package com.finance.ams.yonyou;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Base64;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestTemplate;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.finance.ams.api.BizException;
import com.finance.ams.configcenter.ConfigService;

/**
 * 用友 BIP 开放网关客户端（dbox 沙箱 / 生产同构）
 *
 * 协议要点（依据《用友BIP_水利部接口标准操作手册》，2026-08-08 实测）：
 *  - 签名：appKey+timestamp 按参数名升序拼接，HmacSHA256(appSecret)，Base64 后 URL Encode；
 *  - token：GET /open-auth/selfAppAuth/getAccessToken，取 data.access_token（兼容 data.data.access_token）；
 *  - 业务调用：POST + query 带 access_token/tenantId + JSON Body；
 *  - 账簿类：accbookCode 传编码（凭证链），accbook 传 GUID（报表链）——两者不可混用；
 *  - fields 必须是 JSON 数组（逗号串报 999）。
 *
 * 配置存 ams_config（key=yonyou.connection，页面可维护，改后即时生效）：
 *  { gateway, appKey, appSecret, tenantId, accbookCode, fondsCode }
 */
@Component
public class YonyouClient {

  private static final Logger log = LoggerFactory.getLogger(YonyouClient.class);
  private static final String CONFIG_KEY = "yonyou.connection";
  /** token 默认寿命（用友文档 2h），提前 5 分钟续约 */
  private static final long TOKEN_TTL_MS = 115L * 60 * 1000;

  private final ConfigService config;
  private final ObjectMapper json = new ObjectMapper();
  private final RestTemplate http;

  /** token 缓存（单实例进程内） */
  private volatile String cachedToken;
  private volatile long tokenExpireAt;

  public YonyouClient(ConfigService config) {
    this.config = config;
    SimpleClientHttpRequestFactory f = new SimpleClientHttpRequestFactory();
    f.setConnectTimeout(10_000);
    f.setReadTimeout(30_000);
    this.http = new RestTemplate(f);
  }

  /** 连接配置记录 */
  public record Conn(String gateway, String appKey, String appSecret,
                     String tenantId, String accbookCode, String fondsCode) {}

  /** 读取连接配置（未配置抛业务异常，前端据此引导配置）
   * 优先读多数据源配置（datasource.config → yonyou-bip），兼容旧 yonyou.connection。 */
  public Conn conn() {
    var entry = config.get(CONFIG_KEY).orElse(null);
    // 多数据源配置优先
    var ds = config.get("datasource.config");
    if (ds.isPresent()) {
      try {
        var root = json.readTree(ds.get().valueJson());
        if (root.path("sources").isArray()) {
          for (var n : root.path("sources")) {
            if ("yonyou-bip".equals(n.path("id").asText())) {
              var c = n.path("config");
              return new Conn(
                  text(c, "gateway", "https://dbox.yonyoucloud.com/iuap-api-gateway"),
                  text(c, "appKey", ""),
                  text(c, "appSecret", ""),
                  text(c, "tenantId", ""),
                  text(c, "accbookCode", "0001"),
                  text(c, "fondsCode", "Z001"));
            }
          }
        }
      } catch (Exception ignored) { /* 回退旧配置 */ }
    }
    if (entry == null) {
      throw BizException.badRequest("YONYOU_NOT_CONFIGURED", "用友连接未配置，请在「系统管理→数据源配置」中填写网关与密钥");
    }
    try {
      var node = json.readTree(entry.valueJson());
      return new Conn(
          text(node, "gateway", "https://dbox.yonyoucloud.com/iuap-api-gateway"),
          text(node, "appKey", ""),
          text(node, "appSecret", ""),
          text(node, "tenantId", ""),
          text(node, "accbookCode", "0001"),
          text(node, "fondsCode", "Z001"));
    } catch (BizException e) {
      throw e;
    } catch (Exception e) {
      throw BizException.badRequest("YONYOU_CONFIG_BAD", "用友连接配置解析失败: " + e.getMessage());
    }
  }

  public boolean configured() {
    try {
      Conn c = conn();
      return !c.appKey().isBlank() && !c.appSecret().isBlank() && !c.tenantId().isBlank();
    } catch (Exception e) {
      return false;
    }
  }

  // ═══════════════════ 签名与 token ═══════════════════

  /** HmacSHA256(appSecret, "appKey{key}timestamp{ts}") → Base64 → URL Encode */
  static String sign(String appKey, String appSecret, long timestamp) {
    try {
      // 按参数名升序拼接 "参数名+参数值"（TreeMap 保序）
      Map<String, String> params = new TreeMap<>();
      params.put("appKey", appKey);
      params.put("timestamp", String.valueOf(timestamp));
      StringBuilder sb = new StringBuilder();
      params.forEach((k, v) -> sb.append(k).append(v));
      Mac mac = Mac.getInstance("HmacSHA256");
      mac.init(new SecretKeySpec(appSecret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
      String b64 = Base64.getEncoder().encodeToString(mac.doFinal(sb.toString().getBytes(StandardCharsets.UTF_8)));
      return URLEncoder.encode(b64, StandardCharsets.UTF_8);
    } catch (Exception e) {
      throw new IllegalStateException("签名计算失败: " + e.getMessage(), e);
    }
  }

  /** 取 token（缓存；401/业务失败时强制刷新重试一次由调用方决定） */
  public String token() {
    long now = System.currentTimeMillis();
    if (cachedToken != null && now < tokenExpireAt) return cachedToken;
    synchronized (this) {
      if (cachedToken != null && System.currentTimeMillis() < tokenExpireAt) return cachedToken;
      cachedToken = fetchToken();
      tokenExpireAt = System.currentTimeMillis() + TOKEN_TTL_MS;
      return cachedToken;
    }
  }

  /** 强制刷新（同步中发现 token 失效时调用） */
  public synchronized String refreshToken() {
    cachedToken = fetchToken();
    tokenExpireAt = System.currentTimeMillis() + TOKEN_TTL_MS;
    return cachedToken;
  }

  @SuppressWarnings("unchecked")
  private String fetchToken() {
    Conn c = conn();
    long ts = System.currentTimeMillis();
    String url = c.gateway() + "/open-auth/selfAppAuth/getAccessToken"
        + "?appKey=" + URLEncoder.encode(c.appKey(), StandardCharsets.UTF_8)
        + "&timestamp=" + ts
        + "&signature=" + sign(c.appKey(), c.appSecret(), ts);
    Map<String, Object> resp;
    try {
      // 注意：必须传 URI 对象——传 String 会被 RestTemplate 当 URI 模板二次编码
      // （已编码的 %2B → %252B），导致签名串被破坏、"签名不正确"（2026-08-08 实测坑）
      resp = http.getForObject(java.net.URI.create(url), Map.class);
    } catch (Exception e) {
      throw BizException.badRequest("YONYOU_UNREACHABLE", "用友网关不可达: " + e.getMessage());
    }
    Object data = resp == null ? null : resp.get("data");
    String token = null;
    if (data instanceof Map<?, ?> m) {
      Object t = m.get("access_token");
      if (t == null && m.get("data") instanceof Map<?, ?> m2) t = m2.get("access_token");
      token = t == null ? null : String.valueOf(t);
    }
    if (token == null || token.isBlank()) {
      throw BizException.badRequest("YONYOU_AUTH_FAILED",
          "获取 access_token 失败: " + (resp == null ? "空响应" : String.valueOf(resp.get("message"))));
    }
    log.info("用友 token 获取成功（{} 后过期）", Instant.ofEpochMilli(tokenExpireAt));
    return token;
  }

  // ═══════════════════ 业务接口 ═══════════════════

  /** 通用 POST 调用（自动带 token/tenantId；token 失效自动刷新重试一次） */
  @SuppressWarnings("unchecked")
  public Map<String, Object> call(String path, Map<String, Object> body) {
    Conn c = conn();
    Map<String, Object> resp = doCall(c, path, body, token());
    // token 过期类错误码：刷新重试一次（310036 跨域/token 无效）
    Object code = resp.get("code");
    if ("310036".equals(String.valueOf(code)) || "310037".equals(String.valueOf(code))) {
      log.warn("用友返回 {}，刷新 token 重试", code);
      resp = doCall(c, path, body, refreshToken());
    }
    return resp;
  }

  private Map<String, Object> doCall(Conn c, String path, Map<String, Object> body, String token) {
    String url = c.gateway() + path + "?access_token=" + token + "&tenantId=" + c.tenantId();
    HttpHeaders headers = new HttpHeaders();
    headers.setContentType(MediaType.APPLICATION_JSON);
    try {
      // 同样用 URI.create 防模板二次编码（access_token 可能含 + / = 等字符）
      ResponseEntity<Map> resp = http.exchange(java.net.URI.create(url), HttpMethod.POST,
          new HttpEntity<>(body, headers), Map.class);
      return resp.getBody() == null ? Map.of() : resp.getBody();
    } catch (Exception e) {
      throw BizException.badRequest("YONYOU_CALL_FAILED", "调用用友接口失败 " + path + ": " + e.getMessage());
    }
  }

  /** 接口1：账簿查询 → [ {id(GUID), code, name} ]（取首个账簿） */
  @SuppressWarnings("unchecked")
  public Map<String, Object> queryAccbook() {
    Map<String, Object> resp = call("/yonbip/fi/fipub/basedoc/querybd/accbook", Map.of(
        "fields", List.of("id", "code", "name"),
        "pageIndex", 1,
        "pageSize", 10,
        "conditions", List.of(Map.of("field", "createTime", "value", "2019-10-23 14:00:37", "operator", ">="))));
    Object data = resp.get("data");
    if (data instanceof List<?> list && !list.isEmpty() && list.get(0) instanceof Map<?, ?> m) {
      return (Map<String, Object>) m;
    }
    throw BizException.badRequest("YONYOU_NO_ACCBOOK", "用友账簿查询无数据: " + resp.get("message"));
  }

  /** 接口2：期间查询 → 全部期间 code 列表（实测 576 条，2024-01~2025-12） */
  @SuppressWarnings("unchecked")
  public List<String> queryPeriods() {
    Map<String, Object> resp = call("/yonbip/fi/fipub/basedoc/querybd/accperiod", Map.of(
        "fields", List.of("id", "code", "name"),
        "pageIndex", 1,
        "pageSize", 1000,
        "disableshow", false));
    Object data = resp.get("data");
    if (data instanceof List<?> list) {
      return list.stream()
          .filter(Map.class::isInstance).map(Map.class::cast)
          .map(m -> String.valueOf(m.get("code")))
          .filter(s -> s.matches("\\d{4}-\\d{2}"))
          .sorted()
          .toList();
    }
    return List.of();
  }

  /** 接口3：凭证列表分页查询（必须带 periodStart/periodEnd，否则沙箱返回 0 条——实测坑） */
  public Map<String, Object> queryVouchers(String accbookCode, String period, int pageIndex, int pageSize) {
    return call("/yonbip/fi/ficloud/openapi/voucher/queryVouchers", Map.of(
        "pager", Map.of("pageIndex", pageIndex, "pageSize", pageSize),
        "accbookCode", accbookCode,
        "periodStart", period,
        "periodEnd", period));
  }

  /** 接口4：凭证详情（voucherId 取自列表 recordList[].header.id） */
  public Map<String, Object> queryVoucherDetail(String voucherId) {
    return call("/yonbip/EFI/openapi/voucher/queryVoucherById", Map.of("voucherId", voucherId));
  }

  /** 接口5：凭证附件查询（data 以凭证 id 为 key，值为附件数组，含 filePath 签名 OSS 地址） */
  public Map<String, Object> queryBusinessFiles(List<String> voucherIds) {
    return call("/yonbip/EFI/rest/v1/openapi/queryBusinessFiles", Map.of("businessIds", voucherIds));
  }

  /** 接口6：余额类报表（accbook 必须传 GUID） */
  public Map<String, Object> queryBalanceReport(String accbookGuid, String period) {
    return call("/yonbip/fi/rpt/balance", Map.of("accbook", accbookGuid, "period", period));
  }

  /** 接口7：发生类报表（accbook 必须传 GUID） */
  public Map<String, Object> queryProfitReport(String accbookGuid, String period) {
    return call("/yonbip/fi/rpt/profit", Map.of("accbook", accbookGuid, "period", period));
  }

  private static String text(com.fasterxml.jackson.databind.JsonNode node, String field, String def) {
    var v = node.get(field);
    return v == null || v.isNull() ? def : v.asText(def);
  }
}
