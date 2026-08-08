package com.finance.ams.alfresco;

import java.util.List;
import java.util.Map;

import org.springframework.beans.factory.annotation.Value;

import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Component;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.RestTemplate;

/**
 * Alfresco REST v1 客户端（认证相关最小集）
 *
 * ticket 模式：POST /tickets {userId, password} → ticket id；
 * 后续调用以 `alf_ticket=` 查询参数传递（ACS 26 实测 Basic userId:ticket 返回 401）。
 */
@Component
public class AlfrescoClient {

  private final RestTemplate http = new RestTemplate();
  private final String baseUrl;
  private final String apiV1;

  public AlfrescoClient(@Value("${ams.alfresco.base-url}") String baseUrl,
                        @Value("${ams.alfresco.api-path}") String apiPath) {
    this.baseUrl = baseUrl;
    this.apiV1 = apiPath;
  }

  private String withTicket(String url, String ticket) {
    return url + (url.contains("?") ? "&" : "?") + "alf_ticket=" + ticket;
  }

  /** 账密换 ticket（失败抛 HttpClientErrorException 401） */
  @SuppressWarnings("unchecked")
  public String loginTicket(String userId, String password) {
    String url = baseUrl + "/api/-default-/public/authentication/versions/1/tickets";
    Map<String, String> body = Map.of("userId", userId, "password", password);
    ResponseEntity<Map> res = http.postForEntity(url, body, Map.class);
    Map<String, Object> entry = (Map<String, Object>) res.getBody().get("entry");
    return (String) entry.get("id");
  }

  /** 校验 ticket 有效性并取人员信息；无效抛 401 */
  @SuppressWarnings("unchecked")
  public Map<String, Object> validateTicket(String userId, String ticket) {
    String url = withTicket(baseUrl + apiV1 + "/people/" + userId, ticket);
    ResponseEntity<Map> res = http.getForEntity(url, Map.class);
    return (Map<String, Object>) res.getBody().get("entry");
  }

  /** 取用户的组成员（用于角色解析） */
  @SuppressWarnings("unchecked")
  public List<String> personGroupIds(String userId, String ticket) {
    String url = withTicket(baseUrl + apiV1 + "/people/" + userId + "/groups?maxItems=100", ticket);
    ResponseEntity<Map> res = http.getForEntity(url, Map.class);
    Map<String, Object> list = (Map<String, Object>) res.getBody().get("list");
    List<Map<String, Object>> entries = (List<Map<String, Object>>) list.get("entries");
    return entries.stream()
        .map(e -> (String) ((Map<String, Object>) e.get("entry")).get("id"))
        .toList();
  }

  /** 注销 ticket（尽力而为） */
  public void deleteTicket(String userId, String ticket) {
    try {
      String url = withTicket(baseUrl + "/api/-default-/public/authentication/versions/1/tickets/-me-", ticket);
      http.delete(url);
    } catch (Exception ignored) {
      // ticket 可能已过期，忽略
    }
  }

  /** 判断是否 401/403 类认证错误 */
  public static boolean isAuthError(Exception e) {
    return e instanceof HttpClientErrorException.Unauthorized || e instanceof HttpClientErrorException.Forbidden;
  }
}
