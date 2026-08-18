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
 * 鉴定销毁服务（2026-08-16 启用 V1 既有表 ams_appraisal）
 *
 * 业务流程（最小闭环）：
 *   1. 到期测算：扫描盒库中已入库（transferred）案卷，按「年度+保管期限」算保管期满日
 *      （会计档案保管期限自会计年度终了后第一年起算：期满日 = (year+期限+1)-01-01；永久不期满）；
 *   2. 登记鉴定任务（pending，幂等：同卷已有未终结鉴定则跳过）；
 *   3. 鉴定评审：decision=retain（续存，status=retained）/ destroy（status=approved-destroy 待销毁）；
 *   4. 销毁执行：approved-destroy → 删除 Alfresco 卷节点（含卷内件子树）+ destroyed_at + 操作日志。
 *
 * 状态机：pending → approved-destroy → （执行后 destroyed_at 置位，终态）
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
    this.jdbc = JdbcClient.create(dataSource);
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
               reviewed_at::text AS reviewed_at, destroyed_at::text AS destroyed_at
        FROM ams.ams_appraisal
        """ + (notBlank(status) ? " WHERE status = :status" : "") + " ORDER BY due_date";
    var q = jdbc.sql(sql);
    if (notBlank(status)) q = q.param("status", status);
    return q.query(this::row).list();
  }

  // ═══════════════════ 评审 / 销毁执行 ═══════════════════

  /** 鉴定评审：pending → retained（续存）/ approved-destroy（同意销毁） */
  public Map<String, Object> review(String userId, String id, String decision, String meetingNote) {
    Map<String, Object> row = requireRow(id);
    if (!"pending".equals(row.get("status"))) {
      throw new BizException(HttpStatus.CONFLICT, "APPRAISAL_STATE", "仅待鉴定状态可评审（当前: " + row.get("status") + "）");
    }
    if (!List.of("destroy", "retain").contains(decision)) {
      throw BizException.badRequest("VALIDATION_FAILED", "decision 仅支持 destroy/retain");
    }
    String to = "destroy".equals(decision) ? "approved-destroy" : "retained";
    jdbc.sql("""
        UPDATE ams.ams_appraisal
        SET status = ?, decision = ?, meeting_note = ?, reviewer = ?, reviewed_at = now()
        WHERE id = ?::uuid
        """)
        .params(to, decision, meetingNote, userId, id).update();
    oplog.append(userId, userId, "鉴定评审", str(row.get("volumeNode")), null,
        "retain".equals(decision) ? "鉴定结论：续存" : "鉴定结论：同意销毁（待执行）");
    log.info("鉴定评审: {} → {}（操作人 {}）", row.get("volumeNode"), to, userId);
    Map<String, Object> out = new LinkedHashMap<>(row);
    out.put("status", to);
    return out;
  }

  /**
   * 销毁执行：approved-destroy → 删除 Alfresco 卷节点（含卷内件）+ destroyed_at。
   * 以操作人 ticket 执行（Alfresco 权限生效：无删除权限将被 403 拒绝）。
   * 盒计数回退（volumeCount/boxTotalItems）。
   */
  public Map<String, Object> executeDestroy(String ticket, String userId, String id) {
    Map<String, Object> row = requireRow(id);
    if (!"approved-destroy".equals(row.get("status"))) {
      throw new BizException(HttpStatus.CONFLICT, "APPRAISAL_STATE", "仅「同意销毁」状态可执行销毁（当前: " + row.get("status") + "）");
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

    jdbc.sql("UPDATE ams.ams_appraisal SET destroyed_at = now(), status = 'destroyed' WHERE id = ?::uuid")
        .param(id).update();
    oplog.append(userId, userId, "销毁执行", volumeNode, null,
        "销毁案卷「" + title + "」（" + totalItems + " 件），节点" + (nodeDeleted ? "已删除" : "本已不存在"));
    log.info("销毁执行完成: {}（{}，操作人 {}）", volumeNode, title, userId);
    Map<String, Object> out = new LinkedHashMap<>(row);
    out.put("status", "destroyed");
    return out;
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
