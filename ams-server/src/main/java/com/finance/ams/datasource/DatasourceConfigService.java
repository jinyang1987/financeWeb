package com.finance.ams.datasource;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.springframework.stereotype.Service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.finance.ams.api.BizException;
import com.finance.ams.configcenter.ConfigService;

/**
 * 多数据源配置中心（2026-08-09）
 *
 * 管理「抓取/推送」接入的业务系统连接配置：用友BIP、金蝶云·星空、电子发票平台、
 * 银行流水接口、报销审批系统等。配置统一存 ams_config（key=datasource.config），
 * 仅 admin / 档案主管 / 档案管理员 可读写（详见 DatasourceController 角色校验）。
 *
 * 兼容迁移：旧版用友配置存 yonyou.connection，首次启动读取时若 datasource.config
 * 不存在而 yonyou.connection 存在，则自动吸收为 id=yonyou-bip 的源，不丢配置。
 *
 * 数据结构：
 * {
 *   "sources": [
 *     {
 *       "id": "yonyou-bip",
 *       "name": "用友BIP（YonBIP 开放网关）",
 *       "type": "yonyou",              // yonyou | kingdee | invoice | bank | reimburse | other
 *       "direction": "pull",           // pull(抓取) | push(推送) | both
 *       "enabled": true,
 *       "config": {                    // 各源自有字段（secret 回显脱敏）
 *         "gateway": "...", "appKey": "...", "appSecret": "********",
 *         "tenantId": "...", "accbookCode": "0001", "fondsCode": "Z001"
 *       },
 *       "updatedAt": "...", "updatedBy": "..."
 *     }
 *   ]
 * }
 */
@Service
public class DatasourceConfigService {

  static final String CONFIG_KEY = "datasource.config";

  private final ConfigService config;
  private final ObjectMapper json = new ObjectMapper();

  public DatasourceConfigService(ConfigService config) {
    this.config = config;
  }

  /** 单数据源视图（secret 脱敏回显） */
  public record SourceView(
      String id, String name, String type, String direction, boolean enabled,
      Map<String, Object> config, String updatedAt, String updatedBy) {}

  /** 单数据源配置（原始，含明文 secret——仅服务端内部使用） */
  public record SourceConfig(
      String id, String name, String type, String direction, boolean enabled,
      Map<String, Object> config) {}

  // ═══════════════════ 读取 ═══════════════════

  /** 全部数据源（secret 脱敏） */
  public List<SourceView> list() {
    return all().stream().map(this::mask).toList();
  }

  /** 按 id 取单个（secret 脱敏）；不存在返回 null */
  public SourceView get(String id) {
    SourceConfig src = find(id);
    return src == null ? null : mask(src);
  }

  /** 按 id 取原始配置（含明文 secret，仅内部服务用） */
  public Optional<SourceConfig> raw(String id) {
    return all().stream().filter(s -> s.id().equals(id)).findFirst();
  }

  /** 用友源（迁移兼容：datasource.config 缺省时回退 yonyou.connection） */
  public Optional<SourceConfig> yonyou() {
    Optional<SourceConfig> fromList = raw("yonyou-bip");
    if (fromList.isPresent()) return fromList;
    return legacyYonyou();
  }

  // ═══════════════════ 写入 ═══════════════════

  /** 保存数据源（id 存在则更新，不存在则新增） */
  public SourceView save(String userId, Map<String, Object> body) {
    String id = str(body.get("id"));
    if (id.isBlank()) throw BizException.badRequest("VALIDATION_FAILED", "数据源 id 不能为空");
    String name = str(body.getOrDefault("name", id));
    String type = str(body.getOrDefault("type", "other"));
    String direction = str(body.getOrDefault("direction", "pull"));
    if (!List.of("pull", "push", "both").contains(direction))
      throw BizException.badRequest("VALIDATION_FAILED", "direction 仅支持 pull/push/both");
    boolean enabled = !(body.get("enabled") instanceof Boolean b) || b;

    @SuppressWarnings("unchecked")
    Map<String, Object> cfg = body.get("config") instanceof Map<?, ?> m
        ? (Map<String, Object>) m : new LinkedHashMap<>();

    List<SourceConfig> all = all();
    boolean exists = all.stream().anyMatch(s -> s.id().equals(id));
    if (exists) {
      // 更新：secret 传空/脱敏占位 = 保持原值
      Optional<SourceConfig> old = all.stream().filter(s -> s.id().equals(id)).findFirst();
      if (old.isPresent()) {
        Map<String, Object> oldCfg = new LinkedHashMap<>(old.get().config());
        if (cfg.get("appSecret") instanceof String s
            && (s.isBlank() || "********".equals(s))) {
          cfg.put("appSecret", oldCfg.getOrDefault("appSecret", ""));
        }
      }
      all = new ArrayList<>(all.stream().filter(s -> !s.id().equals(id)).toList());
    }
    all.add(new SourceConfig(id, name, type, direction, enabled, cfg));
    persist(userId, all);
    return mask(all.stream().filter(s -> s.id().equals(id)).findFirst().orElseThrow());
  }

  /** 删除数据源 */
  public void delete(String userId, String id) {
    List<SourceConfig> all = all();
    if (all.stream().noneMatch(s -> s.id().equals(id)))
      throw BizException.notFound("数据源 " + id);
    persist(userId, all.stream().filter(s -> !s.id().equals(id)).toList());
  }

  // ═══════════════════ 内部 ═══════════════════

  private void persist(String userId, List<SourceConfig> sources) {
    try {
      List<Map<String, Object>> list = new ArrayList<>();
      for (SourceConfig s : sources) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", s.id());
        m.put("name", s.name());
        m.put("type", s.type());
        m.put("direction", s.direction());
        m.put("enabled", s.enabled());
        m.put("config", s.config());
        list.add(m);
      }
      config.put(CONFIG_KEY, json.writeValueAsString(Map.of("sources", list)), userId);
    } catch (Exception e) {
      throw BizException.badRequest("CONFIG_SAVE_FAILED", "数据源配置保存失败: " + e.getMessage());
    }
  }

  /** 读全部源（含明文 secret） */
  @SuppressWarnings("unchecked")
  private List<SourceConfig> all() {
    var entry = config.get(CONFIG_KEY);
    if (entry.isEmpty()) {
      // 兼容迁移：旧 yonyou.connection → yonyou-bip
      return legacyYonyou().map(List::of).orElseGet(List::of);
    }
    try {
      var root = json.readTree(entry.get().valueJson());
      if (!root.path("sources").isArray()) return List.of();
      List<SourceConfig> out = new ArrayList<>();
      for (var n : root.path("sources")) {
        Map<String, Object> cfg = new LinkedHashMap<>();
        if (n.path("config").isObject()) {
          n.path("config").fields().forEachRemaining(e ->
              cfg.put(e.getKey(), toJava(e.getValue())));
        }
        out.add(new SourceConfig(
            n.path("id").asText(""),
            n.path("name").asText(""),
            n.path("type").asText("other"),
            n.path("direction").asText("pull"),
            n.path("enabled").asBoolean(true),
            cfg));
      }
      return out;
    } catch (Exception e) {
      throw BizException.badRequest("CONFIG_BAD", "数据源配置解析失败: " + e.getMessage());
    }
  }

  /** 旧版用友配置（yonyou.connection）读为 yonyou-bip 源 */
  private Optional<SourceConfig> legacyYonyou() {
    return config.get("yonyou.connection").map(e -> {
      try {
        var n = json.readTree(e.valueJson());
        Map<String, Object> cfg = new LinkedHashMap<>();
        n.fields().forEachRemaining(f -> cfg.put(f.getKey(), toJava(f.getValue())));
        return new SourceConfig("yonyou-bip", "用友BIP（YonBIP 开放网关）",
            "yonyou", "pull", true, cfg);
      } catch (Exception ex) {
        return null;
      }
    });
  }

  private SourceConfig find(String id) {
    return all().stream().filter(s -> s.id().equals(id)).findFirst().orElse(null);
  }

  /** secret 脱敏回显 */
  private SourceView mask(SourceConfig s) {
    Map<String, Object> cfg = new LinkedHashMap<>(s.config());
    if (cfg.get("appSecret") instanceof String v && !v.isBlank()) {
      cfg.put("appSecret", "********");
    }
    var entry = config.get(CONFIG_KEY);
    String updatedAt = "", updatedBy = "";
    if (entry.isPresent()) {
      updatedAt = entry.get().updatedAt() == null ? "" : entry.get().updatedAt();
      updatedBy = entry.get().updatedBy() == null ? "" : entry.get().updatedBy();
    }
    return new SourceView(s.id(), s.name(), s.type(), s.direction(), s.enabled(),
        cfg, updatedAt, updatedBy);
  }

  private static Object toJava(com.fasterxml.jackson.databind.JsonNode n) {
    if (n == null || n.isNull()) return null;
    if (n.isTextual()) return n.asText();
    if (n.isBoolean()) return n.asBoolean();
    if (n.isNumber()) return n.numberValue();
    if (n.isArray()) {
      List<Object> l = new ArrayList<>();
      n.forEach(x -> l.add(toJava(x)));
      return l;
    }
    if (n.isObject()) {
      Map<String, Object> m = new LinkedHashMap<>();
      n.fields().forEachRemaining(e -> m.put(e.getKey(), toJava(e.getValue())));
      return m;
    }
    return n.toString();
  }

  private static String str(Object o) { return o == null ? "" : String.valueOf(o); }
}
