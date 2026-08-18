package com.finance.ams.review;

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

import com.finance.ams.api.BizException;
import com.finance.ams.alfresco.AlfrescoNodeClient;
import com.finance.ams.record.RecordService;

/**
 * 审核服务（2026-08-09）
 *
 * 业务语义（双链路）：
 *   - 抓取/推送入收集池后，可「进审核库」先审核，审核通过后再组卷；
 *   - 也可「直接组卷」跳过审核。
 *
 * 记录状态机（复用 Alfresco finance:recordStatus 约束内取值，不新增枚举）：
 *   - 仅件数据  收集池（未审核、未组卷）
 *   - 待审核    「审核库」中的记录（进入审核库时置）
 *   - 已组卷    组卷确认后的正式归档状态
 *
 * 审核动作：
 *   - enter：收集池(仅件数据) → 审核库(待审核)
 *   - approve：审核库(待审核) → 通过（回到仅件数据但带审核记录，可组卷）
 *   - reject：审核库(待审核) → 驳回（仅件数据 + 驳回意见；前端可重新编辑后再入审核）
 *
 * 每次动作写入 ams_review_log 留痕（谁、何时、什么意见）。
 */
@Service
public class ReviewService {

  private static final Logger log = LoggerFactory.getLogger(ReviewService.class);

  private final JdbcClient jdbc;
  private final RecordService records;
  private final AlfrescoNodeClient nodes;

  public ReviewService(DataSource dataSource, RecordService records, AlfrescoNodeClient nodes) {
    this.jdbc = JdbcClient.create(dataSource);
    this.records = records;
    this.nodes = nodes;
  }

  /** 进入审核库：仅件数据 → 待审核 */
  public Map<String, Object> enter(String ticket, String userId, String nodeId, String comment) {
    ensureStatus(ticket, nodeId, "仅件数据", "仅「仅件数据」记录可进入审核库");
    setStatus(ticket, nodeId, "待审核");
    logReview(nodeId, "enter", userId, comment);
    log.info("记录进入审核库: {}（审核人 {}）", nodeId, userId);
    return view(ticket, nodeId);
  }

  /** 审核通过：待审核 → 仅件数据（带通过记录，可进组卷） */
  public Map<String, Object> approve(String ticket, String userId, String nodeId, String comment) {
    ensureStatus(ticket, nodeId, "待审核", "仅「待审核」记录可审核通过");
    setStatus(ticket, nodeId, "仅件数据");
    logReview(nodeId, "approve", userId, comment);
    log.info("审核通过: {}（审核人 {}）", nodeId, userId);
    return view(ticket, nodeId);
  }

  /** 审核驳回：待审核 → 仅件数据（带驳回意见） */
  public Map<String, Object> reject(String ticket, String userId, String nodeId, String comment) {
    ensureStatus(ticket, nodeId, "待审核", "仅「待审核」记录可驳回");
    setStatus(ticket, nodeId, "仅件数据");
    logReview(nodeId, "reject", userId, comment);
    log.info("审核驳回: {}（审核人 {}）", nodeId, userId);
    return view(ticket, nodeId);
  }

  /** 审核库列表：某全宗下 recordStatus=待审核 的记录 */
  public List<Map<String, Object>> pendingList(String ticket, String fondsCode,
                                               String archiveType, Integer year, Integer month) {
    // 审核库实际是收集池里 status=待审核 的子集（无独立目录），
    // 复用 RecordService.listPool 做全量过滤。
    var pool = records.listPool(ticket, new RecordService.PoolQuery(
        fondsCode, archiveType, year, month, null, 0, 1000));
    List<Map<String, Object>> out = new ArrayList<>();
    for (Map<String, Object> r : pool.items()) {
      if ("待审核".equals(r.get("recordStatus"))) {
        out.add(withReviewInfo(ticket, r));
      }
    }
    return out;
  }

  /** 已处理列表：审核通过/驳回过的记录（按最近动作倒序，供核对工作台「已处理」Tab） */
  public List<Map<String, Object>> processedList(String ticket, String fondsCode) {
    List<Map<String, Object>> reviewed = jdbc.sql("""
        SELECT record_node_id, MAX(id) AS last_id FROM ams.ams_review_log
        WHERE action IN ('approve','reject')
        GROUP BY record_node_id ORDER BY last_id DESC LIMIT 200
        """)
        .query((rs, i) -> Map.<String, Object>of(
            "nodeId", rs.getString("record_node_id"),
            "lastId", rs.getLong("last_id")))
        .list();
    if (reviewed.isEmpty()) return List.of();
    Map<String, Long> lastIds = new LinkedHashMap<>();
    for (Map<String, Object> m : reviewed) {
      lastIds.put(String.valueOf(m.get("nodeId")), (Long) m.get("lastId"));
    }
    var pool = records.listPool(ticket, new RecordService.PoolQuery(
        fondsCode, null, null, null, null, 0, 1000));
    List<Map<String, Object>> out = new ArrayList<>();
    for (Map<String, Object> r : pool.items()) {
      String nodeId = String.valueOf(r.get("nodeId"));
      if (!lastIds.containsKey(nodeId)) continue;
      if ("待审核".equals(r.get("recordStatus"))) continue; // 待审核的在「待审核」Tab
      out.add(withReviewInfo(ticket, r));
    }
    out.sort((a, b) -> Long.compare(
        lastIds.getOrDefault(String.valueOf(b.get("nodeId")), 0L),
        lastIds.getOrDefault(String.valueOf(a.get("nodeId")), 0L)));
    return out;
  }

  /** 某记录的审核历史 */
  public List<Map<String, Object>> reviewHistory(String nodeId) {
    return jdbc.sql("""
        SELECT id, record_node_id, action, COALESCE(reviewer,'') AS reviewer,
               COALESCE(comment,'') AS comment, created_at::text AS created_at
        FROM ams_review_log WHERE record_node_id=? ORDER BY id DESC
        """)
        .param(nodeId)
        .query((rs, i) -> Map.<String, Object>of(
            "id", rs.getLong("id"),
            "record_node_id", rs.getString("record_node_id"),
            "action", rs.getString("action"),
            "reviewer", rs.getString("reviewer"),
            "comment", rs.getString("comment"),
            "created_at", rs.getString("created_at")))
        .list();
  }

  // ═══════════════════ 内部 ═══════════════════

  @SuppressWarnings("unchecked")
  private void ensureStatus(String ticket, String nodeId, String expected, String msg) {
    Map<String, Object> entry;
    try {
      entry = nodes.getNode(ticket, nodeId);
    } catch (org.springframework.web.client.HttpClientErrorException e) {
      throw BizException.notFound("记录不存在: " + nodeId);
    }
    Object props = entry.get("properties");
    String status = props instanceof Map<?, ?> p && p.get("finance:recordStatus") != null
        ? String.valueOf(p.get("finance:recordStatus")) : "";
    if (!expected.equals(status)) {
      throw new BizException(HttpStatus.CONFLICT, "STATUS_NOT_ALLOWED",
          msg + "（当前: " + (status.isBlank() ? "未知" : status) + "）");
    }
  }

  private void setStatus(String ticket, String nodeId, String status) {
    try {
      nodes.updateNode(ticket, nodeId, Map.of("finance:recordStatus", status));
    } catch (Exception e) {
      throw new BizException(HttpStatus.INTERNAL_SERVER_ERROR, "STATUS_UPDATE_FAILED",
          "状态更新失败: " + e.getMessage());
    }
  }

  private void logReview(String nodeId, String action, String reviewer, String comment) {
    jdbc.sql("""
        INSERT INTO ams_review_log (record_node_id, action, reviewer, comment)
        VALUES (?, ?, ?, ?)
        """)
        .params(nodeId, action,
            reviewer == null || reviewer.isBlank() ? "system" : reviewer,
            comment == null ? "" : comment)
        .update();
  }

  @SuppressWarnings("unchecked")
  private Map<String, Object> view(String ticket, String nodeId) {
    Map<String, Object> entry = nodes.getNode(ticket, nodeId);
    Map<String, Object> v = new LinkedHashMap<>();
    v.put("nodeId", entry.get("id"));
    v.put("name", entry.get("name"));
    Object props = entry.get("properties");
    v.put("recordStatus", props instanceof Map<?, ?> p ? p.get("finance:recordStatus") : "");
    v.put("voucherNo", props instanceof Map<?, ?> p ? p.get("finance:voucherNo") : "");
    return v;
  }

  @SuppressWarnings("unchecked")
  private Map<String, Object> withReviewInfo(String ticket, Map<String, Object> r) {
    Map<String, Object> copy = new LinkedHashMap<>(r);
    String nodeId = String.valueOf(r.get("nodeId"));
    List<Map<String, Object>> history = reviewHistory(nodeId);
    copy.put("reviewHistory", history);
    if (!history.isEmpty()) {
      copy.put("lastReview", history.get(0));
    }
    return copy;
  }
}
