package com.finance.ams.fixity;

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import javax.sql.DataSource;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import com.finance.ams.alfresco.AlfrescoAdminClient;
import com.finance.ams.alfresco.AlfrescoNodeClient;
import com.finance.ams.alfresco.RepoLayout;
import com.finance.ams.oplog.OperationLogService;
import com.finance.ams.util.HashUtil;

/**
 * 电子文件固化服务（2026-08-29 T1 真实性底座，DA/T 70-2018 固化信息有效性落地）。
 *
 * 职责：
 *  1. 登记：建件/推送/用友同步三入口写完内容后调用 register——SHA-256 + 字节数 + 格式
 *     落 PG ams_record_fixity（件级；Alfresco 模型不动，与混合架构一致）；
 *  2. 卷级聚合：确认组卷时按件号序拼接件哈希再取 SHA-256，写卷级 finance:digitalHash；
 *  3. 重算比对（verify）：下载内容重算与登记值逐位比对——四性检测 hash-verify 执行器与
 *     定期巡检共用此入口；
 *  4. 定期巡检（BC-1-1）：cron 可配（ams.fixity.cron，默认每周日 02:30），每轮比对
 *     最久未验的 300 件，异常落检测报告（phase=cq）+ 操作日志；
 *  5. 存量补登记（backfill）：遍历全宗 收集池/案卷库/盒库，为无登记件补登记。
 *
 * 注意：比对基准是「登记值」而非任何实时属性——登记值落库后不受 Alfresco 侧变更影响，
 *      这才构成防篡改证据链。
 */
@Service
public class FixityService {

  private static final Logger log = LoggerFactory.getLogger(FixityService.class);

  /** 巡检单轮最大比对件数（控制单轮时长；多轮自然覆盖全量） */
  private static final int PATROL_BATCH = 300;
  /** 存量补登记单次遍历节点上限（防爆保护） */
  private static final int BACKFILL_NODE_CAP = 20000;

  private final AlfrescoNodeClient nodes;
  private final AlfrescoAdminClient admin;
  private final RepoLayout layout;
  private final JdbcClient jdbc;
  private final OperationLogService oplog;

  public FixityService(AlfrescoNodeClient nodes, AlfrescoAdminClient admin, RepoLayout layout,
                       DataSource dataSource, OperationLogService oplog) {
    this.nodes = nodes;
    this.admin = admin;
    this.layout = layout;
    this.jdbc = JdbcClient.create(dataSource);
    this.oplog = oplog;
  }

  // ═══════════════════ 登记 ═══════════════════

  /**
   * 登记内容摘要（幂等 upsert；重新登记会重置巡检状态——内容被合法替换时应重新登记，
   * 但本系统归档链路内容写入后不可变，重复登记仅发生在建件瞬间）。
   *
   * @return 登记的 SHA-256（小写 hex）
   */
  public String register(String nodeId, byte[] bytes, String mime, String userId) {
    String sha = HashUtil.sha256Hex(bytes);
    jdbc.sql("""
        INSERT INTO ams.ams_record_fixity (node_id, sha256, size_bytes, mime, registered_by)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT (node_id) DO UPDATE SET
          sha256 = EXCLUDED.sha256, size_bytes = EXCLUDED.size_bytes, mime = EXCLUDED.mime,
          registered_by = EXCLUDED.registered_by, registered_at = now(),
          last_verified_at = NULL, last_verify_ok = NULL, verify_count = 0
        """)
        .param(nodeId).param(sha).param((long) bytes.length)
        .param(mime == null ? "" : mime).param(userId == null ? "" : userId)
        .update();
    return sha;
  }

  /** 查登记行（无登记返回 null） */
  public Map<String, Object> lookup(String nodeId) {
    return jdbc.sql("SELECT * FROM ams.ams_record_fixity WHERE node_id = ?")
        .param(nodeId).query().listOfRows().stream().findFirst().orElse(null);
  }

  /** 是否已登记（检测执行器 hash-registered 用） */
  public boolean registered(String nodeId) {
    Integer n = jdbc.sql("SELECT count(*) FROM ams.ams_record_fixity WHERE node_id = ?")
        .param(nodeId).query(Integer.class).single();
    return n != null && n > 0;
  }

  // ═══════════════════ 重算比对 ═══════════════════

  public record VerifyResult(boolean ok, String note, String expected, String actual) {}

  /**
   * 单件重算比对：下载内容 → SHA-256 → 与登记值逐位比对；同步刷新巡检字段。
   * 未登记/下载失败均判不通过（宁可误报不可漏报——真实性维度保守原则）。
   */
  public VerifyResult verify(String ticket, String nodeId) {
    Map<String, Object> row = lookup(nodeId);
    if (row == null) {
      return new VerifyResult(false, "未登记文件摘要（无法校验防篡改）", "", "");
    }
    String expected = String.valueOf(row.get("sha256"));
    String actual;
    try {
      ResponseEntity<byte[]> resp = nodes.getContent(ticket, nodeId);
      byte[] body = resp.getBody();
      if (body == null) return new VerifyResult(false, "内容读取为空", expected, "");
      actual = HashUtil.sha256Hex(body);
    } catch (Exception e) {
      markVerified(nodeId, false);
      return new VerifyResult(false, "内容读取失败: " + e.getMessage(), expected, "");
    }
    boolean ok = expected.equalsIgnoreCase(actual);
    markVerified(nodeId, ok);
    return new VerifyResult(ok, ok ? "" : "内容摘要不一致：登记 " + expected + " ≠ 重算 " + actual, expected, actual);
  }

  private void markVerified(String nodeId, boolean ok) {
    jdbc.sql("""
        UPDATE ams.ams_record_fixity
        SET last_verified_at = now(), last_verify_ok = ?, verify_count = verify_count + 1
        WHERE node_id = ?
        """).param(ok).param(nodeId).update();
  }

  /**
   * 卷级聚合摘要：卷内件按件号排序后的件哈希拼接再 SHA-256。
   * 任一件未登记返回 null（调用方应跳过卷级登记并告警，由补登记/巡检收口）。
   *
   * @param sortedChildren 卷内件（调用方已按件号排序）
   */
  public String aggregateForVolume(List<Map<String, Object>> sortedChildren) {
    List<String> hashes = new ArrayList<>();
    for (Map<String, Object> child : sortedChildren) {
      Map<String, Object> row = lookup(String.valueOf(child.get("id")));
      if (row == null) return null;
      hashes.add(String.valueOf(row.get("sha256")));
    }
    if (hashes.isEmpty()) return null;
    return HashUtil.aggregateSha256(hashes);
  }

  // ═══════════════════ 定期巡检（BC-1-1） ═══════════════════

  /** 定时入口：默认每周日 02:30（cron 可用 ams.fixity.cron 覆盖） */
  @Scheduled(cron = "${ams.fixity.cron:0 30 2 * * SUN}")
  public void scheduledPatrol() {
    try {
      runPatrol("system:fixity-patrol");
    } catch (Exception e) {
      log.error("固化巡检执行失败", e);
    }
  }

  /** 巡检一轮：取最久未验的一批重算比对；异常逐件落检测报告（phase=cq）+ 操作日志 */
  public Map<String, Object> runPatrol(String operator) {
    String ticket = admin.getAdminTicket();
    List<Map<String, Object>> due = jdbc.sql("""
        SELECT node_id FROM ams.ams_record_fixity
        ORDER BY last_verified_at ASC NULLS FIRST LIMIT ?
        """).param(PATROL_BATCH).query().listOfRows();

    int ok = 0, bad = 0;
    List<String> badIds = new ArrayList<>();
    for (Map<String, Object> row : due) {
      String nodeId = String.valueOf(row.get("node_id"));
      VerifyResult r = verify(ticket, nodeId);
      if (r.ok()) ok++;
      else {
        bad++;
        badIds.add(nodeId);
        insertPatrolReport(nodeId, r, operator);
      }
    }
    if (!due.isEmpty() || bad > 0) {
      oplog.append(operator, operator, "固化巡检", "全库", null,
          "重算比对 " + due.size() + " 件：一致 " + ok + "，异常 " + bad
              + (bad > 0 ? "（" + String.join("、", badIds.stream().limit(5).toList()) + (bad > 5 ? " …" : "") + "）" : ""));
    }
    log.info("固化巡检完成：比对 {} 件，一致 {}，异常 {}", due.size(), ok, bad);
    Map<String, Object> out = new LinkedHashMap<>();
    out.put("checked", due.size());
    out.put("consistent", ok);
    out.put("mismatched", bad);
    out.put("mismatchedIds", badIds.stream().limit(20).toList());
    return out;
  }

  /** 巡检异常落检测报告（phase=cq 长期保存环节，real=false 真实性不通过） */
  private void insertPatrolReport(String nodeId, VerifyResult r, String operator) {
    try {
      jdbc.sql("""
          INSERT INTO ams.ams_inspection_report (id, target_node, target_kind, phase,
            real, complete, usable, safe, detail_json, operator, created_at)
          VALUES (?::uuid, ?, 'record', 'cq', false, true, true, true, ?::jsonb, ?, now())
          """)
          .param(UUID.randomUUID().toString())
          .param(nodeId)
          .param("{\"allPass\":false,\"summary\":\"固化巡检异常: " + escapeJson(r.note())
              + "\",\"items\":[{\"code\":\"CQ-1-02\",\"name\":\"在库件摘要重算比对\",\"dimension\":\"real\",\"pass\":false,\"note\":\""
              + escapeJson(r.note()) + "\",\"target\":\"" + nodeId + "\"}]}")
          .param(operator)
          .update();
    } catch (Exception e) {
      log.error("巡检异常报告落库失败: {}", nodeId, e);
    }
  }

  private static String escapeJson(String s) {
    return s == null ? "" : s.replace("\\", "\\\\").replace("\"", "\\\"");
  }

  // ═══════════════════ 存量补登记 ═══════════════════

  /**
   * 遍历全宗的 收集池/案卷库/盒库，为无固化登记的件补登记（以当前内容为准）。
   * 首次上线/模型演进后的存量治理入口；返回统计。
   */
  @SuppressWarnings("unchecked")
  public Map<String, Object> backfill(String ticket, String fondsCode, String userId) {
    String fondsId = layout.fonds(ticket, fondsCode); // 不存在则抛 FONDS_NOT_FOUND（只读解析，不创建）
    // 遍历起点：全宗下的 收集池/案卷库/盒库（存在才入队）
    Deque<String> queue = new ArrayDeque<>();
    for (Map<String, Object> child : childrenOf(ticket, fondsId)) {
      String name = String.valueOf(child.get("name"));
      if (RepoLayout.POOL_NAME.equals(name) || RepoLayout.VOLUMES_ROOT.equals(name) || RepoLayout.BOXES_ROOT.equals(name)) {
        queue.add(String.valueOf(child.get("id")));
      }
    }

    int visited = 0, registered = 0, skipped = 0;
    List<String> errors = new ArrayList<>();
    while (!queue.isEmpty() && visited < BACKFILL_NODE_CAP) {
      String parentId = queue.poll();
      for (Map<String, Object> entry : childrenOf(ticket, parentId)) {
        visited++;
        String type = String.valueOf(entry.get("nodeType"));
        String id = String.valueOf(entry.get("id"));
        if ("finance:record".equals(type)) {
          if (registered(id)) { skipped++; continue; }
          try {
            ResponseEntity<byte[]> resp = nodes.getContent(ticket, id);
            byte[] body = resp.getBody();
            if (body == null || body.length == 0) { skipped++; continue; }
            String mime = "";
            Object content = entry.get("content");
            if (content instanceof Map<?, ?> c && c.get("mimeType") != null) mime = String.valueOf(c.get("mimeType"));
            register(id, body, mime, userId);
            registered++;
          } catch (Exception e) {
            errors.add(id + ": " + e.getMessage());
            log.warn("补登记失败 {}: {}", id, e.getMessage());
          }
        } else if (Boolean.TRUE.equals(entry.get("isFolder")) || type.startsWith("cm:folder")
            || type.startsWith("finance:")) {
          queue.add(id);
        }
      }
    }
    oplog.append(userId, userId, "固化补登记", fondsCode, null,
        "遍历 " + visited + " 节点，新登记 " + registered + " 件，已登记跳过 " + skipped + " 件，失败 " + errors.size() + " 件");
    log.info("固化补登记[{}]: 遍历 {} 节点，新登记 {}，跳过 {}，失败 {}", fondsCode, visited, registered, skipped, errors.size());
    Map<String, Object> out = new LinkedHashMap<>();
    out.put("visited", visited);
    out.put("registered", registered);
    out.put("skipped", skipped);
    out.put("failed", errors.size());
    out.put("errors", errors.stream().limit(10).toList());
    return out;
  }

  @SuppressWarnings("unchecked")
  private List<Map<String, Object>> childrenOf(String ticket, String parentId) {
    List<Map<String, Object>> out = new ArrayList<>();
    int skip = 0;
    while (true) {
      Map<String, Object> list = nodes.listChildren(ticket, parentId, skip, 500);
      for (Map<String, Object> e : (List<Map<String, Object>>) list.get("entries")) {
        out.add((Map<String, Object>) e.get("entry"));
      }
      Map<String, Object> paging = (Map<String, Object>) list.get("pagination");
      if (!Boolean.TRUE.equals(paging.get("hasMoreItems"))) break;
      skip += 500;
    }
    return out;
  }

  // ═══════════════════ 状态统计 ═══════════════════

  public Map<String, Object> status() {
    Map<String, Object> out = new LinkedHashMap<>();
    out.put("total", jdbc.sql("SELECT count(*) FROM ams.ams_record_fixity").query(Long.class).single());
    out.put("verified", jdbc.sql("SELECT count(*) FROM ams.ams_record_fixity WHERE last_verified_at IS NOT NULL").query(Long.class).single());
    out.put("consistent", jdbc.sql("SELECT count(*) FROM ams.ams_record_fixity WHERE last_verify_ok = true").query(Long.class).single());
    out.put("mismatched", jdbc.sql("SELECT count(*) FROM ams.ams_record_fixity WHERE last_verify_ok = false").query(Long.class).single());
    out.put("neverVerified", jdbc.sql("SELECT count(*) FROM ams.ams_record_fixity WHERE last_verified_at IS NULL").query(Long.class).single());
    return out;
  }
}
