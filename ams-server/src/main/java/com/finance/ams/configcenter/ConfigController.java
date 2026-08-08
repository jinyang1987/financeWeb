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

/**
 * 配置中心端点：GET/PUT /config/{key}
 *
 * value 为任意 JSON 文档（存 jsonb），PUT 带 updated_by 审计（X-User-Id 头）。
 */
@RestController
@RequestMapping("/config")
public class ConfigController {

  private final ConfigService service;
  private final ObjectMapper om = new ObjectMapper();

  public ConfigController(ConfigService service) {
    this.service = service;
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
                        @RequestHeader(value = "X-User-Id", required = false) String userId) {
    String json = req.value() == null ? "null" : req.value().toString();
    var e = service.put(key, json, userId);
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
}
