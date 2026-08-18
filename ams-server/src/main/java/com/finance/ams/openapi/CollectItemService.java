package com.finance.ams.openapi;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import javax.sql.DataSource;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;

import com.finance.ams.alfresco.AlfrescoNodeClient;
import com.finance.ams.api.BizException;

/**
 * 收集台账服务（2026-08-16）
 *
 * 抓取/推送的每条入池记录统一登记到 ams_collect_item，支撑：
 *   1. 去向路由追踪（直接入库/送组卷/送核对/送审核）
 *   2. 「核对工作台 · 收集池待核对」列表（destination=to-check &amp; check_status=pending）
 *   3. 核对通过流转：通过·送组卷（清台账）/ 通过·送审核（置待审核）
 *
 * 注意：不在 Alfresco 模型上加属性（避免模型重部署），路由标记全部落 ams 库。
 */
@Service
public class CollectItemService {

  private static final Logger log = LoggerFactory.getLogger(CollectItemService.class);

  private final JdbcClient jdbc;
  private final AlfrescoNodeClient nodes;

  public CollectItemService(DataSource dataSource, AlfrescoNodeClient nodes) {
    this.jdbc = JdbcClient.create(dataSource);
    this.nodes = nodes;
  }

  /** 登记一条收集记录 */
  public void record(String recordNodeId, String fondsCode, String sourceType, String batchNo,
                     String category, String destination, String checkStatus,
                     String externalId, String voucherNo, String archiveType) {
    jdbc.sql("""
        INSERT INTO ams.ams_collect_item
          (record_node_id, fonds_code, source_type, batch_no, category, destination,
           check_status, external_id, voucher_no, archive_type)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """)
        .params(recordNodeId, fondsCode, sourceType, batchNo, category, destination,
            checkStatus == null ? "na" : checkStatus, externalId, voucherNo, archiveType)
        .update();
  }

  /** 收集池待核对列表 */
  public List<Map<String, Object>> pendingCheck(String fondsCode) {
    boolean byFonds = fondsCode != null && !fondsCode.isBlank();
    String sql = """
        SELECT id, record_node_id, fonds_code, source_type, batch_no, category, destination,
               external_id, voucher_no, archive_type, created_at::text AS created_at
        FROM ams.ams_collect_item
        WHERE destination = 'to-check' AND check_status = 'pending'
        """ + (byFonds ? " AND fonds_code = :fondsCode" : "") + " ORDER BY id DESC LIMIT 500";
    var q = jdbc.sql(sql);
    if (byFonds) q = q.param("fondsCode", fondsCode);
    return q.query(this::row).list();
  }

  /**
   * 核对通过流转。
   * @param to volume=通过·送组卷（仅清台账）；review=通过·送审核（recordStatus→待审核 + 审核日志）
   */
  public Map<String, Object> pass(String ticket, long id, String to, String reviewer, String comment) {
    Map<String, Object> item = jdbc.sql("""
        SELECT id, record_node_id, fonds_code, voucher_no, archive_type, check_status
        FROM ams.ams_collect_item WHERE id = ?
        """)
        .param(id).query(this::row).optional()
        .orElseThrow(() -> BizException.notFound("收集记录不存在: " + id));
    if (!"pending".equals(item.get("checkStatus"))) {
      throw new BizException(HttpStatus.CONFLICT, "ALREADY_PROCESSED", "该记录已核对处理，请刷新");
    }
    String nodeId = String.valueOf(item.get("recordNodeId"));
    jdbc.sql("UPDATE ams.ams_collect_item SET check_status = 'passed' WHERE id = ?")
        .param(id).update();

    if ("review".equals(to)) {
      enterReviewLibrary(ticket, nodeId, reviewer, comment == null || comment.isBlank() ? "核对通过，转审核" : comment);
    }
    log.info("收集记录核对通过: id={} → {}（操作人 {}）", id, to, reviewer);
    Map<String, Object> out = new LinkedHashMap<>(item);
    out.put("checkStatus", "passed");
    out.put("routedTo", to);
    return out;
  }

  /** 进审核库：recordStatus → 待审核 + ams_review_log 留痕（enter） */
  public void enterReviewLibrary(String ticket, String nodeId, String reviewer, String comment) {
    try {
      nodes.updateNode(ticket, nodeId, Map.of("finance:recordStatus", "待审核"));
    } catch (Exception e) {
      throw new BizException(HttpStatus.INTERNAL_SERVER_ERROR, "STATUS_UPDATE_FAILED",
          "置待审核失败: " + e.getMessage());
    }
    jdbc.sql("""
        INSERT INTO ams.ams_review_log (record_node_id, action, reviewer, comment)
        VALUES (?, 'enter', ?, ?)
        """)
        .params(nodeId, reviewer == null || reviewer.isBlank() ? "system" : reviewer,
            comment == null ? "" : comment)
        .update();
  }

  private Map<String, Object> row(java.sql.ResultSet rs, int i) throws java.sql.SQLException {
    Map<String, Object> m = new LinkedHashMap<>();
    m.put("id", rs.getLong("id"));
    m.put("recordNodeId", rs.getString("record_node_id"));
    m.put("fondsCode", rs.getString("fonds_code"));
    m.put("sourceType", rs.getString("source_type"));
    m.put("batchNo", rs.getString("batch_no"));
    m.put("category", rs.getString("category"));
    m.put("destination", rs.getString("destination"));
    m.put("externalId", rs.getString("external_id"));
    m.put("voucherNo", rs.getString("voucher_no"));
    m.put("archiveType", rs.getString("archive_type"));
    m.put("createdAt", rs.getObject("created_at") == null ? "" : rs.getString("created_at"));
    if (hasColumn(rs, "check_status")) m.put("checkStatus", rs.getString("check_status"));
    return m;
  }

  private static boolean hasColumn(java.sql.ResultSet rs, String name) {
    try { rs.findColumn(name); return true; } catch (java.sql.SQLException e) { return false; }
  }
}
