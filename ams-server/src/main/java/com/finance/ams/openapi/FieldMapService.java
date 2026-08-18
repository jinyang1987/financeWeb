package com.finance.ams.openapi;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.finance.ams.api.BizException;
import com.finance.ams.configcenter.ConfigService;

/**
 * 接口字段映射配置（低代码集成，2026-08-16）
 *
 * 不同财务系统（用友/金蝶/浪潮/自研ERP）推送的原始字段名各不相同。
 * 本服务在「系统管理 → 连接配置 → 接口字段映射」中以低代码方式维护：
 *   来源系统字段路径 → 档案标准字段 + 转换规则
 * 推送数据入档前自动按映射转换为统一契约格式，接新系统不改代码。
 *
 * 存储：ams_config，key = fieldmap.&lt;sourceSystem&gt;
 * 结构：
 * {
 *   "sourceSystem": "kingdee",
 *   "enabled": true,
 *   "mappings": [
 *     { "category": "*",            // * 或 voucher|ledger|report|other
 *       "stdField": "year",         // 标准字段（支持点路径，如 voucher.voucherNo）
 *       "sourcePath": "fiscalYear", // 来源字段（支持点路径嵌套取值）
 *       "transform": "direct",      // direct|constant|divide100|yearOf|monthOf|prefix|upper
 *       "defaultValue": "" }        // constant/prefix 时使用
 *   ]
 * }
 */
@Service
public class FieldMapService {

  private static final Logger log = LoggerFactory.getLogger(FieldMapService.class);
  static final String KEY_PREFIX = "fieldmap.";

  private final ConfigService config;
  private final ObjectMapper json = new ObjectMapper();

  public FieldMapService(ConfigService config) {
    this.config = config;
  }

  /** 读取某来源系统的映射配置（不存在返回 null） */
  public Map<String, Object> get(String sourceSystem) {
    return config.get(KEY_PREFIX + sourceSystem)
        .map(e -> parse(e.valueJson()))
        .orElse(null);
  }

  /** 全部映射配置列表（概要） */
  public List<Map<String, Object>> list() {
    List<Map<String, Object>> out = new ArrayList<>();
    for (String key : config.keys()) {
      if (!key.startsWith(KEY_PREFIX)) continue;
      Map<String, Object> m = config.get(key).map(e -> parse(e.valueJson())).orElse(null);
      if (m == null) continue;
      m.putIfAbsent("sourceSystem", key.substring(KEY_PREFIX.length()));
      @SuppressWarnings("unchecked")
      int count = m.get("mappings") instanceof List<?> l ? l.size() : 0;
      m.put("mappingCount", count);
      out.add(m);
    }
    return out;
  }

  /** 保存映射配置 */
  public Map<String, Object> save(String sourceSystem, Map<String, Object> body, String operator) {
    if (sourceSystem == null || sourceSystem.isBlank()) {
      throw BizException.badRequest("VALIDATION_FAILED", "sourceSystem 不能为空");
    }
    Map<String, Object> doc = new LinkedHashMap<>();
    doc.put("sourceSystem", sourceSystem);
    doc.put("enabled", !(body.get("enabled") instanceof Boolean b) || b);
    doc.put("mappings", body.get("mappings") instanceof List<?> l ? l : List.of());
    try {
      config.put(KEY_PREFIX + sourceSystem, json.writeValueAsString(doc), operator);
    } catch (Exception e) {
      throw new RuntimeException("映射配置序列化失败", e);
    }
    log.info("保存字段映射配置: {}（{} 条，操作人 {}）", sourceSystem,
        doc.get("mappings") instanceof List<?> l ? l.size() : 0, operator);
    return doc;
  }

  /** 删除映射配置 */
  public void remove(String sourceSystem, String operator) {
    config.put(KEY_PREFIX + sourceSystem, "{\"sourceSystem\":\"" + sourceSystem
        + "\",\"enabled\":false,\"mappings\":[]}", operator);
  }

  /**
   * 把来源系统的原始条目转换为标准契约条目。
   * 无配置/未启用 → 原样返回（认为已是标准格式）。
   * 语义：先整体复制原始条目，再按映射逐字段覆盖/补充（支持部分映射）。
   */
  public Map<String, Object> apply(String sourceSystem, String category, Map<String, Object> rawItem) {
    Map<String, Object> cfg = get(sourceSystem);
    if (cfg == null || !Boolean.TRUE.equals(cfg.get("enabled"))) return rawItem;
    @SuppressWarnings("unchecked")
    List<Map<String, Object>> mappings = cfg.get("mappings") instanceof List<?> l
        ? (List<Map<String, Object>>) l : List.of();
    return applyMappings(mappings, category, rawItem);
  }

  /** 试映射：用给定映射规则转换样例条目（前端「映射测试」用，不落库） */
  public Map<String, Object> test(List<Map<String, Object>> mappings, String category,
                                  Map<String, Object> sampleItem) {
    return applyMappings(mappings == null ? List.of() : mappings, category, sampleItem);
  }

  // ═══════════════════ 内部 ═══════════════════

  @SuppressWarnings("unchecked")
  private Map<String, Object> applyMappings(List<Map<String, Object>> mappings, String category,
                                            Map<String, Object> rawItem) {
    Map<String, Object> out = new LinkedHashMap<>(rawItem);
    for (Map<String, Object> m : mappings) {
      String cat = str(m.get("category"));
      if (!cat.isBlank() && !"*".equals(cat) && !cat.equalsIgnoreCase(category)) continue;
      String stdField = str(m.get("stdField"));
      if (stdField.isBlank()) continue;
      Object value = resolve(rawItem, str(m.get("sourcePath")), str(m.get("transform")),
          str(m.get("defaultValue")));
      if (value != null) setPath(out, stdField, value);
    }
    return out;
  }

  /** 按转换规则取值 */
  private Object resolve(Map<String, Object> item, String sourcePath, String transform, String defVal) {
    if ("constant".equals(transform)) return defVal;
    Object raw = getPath(item, sourcePath);
    if (raw == null) return defVal.isBlank() ? null : defVal;
    String s = String.valueOf(raw);
    return switch (transform == null ? "direct" : transform) {
      case "divide100" -> {
        try { yield Double.parseDouble(s) / 100.0; } catch (NumberFormatException e) { yield raw; }
      }
      case "yearOf" -> s.length() >= 4 ? s.substring(0, 4) : s;
      case "monthOf" -> {
        String[] parts = s.split("-");
        yield parts.length >= 2 ? parts[1] : s;
      }
      case "prefix" -> defVal + s;
      case "upper" -> s.toUpperCase();
      default -> raw; // direct
    };
  }

  /** 点路径取值：a.b.c */
  @SuppressWarnings("unchecked")
  private Object getPath(Map<String, Object> item, String path) {
    if (path == null || path.isBlank()) return null;
    Object cur = item;
    for (String seg : path.split("\\.")) {
      if (!(cur instanceof Map<?, ?> m)) return null;
      cur = ((Map<String, Object>) m).get(seg);
      if (cur == null) return null;
    }
    return cur;
  }

  /** 点路径写值：voucher.voucherNo → 自动建中间 Map */
  @SuppressWarnings("unchecked")
  private void setPath(Map<String, Object> target, String path, Object value) {
    String[] segs = path.split("\\.");
    Map<String, Object> cur = target;
    for (int i = 0; i < segs.length - 1; i++) {
      Object next = cur.get(segs[i]);
      if (!(next instanceof Map<?, ?>)) {
        next = new LinkedHashMap<String, Object>();
        cur.put(segs[i], next);
      }
      cur = (Map<String, Object>) next;
    }
    cur.put(segs[segs.length - 1], value);
  }

  private Map<String, Object> parse(String valueJson) {
    try {
      return json.readValue(valueJson, new TypeReference<LinkedHashMap<String, Object>>() {});
    } catch (Exception e) {
      return new LinkedHashMap<>();
    }
  }

  private static String str(Object o) { return o == null ? "" : String.valueOf(o); }
}
