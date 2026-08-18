package com.finance.ams.configcenter;

import java.util.List;
import java.util.Map;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.finance.ams.auth.AuthUser;
import com.finance.ams.auth.PermissionService;
import com.finance.ams.oplog.OperationLogService;

/**
 * 配置中心端点：GET/PUT /config/{key}
 *
 * 2026-08-18 权限补强（原实现零认证，role.menus/workflow.config 人人可改写 = 自助提权通道）：
 *   ① 认证：AuthInterceptor 统一闸口（本类不再重复验票）；
 *   ② 授权：PUT 按 key → 功能码映射校验（KEY_FUNCTION_MAP），未映射键仅 admin；
 *   ③ 审计：每次 PUT 写 ams_operation_log（action=配置变更/权限配置变更，
 *      detail=新旧值摘要），复用哈希链 —— 对应参考模型 S_LOG_OPERPOWER 授权审计。
 *
 * GET 不限制功能码：登录用户即可读（前端各配置 store 启动装配需要；
 * 配置内容非涉密，涉密数据由行级过滤在各业务端点拦截）。
 */
@RestController
@RequestMapping("/config")
public class ConfigController {

  /**
   * 配置 key → 所需功能码（前端 persist name 即 ams_config key，单一数据源）。
   * 未在此表的 key：仅 admin 可写。
   */
  private static final Map<String, String> KEY_FUNCTION_MAP = Map.ofEntries(
      Map.entry(PermissionService.CONFIG_KEY, "sys-role"),          // role-auth-v1 三维权限矩阵
      Map.entry(PermissionService.LEGACY_MENUS_KEY, "sys-role"),    // role-menus-v3（旧矩阵，向后兼容）
      Map.entry("workflow.config", "config-workflow"),              // 流程配置（审批链等）
      Map.entry("archive-code-config", "archive-code-config"),      // 档号规则
      Map.entry("volume-grouping-config", "volume-grouping-config"),// 组卷盒号规则
      Map.entry("metadata-display-config-v2", "accounting-metadata"),// 元数据显示
      Map.entry("watermark-config-v1", "watermark-config"),         // 水印策略
      Map.entry("cockpit-config-v1", "sys-cockpit-config"),         // 驾驶舱布局
      Map.entry("directory", "directory-config"),                   // 目录配置
      Map.entry("inspection.plan", "inspection-config")             // 四性检测项
  );

  /** 权限类配置（审计 action 区分于普通配置变更，便于审计员专项追踪授权动作） */
  private static final java.util.Set<String> AUTHZ_KEYS = java.util.Set.of(
      PermissionService.CONFIG_KEY, PermissionService.LEGACY_MENUS_KEY);

  private final ConfigService service;
  private final PermissionService perm;
  private final OperationLogService oplog;
  private final ObjectMapper om = new ObjectMapper();

  public ConfigController(ConfigService service, PermissionService perm, OperationLogService oplog) {
    this.service = service;
    this.perm = perm;
    this.oplog = oplog;
  }

  public record ConfigView(String key, JsonNode value, String updatedAt, String updatedBy) {}

  @GetMapping("/{key}")
  public ResponseEntity<ConfigView> get(@PathVariable String key) {
    return service.get(key)
        .map(e -> ResponseEntity.ok(new ConfigView(e.key(), readJson(e.valueJson()), e.updatedAt(), e.updatedBy())))
        .orElse(ResponseEntity.notFound().build());
  }

  public record PutRequest(JsonNode value) {}

  @PutMapping("/{key}")
  public ConfigView put(@PathVariable String key,
                        @RequestBody PutRequest req,
                        @RequestHeader(value = "X-User-Id", required = false) String userId,
                        @RequestHeader(value = "X-Alfresco-Ticket", required = false) String ticket) {
    AuthUser me = perm.me(userId, ticket);
    // 授权：key → 功能码；未映射键仅 admin
    String requiredFunction = KEY_FUNCTION_MAP.get(key);
    if (requiredFunction != null) {
      perm.requireFunction(me, requiredFunction);
    } else if (!me.roles().contains(PermissionService.ROLE_ADMIN)) {
      throw com.finance.ams.api.BizException.forbidden("FORBIDDEN", "未映射的配置键仅系统管理员可写: " + key);
    }

    String oldJson = service.get(key).map(ConfigService.ConfigEntry::valueJson).orElse("");
    String json = req.value() == null ? "null" : req.value().toString();
    var e = service.put(key, json, userId);

    // 审计：授权类/普通配置变更均上链（detail 截断防超长）
    String action = AUTHZ_KEYS.contains(key) ? "权限配置变更" : "配置变更";
    oplog.append(me.account(), me.name(), action, key, null,
        "key=" + key + "；旧值 " + abbrev(oldJson) + " → 新值 " + abbrev(json));

    // 权限配置保存后立即使服务端缓存失效（近实时生效，优于参考模型"重新登录"）
    if (AUTHZ_KEYS.contains(key)) perm.invalidate();

    return new ConfigView(e.key(), readJson(e.valueJson()), e.updatedAt(), e.updatedBy());
  }

  @GetMapping("/keys")
  public Map<String, List<String>> keys() {
    return Map.of("keys", service.keys());
  }

  private JsonNode readJson(String json) {
    try {
      return om.readTree(json);
    } catch (Exception e) {
      return om.nullNode();
    }
  }

  private static String abbrev(String s) {
    if (s == null || s.isBlank()) return "∅";
    return s.length() <= 200 ? s : s.substring(0, 200) + "…(" + s.length() + "字)";
  }
}
