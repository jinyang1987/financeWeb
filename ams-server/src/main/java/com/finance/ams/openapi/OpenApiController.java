package com.finance.ams.openapi;

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

import com.finance.ams.api.BizException;
import com.finance.ams.auth.AuthService;
import com.finance.ams.auth.AuthUser;

/**
 * 推送接入开放接口（Open API Push v2，2026-08-16）
 *
 * 业务系统调用（推送方认证）：Bearer token
 *   POST /open/v1/token            换令牌
 *   POST /open/v1/archives         单件推送
 *   POST /open/v1/archives/batch   批量推送（统一四类契约：voucher|ledger|report|other）
 *   GET  /open/v1/batches/{batchNo} 回执
 *   POST /open/v1/archives/{id}/confirm 归档确认（可选）
 *
 * 档案侧管理（会话认证，仅档案管理员/主管/admin）：
 *   GET  /open/v1/apps             接入应用列表
 *   POST /open/v1/apps             签发接入应用（含默认去向）
 *   PUT  /open/v1/apps/{id}/destination  修改应用默认去向
 *   GET  /open/v1/batches          推送批次历史
 *   POST /open/v1/batches/{batchNo}/four-checks 批次运行四性检测
 *   POST /open/v1/batches/{batchNo}/to-review   批次转审核库
 *   POST /open/v1/batches/{batchNo}/auto-group  批次自动组卷
 *   GET  /open/v1/logs             推送全链路日志
 *   POST /open/v1/simulate         模拟推送（演示：四类样例走真实管道）
 *   GET  /open/v1/collect/pending-check         收集池待核对列表
 *   POST /open/v1/collect/{id}/pass             核对通过（送组卷/送审核）
 *   GET  /open/v1/field-maps                    字段映射配置列表
 *   GET  /open/v1/field-maps/{sourceSystem}     读取某来源系统映射
 *   PUT  /open/v1/field-maps/{sourceSystem}     保存映射（低代码集成）
 *   POST /open/v1/field-maps/test               试映射（样例 JSON → 标准契约）
 */
@RestController
@RequestMapping("/open/v1")
public class OpenApiController {

  private final OpenPushService service;
  private final PushLogService pushLogs;
  private final CollectItemService collectItems;
  private final FieldMapService fieldMaps;
  private final AuthService auth;

  public OpenApiController(OpenPushService service, PushLogService pushLogs,
                           CollectItemService collectItems, FieldMapService fieldMaps,
                           AuthService auth) {
    this.service = service;
    this.pushLogs = pushLogs;
    this.collectItems = collectItems;
    this.fieldMaps = fieldMaps;
    this.auth = auth;
  }

  // ═══════════════════ 推送方认证（Bearer） ═══════════════════

  /** POST /open/v1/token { appKey, appSecret } → { access_token } */
  @PostMapping("/token")
  public Map<String, Object> token(@RequestBody Map<String, Object> body) {
    String appKey = str(body.get("appKey"));
    String appSecret = str(body.get("appSecret"));
    if (appKey.isBlank() || appSecret.isBlank()) {
      throw BizException.badRequest("VALIDATION_FAILED", "appKey / appSecret 不能为空");
    }
    return service.issueToken(appKey, appSecret);
  }

  @PostMapping("/archives")
  public Map<String, Object> pushSingle(
      @RequestHeader(value = "Authorization", required = false) String authz,
      @RequestBody Map<String, Object> body) {
    Map<String, Object> app = service.requireApp(authz);
    return service.pushSingle(app, body);
  }

  @PostMapping("/archives/batch")
  public Map<String, Object> pushBatch(
      @RequestHeader(value = "Authorization", required = false) String authz,
      @RequestBody Map<String, Object> body) {
    Map<String, Object> app = service.requireApp(authz);
    return service.pushBatch(app, body);
  }

  @GetMapping("/batches/{batchNo}")
  public Map<String, Object> batchReceipt(
      @RequestHeader(value = "Authorization", required = false) String authz,
      @PathVariable String batchNo) {
    service.requireApp(authz);
    return service.batchReceipt(batchNo);
  }

  @PostMapping("/archives/{id}/confirm")
  public Map<String, Object> confirm(
      @RequestHeader(value = "Authorization", required = false) String authz,
      @PathVariable String id) {
    service.requireApp(authz);
    return Map.of("id", id, "confirmed", true, "message", "已确认归档（入池受理）");
  }

  // ═══════════════════ 档案侧管理（会话认证） ═══════════════════

  @GetMapping("/apps")
  public List<Map<String, Object>> apps(
      @RequestHeader(value = "X-User-Id", required = false) String userId,
      @RequestHeader(value = "X-Alfresco-Ticket", required = false) String ticket) {
    requireAdminRole(userId, ticket);
    return service.listApps();
  }

  @PostMapping("/apps")
  public Map<String, Object> createApp(
      @RequestHeader(value = "X-User-Id", required = false) String userId,
      @RequestHeader(value = "X-Alfresco-Ticket", required = false) String ticket,
      @RequestBody Map<String, Object> body) {
    requireAdminRole(userId, ticket);
    return service.createApp(userId, body);
  }

  @PutMapping("/apps/{id}/destination")
  public Map<String, Object> updateAppDestination(
      @RequestHeader(value = "X-User-Id", required = false) String userId,
      @RequestHeader(value = "X-Alfresco-Ticket", required = false) String ticket,
      @PathVariable long id,
      @RequestBody Map<String, Object> body) {
    requireAdminRole(userId, ticket);
    service.updateAppDestination(id, str(body.get("destination")));
    return Map.of("ok", true);
  }

  @GetMapping("/batches")
  public List<Map<String, Object>> batches(
      @RequestHeader(value = "X-User-Id", required = false) String userId,
      @RequestHeader(value = "X-Alfresco-Ticket", required = false) String ticket,
      @RequestParam(defaultValue = "30") int limit) {
    requireAdminRole(userId, ticket);
    return service.listBatches(limit);
  }

  /** 批次运行四性检测 */
  @PostMapping("/batches/{batchNo}/four-checks")
  public Map<String, Object> batchFourChecks(
      @RequestHeader(value = "X-User-Id", required = false) String userId,
      @RequestHeader(value = "X-Alfresco-Ticket", required = false) String ticket,
      @PathVariable String batchNo) {
    requireAdminRole(userId, ticket);
    return service.runFourChecksForBatch(ticket, batchNo);
  }

  /** 批次转审核库（核对工作台·待审核） */
  @PostMapping("/batches/{batchNo}/to-review")
  public Map<String, Object> batchToReview(
      @RequestHeader(value = "X-User-Id", required = false) String userId,
      @RequestHeader(value = "X-Alfresco-Ticket", required = false) String ticket,
      @PathVariable String batchNo) {
    requireAdminRole(userId, ticket);
    return service.routeBatchToReview(ticket, userId, batchNo);
  }

  /** 批次自动组卷（直接入库） */
  @PostMapping("/batches/{batchNo}/auto-group")
  public Map<String, Object> batchAutoGroup(
      @RequestHeader(value = "X-User-Id", required = false) String userId,
      @RequestHeader(value = "X-Alfresco-Ticket", required = false) String ticket,
      @PathVariable String batchNo) {
    requireAdminRole(userId, ticket);
    return service.autoGroupBatch(ticket, userId, batchNo);
  }

  // ═══ 全链路日志 ═══

  @GetMapping("/logs")
  public List<Map<String, Object>> logs(
      @RequestHeader(value = "X-User-Id", required = false) String userId,
      @RequestHeader(value = "X-Alfresco-Ticket", required = false) String ticket,
      @RequestParam(required = false) String batchNo,
      @RequestParam(required = false) String level,
      @RequestParam(defaultValue = "200") int limit) {
    requireAdminRole(userId, ticket);
    return pushLogs.list(batchNo, level, limit);
  }

  // ═══ 模拟推送（演示） ═══

  @PostMapping("/simulate")
  public Map<String, Object> simulate(
      @RequestHeader(value = "X-User-Id", required = false) String userId,
      @RequestHeader(value = "X-Alfresco-Ticket", required = false) String ticket,
      @RequestBody Map<String, Object> body) {
    requireAdminRole(userId, ticket);
    return service.simulate(userId, body);
  }

  // ═══ 收集台账（待核对流转） ═══

  @GetMapping("/collect/pending-check")
  public List<Map<String, Object>> pendingCheck(
      @RequestHeader(value = "X-User-Id", required = false) String userId,
      @RequestHeader(value = "X-Alfresco-Ticket", required = false) String ticket,
      @RequestParam(required = false) String fondsCode) {
    requireAdminRole(userId, ticket);
    return collectItems.pendingCheck(fondsCode);
  }

  /** 核对通过：to=volume(送组卷) | review(送审核) */
  @PostMapping("/collect/{id}/pass")
  public Map<String, Object> collectPass(
      @RequestHeader(value = "X-User-Id", required = false) String userId,
      @RequestHeader(value = "X-Alfresco-Ticket", required = false) String ticket,
      @PathVariable long id,
      @RequestBody Map<String, Object> body) {
    requireAdminRole(userId, ticket);
    return collectItems.pass(ticket, id, str(body.getOrDefault("to", "volume")), userId,
        str(body.get("comment")));
  }

  // ═══ 字段映射（低代码集成） ═══

  @GetMapping("/field-maps")
  public List<Map<String, Object>> fieldMaps(
      @RequestHeader(value = "X-User-Id", required = false) String userId,
      @RequestHeader(value = "X-Alfresco-Ticket", required = false) String ticket) {
    requireAdminRole(userId, ticket);
    return fieldMaps.list();
  }

  @GetMapping("/field-maps/{sourceSystem}")
  public Map<String, Object> fieldMap(
      @RequestHeader(value = "X-User-Id", required = false) String userId,
      @RequestHeader(value = "X-Alfresco-Ticket", required = false) String ticket,
      @PathVariable String sourceSystem) {
    requireAdminRole(userId, ticket);
    Map<String, Object> m = fieldMaps.get(sourceSystem);
    return m == null ? Map.of("sourceSystem", sourceSystem, "enabled", false, "mappings", List.of()) : m;
  }

  @PutMapping("/field-maps/{sourceSystem}")
  public Map<String, Object> saveFieldMap(
      @RequestHeader(value = "X-User-Id", required = false) String userId,
      @RequestHeader(value = "X-Alfresco-Ticket", required = false) String ticket,
      @PathVariable String sourceSystem,
      @RequestBody Map<String, Object> body) {
    requireAdminRole(userId, ticket);
    return fieldMaps.save(sourceSystem, body, userId);
  }

  /** 试映射：{ mappings:[...], category, sample:{...} } → 转换后的标准条目 */
  @SuppressWarnings("unchecked")
  @PostMapping("/field-maps/test")
  public Map<String, Object> testFieldMap(
      @RequestHeader(value = "X-User-Id", required = false) String userId,
      @RequestHeader(value = "X-Alfresco-Ticket", required = false) String ticket,
      @RequestBody Map<String, Object> body) {
    requireAdminRole(userId, ticket);
    List<Map<String, Object>> mappings = body.get("mappings") instanceof List<?> l
        ? (List<Map<String, Object>>) l : List.of();
    Map<String, Object> sample = body.get("sample") instanceof Map<?, ?> m
        ? (Map<String, Object>) m : Map.of();
    String category = str(body.getOrDefault("category", "voucher"));
    return fieldMaps.test(mappings, category, sample);
  }

  // ═══════════════════ 内部 ═══════════════════

  private void requireAdminRole(String userId, String ticket) {
    if (userId == null || userId.isBlank() || ticket == null || ticket.isBlank()) {
      throw new BizException(HttpStatus.UNAUTHORIZED, "SESSION_EXPIRED", "缺少会话凭据，请重新登录");
    }
    AuthUser user = auth.me(userId, ticket);
    boolean allowed = user.roles().stream().anyMatch(r ->
        List.of("admin", "archive_director", "archivist").contains(r));
    if (!allowed) {
      throw new BizException(HttpStatus.FORBIDDEN, "FORBIDDEN", "仅档案管理员/档案主管/系统管理员可管理推送接入");
    }
  }

  private static String str(Object o) { return o == null ? "" : String.valueOf(o); }
}
