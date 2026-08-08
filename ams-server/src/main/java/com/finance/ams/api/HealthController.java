package com.finance.ams.api;

import java.time.OffsetDateTime;

import javax.sql.DataSource;

import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 健康检查（P0-2 验收端点）
 */
@RestController
public class HealthController {

  private final JdbcClient jdbc;

  public HealthController(DataSource dataSource) {
    this.jdbc = JdbcClient.create(dataSource);
  }

  @GetMapping("/health")
  public ResponseEntity<HealthResponse> health() {
    String db = "down";
    String migration = "none";
    try {
      jdbc.sql("SELECT 1").query(Integer.class).single();
      db = "up";
      migration = jdbc.sql("SELECT COALESCE(MAX(version), '0') FROM ams.flyway_schema_history WHERE success")
          .query(String.class).optional().orElse("0");
    } catch (Exception ignored) {
      // schema 尚未迁移时 flyway_schema_history 不存在，属正常
    }
    return ResponseEntity.ok(new HealthResponse("ok", "ams-server", db, migration, OffsetDateTime.now().toString()));
  }

  public record HealthResponse(String status, String service, String database, String migration, String time) {}
}
