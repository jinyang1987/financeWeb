package com.finance.ams.oplog;

import java.security.MessageDigest;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.LinkedHashMap;
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
    append(actorId, actorName, action, target, orderId, detail, null);
  }

  /**
   * 追加操作日志（带客户端 IP，2026-08-25）。
   * ip 列（inet）仅存证、不入哈希链输入——保持与历史行同一验链公式，链可真实重算。
   */
  public void append(String actorId, String actorName, String action, String target,
                     String orderId, String detail, String ip) {
    // 注意：表结构以 V1__init.sql 为准——时间列是 ts（非 created_at），目标列是 target_label（非 target），id 为 bigserial 自增
    String prevHash = jdbc.sql("SELECT hash FROM ams_operation_log ORDER BY ts DESC, id DESC LIMIT 1")
        .query().listOfRows().stream().findFirst().map(r -> String.valueOf(r.get("hash"))).orElse("GENESIS");
    // 毫秒截断：PG timestamptz 为微秒精度，纳秒值入库会四舍五入导致链式校验时 ts 文本漂移
    // （2026-08-16 审计链验真修复：保证 hash 输入的 ts 与库内读回值严格一致，链可真实重算）
    java.time.LocalDateTime now = java.time.LocalDateTime.now().truncatedTo(java.time.temporal.ChronoUnit.MILLIS);
    String ts = now.format(DateTimeFormatter.ISO_LOCAL_DATE_TIME);
    String hash = sha256(prevHash + actorId + action + target + ts);

    jdbc.sql("""
        INSERT INTO ams_operation_log (actor_id, actor_name, action, target_label, order_id, detail, hash, prev_hash, ts, ip)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?::inet)
        """)
        .param(actorId).param(actorName)
        .param(action).param(target).param(toUuidOrNull(orderId)).param(detail)
        .param(hash).param(prevHash).param(java.sql.Timestamp.valueOf(now))
        .param(toIpOrNull(ip))
        .update();
  }

  /** 客户端真实 IP：优先取 X-Forwarded-For 首段（反代/网关场景），否则远端地址 */
  public static String clientIp(jakarta.servlet.http.HttpServletRequest request) {
    if (request == null) return null;
    String xff = request.getHeader("X-Forwarded-For");
    if (xff != null && !xff.isBlank()) {
      String first = xff.split(",")[0].trim();
      if (!first.isEmpty()) return first;
    }
    String real = request.getHeader("X-Real-IP");
    if (real != null && !real.isBlank()) return real.trim();
    return request.getRemoteAddr();
  }

  /** ip 列（inet 类型）：空白转 null；非法格式降级为 null 而不是让整条日志写入失败 */
  private static Object toIpOrNull(String ip) {
    if (ip == null || ip.isBlank()) return null;
    String s = ip.trim();
    if (!s.matches("[0-9a-fA-F.:]+")) return null;
    return s;
  }

  /**
   * 审计链验真（2026-08-16）：按 (ts, id) 顺序重算每条 hash 并核对 prev_hash 链接。
   * 任何篡改/删除中间行都会导致断链。返回 total/verified/broken + 前 10 个断点行 id。
   * 注意：精度修复前（2026-08-16 之前）写入的历史行因 ts 纳秒漂移无法重算匹配，
   * 会计入 unverifiable（如实报告，不粉饰）。
   */
  public Map<String, Object> verifyChain() {
    List<Map<String, Object>> rows = jdbc.sql("""
        SELECT id, actor_id, action, target_label, ts, hash, prev_hash
        FROM ams_operation_log ORDER BY ts ASC, id ASC
        """).query().listOfRows();

    String prev = "GENESIS";
    int verified = 0;
    List<Object> brokenIds = new ArrayList<>();
    List<Object> unverifiableIds = new ArrayList<>();
    for (Map<String, Object> r : rows) {
      String tsText = toIsoText(r.get("ts"));
      String expected = sha256(prev + str(r.get("actor_id")) + str(r.get("action")) + str(r.get("target_label")) + tsText);
      boolean linkOk = prev.equals(str(r.get("prev_hash")));
      boolean hashOk = expected.equals(str(r.get("hash")));
      if (linkOk && hashOk) {
        verified++;
      } else if (linkOk) {
        // 链接完好但内容哈希不符：历史行（精度漂移）或真篡改——如实单列
        unverifiableIds.add(r.get("id"));
      } else {
        brokenIds.add(r.get("id"));
      }
      prev = str(r.get("hash"));
    }
    Map<String, Object> out = new LinkedHashMap<>();
    out.put("total", rows.size());
    out.put("verified", verified);
    out.put("unverifiable", unverifiableIds.size());
    out.put("broken", brokenIds.size());
    out.put("brokenIds", brokenIds.stream().limit(10).toList());
    out.put("unverifiableIds", unverifiableIds.stream().limit(10).toList());
    out.put("chainIntact", brokenIds.isEmpty());
    return out;
  }

  /** ts 列值 → ISO 文本（与 append 时 hash 输入严格一致的渲染） */
  private static String toIsoText(Object ts) {
    if (ts instanceof java.sql.Timestamp t) {
      return t.toLocalDateTime().format(DateTimeFormatter.ISO_LOCAL_DATE_TIME);
    }
    return str(ts);
  }

  public List<Map<String, Object>> query(String actorId, String action, String orderId,
                                         String from, String to, int skip, int limit) {
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
    if (from != null && !from.isBlank()) { sql.append(" AND ts >= ?::timestamptz"); params.add(from.trim()); }
    if (to != null && !to.isBlank()) { sql.append(" AND ts <= ?::timestamptz"); params.add(to.trim()); }
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

  public long count(String actorId, String action, String from, String to) {
    var sql = new StringBuilder("SELECT COUNT(*) FROM ams_operation_log WHERE 1=1");
    var params = new java.util.ArrayList<Object>();
    if (actorId != null && !actorId.isBlank()) { sql.append(" AND actor_id = ?"); params.add(actorId); }
    if (action != null && !action.isBlank()) { sql.append(" AND action = ?"); params.add(action); }
    if (from != null && !from.isBlank()) { sql.append(" AND ts >= ?::timestamptz"); params.add(from.trim()); }
    if (to != null && !to.isBlank()) { sql.append(" AND ts <= ?::timestamptz"); params.add(to.trim()); }
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

  private static String str(Object o) { return o == null ? "" : String.valueOf(o); }
}
