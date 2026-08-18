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
import com.finance.ams.api.BizException;
import com.finance.ams.oplog.OperationLogService;

/**
 * 对外移交批次服务（2026-08-16 启用 V1 既有表 ams_transfer_batch）
 *
 * 业务语义：会计部/业务部保管的案卷，保管满临时保管期后正式移交档案部（馆）。
 * 批次状态机：pending（待准备）→ prepared（清册已生成/待签收）→ received（已签收）；
 *             pending/prepared 可 reject 退回 pending 之前的草稿态或直接作废删除。
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

  public TransferService(DataSource dataSource, AlfrescoNodeClient nodes, OperationLogService oplog) {
    this.jdbc = JdbcClient.create(dataSource);
    this.nodes = nodes;
    this.oplog = oplog;
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
               received_at::text AS received_at
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
               received_at::text AS received_at
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

  /** 生成移交清册：pending → prepared */
  public Map<String, Object> prepare(String userId, String id) {
    return transition(userId, id, "pending", "prepared", "生成移交清册");
  }

  /** 接收方签收：prepared → received（写 received_at） */
  public Map<String, Object> receive(String userId, String id) {
    Map<String, Object> row = transition(userId, id, "prepared", "received", "移交签收");
    jdbc.sql("UPDATE ams.ams_transfer_batch SET received_at = now() WHERE id = ?::uuid")
        .param(id).update();
    return row;
  }

  /** 退回：prepared → pending（清册有误重新准备） */
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
        SELECT id, transfer_no, status FROM ams.ams_transfer_batch WHERE id = ?::uuid
        """)
        .param(id).query((rs, i) -> {
          Map<String, Object> m = new LinkedHashMap<>();
          m.put("id", rs.getString("id"));
          m.put("transferNo", rs.getString("transfer_no"));
          m.put("status", rs.getString("status"));
          return m;
        }).optional()
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
    return m;
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
