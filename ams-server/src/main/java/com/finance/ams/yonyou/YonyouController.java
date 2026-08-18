package com.finance.ams.yonyou;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.finance.ams.api.BizException;
import com.finance.ams.configcenter.ConfigService;

/**
 * 用友 BIP 集成端点
 *
 *   GET  /yonyou/status            集成状态总览（配置/连接/最近批次/下次执行）
 *   GET  /yonyou/config            连接配置（appSecret 脱敏回显）
 *   PUT  /yonyou/config            保存连接配置（secret 传空=保持不变）
 *   POST /yonyou/test-connection   实调网关验证（token + 账簿解析）
 *   GET  /yonyou/periods           可选会计期间（用友期间接口真实值）
 *   POST /yonyou/preview           预览某期间凭证数 {period}
 *   POST /yonyou/sync              手动同步 {period, autoGroup?}
 *   GET  /yonyou/batches           批次历史
 *   GET  /yonyou/batches/{id}      批次详情（含明细）
 *   GET  /yonyou/schedule          调度配置
 *   PUT  /yonyou/schedule          保存调度配置 {enabled, cron, autoGroup}
 */
@RestController
@RequestMapping("/yonyou")
public class YonyouController {

  private final YonyouClient client;
  private final YonyouSyncService sync;
  private final YonyouScheduler scheduler;
  private final ConfigService config;
  private final com.finance.ams.auth.AuthService auth;
  private final ObjectMapper json = new ObjectMapper();

  public YonyouController(YonyouClient client, YonyouSyncService sync,
                          YonyouScheduler scheduler, ConfigService config,
                          com.finance.ams.auth.AuthService auth) {
    this.client = client;
    this.sync = sync;
    this.scheduler = scheduler;
    this.config = config;
    this.auth = auth;
  }

  // ═══ 状态总览 ═══

  @GetMapping("/status")
  public Map<String, Object> status(
      @RequestHeader(value = "X-User-Id", required = false) String userId,
      @RequestHeader(value = "X-Alfresco-Ticket", required = false) String ticket) {
    requireAuth(userId, ticket);
    Map<String, Object> out = new LinkedHashMap<>();
    out.put("configured", client.configured());
    if (client.configured()) {
      YonyouClient.Conn c = client.conn();
      out.put("gateway", c.gateway());
      out.put("tenantId", c.tenantId());
      out.put("appKey", c.appKey());
      out.put("accbookCode", c.accbookCode());
      out.put("fondsCode", c.fondsCode());
    }
    out.put("syncRunning", sync.isRunning());
    YonyouSyncService.ScheduleConfig sc = sync.scheduleConfig();
    out.put("schedule", Map.of(
        "enabled", sc.enabled(), "cron", sc.cron(), "autoGroup", sc.autoGroup(),
        "nextRun", scheduler.nextRunAt() == null ? "" : scheduler.nextRunAt().toString()));
    List<Map<String, Object>> batches = sync.listBatches(1);
    out.put("lastBatch", batches.isEmpty() ? null : batches.get(0));
    return out;
  }

  // ═══ 连接配置 ═══

  @GetMapping("/config")
  public Map<String, Object> getConfig(
      @RequestHeader(value = "X-User-Id", required = false) String userId,
      @RequestHeader(value = "X-Alfresco-Ticket", required = false) String ticket) {
    requireAdminRole(userId, ticket);
    Map<String, Object> out = new LinkedHashMap<>();
    out.put("configured", client.configured());
    config.get(YonyouSyncService.CONFIG_CONN).ifPresent(e -> {
      try {
        ObjectNode n = (ObjectNode) json.readTree(e.valueJson());
        if (n.hasNonNull("appSecret") && !n.get("appSecret").asText().isBlank()) {
          n.put("appSecret", "********");   // 脱敏回显
        }
        out.putAll(json.convertValue(n, Map.class));
      } catch (Exception ignored) { }
      out.put("updatedAt", e.updatedAt());
      out.put("updatedBy", e.updatedBy());
    });
    return out;
  }

  @PutMapping("/config")
  public Map<String, Object> putConfig(
      @RequestHeader(value = "X-User-Id", required = false) String userId,
      @RequestHeader(value = "X-Alfresco-Ticket", required = false) String ticket,
      @RequestBody Map<String, Object> body) {
    requireAdminRole(userId, ticket);
    // secret 传空/脱敏占位 = 保持原值
    String secret = str(body.get("appSecret"));
    if (secret.isBlank() || "********".equals(secret)) {
      secret = config.get(YonyouSyncService.CONFIG_CONN).map(e -> {
        try {
          return json.readTree(e.valueJson()).path("appSecret").asText("");
        } catch (Exception ex) { return ""; }
      }).orElse("");
    }
    Map<String, Object> v = new LinkedHashMap<>();
    v.put("gateway", str(body.getOrDefault("gateway", "https://dbox.yonyoucloud.com/iuap-api-gateway")));
    v.put("appKey", str(body.get("appKey")));
    v.put("appSecret", secret);
    v.put("tenantId", str(body.get("tenantId")));
    v.put("accbookCode", str(body.getOrDefault("accbookCode", "0001")));
    v.put("fondsCode", str(body.getOrDefault("fondsCode", "Z001")));
    if (str(v.get("appKey")).isBlank() || secret.isBlank() || str(v.get("tenantId")).isBlank()) {
      throw BizException.badRequest("VALIDATION_FAILED", "appKey / appSecret / tenantId 不能为空");
    }
    try {
      config.put(YonyouSyncService.CONFIG_CONN, json.writeValueAsString(v), userId);
    } catch (Exception e) {
      throw BizException.badRequest("CONFIG_SAVE_FAILED", "配置保存失败: " + e.getMessage());
    }
    sync.invalidateAccbookCache();
    return getConfig(userId, ticket);
  }

  // ═══ 连接测试 ═══

  @PostMapping("/test-connection")
  public Map<String, Object> testConnection(
      @RequestHeader(value = "X-User-Id", required = false) String userId,
      @RequestHeader(value = "X-Alfresco-Ticket", required = false) String ticket) {
    requireAuth(userId, ticket);
    Map<String, Object> out = new LinkedHashMap<>();
    long t0 = System.currentTimeMillis();
    try {
      client.refreshToken();   // 实调鉴权端点
      Map<String, Object> book = client.queryAccbook();
      out.put("ok", true);
      out.put("accbook", Map.of(
          "id", String.valueOf(book.get("id")),
          "code", String.valueOf(book.get("code")),
          "name", String.valueOf(book.getOrDefault("name", ""))));
      out.put("elapsedMs", System.currentTimeMillis() - t0);
      sync.invalidateAccbookCache();
    } catch (BizException e) {
      out.put("ok", false);
      out.put("error", e.getMessage());
      out.put("elapsedMs", System.currentTimeMillis() - t0);
    }
    return out;
  }

  // ═══ 期间与预览 ═══

  @GetMapping("/periods")
  public Map<String, Object> periods(
      @RequestHeader(value = "X-User-Id", required = false) String userId,
      @RequestHeader(value = "X-Alfresco-Ticket", required = false) String ticket) {
    requireAuth(userId, ticket);
    List<String> periods = client.queryPeriods();
    Map<String, Object> out = new LinkedHashMap<>();
    out.put("periods", periods);
    out.put("suggested", YonyouSyncService.previousPeriod());
    return out;
  }

  @PostMapping("/preview")
  public Map<String, Object> preview(
      @RequestHeader(value = "X-User-Id", required = false) String userId,
      @RequestHeader(value = "X-Alfresco-Ticket", required = false) String ticket,
      @RequestBody Map<String, Object> body) {
    requireAuth(userId, ticket);
    String period = str(body.get("period"));
    if (!period.matches("\\d{4}-\\d{2}"))
      throw BizException.badRequest("VALIDATION_FAILED", "会计期间格式须为 yyyy-MM");
    YonyouClient.Conn c = client.conn();
    Map<String, Object> resp = client.queryVouchers(c.accbookCode(), period, 1, 1);
    long count = 0;
    if (resp.get("data") instanceof Map<?, ?> d && d.get("recordCount") instanceof Number n) {
      count = n.longValue();
    }
    return Map.of("period", period, "voucherCount", count);
  }

  // ═══ 同步 ═══

  @PostMapping("/sync")
  public Map<String, Object> syncNow(
      @RequestHeader(value = "X-User-Id", required = false) String userId,
      @RequestHeader(value = "X-Alfresco-Ticket", required = false) String ticket,
      @RequestBody Map<String, Object> body) {
    requireAuth(userId, ticket);
    String period = str(body.get("period"));
    Boolean autoGroup = body.get("autoGroup") instanceof Boolean b ? b : null;
    Boolean review = body.get("review") instanceof Boolean b2 ? b2 : null;
    String destination = str(body.get("destination"));
    return sync.syncNow(period, "manual", userId, ticket, autoGroup, review,
        destination.isBlank() ? null : destination);
  }

  @GetMapping("/batches")
  public List<Map<String, Object>> batches(
      @RequestHeader(value = "X-User-Id", required = false) String userId,
      @RequestHeader(value = "X-Alfresco-Ticket", required = false) String ticket,
      @RequestParam(value = "limit", defaultValue = "30") int limit) {
    requireAuth(userId, ticket);
    return sync.listBatches(limit);
  }

  @GetMapping("/batches/{id}")
  public Map<String, Object> batchDetail(
      @RequestHeader(value = "X-User-Id", required = false) String userId,
      @RequestHeader(value = "X-Alfresco-Ticket", required = false) String ticket,
      @PathVariable("id") long id) {
    requireAuth(userId, ticket);
    return sync.batchDetail(id);
  }

  // ═══ 调度配置 ═══

  @GetMapping("/schedule")
  public Map<String, Object> getSchedule(
      @RequestHeader(value = "X-User-Id", required = false) String userId,
      @RequestHeader(value = "X-Alfresco-Ticket", required = false) String ticket) {
    requireAuth(userId, ticket);
    YonyouSyncService.ScheduleConfig sc = sync.scheduleConfig();
    Map<String, Object> out = new LinkedHashMap<>();
    out.put("enabled", sc.enabled());
    out.put("cron", sc.cron());
    out.put("autoGroup", sc.autoGroup());
    out.put("nextRun", scheduler.nextRunAt() == null ? "" : scheduler.nextRunAt().toString());
    out.put("suggestedPeriod", YonyouSyncService.previousPeriod());
    return out;
  }

  @PutMapping("/schedule")
  public Map<String, Object> putSchedule(
      @RequestHeader(value = "X-User-Id", required = false) String userId,
      @RequestHeader(value = "X-Alfresco-Ticket", required = false) String ticket,
      @RequestBody Map<String, Object> body) {
    requireAuth(userId, ticket);
    boolean enabled = body.get("enabled") instanceof Boolean b && b;
    String cron = str(body.getOrDefault("cron", "0 30 2 1 * *"));
    boolean autoGroup = !(body.get("autoGroup") instanceof Boolean b2) || b2;
    if (!org.springframework.scheduling.support.CronExpression.isValidExpression(cron)) {
      throw BizException.badRequest("VALIDATION_FAILED", "cron 表达式不合法: " + cron);
    }
    sync.saveSchedule(new YonyouSyncService.ScheduleConfig(enabled, cron, autoGroup,
        str(body.get("destination")), str(body.get("description"))), userId);
    return getSchedule(userId, ticket);
  }

  // ── 内部 ──

  private void requireAuth(String userId, String ticket) {
    if (userId == null || userId.isBlank() || ticket == null || ticket.isBlank()) {
      throw new BizException(HttpStatus.UNAUTHORIZED, "SESSION_EXPIRED", "缺少会话凭据，请重新登录");
    }
  }

  /** 连接配置仅 档案管理员/档案主管/admin 可读写 */
  private void requireAdminRole(String userId, String ticket) {
    requireAuth(userId, ticket);
    var user = auth.me(userId, ticket);
    boolean allowed = user.roles().stream().anyMatch(r ->
        java.util.List.of("admin", "archive_director", "archivist").contains(r));
    if (!allowed) {
      throw new BizException(HttpStatus.FORBIDDEN, "FORBIDDEN", "仅档案管理员/档案主管/系统管理员可管理连接配置");
    }
  }

  private static String str(Object o) { return o == null ? "" : String.valueOf(o); }
}
