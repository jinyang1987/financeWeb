package com.finance.ams.alfresco;

import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.client.HttpClientErrorException;

import com.finance.ams.api.BizException;

/**
 * 档案库目录布局助手（卷域/盒域共享）
 *
 * 目录规约（/Company Home 下）：
 *   会计档案管理/{全宗}/_收集池          未组卷件（件域，P1-①）
 *   会计档案管理/{全宗}/案卷库/{KP|KB|FB|QT}/{year}/   在组案卷（draft/confirmed）
 *   会计档案管理/{全宗}/盒库/{KP|KB|FB|QT}/{year}/     档案盒（移交后案卷 move 进盒）
 *
 * 注意：record 域的 RecordService 自带等价私有实现（fondsCache/ensurePool），
 * 为控制 P1-② 改动半径未做合并 —— 后续清理时统一（见实施任务分解 P4 死代码清理）。
 */
@Component
public class RepoLayout {

  // 显式声明日志（勿依赖 Lombok：IDE 的 ECJ 无注解处理，会把含 log 的类编成
  // 「Unresolved compilation problem」残类盖进 target/classes——2026-07-29 实测事故）
  private static final org.slf4j.Logger log = org.slf4j.LoggerFactory.getLogger(RepoLayout.class);

  /** 全宗根目录名（/Company Home 下） */
  public static final String ROOT_NAME = "会计档案管理";
  /** 收集池目录名（每个全宗下一个） */
  public static final String POOL_NAME = "_收集池";
  /** 案卷库目录名（在组案卷） */
  public static final String VOLUMES_ROOT = "案卷库";
  /** 盒库目录名（移交归盒） */
  public static final String BOXES_ROOT = "盒库";

  private final AlfrescoNodeClient nodes;

  private volatile String rootNodeId;
  private final Map<String, String> fondsCache = new ConcurrentHashMap<>();
  /** 父节点 id + 子目录名 → 子目录 id（目录极少变更，进程内缓存） */
  private final Map<String, String> dirCache = new ConcurrentHashMap<>();

  public RepoLayout(AlfrescoNodeClient nodes) {
    this.nodes = nodes;
  }

  /** 档案库根目录 id */
  public String root(String ticket) {
    if (rootNodeId != null) return rootNodeId;
    synchronized (fondsCache) {
      if (rootNodeId != null) return rootNodeId;
      try {
        // 必须用 -root-（Company Home）；-my- 对普通用户是个人主目录（P1-① 坑 #1）
        String companyHomeId = String.valueOf(nodes.getNode(ticket, "-root-").get("id"));
        rootNodeId = nodes.findChildId(ticket, companyHomeId, ROOT_NAME);
      } catch (HttpClientErrorException e) {
        throw translate("根目录解析失败", e);
      }
      if (rootNodeId == null) {
        throw new BizException(HttpStatus.INTERNAL_SERVER_ERROR, "ROOT_NOT_FOUND",
            "未找到「" + ROOT_NAME + "」根目录，请先在 Alfresco 中建全宗");
      }
      return rootNodeId;
    }
  }

  /** 全宗号 → 全宗节点 id（缓存；整表重扫一次灌满缓存） */
  @SuppressWarnings("unchecked")
  public String fonds(String ticket, String fondsCode) {
    String cached = fondsCache.get(fondsCode);
    if (cached != null) return cached;
    synchronized (fondsCache) {
      if (fondsCache.containsKey(fondsCode)) return fondsCache.get(fondsCode);
      int skip = 0;
      while (true) {
        Map<String, Object> list = nodes.listChildren(ticket, root(ticket), skip, 200);
        for (Map<String, Object> e : (List<Map<String, Object>>) list.get("entries")) {
          Map<String, Object> entry = (Map<String, Object>) e.get("entry");
          if (!"finance:fonds".equals(entry.get("nodeType"))) continue;
          Object props = entry.get("properties");
          String code = props instanceof Map<?, ?> p && p.get("finance:code") != null
              ? String.valueOf(p.get("finance:code")) : "";
          if (!code.isEmpty()) fondsCache.put(code, String.valueOf(entry.get("id")));
        }
        Map<String, Object> paging = (Map<String, Object>) list.get("pagination");
        if (!Boolean.TRUE.equals(paging.get("hasMoreItems"))) break;
        skip += 200;
      }
      String found = fondsCache.get(fondsCode);
      if (found == null) {
        log.warn("全宗解析失败(RepoLayout): 请求 fondsCode=[{}](len={}), 库内全宗={}",
            fondsCode, fondsCode == null ? -1 : fondsCode.length(), fondsCache.keySet());
        throw BizException.badRequest("FONDS_NOT_FOUND",
            "全宗不存在: " + fondsCode + "（库内现有全宗: " + String.join(",", fondsCache.keySet()) + "）");
      }
      return found;
    }
  }

  /** 确保子目录存在（不存在则以当前用户身份创建），返回目录 id */
  public String ensureChild(String ticket, String parentId, String name) {
    String key = parentId + "/" + name;
    String cached = dirCache.get(key);
    if (cached != null) return cached;
    synchronized (dirCache) {
      if (dirCache.containsKey(key)) return dirCache.get(key);
      String id;
      try {
        id = nodes.findChildId(ticket, parentId, name);
        if (id == null) {
          id = String.valueOf(nodes.createFolder(ticket, parentId, name).get("id"));
        }
      } catch (HttpClientErrorException e) {
        throw translate("目录解析失败: " + name, e);
      }
      dirCache.put(key, id);
      return id;
    }
  }

  /** 逐级确保路径（相对全宗节点），返回末级目录 id */
  public String ensurePath(String ticket, String fondsId, String... segments) {
    String cur = fondsId;
    for (String seg : segments) cur = ensureChild(ticket, cur, seg);
    return cur;
  }

  /** 收集池目录 id（每个全宗一个，自动创建） */
  public String pool(String ticket, String fondsId) {
    return ensureChild(ticket, fondsId, POOL_NAME);
  }

  /** 从任意节点反查所属全宗节点（路径链中第一个 finance:fonds，附带其 properties） */
  @SuppressWarnings("unchecked")
  public Map<String, Object> findFondsOf(String ticket, String nodeId) {
    String fondsId = null;
    try {
      Map<String, Object> entry = nodes.getNodeWithPath(ticket, nodeId);
      Object path = entry.get("path");
      if (path instanceof Map<?, ?> p && p.get("elements") instanceof List<?> els) {
        for (Object el : els) {
          if (el instanceof Map<?, ?> m && "finance:fonds".equals(m.get("nodeType"))) {
            fondsId = String.valueOf(m.get("id"));
          }
        }
      }
    } catch (HttpClientErrorException e) {
      throw translate("路径解析失败", e);
    }
    if (fondsId == null) {
      throw BizException.badRequest("FONDS_NOT_FOUND", "节点不在任何全宗目录下: " + nodeId);
    }
    try {
      return nodes.getNode(ticket, fondsId);
    } catch (HttpClientErrorException e) {
      throw translate("全宗节点查询失败", e);
    }
  }

  /** 路径链中最近的指定类型祖先节点（如案卷所属的 finance:archiveBox，附 properties），无则 null */
  @SuppressWarnings("unchecked")
  public Map<String, Object> nearestAncestorOfType(String ticket, String nodeId, String nodeType) {
    String foundId = null;
    try {
      Map<String, Object> entry = nodes.getNodeWithPath(ticket, nodeId);
      Object path = entry.get("path");
      if (path instanceof Map<?, ?> p && p.get("elements") instanceof List<?> els) {
        for (Object el : els) {
          if (el instanceof Map<?, ?> m && nodeType.equals(m.get("nodeType"))) {
            foundId = String.valueOf(m.get("id"));
          }
        }
      }
    } catch (HttpClientErrorException e) {
      throw translate("路径解析失败", e);
    }
    if (foundId == null) return null;
    try {
      return nodes.getNode(ticket, foundId);
    } catch (HttpClientErrorException e) {
      throw translate("祖先节点查询失败", e);
    }
  }

  /** Alfresco 异常翻译（与 RecordService.translate 同规约） */
  public static BizException translate(String prefix, Exception e) {
    if (e instanceof HttpClientErrorException hce) {
      int status = hce.getStatusCode().value();
      if (status == 401) return new BizException(HttpStatus.UNAUTHORIZED, "SESSION_EXPIRED", "会话已过期，请重新登录");
      if (status == 403) return new BizException(HttpStatus.FORBIDDEN, "FORBIDDEN", "当前账号无档案库写入权限");
      if (status == 404) return new BizException(HttpStatus.NOT_FOUND, "NODE_NOT_FOUND", prefix + "：节点不存在");
      return new BizException(HttpStatus.valueOf(status), "ALFRESCO_ERROR", prefix + "：" + alfrescoReason(hce));
    }
    return new BizException(HttpStatus.INTERNAL_SERVER_ERROR, "ALFRESCO_ERROR", prefix + "：" + e.getMessage());
  }

  /**
   * 从 Alfresco 错误响应体提取可读原因（{"error":{"errorKey","briefSummary"}}）。
   * 2026-08-19 修复：原实现用 hce.getStatusText()——HTTP/2 没有 reason phrase，恒为空串，
   * 导致「移交归盒失败: 」这类无原因报错，业务侧无法理解。常见错误中文化，其余透传 briefSummary。
   */
  private static String alfrescoReason(HttpClientErrorException hce) {
    try {
      String body = hce.getResponseBodyAsString();
      if (body != null && !body.isBlank()) {
        com.fasterxml.jackson.databind.JsonNode err =
            new com.fasterxml.jackson.databind.ObjectMapper().readTree(body).path("error");
        String key = err.path("errorKey").asText("");
        String summary = err.path("briefSummary").asText("");
        if (key.contains("DuplicateChildNodeName") || summary.contains("Duplicate child")) {
          return "目标位置已存在同名节点（请勿重复操作）";
        }
        if (key.contains("NodeLocked") || summary.contains("NodeLocked") || summary.contains("node is locked")) {
          return "节点已被锁定，禁止移动/修改";
        }
        if (summary.toLowerCase().contains("access denied") || summary.contains("Permission")) {
          return "当前账号在档案库中的权限不足";
        }
        if (!summary.isBlank()) {
          // briefSummary 形如 "08210045 Duplicate child node name: xxx"（前导为日志 id），剥掉前导数字
          String cleaned = summary.replaceFirst("^\\d+\\s*", "").trim();
          if (!cleaned.isEmpty()) return cleaned;
        }
      }
    } catch (Exception ignored) { /* 解析失败走兜底 */ }
    String st = hce.getStatusText();
    return (st == null || st.isBlank())
        ? "档案库返回错误（HTTP " + hce.getStatusCode().value() + "）"
        : st;
  }
}
