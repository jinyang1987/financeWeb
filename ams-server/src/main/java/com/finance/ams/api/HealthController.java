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
      // version 列为 varchar，须按整数比较（字符串 MAX 下 '9' > '10' 会误报）。
      // 仅取纯数字版本号，排除空串与语义化版本（如 << Flyway Schema Creation >> 的 ''）。
      migration = jdbc.sql("SELECT COALESCE(MAX(version::integer), 0) FROM ams.flyway_schema_history "
              + "WHERE success AND version ~ '^[0-9]+$'")
          .query(Integer.class).optional().orElse(0).toString();
    } catch (Exception ignored) {
      // schema 尚未迁移时 flyway_schema_history 不存在，属正常
    }
    return ResponseEntity.ok(new HealthResponse("ok", "ams-server", db, migration, OffsetDateTime.now().toString()));
  }

  public record HealthResponse(String status, String service, String database, String migration, String time) {}
}
