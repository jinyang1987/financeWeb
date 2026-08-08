package com.finance.ams.oplog;

import java.security.MessageDigest;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import javax.sql.DataSource;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;

/**
 * 统一操作日志服务（P2-4）：ams_operation_log 哈希链（防篡改）
 *
 * 每条日志的 hash = SHA-256(prev_hash + actor + action + target + timestamp)，
 * 形成单向链表，任何中间篡改都会导致后续哈希不一致。
 */
@Service
public class OperationLogService {

  private final JdbcClient jdbc;

  public OperationLogService(DataSource dataSource) {
    this.jdbc = JdbcClient.create(dataSource);
  }

  public void append(String actorId, String actorName, String action, String target,
                     String orderId, String detail) {
    // 注意：表结构以 V1__init.sql 为准——时间列是 ts（非 created_at），目标列是 target_label（非 target），id 为 bigserial 自增
    String prevHash = jdbc.sql("SELECT hash FROM ams_operation_log ORDER BY ts DESC LIMIT 1")
        .query().listOfRows().stream().findFirst().map(r -> String.valueOf(r.get("hash"))).orElse("GENESIS");
    java.time.LocalDateTime now = java.time.LocalDateTime.now();
    String ts = now.format(DateTimeFormatter.ISO_LOCAL_DATE_TIME);
    String hash = sha256(prevHash + actorId + action + target + ts);

    jdbc.sql("""
        INSERT INTO ams_operation_log (actor_id, actor_name, action, target_label, order_id, detail, hash, prev_hash, ts)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """)
        .param(actorId).param(actorName)
        .param(action).param(target).param(toUuidOrNull(orderId)).param(detail)
        .param(hash).param(prevHash).param(java.sql.Timestamp.valueOf(now))
        .update();
  }

  public List<Map<String, Object>> query(String actorId, String action, String orderId,
                                         int skip, int limit) {
    // 别名兼容前端契约：created_at←ts, target←target_label
    var sql = new StringBuilder("SELECT *, ts AS created_at, target_label AS target FROM ams_operation_log WHERE 1=1");
    var params = new java.util.ArrayList<Object>();
    if (actorId != null && !actorId.isBlank()) { sql.append(" AND actor_id = ?"); params.add(actorId); }
    if (action != null && !action.isBlank()) { sql.append(" AND action = ?"); params.add(action); }
    if (orderId != null && !orderId.isBlank()) {
      UUID oid = toUuidOrNull(orderId);
      if (oid == null) { sql.append(" AND 1=0"); }  // 非 UUID 的 orderId 不可能命中 uuid 列
      else { sql.append(" AND order_id = ?"); params.add(oid); }
    }
    sql.append(" ORDER BY ts DESC LIMIT ? OFFSET ?");
    params.add(limit);
    params.add(skip);
    return jdbc.sql(sql.toString()).params(params.toArray()).query().listOfRows();
  }

  /** order_id 列为 uuid 类型：可解析则转 UUID，否则 null（JDBC setString 直插 uuid 列会报类型错误） */
  private static UUID toUuidOrNull(String s) {
    if (s == null || s.isBlank()) return null;
    try { return UUID.fromString(s.trim()); } catch (Exception e) { return null; }
  }

  public long count(String actorId, String action) {
    var sql = new StringBuilder("SELECT COUNT(*) FROM ams_operation_log WHERE 1=1");
    var params = new java.util.ArrayList<Object>();
    if (actorId != null && !actorId.isBlank()) { sql.append(" AND actor_id = ?"); params.add(actorId); }
    if (action != null && !action.isBlank()) { sql.append(" AND action = ?"); params.add(action); }
    return jdbc.sql(sql.toString()).params(params.toArray()).query(Long.class).single();
  }

  private static String sha256(String input) {
    try {
      MessageDigest md = MessageDigest.getInstance("SHA-256");
      return HexFormat.of().formatHex(md.digest(input.getBytes(java.nio.charset.StandardCharsets.UTF_8)));
    } catch (Exception e) {
      return "ERROR";
    }
  }
}
