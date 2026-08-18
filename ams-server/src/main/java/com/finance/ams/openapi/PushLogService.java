package com.finance.ams.openapi;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import javax.sql.DataSource;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;

/**
 * 集成采集全链路日志（2026-08-16）
 *
 * 推送/抓取入档的每个关键步骤写一行日志（受理→校验→映射→建件→四性→去向→组卷），
 * 供「集成接口采集 → 推送日志」页签展示与问题排查。
 */
@Service
public class PushLogService {

  private final JdbcClient jdbc;

  public PushLogService(DataSource dataSource) {
    this.jdbc = JdbcClient.create(dataSource);
  }

  public void log(String batchNo, String level, String step, String message, String detail) {
    jdbc.sql("""
        INSERT INTO ams.ams_push_log (batch_no, level, step, message, detail)
        VALUES (?, ?, ?, ?, ?)
        """)
        .params(batchNo == null ? "" : batchNo, level, step, message,
            detail == null || detail.isBlank() ? null : detail)
        .update();
  }

  public void info(String batchNo, String step, String message) {
    log(batchNo, "info", step, message, null);
  }

  public void warn(String batchNo, String step, String message) {
    log(batchNo, "warn", step, message, null);
  }

  public void error(String batchNo, String step, String message, String detail) {
    log(batchNo, "error", step, message, detail);
  }

  /** 日志查询：按批次号/级别过滤，倒序 */
  public List<Map<String, Object>> list(String batchNo, String level, int limit) {
    StringBuilder sql = new StringBuilder("""
        SELECT id, batch_no, level, step, message, COALESCE(detail,'') AS detail, created_at::text AS created_at
        FROM ams.ams_push_log WHERE 1=1
        """);
    if (batchNo != null && !batchNo.isBlank()) sql.append(" AND batch_no = :batchNo");
    if (level != null && !level.isBlank()) sql.append(" AND level = :level");
    sql.append(" ORDER BY id DESC LIMIT :limit");
    var q = jdbc.sql(sql.toString()).param("limit", Math.min(Math.max(limit, 1), 500));
    if (batchNo != null && !batchNo.isBlank()) q = q.param("batchNo", batchNo);
    if (level != null && !level.isBlank()) q = q.param("level", level);
    return q.query((rs, i) -> {
      Map<String, Object> m = new LinkedHashMap<>();
      m.put("id", rs.getLong("id"));
      m.put("batchNo", rs.getString("batch_no"));
      m.put("level", rs.getString("level"));
      m.put("step", rs.getString("step"));
      m.put("message", rs.getString("message"));
      m.put("detail", rs.getString("detail"));
      m.put("createdAt", rs.getString("created_at"));
      return m;
    }).list();
  }
}
