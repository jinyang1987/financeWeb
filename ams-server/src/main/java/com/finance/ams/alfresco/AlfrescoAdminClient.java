package com.finance.ams.alfresco;

import java.util.List;
import java.util.Map;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Component;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.RestTemplate;

/**
 * Alfresco 管理操作客户端（seed 用，以管理员 ticket 执行）
 */
@Component
public class AlfrescoAdminClient {

  private static final Logger log = LoggerFactory.getLogger(AlfrescoAdminClient.class);

  private final RestTemplate http = new RestTemplate();
  private final String baseUrl;
  private final String apiV1;
  private final String adminUser;
  private final String adminPassword;

  private volatile String adminTicket;

  public AlfrescoAdminClient(
      @Value("${ams.alfresco.base-url}") String baseUrl,
      @Value("${ams.alfresco.api-path}") String apiPath,
      @Value("${ams.seed.admin-user:admin}") String adminUser,
      @Value("${ams.seed.admin-password:admin}") String adminPassword) {
    this.baseUrl = baseUrl;
    this.apiV1 = apiPath;
    this.adminUser = adminUser;
    this.adminPassword = adminPassword;
  }

  /** 管理员 ticket（懒加载 + 401 自动续期） */
  @SuppressWarnings("unchecked")
  private synchronized String ticket() {
    if (adminTicket == null) {
      String url = baseUrl + "/api/-default-/public/authentication/versions/1/tickets";
      ResponseEntity<Map> res = http.postForEntity(url, Map.of("userId", adminUser, "password", adminPassword), Map.class);
      adminTicket = (String) ((Map<String, Object>) res.getBody().get("entry")).get("id");
    }
    return adminTicket;
  }

  private String withTicket(String url) {
    return url + (url.contains("?") ? "&" : "?") + "alf_ticket=" + ticket();
  }

  /** 401 时刷新 ticket 重试一次 */
  private <T> T callWithRetry(java.util.function.Supplier<T> call) {
    try {
      return call.get();
    } catch (HttpClientErrorException e) {
      if (e.getStatusCode().value() == 401) {
        adminTicket = null;
        return call.get();
      }
      throw e;
    }
  }

  // ── People ──

  public boolean personExists(String id) {
    return callWithRetry(() -> {
      try {
        http.getForEntity(withTicket(baseUrl + apiV1 + "/people/" + id), Map.class);
        return true;
      } catch (HttpClientErrorException.NotFound e) {
        return false;
      }
    });
  }

  public void createPerson(String id, String firstName, String lastName, String email, String password) {
    callWithRetry(() -> {
      http.postForEntity(withTicket(baseUrl + apiV1 + "/people"),
          Map.of("id", id, "firstName", firstName, "lastName", lastName, "email", email, "password", password),
          Map.class);
      return null;
    });
  }

  // ── Nodes（ACL seed 用） ──

  /** 取节点 id（-my- 等特殊 id 亦可） */
  @SuppressWarnings("unchecked")
  public String getNodeId(String nodeId) {
    return callWithRetry(() -> {
      ResponseEntity<Map> res = http.getForEntity(withTicket(baseUrl + apiV1 + "/nodes/" + nodeId), Map.class);
      return (String) ((Map<String, Object>) res.getBody().get("entry")).get("id");
    });
  }

  /** 按名称查直接子节点 id（找不到返回 null） */
  @SuppressWarnings("unchecked")
  public String findChildId(String parentId, String name) {
    return callWithRetry(() -> {
      int skip = 0;
      while (true) {
        ResponseEntity<Map> res = http.getForEntity(
            withTicket(baseUrl + apiV1 + "/nodes/" + parentId + "/children?skipCount=" + skip + "&maxItems=500"), Map.class);
        Map<String, Object> list = (Map<String, Object>) res.getBody().get("list");
        for (Map<String, Object> e : (List<Map<String, Object>>) list.get("entries")) {
          Map<String, Object> entry = (Map<String, Object>) e.get("entry");
          if (name.equals(entry.get("name"))) return (String) entry.get("id");
        }
        Map<String, Object> paging = (Map<String, Object>) list.get("pagination");
        if (!Boolean.TRUE.equals(paging.get("hasMoreItems"))) return null;
        skip += 500;
      }
    });
  }

  /**
   * 对节点设置 GROUP_EVERYONE=Collaborator（本地权限，继承保持开启）。
   * 用于「会计档案管理」根目录：保证所有演示账号都能在收集池建件/写内容。
   * 注意：ACS 26 无 PUT /nodes/{id}/permissions 端点（404），权限走节点更新体的 permissions 字段。
   */
  public void setEveryoneCollaborator(String nodeId) {
    callWithRetry(() -> {
      Map<String, Object> permissions = Map.of(
          "isInheritanceEnabled", true,
          "locallySet", List.of(Map.of(
              "authorityId", "GROUP_EVERYONE",
              "name", "Collaborator",
              "accessStatus", "ALLOWED")));
      http.put(withTicket(baseUrl + apiV1 + "/nodes/" + nodeId), Map.of("permissions", permissions));
      return null;
    });
  }

  /** 建子节点（任意类型 + 属性），返回新节点 id */
  @SuppressWarnings("unchecked")
  public String createNode(String parentId, String name, String nodeType, Map<String, Object> properties) {
    return callWithRetry(() -> {
      var body = new java.util.LinkedHashMap<String, Object>();
      body.put("name", name);
      body.put("nodeType", nodeType);
      if (properties != null && !properties.isEmpty()) body.put("properties", properties);
      ResponseEntity<Map> res = http.postForEntity(
          withTicket(baseUrl + apiV1 + "/nodes/" + parentId + "/children"), body, Map.class);
      return (String) ((Map<String, Object>) res.getBody().get("entry")).get("id");
    });
  }

  /** 列子节点（含 properties），返回 entry 列表 */
  @SuppressWarnings("unchecked")
  public List<Map<String, Object>> listChildren(String parentId) {
    return callWithRetry(() -> {
      List<Map<String, Object>> result = new java.util.ArrayList<>();
      int skip = 0;
      while (true) {
        ResponseEntity<Map> res = http.getForEntity(
            withTicket(baseUrl + apiV1 + "/nodes/" + parentId + "/children?skipCount=" + skip + "&maxItems=500&include=properties"),
            Map.class);
        Map<String, Object> list = (Map<String, Object>) res.getBody().get("list");
        for (Map<String, Object> e : (List<Map<String, Object>>) list.get("entries")) {
          result.add((Map<String, Object>) e.get("entry"));
        }
        Map<String, Object> paging = (Map<String, Object>) list.get("pagination");
        if (!Boolean.TRUE.equals(paging.get("hasMoreItems"))) return result;
        skip += 500;
      }
    });
  }

  // ── Groups ──

  public boolean groupExists(String fullName) {
    return callWithRetry(() -> {
      try {
        http.getForEntity(withTicket(baseUrl + apiV1 + "/groups/" + fullName), Map.class);
        return true;
      } catch (HttpClientErrorException.NotFound e) {
        return false;
      }
    });
  }

  /** 创建根组（id 不带 GROUP_ 前缀，Alfresco 自动补） */
  public void createRootGroup(String id, String displayName) {
    callWithRetry(() -> {
      http.postForEntity(withTicket(baseUrl + apiV1 + "/groups"),
          Map.of("id", id, "displayName", displayName), Map.class);
      return null;
    });
  }

  /** 创建子组（Legacy API，组织树用） */
  public void createChildGroup(String parentShortName, String shortName, String displayName) {
    callWithRetry(() -> {
      http.postForEntity(
          withTicket(baseUrl + "/service/api/groups/" + parentShortName + "/children/GROUP_" + shortName),
          Map.of("shortName", shortName, "displayName", displayName), Map.class);
      return null;
    });
  }

  /** 组成员判定（v1 无单成员 GET 端点，列成员扫描） */
  @SuppressWarnings("unchecked")
  public boolean isMember(String groupFullName, String personId) {
    return callWithRetry(() -> {
      try {
        ResponseEntity<Map> res = http.getForEntity(
            withTicket(baseUrl + apiV1 + "/groups/" + groupFullName + "/members?maxItems=1000"), Map.class);
        Map<String, Object> list = (Map<String, Object>) res.getBody().get("list");
        List<Map<String, Object>> entries = (List<Map<String, Object>>) list.get("entries");
        return entries.stream().anyMatch(e ->
            personId.equals(((Map<String, Object>) e.get("entry")).get("id")));
      } catch (HttpClientErrorException.NotFound e) {
        return false;
      }
    });
  }

  public void addMember(String groupFullName, String personId) {
    callWithRetry(() -> {
      http.postForEntity(withTicket(baseUrl + apiV1 + "/groups/" + groupFullName + "/members"),
          Map.of("id", personId, "memberType", "PERSON"), Map.class);
      return null;
    });
  }
}
