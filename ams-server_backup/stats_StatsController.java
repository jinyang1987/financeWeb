package com.finance.ams.stats;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import javax.sql.DataSource;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.web.bind.annotation.*;

/**
 * 统计聚合端点（P4-4）：服务端 SQL 聚合
 */
@RestController
@RequestMapping("/stats")
public class StatsController {

  private final JdbcClient jdbc;

  public StatsController(DataSource dataSource) {
    this.jdbc = JdbcClient.create(dataSource);
  }

  @GetMapping("/inventory")
  public Map<String, Object> inventory(
      @RequestHeader(value = "X-User-Id", required = false) String userId,
      @RequestHeader(value = "X-Alfresco-Ticket", required = false) String ticket) {
    Map<String, Object> result = new LinkedHashMap<>();
    result.put("borrowOrders", jdbc.sql("SELECT COUNT(*) FROM ams_borrow_order").query(Long.class).single());
    result.put("activeFulfillments", jdbc.sql("SELECT COUNT(*) FROM ams_fulfillment WHERE status IN ('granted','lent','pending','queued')").query(Long.class).single());
    result.put("inspectionReports", jdbc.sql("SELECT COUNT(*) FROM ams_inspection_report").query(Long.class).single());
    result.put("operationLogs", jdbc.sql("SELECT COUNT(*) FROM ams_operation_log").query(Long.class).single());
    result.put("storageNodes", jdbc.sql("SELECT COUNT(*) FROM ams_storage_node").query(Long.class).single());
    return result;
  }

  @GetMapping("/lifecycle")
  public Map<String, Object> lifecycle(
      @RequestHeader(value = "X-User-Id", required = false) String userId,
      @RequestHeader(value = "X-Alfresco-Ticket", required = false) String ticket) {
    Map<String, Object> result = new LinkedHashMap<>();
    result.put("inspectionByPhase", jdbc.sql(
        "SELECT phase, all_pass, COUNT(*) AS cnt FROM ams_inspection_report GROUP BY phase, all_pass").query().listOfRows());
    result.put("inspectionPassRate", jdbc.sql(
        "SELECT ROUND(100.0 * SUM(CASE WHEN all_pass THEN 1 ELSE 0 END) / NULLIF(COUNT(*),0), 1) FROM ams_inspection_report")
        .query().optionalRow().map(r -> r.values().iterator().next()).orElse(0));
    result.put("recentLogs", jdbc.sql(
        "SELECT action, COUNT(*) AS cnt FROM ams_operation_log GROUP BY action ORDER BY cnt DESC LIMIT 10").query().listOfRows());
    return result;
  }

  @GetMapping("/compliance")
  public Map<String, Object> compliance(
      @RequestHeader(value = "X-User-Id", required = false) String userId,
      @RequestHeader(value = "X-Alfresco-Ticket", required = false) String ticket) {
    Map<String, Object> result = new LinkedHashMap<>();
    result.put("overdueFulfillments", jdbc.sql("SELECT COUNT(*) FROM ams_fulfillment WHERE status='overdue'").query(Long.class).single());
    result.put("blacklistCandidates", jdbc.sql("""
        SELECT COUNT(DISTINCT o.applicant_id) FROM ams_borrow_order o
        JOIN ams_fulfillment f ON f.order_id = o.id
        WHERE f.type='physical' AND f.status IN ('lent','overdue')
          AND f.end_date < CURRENT_DATE AND o.status NOT IN ('terminated','rejected')
        """).query(Long.class).single());
    result.put("logIntegrity", jdbc.sql("SELECT COUNT(*) FROM ams_operation_log").query(Long.class).single());
    return result;
  }

    @GetMapping("/borrow")
  public Map<String, Object> borrow(
      @RequestHeader(value = "X-User-Id", required = false) String userId,
      @RequestHeader(value = "X-Alfresco-Ticket", required = false) String ticket) {
    Map<String, Object> result = new LinkedHashMap<>();
    result.put("byStatus", jdbc.sql("SELECT status, COUNT(*) AS cnt FROM ams_borrow_order GROUP BY status").query().listOfRows());
    result.put("overdue", jdbc.sql("SELECT COUNT(*) FROM ams_fulfillment WHERE status='overdue'").query(Long.class).single());
    result.put("fulfillmentByType", jdbc.sql("SELECT type, status, COUNT(*) AS cnt FROM ams_fulfillment GROUP BY type, status").query().listOfRows());
    return result;
  }
}

