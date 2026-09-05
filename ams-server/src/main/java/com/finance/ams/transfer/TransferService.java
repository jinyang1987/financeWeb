package com.finance.ams.transfer;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import javax.sql.DataSource;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.web.client.HttpClientErrorException;

import com.finance.ams.alfresco.AlfrescoNodeClient;
import com.finance.ams.alfresco.RepoLayout;
import com.finance.ams.api.BizException;
import com.finance.ams.oplog.OperationLogService;

/**
 * 对外移交批次服务（2026-08-16 启用 V1 既有表 ams_transfer_batch；2026-09-05 T14 清册真实生成）
 *
 * 业务语义：会计部/业务部保管的案卷，保管满临时保管期后正式移交档案部（馆）。
 * 批次状态机：pending（待准备）→ prepared（清册已生成/待签收）→ received（已签收）；
 *             pending/prepared 可 reject 退回 pending 之前的草稿态或直接作废删除。
 *
 * T14（缺陷 #19）：
 *   - prepare() 由「纯状态跃迁」升级为真实清册生成：HTML 移交清册（DA/T 70-2022 YJ 系列法定字段：
 *     清册编号/移交双方/经办人/卷清单（档号/题名/年度/期限/件数）/合计/日期/签章位），
 *     写入 Alfresco /{全宗}/_移交清册/{年}/ 随档留存，register_no/register_file_node 落库；
 *   - GET /{id}/register-file：清册下载（打印/随批交换）；
 *   - receive() 接收方签收前置检测：逐卷执行 gd∪yj 全口径四性检测，不合格 409 阻断签收
 *     （原「接收方签收零检测」）。
 *
 * 边界说明（与组卷工作台「移交归盒」的区别）：
 *   - 移交归盒（VolumeService.transfer）：所内归档动作，卷 → 盒库，volumeStatus=transferred；
 *   - 本域（对外移交批次）：所外/跨部门正式移交，只记台账不动卷节点状态
 *     （卷保持 transferred 入库态；如未来模型增加 handed-over 枚举，可在 receive 时置位）。
 *   - 台账 volume_nodes 存 Alfresco 节点 id 数组；明细展示时按节点实时解析题名/档号。
 */
@Service
public class TransferService {

  private static final Logger log = LoggerFactory.getLogger(TransferService.class);

  private final JdbcClient jdbc;
  private final AlfrescoNodeClient nodes;
  private final OperationLogService oplog;
  private final com.finance.ams.inspection.InspectionService inspection;
  private final com.finance.ams.alfresco.RepoLayout layout;

  public TransferService(DataSource dataSource, AlfrescoNodeClient nodes, OperationLogService oplog,
                         com.finance.ams.inspection.InspectionService inspection,
                         com.finance.ams.alfresco.RepoLayout layout) {
    this.jdbc = org.springframework.jdbc.core.simple.JdbcClient.create(dataSource);
    this.nodes = nodes;
    this.oplog = oplog;
    this.inspection = inspection;
    this.layout = layout;
  }

  // ═══════════════════ 批次创建 ═══════════════════

  public record CreateCmd(String fromDept, String toDept, String fromPerson, String toPerson,
                          List<String> volumeNodes, String transferDate) {}

  /**
   * 发起移交：校验案卷存在且为已入库（transferred）状态 → 建批次（pending）。
   * 批次号 TJ-yyyyMMdd-NNN（当日计数+1，transfer_no 唯一约束兜底）。
   */
  public Map<String, Object> create(String userId, String ticket, CreateCmd cmd) {
    if (cmd.volumeNodes() == null || cmd.volumeNodes().isEmpty()) {
      throw BizException.badRequest("VALIDATION_FAILED", "移交案卷不能为空");
    }
    if (!notBlank(cmd.toDept())) throw BizException.badRequest("VALIDATION_FAILED", "接收单位不能为空");

    // 校验卷存在性与状态，并累计件数
    int totalItems = 0;
    List<String> titles = new ArrayList<>();
    for (String nodeId : cmd.volumeNodes()) {
      Map<String, Object> vol;
      try {
        vol = nodes.getNode(ticket, nodeId);
      } catch (HttpClientErrorException e) {
        throw BizException.badRequest("VOLUME_NOT_FOUND", "案卷不存在或无权限: " + nodeId);
      }
      if (!"finance:volume".equals(vol.get("nodeType"))) {
        throw BizException.badRequest("NOT_A_VOLUME", "节点不是案卷: " + nodeId);
      }
      String status = propOf(vol, "finance:volumeStatus");
      if (!"transferred".equals(status)) {
        throw new BizException(HttpStatus.CONFLICT, "VOLUME_NOT_ARCHIVED",
            "案卷须先完成移交归盒（入库）才能发起对外移交: " + propOf(vol, "finance:title"));
      }
      Object items = vol.get("properties") instanceof Map<?, ?> p ? p.get("finance:volumeTotalItems") : null;
      totalItems += items instanceof Number n ? n.intValue() : 0;
      titles.add(propOf(vol, "finance:title"));
    }

    String today = LocalDate.now().format(DateTimeFormatter.BASIC_ISO_DATE);
    int seq = jdbc.sql("SELECT count(*) FROM ams.ams_transfer_batch WHERE transfer_no LIKE 'TJ-' || ? || '-%'")
        .param(today).query(Integer.class).single() + 1;
    String transferNo = "TJ-" + today + "-" + String.format("%03d", seq);

    String date = notBlank(cmd.transferDate()) ? cmd.transferDate() : LocalDate.now().toString();
    jdbc.sql("""
        INSERT INTO ams.ams_transfer_batch
          (id, transfer_no, from_dept, to_dept, from_person, to_person,
           volume_nodes, total_items, status, transfer_date)
        VALUES (gen_random_uuid(), ?, ?, ?, ?, ?, ?::text[], ?, 'pending', ?::date)
        """)
        .params(transferNo, cmd.fromDept(), cmd.toDept(), cmd.fromPerson(), cmd.toPerson(),
            "{" + String.join(",", cmd.volumeNodes()) + "}", totalItems, date)
        .update();

    oplog.append(userId, userId, "发起移交批次",
        transferNo, null, String.format("移交 %d 卷（共 %d 件）→ %s", cmd.volumeNodes().size(), totalItems, cmd.toDept()));
    log.info("移交批次创建: {}（{} 卷/{} 件 → {}，操作人 {}）", transferNo, cmd.volumeNodes().size(), totalItems, cmd.toDept(), userId);
    return Map.of("transferNo", transferNo, "totalVolumes", cmd.volumeNodes().size(), "totalItems", totalItems);
  }

  // ═══════════════════ 查询 ═══════════════════

  /** 批次列表（可按状态过滤）；resolveVolumes=true 时附带每卷题名/档号（详情用） */
  public List<Map<String, Object>> list(String ticket, String status, boolean resolveVolumes) {
    String sql = """
        SELECT id, transfer_no, from_dept, to_dept, from_person, to_person,
               volume_nodes, total_items, status,
               transfer_date::text AS transfer_date,
               received_at::text AS received_at,
               register_no, register_file_node
        FROM ams.ams_transfer_batch
        """ + (notBlank(status) ? " WHERE status = :status" : "") + " ORDER BY transfer_no DESC LIMIT 500";
    var q = jdbc.sql(sql);
    if (notBlank(status)) q = q.param("status", status);
    List<Map<String, Object>> rows = q.query(this::row).list();
    if (resolveVolumes) {
      for (Map<String, Object> r : rows) resolveVolumeRefs(ticket, r);
    }
    return rows;
  }

  public Map<String, Object> detail(String ticket, String id) {
    Map<String, Object> row = jdbc.sql("""
        SELECT id, transfer_no, from_dept, to_dept, from_person, to_person,
               volume_nodes, total_items, status,
               transfer_date::text AS transfer_date,
               received_at::text AS received_at,
               register_no, register_file_node
        FROM ams.ams_transfer_batch WHERE id = ?::uuid
        """)
        .param(id).query(this::row).optional()
        .orElseThrow(() -> BizException.notFound("移交批次不存在: " + id));
    resolveVolumeRefs(ticket, row);
    return row;
  }

  /** 按节点 id 实时解析卷题名/档号（节点已删则标注） */
  private void resolveVolumeRefs(String ticket, Map<String, Object> row) {
    @SuppressWarnings("unchecked")
    List<String> ids = (List<String>) row.get("volumeNodes");
    List<Map<String, Object>> vols = new ArrayList<>();
    for (String nodeId : ids) {
      try {
        Map<String, Object> vol = nodes.getNode(ticket, nodeId);
        vols.add(Map.of(
            "nodeId", nodeId,
            "title", propOf(vol, "finance:title"),
            "volumeCode", propOf(vol, "finance:volumeCode"),
            "status", propOf(vol, "finance:volumeStatus"),
            "totalItems", vol.get("properties") instanceof Map<?, ?> p && p.get("finance:volumeTotalItems") instanceof Number n
                ? n.intValue() : 0));
      } catch (Exception e) {
        vols.add(Map.of("nodeId", nodeId, "title", "（节点已删除）", "volumeCode", "", "status", "missing", "totalItems", 0));
      }
    }
    row.put("volumes", vols);
  }

  // ═══════════════════ 状态流转 ═══════════════════

  /**
   * 生成移交清册（T14 真实生成）：pending → prepared。
   * 清册 HTML（DA/T 70-2022 YJ 系列法定字段）写入 Alfresco /{全宗}/_移交清册/{年}/ 随档留存，
   * register_no（YJ-日期-短id）+ register_file_node 落库；幂等（已生成直接放行状态跃迁）。
   */
  public Map<String, Object> prepare(String userId, String ticket, String id) {
    Map<String, Object> row = fullRow(id);
    if (!"pending".equals(row.get("status"))) {
      throw new BizException(HttpStatus.CONFLICT, "BATCH_STATE",
          "批次当前状态不允许生成清册（当前: " + row.get("status") + "，要求: pending）");
    }
    if (!notBlank(str(row.get("registerFileNode")))) {
      generateRegisterFile(ticket, userId, id, row);
    }
    jdbc.sql("UPDATE ams.ams_transfer_batch SET status = 'prepared' WHERE id = ?::uuid").param(id).update();
    oplog.append(userId, userId, "生成移交清册", String.valueOf(row.get("transferNo")), null,
        "清册编号 " + str(fullRow(id).get("registerNo")));
    log.info("移交批次清册生成: {} → prepared（操作人 {}）", row.get("transferNo"), userId);
    Map<String, Object> out = fullRow(id);
    out.put("status", "prepared");
    return out;
  }

  /**
   * 生成清册文件并随档留存：resolve 卷清单 → HTML → /{全宗}/_移交清册/{年}/ → 落库。
   */
  @SuppressWarnings("unchecked")
  private void generateRegisterFile(String ticket, String userId, String id, Map<String, Object> row) {
    List<String> volIds = (List<String>) row.get("volumeNodes");
    List<Map<String, Object>> vols = new ArrayList<>();
    int totalItems = 0;
    for (String nodeId : volIds) {
      try {
        Map<String, Object> vol = nodes.getNode(ticket, nodeId);
        int items = vol.get("properties") instanceof Map<?, ?> p && p.get("finance:volumeTotalItems") instanceof Number n
            ? n.intValue() : 0;
        totalItems += items;
        vols.add(Map.of(
            "nodeId", nodeId,
            "volumeCode", propOf(vol, "finance:volumeCode"),
            "title", propOf(vol, "finance:title"),
            "year", propOf(vol, "finance:volumeYear"),
            "retention", propOf(vol, "finance:volumeRetention"),
            "totalItems", items));
      } catch (Exception e) {
        vols.add(Map.of("nodeId", nodeId, "volumeCode", "", "title", "（节点已删除）",
            "year", "", "retention", "", "totalItems", 0));
      }
    }
    if (vols.isEmpty()) throw BizException.badRequest("BATCH_EMPTY", "批次内无可移交案卷");
    String firstNode = volIds.get(0);
    Map<String, Object> fonds;
    try {
      fonds = layout.findFondsOf(ticket, firstNode);
    } catch (Exception e) {
      throw RepoLayout.translate("移交清册生成失败（全宗解析）", e);
    }
    String fondsCode = propOf(fonds, "finance:code");

    String transferNo = str(row.get("transferNo"));
    String registerNo = "YJ-" + LocalDate.now().format(DateTimeFormatter.BASIC_ISO_DATE)
        + "-" + id.substring(0, 8).toUpperCase();
    String html = renderRegisterHtml(registerNo, transferNo, fondsCode,
        str(row.get("fromDept")), str(row.get("toDept")), str(row.get("fromPerson")), str(row.get("toPerson")),
        str(row.get("transferDate")), vols, totalItems);
    String fileName = "移交清册-" + registerNo + ".html";

    String fileNodeId;
    try {
      String dirId = layout.ensurePath(ticket, str(fonds.get("id")), "_移交清册", String.valueOf(LocalDate.now().getYear()));
      Map<String, Object> created = nodes.createNode(ticket, dirId, fileName, "cm:content", Map.of(
          "cm:title", "会计档案移交清册 " + registerNo,
          "cm:description", "移交批次 " + transferNo + "；" + vols.size() + " 卷 " + totalItems + " 件 → " + str(row.get("toDept"))));
      fileNodeId = String.valueOf(created.get("id"));
      nodes.putContent(ticket, fileNodeId, html.getBytes(java.nio.charset.StandardCharsets.UTF_8), "text/html");
    } catch (HttpClientErrorException e) {
      throw RepoLayout.translate("移交清册写入 Alfresco 失败", e);
    }
    jdbc.sql("UPDATE ams.ams_transfer_batch SET register_no = ?, register_file_node = ? WHERE id = ?::uuid")
        .params(registerNo, fileNodeId, id).update();
    log.info("移交清册文件生成: {} → {}（{}）", transferNo, registerNo, fileNodeId);
  }

  /** 移交清册 HTML（DA/T 70-2022 YJ 系列法定字段；打印样式内联） */
  private String renderRegisterHtml(String registerNo, String transferNo, String fondsCode,
                                    String fromDept, String toDept, String fromPerson, String toPerson,
                                    String transferDate, List<Map<String, Object>> vols, int totalItems) {
    StringBuilder rows = new StringBuilder();
    int seq = 0;
    for (Map<String, Object> v : vols) {
      rows.append("<tr><td>").append(++seq).append("</td><td>").append(esc(str(v.get("volumeCode"))))
          .append("</td><td>").append(esc(str(v.get("title"))))
          .append("</td><td>").append(esc(str(v.get("year"))))
          .append("</td><td>").append(esc(str(v.get("retention"))))
          .append("</td><td>").append(str(v.get("totalItems"))).append("</td></tr>");
    }
    return """
        <!DOCTYPE html>
        <html lang="zh-CN"><head><meta charset="UTF-8">
        <title>会计档案移交清册 %s</title>
        <style>
          body { font-family: "SimSun","Microsoft YaHei",serif; margin: 40px auto; max-width: 860px; color: #111; }
          h1 { text-align: center; font-size: 22px; letter-spacing: 6px; }
          .meta { font-size: 13px; color: #444; margin: 12px 0 4px; }
          table { width: 100%%; border-collapse: collapse; margin: 14px 0; font-size: 13px; }
          th, td { border: 1px solid #333; padding: 7px 9px; text-align: left; }
          th { background: #f0f0f0; font-weight: 600; }
          .total td { font-weight: 600; background: #fafafa; }
          .signs { margin-top: 44px; display: flex; justify-content: space-between; font-size: 14px; }
          .signs div { width: 46%%; }
          .note { font-size: 12px; color: #555; margin-top: 22px; line-height: 1.7; }
          @media print { body { margin: 12mm; } }
        </style></head><body>
        <h1>会计档案移交清册</h1>
        <p class="meta">清册编号：%s　　移交批次号：%s　　全宗号：%s</p>
        <p class="meta">移交单位（部门）：%s　　接收单位（部门）：%s</p>
        <p class="meta">移交经办人：%s　　接收经办人：%s　　移交日期：%s</p>
        <table>
          <thead><tr><th style="width:44px">序号</th><th>档号</th><th>题名</th><th style="width:76px">年度</th>
            <th style="width:76px">保管期限</th><th style="width:64px">件数</th></tr></thead>
          <tbody>%s
            <tr class="total"><td colspan="5">合计：共 %d 卷</td><td>%d 件</td></tr>
          </tbody>
        </table>
        <div class="signs">
          <div>移交单位（签章）：____________<br><span style="font-size:12px;color:#555">经办人： %s</span></div>
          <div style="text-align:right">接收单位（签章）：____________<br><span style="font-size:12px;color:#555">经办人： %s</span></div>
        </div>
        <p class="note">依据《会计档案管理办法》（财政部 国家档案局令第79号）与 DA/T 70-2022 编制。<br>
        接收方签收前应按 DA/T 70-2022 对移交档案进行检测（本系统在签收时自动执行四性检测，未通过不得签收）。</p>
        </body></html>
        """.formatted(
            esc(registerNo), esc(registerNo), esc(transferNo), esc(fondsCode),
            esc(fromDept), esc(toDept), esc(fromPerson), esc(toPerson), esc(transferDate),
            rows.toString(), vols.size(), totalItems,
            esc(fromPerson), esc(toPerson));
  }

  private static String esc(String s) {
    return s == null ? "" : s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;");
  }

  /** 移交清册 HTML 下载（打印/随批交换；仅清册已生成可下载） */
  public Map<String, Object> registerContent(String ticket, String id) {
    Map<String, Object> row = requireRow(id);
    String fileNode = str(row.get("registerFileNode"));
    if (!notBlank(fileNode)) {
      throw BizException.badRequest("REGISTER_NOT_GENERATED", "移交清册尚未生成（请先「生成清册」）");
    }
    try {
      var resp = nodes.getContent(ticket, fileNode);
      return Map.of("bytes", resp.getBody() == null ? new byte[0] : resp.getBody(),
          "filename", "移交清册-" + str(row.get("registerNo")) + ".html");
    } catch (HttpClientErrorException e) {
      throw RepoLayout.translate("移交清册下载失败", e);
    }
  }

  /**
   * 接收方签收：prepared → received（写 received_at）。
   * T14 接收方检测入口：签收前逐卷执行 gd∪yj 全口径四性检测（接收方口径），
   * 任一卷不通过即 409 阻断签收（问题明细随异常返回，转入交接问题处理）。
   */
  public Map<String, Object> receive(String userId, String ticket, String id) {
    Map<String, Object> row = fullRow(id);
    if (!"prepared".equals(row.get("status"))) {
      throw new BizException(HttpStatus.CONFLICT, "BATCH_STATE",
          "批次当前状态不允许签收（当前: " + row.get("status") + "，要求: prepared）");
    }
    @SuppressWarnings("unchecked")
    List<String> volIds = (List<String>) row.get("volumeNodes");
    List<Map<String, Object>> failures = new ArrayList<>();
    for (String volId : volIds) {
      try {
        Map<String, Object> report = inspection.runVolume(ticket, userId, volId, "yj");
        if (!Boolean.TRUE.equals(report.get("allPass"))) {
          Object issues = report.get("issues");
          int issueCount = issues instanceof List<?> l ? l.size() : 0;
          failures.add(Map.of("volumeId", volId, "issueCount", issueCount, "issues", issues == null ? List.of() : issues));
        }
      } catch (BizException e) {
        failures.add(Map.of("volumeId", volId, "issueCount", 0, "issues", List.of(str(e.getMessage()))));
      }
    }
    if (!failures.isEmpty()) {
      throw new BizException(HttpStatus.CONFLICT, "RECEIVE_INSPECTION_FAILED",
          "接收检测未通过：" + failures.size() + " 卷存在四性检测问题，已阻断签收（接收方须复核或退回移交方整改）");
    }
    jdbc.sql("UPDATE ams.ams_transfer_batch SET status = 'received', received_at = now() WHERE id = ?::uuid")
        .param(id).update();
    oplog.append(userId, userId, "移交签收", String.valueOf(row.get("transferNo")), null,
        "接收检测通过（gd∪yj 全口径）后签收，共 " + volIds.size() + " 卷");
    log.info("移交批次签收: {} → received（接收检测通过，操作人 {}）", row.get("transferNo"), userId);
    Map<String, Object> out = fullRow(id);
    out.put("status", "received");
    return out;
  }

  /** 退回：prepared → pending（清册有误重新准备；清册文件保留，重新 prepare 幂等复用） */
  public Map<String, Object> reject(String userId, String id, String reason) {
    return transition(userId, id, "prepared", "pending",
        "移交退回" + (notBlank(reason) ? "：" + reason : ""));
  }

  /** 删除批次（仅 pending 未生成清册可删） */
  public void delete(String userId, String id) {
    Map<String, Object> row = requireRow(id);
    if (!"pending".equals(row.get("status"))) {
      throw new BizException(HttpStatus.CONFLICT, "BATCH_STATE", "仅待准备状态的批次可删除（已生成清册/已签收不可删）");
    }
    jdbc.sql("DELETE FROM ams.ams_transfer_batch WHERE id = ?::uuid").param(id).update();
    oplog.append(userId, userId, "删除移交批次", String.valueOf(row.get("transferNo")), null, "");
    log.info("移交批次删除: {}（操作人 {}）", row.get("transferNo"), userId);
  }

  private Map<String, Object> transition(String userId, String id, String from, String to, String actionLabel) {
    Map<String, Object> row = requireRow(id);
    if (!from.equals(row.get("status"))) {
      throw new BizException(HttpStatus.CONFLICT, "BATCH_STATE",
          "批次当前状态不允许该操作（当前: " + row.get("status") + "，要求: " + from + "）");
    }
    jdbc.sql("UPDATE ams.ams_transfer_batch SET status = ? WHERE id = ?::uuid").params(to, id).update();
    oplog.append(userId, userId, actionLabel, String.valueOf(row.get("transferNo")), null, "");
    log.info("移交批次 {}: {} → {}（操作人 {}）", row.get("transferNo"), from, to, userId);
    Map<String, Object> out = new LinkedHashMap<>(row);
    out.put("status", to);
    return out;
  }

  private Map<String, Object> requireRow(String id) {
    return jdbc.sql("""
        SELECT id, transfer_no, status, register_no, register_file_node FROM ams.ams_transfer_batch WHERE id = ?::uuid
        """)
        .param(id).query((rs, i) -> {
          Map<String, Object> m = new LinkedHashMap<>();
          m.put("id", rs.getString("id"));
          m.put("transferNo", rs.getString("transfer_no"));
          m.put("status", rs.getString("status"));
          m.put("registerNo", rs.getString("register_no") == null ? "" : rs.getString("register_no"));
          m.put("registerFileNode", rs.getString("register_file_node") == null ? "" : rs.getString("register_file_node"));
          return m;
        }).optional()
        .orElseThrow(() -> BizException.notFound("移交批次不存在: " + id));
  }

  /** 全列行（清册字段；状态流转返回用） */
  private Map<String, Object> fullRow(String id) {
    return jdbc.sql("""
        SELECT id, transfer_no, from_dept, to_dept, from_person, to_person,
               volume_nodes, total_items, status,
               transfer_date::text AS transfer_date, received_at::text AS received_at,
               register_no, register_file_node
        FROM ams.ams_transfer_batch WHERE id = ?::uuid
        """)
        .param(id).query(this::row).optional()
        .orElseThrow(() -> BizException.notFound("移交批次不存在: " + id));
  }

  // ═══════════════════ 行映射 ═══════════════════

  private Map<String, Object> row(ResultSet rs, int i) throws SQLException {
    Map<String, Object> m = new LinkedHashMap<>();
    m.put("id", rs.getString("id"));
    m.put("transferNo", rs.getString("transfer_no"));
    m.put("fromDept", rs.getString("from_dept"));
    m.put("toDept", rs.getString("to_dept"));
    m.put("fromPerson", rs.getString("from_person"));
    m.put("toPerson", rs.getString("to_person"));
    String[] volNodes = (String[]) rs.getArray("volume_nodes").getArray();
    m.put("volumeNodes", List.of(volNodes));
    m.put("totalVolumes", volNodes.length);
    m.put("totalItems", rs.getInt("total_items"));
    m.put("status", rs.getString("status"));
    m.put("transferDate", rs.getString("transfer_date"));
    m.put("receivedAt", rs.getString("received_at") == null ? "" : rs.getString("received_at"));
    m.put("registerNo", rs.getString("register_no") == null ? "" : rs.getString("register_no"));
    m.put("registerFileNode", rs.getString("register_file_node") == null ? "" : rs.getString("register_file_node"));
    return m;
  }

  private static String str(Object o) {
    return o == null ? "" : String.valueOf(o);
  }

  @SuppressWarnings("unchecked")
  private static String propOf(Map<String, Object> entry, String name) {
    Object props = entry.get("properties");
    if (!(props instanceof Map)) return "";
    Object v = ((Map<String, Object>) props).get(name);
    return v == null ? "" : String.valueOf(v);
  }

  private static boolean notBlank(String s) {
    return s != null && !s.isBlank();
  }
}
