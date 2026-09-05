package com.finance.ams.appraisal;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.LocalDate;
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
 * 鉴定销毁服务（2026-08-16 启用 V1 既有表 ams_appraisal；2026-09-05 T13 法定化改造）
 *
 * 业务流程（缺陷 #18 法定要件落地，79号令第20/21条）：
 *   1. 到期测算：扫描盒库中已入库（transferred）案卷，按「年度+保管期限」算保管期满日
 *      （会计档案保管期限自会计年度终了后第一年起算：期满日 = (year+期限+1)-01-01；永久不期满）；
 *   2. 登记鉴定任务（pending，幂等：同卷已有未终结鉴定则跳过）；
 *   3. 鉴定评审：
 *      - retain（续存）：单步评审，终态 retained；
 *      - destroy（销毁）：三方签批链——申请单位（保管部门）→ 档案管理部门 → 监销人（审计/监察），
 *        申请时必须完成「未结清债权债务核查」（79号令第20条：未结清的债权债务原始凭证不得销毁），
 *        三方签齐后 status=approved-destroy；
 *   4. 销毁清册：approved-destroy 后生成销毁清册（法定字段，HTML 可打印，一式两份报备案），
 *      文件写入 Alfresco /{全宗}/_销毁清册/{年}/ 随档留存，register_no/register_file_node 落库；
 *   5. 销毁执行：须清册已生成 + 监销人已签批 + 填写共同监销记录；删除后重取节点校验 404
 *      记入不可恢复性验证（unrecoverable_verified）。
 *
 * 状态机：pending →（三方签齐）approved-destroy →（清册+监销记录+执行）destroyed
 *                 → retained（终态）
 */
@Service
public class AppraisalService {

  private static final Logger log = LoggerFactory.getLogger(AppraisalService.class);

  private final JdbcClient jdbc;
  private final AlfrescoNodeClient nodes;
  private final RepoLayout layout;
  private final OperationLogService oplog;

  public AppraisalService(DataSource dataSource, AlfrescoNodeClient nodes,
                          RepoLayout layout, OperationLogService oplog) {
    this.jdbc = org.springframework.jdbc.core.simple.JdbcClient.create(dataSource);
    this.nodes = nodes;
    this.layout = layout;
    this.oplog = oplog;
  }

  // ═══════════════════ 到期测算 ═══════════════════

  /** 保管期限 → 年限；永久返回 null（不期满） */
  static Integer retentionYears(String retention) {
    if (retention == null || retention.isBlank() || retention.contains("永久")) return null;
    String digits = retention.replaceAll("[^0-9]", "");
    return digits.isEmpty() ? null : Integer.parseInt(digits);
  }

  /** 期满日：保管期限自会计年度终了后第一天起算 → (year + 期限 + 1)-01-01 */
  static LocalDate dueDate(int year, int retentionYears) {
    return LocalDate.of(year + retentionYears + 1, 1, 1);
  }

  /**
   * 到期案卷实时测算（不落库）：扫描 /{全宗}/盒库/{CAT}/{year}/{box}/{vol}，
   * 返回保管期满（dueDate <= today）的案卷及既有鉴定状态。
   */
  public List<Map<String, Object>> dueVolumes(String ticket, String fondsCode) {
    if (!notBlank(fondsCode)) throw BizException.badRequest("VALIDATION_FAILED", "fondsCode 不能为空");
    String fondsId = layout.fonds(ticket, fondsCode);
    String boxesRoot = layout.ensureChild(ticket, fondsId, RepoLayout.BOXES_ROOT);

    LocalDate today = LocalDate.now();
    List<Map<String, Object>> out = new ArrayList<>();
    for (Map<String, Object> catDir : childFolders(ticket, boxesRoot)) {
      for (Map<String, Object> yearDir : childFolders(ticket, str(catDir.get("id")))) {
        for (Map<String, Object> box : childrenOfType(ticket, str(yearDir.get("id")), "finance:archiveBox")) {
          for (Map<String, Object> vol : childrenOfType(ticket, str(box.get("id")), "finance:volume")) {
            String retention = prop(vol, "finance:volumeRetention");
            Integer years = retentionYears(retention);
            Integer volYear = intProp(vol, "finance:volumeYear");
            if (years == null || volYear == null) continue;
            LocalDate due = dueDate(volYear, years);
            if (due.isAfter(today)) continue;
            Map<String, Object> view = new LinkedHashMap<>();
            view.put("volumeNode", str(vol.get("id")));
            view.put("title", prop(vol, "finance:title"));
            view.put("volumeCode", prop(vol, "finance:volumeCode"));
            view.put("year", volYear);
            view.put("retention", retention);
            view.put("dueDate", due.toString());
            view.put("boxNo", prop(box, "finance:boxNo"));
            view.put("totalItems", intProp(vol, "finance:volumeTotalItems"));
            view.put("appraisalStatus", openStatusOf(str(vol.get("id"))));
            out.add(view);
          }
        }
      }
    }
    return out;
  }

  /** 该卷是否已有未终结鉴定（pending/approved-destroy 返回对应状态；无/已终结返回 ""） */
  private String openStatusOf(String volumeNode) {
    return jdbc.sql("""
        SELECT status FROM ams.ams_appraisal
        WHERE volume_node = ? AND status IN ('pending','approved-destroy')
        ORDER BY reviewed_at DESC NULLS LAST LIMIT 1
        """)
        .param(volumeNode).query(String.class).optional().orElse("");
  }

  // ═══════════════════ 登记鉴定任务 ═══════════════════

  /** 把到期卷登记为 pending 鉴定任务（幂等），返回新登记数 */
  public Map<String, Object> scan(String ticket, String fondsCode, String userId) {
    List<Map<String, Object>> dues = dueVolumes(ticket, fondsCode);
    int created = 0;
    for (Map<String, Object> v : dues) {
      if (!str(v.get("appraisalStatus")).isEmpty()) continue; // 已有未终结鉴定
      jdbc.sql("""
          INSERT INTO ams.ams_appraisal (id, volume_node, due_date, status)
          VALUES (gen_random_uuid(), ?, ?::date, 'pending')
          """)
          .params(str(v.get("volumeNode")), str(v.get("dueDate")))
          .update();
      created++;
    }
    if (created > 0) {
      oplog.append(userId, userId, "鉴定任务登记", fondsCode, null, "到期卷登记 " + created + " 卷");
    }
    log.info("鉴定扫描: 全宗 {} 到期 {} 卷，新登记 {}", fondsCode, dues.size(), created);
    return Map.of("dueVolumes", dues.size(), "registered", created);
  }

  // ═══════════════════ 列表 ═══════════════════

  public List<Map<String, Object>> list(String status) {
    String sql = """
        SELECT id, volume_node, due_date::text AS due_date, status, decision,
               meeting_note, reviewer,
               reviewed_at::text AS reviewed_at, destroyed_at::text AS destroyed_at,
               sign_applicant, sign_applicant_at::text AS sign_applicant_at,
               sign_archives, sign_archives_at::text AS sign_archives_at,
               sign_supervisor, sign_supervisor_at::text AS sign_supervisor_at,
               supervisor_note, unrecoverable_verified, unrecoverable_note,
               unsettled_check, unsettled_note, register_no, register_file_node
        FROM ams.ams_appraisal
        """ + (notBlank(status) ? " WHERE status = :status" : "") + " ORDER BY due_date";
    var q = jdbc.sql(sql);
    if (notBlank(status)) q = q.param("status", status);
    return q.query(this::row).list();
  }

  // ═══════════════════ 评审 / 签批链 / 清册 / 销毁执行 ═══════════════════

  /**
   * 鉴定评审：
   *   - decision=retain（续存）：单步评审，pending → retained 终态；
   *   - decision=destroy（销毁）：法定销毁必须走三方签批链（POST /appraisals/{id}/sign），
   *     且申请时须完成未结清债权债务核查——此处不再接受单步直通（2026-08-29 T13）。
   */
  public Map<String, Object> review(String userId, String id, String decision, String meetingNote) {
    Map<String, Object> row = requireRow(id);
    if (!"pending".equals(row.get("status"))) {
      throw new BizException(HttpStatus.CONFLICT, "APPRAISAL_STATE", "仅待鉴定状态可评审（当前: " + row.get("status") + "）");
    }
    if (!List.of("destroy", "retain").contains(decision)) {
      throw BizException.badRequest("VALIDATION_FAILED", "decision 仅支持 destroy/retain");
    }
    if ("destroy".equals(decision)) {
      throw BizException.badRequest("SIGN_CHAIN_REQUIRED",
          "法定销毁须走三方签批链（申请单位→档案管理部门→监销人），请调用签批接口：POST /appraisals/{id}/sign");
    }
    jdbc.sql("""
        UPDATE ams.ams_appraisal
        SET status = 'retained', decision = 'retain', meeting_note = ?, reviewer = ?, reviewed_at = now()
        WHERE id = ?::uuid
        """)
        .params(meetingNote, userId, id).update();
    oplog.append(userId, userId, "鉴定评审", str(row.get("volumeNode")), null, "鉴定结论：续存");
    log.info("鉴定评审: {} → retained（操作人 {}）", row.get("volumeNode"), userId);
    Map<String, Object> out = new LinkedHashMap<>(row);
    out.put("status", "retained");
    return out;
  }

  /**
   * 销毁签批链（T13 三方签批，POST /appraisals/{id}/sign）：
   *   1. applicant 申请单位（保管部门）——必须同时提交 unsettledCheck=true + unsettledNote
   *      （79号令第20条：保管期满但未结清的债权债务原始凭证不得销毁，核查声明留痕）；
   *   2. archives 档案管理部门负责人；
   *   3. supervisor 监销人（审计/监察）。
   * 顺序强制：applicant → archives → supervisor（越序 409）；已签不可改（409）。
   * 三方签齐 → status=approved-destroy、decision=destroy。
   */
  public Map<String, Object> sign(String userId, String id, String role, String note,
                                  Boolean unsettledCheck, String unsettledNote) {
    Map<String, Object> row = fullRow(id);
    if (!"pending".equals(row.get("status"))) {
      throw new BizException(HttpStatus.CONFLICT, "APPRAISAL_STATE", "仅待鉴定状态可签批（当前: " + row.get("status") + "）");
    }
    if (!List.of("applicant", "archives", "supervisor").contains(role)) {
      throw BizException.badRequest("VALIDATION_FAILED", "role 仅支持 applicant/archives/supervisor");
    }
    // 顺序与幂等校验
    String applicant = str(row.get("signApplicant"));
    String archives = str(row.get("signArchives"));
    String supervisor = str(row.get("signSupervisor"));
    switch (role) {
      case "applicant" -> {
        if (notBlank(applicant)) throw new BizException(HttpStatus.CONFLICT, "ALREADY_SIGNED", "申请单位已签批，签批不可更改");
        if (!Boolean.TRUE.equals(unsettledCheck)) {
          throw BizException.badRequest("UNSETTLED_CHECK_REQUIRED",
              "申请销毁必须完成「未结清债权债务核查」并勾选声明（79号令第20条：未结清的债权债务原始凭证不得销毁）");
        }
        jdbc.sql("""
            UPDATE ams.ams_appraisal
            SET sign_applicant = ?, sign_applicant_at = now(), unsettled_check = true, unsettled_note = ?
            WHERE id = ?::uuid
            """).params(userId, str(unsettledNote), id).update();
      }
      case "archives" -> {
        if (notBlank(archives)) throw new BizException(HttpStatus.CONFLICT, "ALREADY_SIGNED", "档案管理部门已签批，签批不可更改");
        if (!notBlank(applicant)) {
          throw new BizException(HttpStatus.CONFLICT, "SIGN_ORDER", "签批顺序错误：须先由申请单位（保管部门）发起销毁申请");
        }
        jdbc.sql("UPDATE ams.ams_appraisal SET sign_archives = ?, sign_archives_at = now() WHERE id = ?::uuid")
            .params(userId, id).update();
      }
      case "supervisor" -> {
        if (notBlank(supervisor)) throw new BizException(HttpStatus.CONFLICT, "ALREADY_SIGNED", "监销人已签批，签批不可更改");
        if (!notBlank(archives)) {
          throw new BizException(HttpStatus.CONFLICT, "SIGN_ORDER", "签批顺序错误：须先由档案管理部门签批");
        }
        jdbc.sql("""
            UPDATE ams.ams_appraisal
            SET sign_supervisor = ?, sign_supervisor_at = now(),
                status = 'approved-destroy', decision = 'destroy', reviewer = ?, reviewed_at = now(),
                meeting_note = ?
            WHERE id = ?::uuid
            """).params(userId, userId, notBlank(note) ? note : "三方签批链完成（申请/档案/监销）", id).update();
      }
      default -> { /* 不可达（上方已校验） */ }
    }
    String actionLabel = switch (role) {
      case "applicant" -> "销毁申请签批（申请单位）";
      case "archives" -> "销毁签批（档案管理部门）";
      default -> "销毁签批（监销人）";
    };
    oplog.append(userId, userId, actionLabel, str(row.get("volumeNode")), null, notBlank(note) ? note : "");
    log.info("销毁签批: {} {}（操作人 {}）", row.get("volumeNode"), role, userId);
    return fullRow(id);
  }

  /**
   * 生成销毁清册（T13 法定要件，仅 approved-destroy 可生成）：
   * HTML 清册（法定字段：全宗号/题名/年度/期限/件数/鉴定结论/三方签章位/监销人/销毁日期），
   * 写入 Alfresco /{全宗}/_销毁清册/{年}/ 随档留存（一式两份报备案由打印承担），
   * register_no（XH-日期-短id）+ register_file_node 落库。幂等：已生成直接返回。
   */
  public Map<String, Object> generateRegister(String ticket, String userId, String id) {
    Map<String, Object> row = fullRow(id);
    if (!"approved-destroy".equals(row.get("status"))) {
      throw new BizException(HttpStatus.CONFLICT, "APPRAISAL_STATE", "仅「同意销毁」状态可生成销毁清册（当前: " + row.get("status") + "）");
    }
    if (notBlank(str(row.get("registerFileNode")))) {
      return fullRow(id); // 幂等
    }
    String volumeNode = str(row.get("volumeNode"));
    Map<String, Object> vol;
    try {
      vol = nodes.getNode(ticket, volumeNode);
    } catch (HttpClientErrorException e) {
      throw RepoLayout.translate("销毁清册生成失败（卷节点读取）", e);
    }
    String title = prop(vol, "finance:title");
    String volumeCode = prop(vol, "finance:volumeCode");
    String year = prop(vol, "finance:volumeYear");
    String retention = prop(vol, "finance:volumeRetention");
    int totalItems = intProp(vol, "finance:volumeTotalItems") != null ? intProp(vol, "finance:volumeTotalItems") : 0;
    Map<String, Object> fonds = layout.findFondsOf(ticket, volumeNode);
    String fondsCode = prop(fonds, "finance:code");

    String registerNo = "XH-" + LocalDate.now().format(java.time.format.DateTimeFormatter.BASIC_ISO_DATE)
        + "-" + id.substring(0, 8).toUpperCase();
    String html = renderRegisterHtml(registerNo, fondsCode, volumeCode, title, year, retention, totalItems, row);
    String fileName = "销毁清册-" + registerNo + ".html";

    String fileNodeId;
    try {
      String dirId = layout.ensurePath(ticket, str(fonds.get("id")), "_销毁清册", String.valueOf(LocalDate.now().getYear()));
      Map<String, Object> created = nodes.createNode(ticket, dirId, fileName, "cm:content", Map.of(
          "cm:title", "会计档案销毁清册 " + registerNo,
          "cm:description", "案卷 " + volumeCode + "；清册编号 " + registerNo + "（一式两份报备案）"));
      fileNodeId = String.valueOf(created.get("id"));
      nodes.putContent(ticket, fileNodeId, html.getBytes(java.nio.charset.StandardCharsets.UTF_8), "text/html");
    } catch (HttpClientErrorException e) {
      throw RepoLayout.translate("销毁清册写入 Alfresco 失败", e);
    }
    jdbc.sql("UPDATE ams.ams_appraisal SET register_no = ?, register_file_node = ? WHERE id = ?::uuid")
        .params(registerNo, fileNodeId, id).update();
    oplog.append(userId, userId, "销毁清册生成", volumeNode, null,
        "清册编号 " + registerNo + "，文件节点 " + fileNodeId);
    log.info("销毁清册生成: {} → {}（{}）", volumeNode, registerNo, fileNodeId);
    return fullRow(id);
  }

  /** 销毁清册 HTML 下载（打印/备案用；仅清册已生成可下载） */
  public Map<String, Object> registerContent(String ticket, String id) {
    Map<String, Object> row = fullRow(id);
    String fileNode = str(row.get("registerFileNode"));
    if (!notBlank(fileNode)) {
      throw BizException.badRequest("REGISTER_NOT_GENERATED", "销毁清册尚未生成，请先生成清册");
    }
    try {
      var resp = nodes.getContent(ticket, fileNode);
      return Map.of("bytes", resp.getBody() == null ? new byte[0] : resp.getBody(),
          "filename", "销毁清册-" + str(row.get("registerNo")) + ".html");
    } catch (HttpClientErrorException e) {
      throw RepoLayout.translate("销毁清册下载失败", e);
    }
  }

  /** 清册 HTML（法定字段齐备；打印样式内联） */
  private static String esc(String s) {
    return s == null ? "" : s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;");
  }

  private String renderRegisterHtml(String registerNo, String fondsCode, String volumeCode, String title,
                                    String year, String retention, int totalItems, Map<String, Object> row) {
    return """
        <!DOCTYPE html>
        <html lang="zh-CN"><head><meta charset="UTF-8">
        <title>会计档案销毁清册 %s</title>
        <style>
          body { font-family: "SimSun","Microsoft YaHei",serif; margin: 40px auto; max-width: 760px; color: #111; }
          h1 { text-align: center; font-size: 22px; letter-spacing: 6px; }
          .meta { text-align: right; font-size: 13px; color: #444; }
          table { width: 100%%; border-collapse: collapse; margin: 18px 0; font-size: 14px; }
          th, td { border: 1px solid #333; padding: 8px 10px; text-align: left; }
          th { background: #f0f0f0; font-weight: 600; width: 160px; }
          .signs { margin-top: 42px; display: flex; justify-content: space-between; font-size: 14px; }
          .signs div { width: 30%%; }
          .note { font-size: 12px; color: #555; margin-top: 24px; line-height: 1.7; }
          @media print { body { margin: 12mm; } }
        </style></head><body>
        <h1>会计档案销毁清册</h1>
        <p class="meta">清册编号：%s　　编制日期：%s</p>
        <table>
          <tr><th>全宗号</th><td>%s</td></tr>
          <tr><th>案卷档号</th><td>%s</td></tr>
          <tr><th>案卷题名</th><td>%s</td></tr>
          <tr><th>形成年度</th><td>%s</td></tr>
          <tr><th>保管期限</th><td>%s</td></tr>
          <tr><th>卷内件数</th><td>%d 件</td></tr>
          <tr><th>鉴定结论</th><td>保管期满，经鉴定无保存价值，同意销毁（三方签批）</td></tr>
          <tr><th>未结清债权债务核查</th><td>%s</td></tr>
          <tr><th>申请单位（保管部门）</th><td>%s（%s）</td></tr>
          <tr><th>档案管理部门</th><td>%s（%s）</td></tr>
          <tr><th>监销人（审计/监察）</th><td>%s（%s）</td></tr>
          <tr><th>销毁日期</th><td>%s</td></tr>
          <tr><th>监销记录</th><td>%s</td></tr>
        </table>
        <div class="signs">
          <div>申请单位经办人（签章）：____________</div>
          <div>档案管理部门（签章）：____________</div>
          <div>监销人（签章）：____________</div>
        </div>
        <p class="note">依据《会计档案管理办法》（财政部 国家档案局令第79号）第二十条、第二十一条编制。<br>
        本清册一式两份，一份由单位档案管理部门存档备查，一份报同级档案行政管理部门备案（如适用）。<br>
        说明：到期但未结清的债权债务原始凭证不得销毁，应当单独抽出立卷，保管到结清为止。</p>
        </body></html>
        """.formatted(
            esc(registerNo), esc(registerNo), LocalDate.now(),
            esc(fondsCode), esc(volumeCode), esc(title),
            esc(year), esc(retention), totalItems,
            Boolean.TRUE.equals(row.get("unsettledCheck"))
                ? "已核查，无未结清债权债务" + (notBlank(str(row.get("unsettledNote"))) ? "（" + esc(str(row.get("unsettledNote"))) + "）" : "")
                : "未核查（不应出现——签批链强制）",
            esc(str(row.get("signApplicant"))), esc(timeText(row.get("signApplicantAt"))),
            esc(str(row.get("signArchives"))), esc(timeText(row.get("signArchivesAt"))),
            esc(str(row.get("signSupervisor"))), esc(timeText(row.get("signSupervisorAt"))),
            LocalDate.now(), "（执行时填写：共同监销情况）");
  }

  private static String timeText(Object ts) {
    String s = ts == null ? "" : String.valueOf(ts);
    return s.length() >= 19 ? s.substring(0, 19).replace('T', ' ') : s;
  }

  /**
   * 销毁执行（T13 法定前置全检）：approved-destroy → 删除卷节点（含卷内件）。
   * 前置：①销毁清册已生成（register_file_node）；②监销人已签批；
   *      ③共同监销记录必填（supervisorNote）。
   * 执行后：重取节点校验 404 → unrecoverable_verified=true（不可恢复性验证留痕）；
   * 盒计数回退；操作日志。
   */
  public Map<String, Object> executeDestroy(String ticket, String userId, String id, String supervisorNote) {
    Map<String, Object> row = fullRow(id);
    if (!"approved-destroy".equals(row.get("status"))) {
      throw new BizException(HttpStatus.CONFLICT, "APPRAISAL_STATE", "仅「同意销毁」状态可执行销毁（当前: " + row.get("status") + "）");
    }
    if (!notBlank(str(row.get("registerFileNode")))) {
      throw new BizException(HttpStatus.CONFLICT, "REGISTER_REQUIRED",
          "销毁清册尚未生成（法定要件）：请先生成销毁清册并报备案，再执行销毁");
    }
    if (!notBlank(str(row.get("signSupervisor")))) {
      throw new BizException(HttpStatus.CONFLICT, "SUPERVISOR_REQUIRED", "监销人尚未签批（法定要件）：三方签批链未完成");
    }
    if (!notBlank(supervisorNote)) {
      throw BizException.badRequest("VALIDATION_FAILED", "共同监销记录必填：请填写监销人、监销时间与销毁方式等共同监销情况");
    }
    String volumeNode = str(row.get("volumeNode"));

    // 卷信息留痕（删除前读取）
    String title = volumeNode;
    int totalItems = 0;
    Map<String, Object> box = null;
    try {
      Map<String, Object> vol = nodes.getNode(ticket, volumeNode);
      title = prop(vol, "finance:title");
      totalItems = intProp(vol, "finance:volumeTotalItems") != null ? intProp(vol, "finance:volumeTotalItems") : 0;
      box = layout.nearestAncestorOfType(ticket, volumeNode, "finance:archiveBox");
    } catch (Exception ignored) { /* 节点可能已不存在，继续收尾 */ }

    // 删除卷节点（Alfresco DELETE 级联删除卷内件子树）
    boolean nodeDeleted = false;
    try {
      nodes.deleteNode(ticket, volumeNode);
      nodeDeleted = true;
    } catch (HttpClientErrorException.NotFound e) {
      log.warn("销毁执行：卷节点已不存在，按已销毁收尾: {}", volumeNode);
    } catch (HttpClientErrorException e) {
      throw RepoLayout.translate("销毁执行失败（删除卷节点）", e);
    }

    // 不可恢复性验证（T13）：删除后重取节点，必须 404 才记 verified
    boolean unrecoverable = false;
    String unrecoverableNote;
    try {
      nodes.getNode(ticket, volumeNode);
      unrecoverableNote = "删除后重取校验仍可读取节点——不可恢复性验证未通过，请人工核查";
      log.error("不可恢复性验证未通过（重取成功）: {}", volumeNode);
    } catch (HttpClientErrorException.NotFound nf) {
      unrecoverable = true;
      unrecoverableNote = "删除后重取校验 404：节点及卷内件已物理删除，不可恢复";
    } catch (HttpClientErrorException e) {
      unrecoverableNote = "删除后重取校验异常: " + e.getMessage();
    }

    // 盒计数回退
    if (box != null) {
      int volCount = intProp(box, "finance:volumeCount") != null ? intProp(box, "finance:volumeCount") : 0;
      int itemCount = intProp(box, "finance:boxTotalItems") != null ? intProp(box, "finance:boxTotalItems") : 0;
      Map<String, Object> upd = new LinkedHashMap<>();
      upd.put("finance:volumeCount", Math.max(0, volCount - 1));
      upd.put("finance:boxTotalItems", Math.max(0, itemCount - totalItems));
      try {
        nodes.updateNode(ticket, str(box.get("id")), upd);
      } catch (Exception e) {
        log.warn("销毁后盒计数回退失败（不影响销毁结果）: {}", e.getMessage());
      }
    }

    jdbc.sql("""
        UPDATE ams.ams_appraisal
        SET destroyed_at = now(), status = 'destroyed',
            supervisor_note = ?, unrecoverable_verified = ?, unrecoverable_note = ?
        WHERE id = ?::uuid
        """).params(supervisorNote, unrecoverable, unrecoverableNote, id).update();
    oplog.append(userId, userId, "销毁执行", volumeNode, null,
        "销毁案卷「" + title + "」（" + totalItems + " 件），清册 " + str(row.get("registerNo"))
            + "；监销记录：" + supervisorNote + "；不可恢复验证" + (unrecoverable ? "通过" : "未通过"));
    log.info("销毁执行完成: {}（{}，操作人 {}，不可恢复验证 {}）", volumeNode, title, userId, unrecoverable);
    Map<String, Object> out = fullRow(id);
    out.put("status", "destroyed");
    return out;
  }

  /** 全列行读取（签批链/清册/验证字段） */
  private Map<String, Object> fullRow(String id) {
    return jdbc.sql("""
        SELECT id, volume_node, due_date::text AS due_date, status, decision,
               meeting_note, reviewer, reviewed_at::text AS reviewed_at, destroyed_at::text AS destroyed_at,
               sign_applicant, sign_applicant_at::text AS sign_applicant_at,
               sign_archives, sign_archives_at::text AS sign_archives_at,
               sign_supervisor, sign_supervisor_at::text AS sign_supervisor_at,
               supervisor_note, unrecoverable_verified, unrecoverable_note,
               unsettled_check, unsettled_note, register_no, register_file_node
        FROM ams.ams_appraisal WHERE id = ?::uuid
        """)
        .param(id).query(this::row).optional()
        .orElseThrow(() -> BizException.notFound("鉴定记录不存在: " + id));
  }

  // ═══════════════════ 内部 ═══════════════════

  private Map<String, Object> requireRow(String id) {
    return jdbc.sql("SELECT id, volume_node, status FROM ams.ams_appraisal WHERE id = ?::uuid")
        .param(id).query((rs, i) -> {
          Map<String, Object> m = new LinkedHashMap<>();
          m.put("id", rs.getString("id"));
          m.put("volumeNode", rs.getString("volume_node"));
          m.put("status", rs.getString("status"));
          return m;
        }).optional()
        .orElseThrow(() -> BizException.notFound("鉴定记录不存在: " + id));
  }

  private Map<String, Object> row(ResultSet rs, int i) throws SQLException {
    Map<String, Object> m = new LinkedHashMap<>();
    m.put("id", rs.getString("id"));
    m.put("volumeNode", rs.getString("volume_node"));
    m.put("dueDate", rs.getString("due_date"));
    m.put("status", rs.getString("status"));
    m.put("decision", rs.getString("decision"));
    m.put("meetingNote", rs.getString("meeting_note"));
    m.put("reviewer", rs.getString("reviewer"));
    m.put("reviewedAt", rs.getString("reviewed_at") == null ? "" : rs.getString("reviewed_at"));
    m.put("destroyedAt", rs.getString("destroyed_at") == null ? "" : rs.getString("destroyed_at"));
    // T13 法定要件字段
    m.put("signApplicant", rs.getString("sign_applicant") == null ? "" : rs.getString("sign_applicant"));
    m.put("signApplicantAt", rs.getString("sign_applicant_at") == null ? "" : rs.getString("sign_applicant_at"));
    m.put("signArchives", rs.getString("sign_archives") == null ? "" : rs.getString("sign_archives"));
    m.put("signArchivesAt", rs.getString("sign_archives_at") == null ? "" : rs.getString("sign_archives_at"));
    m.put("signSupervisor", rs.getString("sign_supervisor") == null ? "" : rs.getString("sign_supervisor"));
    m.put("signSupervisorAt", rs.getString("sign_supervisor_at") == null ? "" : rs.getString("sign_supervisor_at"));
    m.put("supervisorNote", rs.getString("supervisor_note") == null ? "" : rs.getString("supervisor_note"));
    m.put("unrecoverableVerified", rs.getBoolean("unrecoverable_verified"));
    m.put("unrecoverableNote", rs.getString("unrecoverable_note") == null ? "" : rs.getString("unrecoverable_note"));
    m.put("unsettledCheck", rs.getBoolean("unsettled_check"));
    m.put("unsettledNote", rs.getString("unsettled_note") == null ? "" : rs.getString("unsettled_note"));
    m.put("registerNo", rs.getString("register_no") == null ? "" : rs.getString("register_no"));
    m.put("registerFileNode", rs.getString("register_file_node") == null ? "" : rs.getString("register_file_node"));
    return m;
  }

  @SuppressWarnings("unchecked")
  private List<Map<String, Object>> childFolders(String ticket, String parentId) {
    List<Map<String, Object>> out = new ArrayList<>();
    int skip = 0;
    while (true) {
      Map<String, Object> list;
      try {
        list = nodes.listChildren(ticket, parentId, skip, 500);
      } catch (HttpClientErrorException.NotFound e) {
        return out;
      } catch (HttpClientErrorException e) {
        throw RepoLayout.translate("目录扫描失败", e);
      }
      for (Map<String, Object> e : (List<Map<String, Object>>) list.get("entries")) {
        Map<String, Object> entry = (Map<String, Object>) e.get("entry");
        if (Boolean.TRUE.equals(entry.get("isFolder"))) out.add(entry);
      }
      Map<String, Object> paging = (Map<String, Object>) list.get("pagination");
      if (!Boolean.TRUE.equals(paging.get("hasMoreItems"))) break;
      skip += 500;
    }
    return out;
  }

  @SuppressWarnings("unchecked")
  private List<Map<String, Object>> childrenOfType(String ticket, String parentId, String nodeType) {
    List<Map<String, Object>> out = new ArrayList<>();
    int skip = 0;
    while (true) {
      Map<String, Object> list;
      try {
        list = nodes.listChildren(ticket, parentId, skip, 500);
      } catch (HttpClientErrorException.NotFound e) {
        return out;
      } catch (HttpClientErrorException e) {
        throw RepoLayout.translate("子节点扫描失败", e);
      }
      for (Map<String, Object> e : (List<Map<String, Object>>) list.get("entries")) {
        Map<String, Object> entry = (Map<String, Object>) e.get("entry");
        if (nodeType.equals(entry.get("nodeType"))) out.add(entry);
      }
      Map<String, Object> paging = (Map<String, Object>) list.get("pagination");
      if (!Boolean.TRUE.equals(paging.get("hasMoreItems"))) break;
      skip += 500;
    }
    return out;
  }

  @SuppressWarnings("unchecked")
  private static String prop(Map<String, Object> entry, String name) {
    Object props = entry.get("properties");
    if (!(props instanceof Map)) return "";
    Object v = ((Map<String, Object>) props).get(name);
    return v == null ? "" : String.valueOf(v);
  }

  @SuppressWarnings("unchecked")
  private static Integer intProp(Map<String, Object> entry, String name) {
    Object props = entry.get("properties");
    if (!(props instanceof Map)) return null;
    Object v = ((Map<String, Object>) props).get(name);
    return v instanceof Number n ? n.intValue() : null;
  }

  private static String str(Object o) {
    return o == null ? "" : String.valueOf(o);
  }

  private static boolean notBlank(String s) {
    return s != null && !s.isBlank();
  }
}
