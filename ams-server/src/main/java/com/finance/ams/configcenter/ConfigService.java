package com.finance.ams.configcenter;

import java.util.Map;
import java.util.Optional;

import javax.sql.DataSource;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;

import com.finance.ams.api.BizException;

/**
 * 配置中心服务（ams_config KV，jsonb 存储 + 审计字段）
 *
 * key 约定：metadata.display / grouping.rules / code.rule / watermark /
 *          cockpit.layout / role.menus / directory / retention.table /
 *          inspection.plan / approval.routes / report.config
 */
@Service
public class ConfigService {

  private final JdbcClient jdbc;

  public ConfigService(DataSource dataSource) {
    this.jdbc = JdbcClient.create(dataSource);
  }

  public record ConfigEntry(String key, String valueJson, String updatedAt, String updatedBy) {}

  /** 读取配置（不存在返回 empty） */
  public Optional<ConfigEntry> get(String key) {
    return jdbc.sql("SELECT key, value_json::text AS value_json, updated_at::text AS updated_at, COALESCE(updated_by,'') AS updated_by FROM ams_config WHERE key = ?")
        .param(key)
        .query((rs, i) -> new ConfigEntry(
            rs.getString("key"),
            rs.getString("value_json"),
            rs.getString("updated_at"),
            rs.getString("updated_by")))
        .optional();
  }

  /** 读取或抛 404 */
  public ConfigEntry getOrThrow(String key) {
    return get(key).orElseThrow(() -> BizException.notFound("配置 " + key));
  }

  /** 写入（upsert + 审计） */
  public ConfigEntry put(String key, String valueJson, String updatedBy) {
    jdbc.sql("""
        INSERT INTO ams_config (key, value_json, updated_by)
        VALUES (?, ?::jsonb, ?)
        ON CONFLICT (key) DO UPDATE SET
          value_json = EXCLUDED.value_json,
          updated_at = now(),
          updated_by = EXCLUDED.updated_by
        """)
        .params(key, valueJson, updatedBy == null || updatedBy.isBlank() ? "system" : updatedBy)
        .update();
    return getOrThrow(key);
  }

  /** 列举全部 key（管理/调试用） */
  public java.util.List<String> keys() {
    return jdbc.sql("SELECT key FROM ams_config ORDER BY key").query(String.class).list();
  }
}
