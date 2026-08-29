package com.finance.ams.alfresco;

import java.util.List;
import java.util.Map;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Component;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.RestTemplate;

/**
 * Alfresco 节点操作客户端（以登录用户的 ticket 调用，权限生效）
 *
 * 覆盖 P1 件域所需最小集：子节点查询/建目录/建节点/写内容/读内容/删节点。
 * 约定：ACS 26 只接受 `alf_ticket=` 查询参数（P0-5 实测结论）。
 */
@Component
public class AlfrescoNodeClient {

  private final RestTemplate http = new RestTemplate();
  private final String baseUrl;
  private final String apiV1;

  public AlfrescoNodeClient(@Value("${ams.alfresco.base-url}") String baseUrl,
                            @Value("${ams.alfresco.api-path}") String apiPath) {
    this.baseUrl = baseUrl;
    this.apiV1 = apiPath;
  }

  private String withTicket(String url, String ticket) {
    return url + (url.contains("?") ? "&" : "?") + "alf_ticket=" + ticket;
  }

  /** 取节点（-my- 等特殊 id 亦可） */
  @SuppressWarnings("unchecked")
  public Map<String, Object> getNode(String ticket, String nodeId) {
    ResponseEntity<Map> res = http.getForEntity(withTicket(baseUrl + apiV1 + "/nodes/" + nodeId, ticket), Map.class);
    return (Map<String, Object>) res.getBody().get("entry");
  }

  /**
   * 取节点并携带完整路径（include=path,properties）。
   * entry.path.elements = 根 → 叶 全祖先链（含 id/name/nodeType，无 properties）。
   * 注意：/nodes/{id}/parents 只返回直接父节点，反查全宗/档案盒必须用本方法。
   */
  @SuppressWarnings("unchecked")
  public Map<String, Object> getNodeWithPath(String ticket, String nodeId) {
    String url = baseUrl + apiV1 + "/nodes/" + nodeId + "?include=path,properties";
    ResponseEntity<Map> res = http.getForEntity(withTicket(url, ticket), Map.class);
    return (Map<String, Object>) res.getBody().get("entry");
  }

  /**
   * 按名称查直接子节点 id（找不到返回 null）。children API 走数据库事务读，
   * 无 Solr 索引延迟，适合"建完立即可见"的场景。
   */
  @SuppressWarnings("unchecked")
  public String findChildId(String ticket, String parentId, String name) {
    int skip = 0;
    while (true) {
      String url = baseUrl + apiV1 + "/nodes/" + parentId + "/children?skipCount=" + skip + "&maxItems=500";
      ResponseEntity<Map> res = http.getForEntity(withTicket(url, ticket), Map.class);
      Map<String, Object> list = (Map<String, Object>) res.getBody().get("list");
      for (Map<String, Object> e : (List<Map<String, Object>>) list.get("entries")) {
        Map<String, Object> entry = (Map<String, Object>) e.get("entry");
        if (name.equals(entry.get("name"))) return (String) entry.get("id");
      }
      Map<String, Object> paging = (Map<String, Object>) list.get("pagination");
      if (!Boolean.TRUE.equals(paging.get("hasMoreItems"))) return null;
      skip += 500;
    }
  }

  /** 建子目录（cm:folder），返回 entry */
  public Map<String, Object> createFolder(String ticket, String parentId, String name) {
    return postChild(ticket, parentId, name, "cm:folder", null);
  }

  /** 建子节点（任意类型 + 属性），返回 entry */
  public Map<String, Object> createNode(String ticket, String parentId, String name,
                                        String nodeType, Map<String, Object> properties) {
    return postChild(ticket, parentId, name, nodeType, properties);
  }

  @SuppressWarnings("unchecked")
  private Map<String, Object> postChild(String ticket, String parentId, String name,
                                        String nodeType, Map<String, Object> properties) {
    var body = new java.util.LinkedHashMap<String, Object>();
    body.put("name", name);
    body.put("nodeType", nodeType);
    if (properties != null && !properties.isEmpty()) body.put("properties", properties);
    ResponseEntity<Map> res = http.postForEntity(
        withTicket(baseUrl + apiV1 + "/nodes/" + parentId + "/children", ticket), body, Map.class);
    return (Map<String, Object>) res.getBody().get("entry");
  }

  /** 写入二进制内容（cm:content），mimetype 决定预览/转换行为 */
  @SuppressWarnings("unchecked")
  public Map<String, Object> putContent(String ticket, String nodeId, byte[] bytes, String mimetype) {
    HttpHeaders headers = new HttpHeaders();
    headers.setContentType(MediaType.parseMediaType(mimetype));
    headers.setContentLength(bytes.length);
    ResponseEntity<Map> res = http.exchange(
        withTicket(baseUrl + apiV1 + "/nodes/" + nodeId + "/content", ticket),
        HttpMethod.PUT, new HttpEntity<>(bytes, headers), Map.class);
    return (Map<String, Object>) res.getBody().get("entry");
  }

  /** 读取二进制内容（原始字节 + 响应头中的 Content-Type） */
  public ResponseEntity<byte[]> getContent(String ticket, String nodeId) {
    return http.exchange(withTicket(baseUrl + apiV1 + "/nodes/" + nodeId + "/content", ticket),
        HttpMethod.GET, HttpEntity.EMPTY, byte[].class);
  }

  /** 删除节点（永久删除，不进归档区） */
  public void deleteNode(String ticket, String nodeId) {
    http.delete(withTicket(baseUrl + apiV1 + "/nodes/" + nodeId + "?permanent=true", ticket));
  }

  /** 重命名节点（PUT /nodes/{id} body {name}；cm:name 仅显示名，与档号无关） */
  public void renameNode(String ticket, String nodeId, String name) {
    http.exchange(withTicket(baseUrl + apiV1 + "/nodes/" + nodeId, ticket),
        HttpMethod.PUT, new HttpEntity<>(Map.of("name", name)), Map.class);
  }

  /**
   * 更新节点属性（PUT /nodes/{id}，body {properties:{...}}）。
   * 属性值为 null 时 Alfresco 语义为清除该属性。
   */
  @SuppressWarnings("unchecked")
  public Map<String, Object> updateNode(String ticket, String nodeId, Map<String, Object> properties) {
    var body = new java.util.LinkedHashMap<String, Object>();
    body.put("properties", properties);
    ResponseEntity<Map> res = http.exchange(
        withTicket(baseUrl + apiV1 + "/nodes/" + nodeId, ticket),
        HttpMethod.PUT, new HttpEntity<>(body), Map.class);
    return (Map<String, Object>) res.getBody().get("entry");
  }

  /** 移动节点到新父目录（nodeRef 不变，仅改主父关联），返回 entry */
  @SuppressWarnings("unchecked")
  public Map<String, Object> moveNode(String ticket, String nodeId, String targetParentId) {
    var body = new java.util.LinkedHashMap<String, Object>();
    body.put("targetParentId", targetParentId);
    ResponseEntity<Map> res = http.postForEntity(
        withTicket(baseUrl + apiV1 + "/nodes/" + nodeId + "/move", ticket), body, Map.class);
    return (Map<String, Object>) res.getBody().get("entry");
  }

  /**
   * 列子节点（含 properties），返回 Alfresco list 原始结构
   * {entries:[{entry:{...}}], pagination:{...}}。
   */
  @SuppressWarnings("unchecked")
  public Map<String, Object> listChildren(String ticket, String parentId, int skipCount, int maxItems) {
    String url = baseUrl + apiV1 + "/nodes/" + parentId + "/children"
        + "?skipCount=" + skipCount + "&maxItems=" + maxItems + "&include=properties";
    ResponseEntity<Map> res = http.getForEntity(withTicket(url, ticket), Map.class);
    return (Map<String, Object>) res.getBody().get("list");
  }

  /** 是否 409 冲突（同名子节点已存在） */
  public static boolean isConflict(Exception e) {
    return e instanceof HttpClientErrorException.Conflict;
  }
}
