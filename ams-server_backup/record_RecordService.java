package com.finance.ams.record;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;
import org.springframework.web.client.HttpClientErrorException;

import com.finance.ams.alfresco.AlfrescoNodeClient;
import com.finance.ams.api.BizException;

/**
 * 件域服务（P1-①）：上传建件 / 收集池列表 / 内容读取
 *
 * 节点落点：/会计档案管理/{全宗}/_收集池/{件}（finance:record，cm:content 子类）。
 * 确认组卷时由卷域服务把节点 move 进案卷目录（nodeRef 不变）。
 *
 * 设计要点：
 *  - 列表走 children API（数据库事务读），上传后立即可见，不依赖 Solr 索引；
 *  - 全宗/收集池节点 id 进程内缓存（fonds 极少变更；404 时自动清缓存重解析一次）；
 *  - 件级档号在建件时为临时值 PEND-xxxxxxxx，确认组卷赋号时替换为正式档号。
 */
@Service
public class RecordService {

  private static final Logger log = LoggerFactory.getLogger(RecordService.class);

  /** 全宗根目录名（/Company Home 下） */
  static final String ROOT_NAME = "会计档案管理";
  /** 收集池目录名（每个全宗下一个） */
  static final String POOL_NAME = "_收集池";
  /** 件级临时档号标记（未赋号）：全宗号 + 此后缀 + uuid8 */
  static final String PENDING_CODE_SUFFIX = "-PEND-";

  private final AlfrescoNodeClient nodes;

  /** 全宗号 → 全宗节点 id */
  private final Map<String, String> fondsCache = new ConcurrentHashMap<>();
  /** 全宗节点 id → 收集池节点 id */
  private final Map<String, String> poolCache = new ConcurrentHashMap<>();
  /** 根目录（会计档案管理）节点 id */
  private volatile String rootNodeId;

  public RecordService(AlfrescoNodeClient nodes) {
    this.nodes = nodes;
  }

  // ═══════════════════ 上传建件 ═══════════════════

  public record CreateCmd(
      String fondsCode, String voucherNo, String archiveType, String department,
      Double amount, Integer year, Integer month, String retention,
      String source, String carrierType, String preparer, String voucherCategory,
      String remarks) {}

  /**
   * 上传建件：建 finance:record 节点（全属性）→ 写入文件内容；内容失败回滚删节点。
   */
  public Map<String, Object> create(String userId, String ticket, CreateCmd cmd,
                                    String filename, String mimetype, byte[] bytes) {
    validate(cmd, filename, bytes);
    String fondsId = resolveFonds(ticket, cmd.fondsCode());
    String poolId = ensurePool(ticket, fondsId);

    Map<String, Object> props = new LinkedHashMap<>();
    // 临时档号：{全宗号}-PEND-xxxxxxxx。带全宗前缀是为了让前端按 archiveCode 前缀的
    // 全宗过滤逻辑继续生效；确认组卷赋号时替换为正式档号（P0-7 流水）。
    props.put("finance:archiveCode", cmd.fondsCode().toUpperCase() + PENDING_CODE_SUFFIX
        + UUID.randomUUID().toString().substring(0, 8));
    props.put("finance:voucherNo", cmd.voucherNo());
    props.put("finance:archiveType", cmd.archiveType());
    if (notBlank(cmd.department())) props.put("finance:department", cmd.department());
    if (cmd.amount() != null) props.put("finance:amount", cmd.amount());
    props.put("finance:year", cmd.year());
    if (cmd.month() != null) props.put("finance:month", cmd.month());
    if (notBlank(cmd.retention())) props.put("finance:retention", cmd.retention());
    props.put("finance:recordStatus", "仅件数据");
    props.put("finance:source", cmd.source());
    props.put("finance:carrierType", cmd.carrierType());
    if (notBlank(cmd.preparer())) props.put("finance:preparer", cmd.preparer());
    if (notBlank(cmd.voucherCategory())) props.put("finance:voucherCategory", cmd.voucherCategory());
    if (notBlank(cmd.remarks())) props.put("finance:recordRemark", cmd.remarks());
    props.put("finance:numbered", false);

    Map<String, Object> entry = createWithRenameRetry(ticket, poolId, sanitizeName(filename), "finance:record", props);
    String nodeId = (String) entry.get("id");
    try {
      nodes.putContent(ticket, nodeId, bytes, mimetype);
    } catch (Exception e) {
      try { nodes.deleteNode(ticket, nodeId); } catch (Exception ignored) { /* 回滚尽力而为 */ }
      throw translate("内容写入失败，节点已回滚", e);
    }
    log.info("建件成功: {} → {}（{}，{} 字节，操作人 {}）", cmd.voucherNo(), nodeId, filename, bytes.length, userId);
    return toView(entry, mimetype, bytes.length);
  }

  private void validate(CreateCmd cmd, String filename, byte[] bytes) {
    if (!notBlank(cmd.fondsCode())) throw BizException.badRequest("VALIDATION_FAILED", "fondsCode 不能为空");
    if (!notBlank(cmd.voucherNo())) throw BizException.badRequest("VALIDATION_FAILED", "凭证字号不能为空");
    if (!notBlank(cmd.archiveType())) throw BizException.badRequest("VALIDATION_FAILED", "档案类型不能为空");
    if (cmd.year() == null || cmd.year() < 1900 || cmd.year() > 2100)
      throw BizException.badRequest("VALIDATION_FAILED", "会计年度不合法");
    if (cmd.month() != null && (cmd.month() < 1 || cmd.month() > 12))
      throw BizException.badRequest("VALIDATION_FAILED", "会计月份须在 1-12 之间");
    if (notBlank(cmd.retention()) && !List.of("永久", "30年", "10年").contains(cmd.retention()))
      throw BizException.badRequest("VALIDATION_FAILED", "保管期限仅支持：永久/30年/10年");
    if (!List.of("digital-native", "digitized").contains(cmd.source()))
      throw BizException.badRequest("VALIDATION_FAILED", "来源标记仅支持：digital-native/digitized");
    if (!List.of("electronic", "paper").contains(cmd.carrierType()))
      throw BizException.badRequest("VALIDATION_FAILED", "载体类型仅支持：electronic/paper");
    if (!notBlank(filename)) throw BizException.badRequest("VALIDATION_FAILED", "文件名不能为空");
    if (bytes.length == 0) throw BizException.badRequest("VALIDATION_FAILED", "文件内容为空");
  }

  /** cm:name 合法化（Alfresco 禁止 * " < > \ / ? : | 且不能以 . 结尾） */
  private String sanitizeName(String name) {
    String cleaned = name.replaceAll("[*?\"<>\\\\/:|]", "_").trim();
    while (cleaned.endsWith(".")) cleaned = cleaned.substring(0, cleaned.length() - 1);
    return cleaned.isBlank() ? "未命名文件" : cleaned;
  }

  /** 同名冲突时自动追加 (2)(3)... 后缀重建 */
  private Map<String, Object> createWithRenameRetry(String ticket, String parentId, String name,
                                                    String nodeType, Map<String, Object> props) {
    String candidate = name;
    for (int i = 2; ; i++) {
      try {
        return nodes.createNode(ticket, parentId, candidate, nodeType, props);
      } catch (HttpClientErrorException.Conflict e) {
        candidate = appendSuffix(name, i);
        if (i > 20) throw BizException.badRequest("NAME_CONFLICT", "同名文件过多，请重命名后上传: " + name);
      } catch (HttpClientErrorException e) {
        throw translate("建件失败", e);
      }
    }
  }

  private String appendSuffix(String name, int seq) {
    int dot = name.lastIndexOf('.');
    return dot > 0 ? name.substring(0, dot) + " (" + seq + ")" + name.substring(dot)
                   : name + " (" + seq + ")";
  }

  // ═══════════════════ 收集池列表 ═══════════════════

  public record PoolQuery(String fondsCode, String archiveType, Integer year, Integer month,
                          String keyword, int skipCount, int maxItems) {}

  public record PoolResult(List<Map<String, Object>> items, long totalItems, int skipCount, int maxItems) {}

  /**
   * 收集池列表（未组卷件）：children API 全量拉取 + 内存过滤/分页。
   * 池量级（数百件）下内存过滤完全够用，且规避了 Solr 索引延迟导致的"上传后看不到"。
   */
  @SuppressWarnings("unchecked")
  public PoolResult listPool(String ticket, PoolQuery q) {
    if (!notBlank(q.fondsCode())) throw BizException.badRequest("VALIDATION_FAILED", "fondsCode 不能为空");
    String fondsId = resolveFonds(ticket, q.fondsCode());
    String poolId = ensurePool(ticket, fondsId);

    List<Map<String, Object>> all = new ArrayList<>();
    int skip = 0;
    while (all.size() < 5000) {
      Map<String, Object> list = nodes.listChildren(ticket, poolId, skip, 500);
      for (Map<String, Object> e : (List<Map<String, Object>>) list.get("entries")) {
        Map<String, Object> entry = (Map<String, Object>) e.get("entry");
        if ("finance:record".equals(entry.get("nodeType"))) all.add(entry);
      }
      Map<String, Object> paging = (Map<String, Object>) list.get("pagination");
      if (!Boolean.TRUE.equals(paging.get("hasMoreItems"))) break;
      skip += 500;
    }

    String kw = q.keyword() == null ? "" : q.keyword().trim().toLowerCase();
    List<Map<String, Object>> filtered = all.stream()
        .filter(e -> q.archiveType() == null || q.archiveType().equals(prop(e, "finance:archiveType")))
        .filter(e -> q.year() == null || q.year().equals(intProp(e, "finance:year")))
        .filter(e -> q.month() == null || q.month().equals(intProp(e, "finance:month")))
        .filter(e -> kw.isEmpty()
            || str(e.get("name")).toLowerCase().contains(kw)
            || str(prop(e, "finance:voucherNo")).toLowerCase().contains(kw)
            || str(prop(e, "finance:recordRemark")).toLowerCase().contains(kw))
        .sorted(Comparator.comparing(e -> str(e.get("createdAt")), Comparator.reverseOrder()))
        .toList();

    int from = Math.min(q.skipCount(), filtered.size());
    int to = Math.min(from + q.maxItems(), filtered.size());
    List<Map<String, Object>> page = filtered.subList(from, to).stream().map(e -> toView(e, null, -1)).toList();
    return new PoolResult(page, filtered.size(), q.skipCount(), q.maxItems());
  }

  // ═══════════════════ 卷内件全量读取（P1-③ 读视图） ═══════════════════

  /**
   * 按父节点 id 读取其下全部 finance:record 子节点（完整 RecordView 格式）。
   * 供读视图（财务分类/档案查询）使用：卷内件需要全属性（voucherCategory/subType 等），
   * 而 VolumeService.items 只返回摘要字段。
   *
   * @param ticket    用户会话
   * @param parentId  父节点 id（finance:volume 或 finance:archiveBox）
   * @return 完整 RecordView 列表（按 volumeItemNo 顺排，无该属性则按创建时间）
   */
  @SuppressWarnings("unchecked")
  public List<Map<String, Object>> listByParent(String ticket, String parentId) {
    List<Map<String, Object>> all = new ArrayList<>();
    int skip = 0;
    while (all.size() < 5000) {
      Map<String, Object> list;
      try {
        list = nodes.listChildren(ticket, parentId, skip, 500);
      } catch (HttpClientErrorException.NotFound e) {
        return all;
      } catch (HttpClientErrorException e) {
        throw translate("卷内件查询失败", e);
      }
      for (Map<String, Object> e : (List<Map<String, Object>>) list.get("entries")) {
        Map<String, Object> entry = (Map<String, Object>) e.get("entry");
        if ("finance:record".equals(entry.get("nodeType"))) all.add(entry);
      }
      Map<String, Object> paging = (Map<String, Object>) list.get("pagination");
      if (!Boolean.TRUE.equals(paging.get("hasMoreItems"))) break;
      skip += 500;
    }
    all.sort(Comparator.comparing(e -> {
      Integer n = intProp(e, "finance:volumeItemNo");
      return n == null ? Integer.MAX_VALUE : n;
    }));
    return all.stream().map(e -> toView(e, null, -1)).toList();
  }

  /**
   * 按档案盒 id 读取盒内全部记录（盒→卷→件两级遍历）。
   * 盒的直接子节点是 finance:volume（文件夹），需逐卷再读子件。
   */
  @SuppressWarnings("unchecked")
  public List<Map<String, Object>> listByBox(String ticket, String boxId) {
    List<Map<String, Object>> out = new ArrayList<>();
    int skip = 0;
    while (true) {
      Map<String, Object> list;
      try {
        list = nodes.listChildren(ticket, boxId, skip, 500);
      } catch (HttpClientErrorException.NotFound e) {
        return out;
      } catch (HttpClientErrorException e) {
        throw translate("盒内卷查询失败", e);
      }
      for (Map<String, Object> e : (List<Map<String, Object>>) list.get("entries")) {
        Map<String, Object> entry = (Map<String, Object>) e.get("entry");
        if ("finance:volume".equals(entry.get("nodeType"))) {
          out.addAll(listByParent(ticket, (String) entry.get("id")));
        }
      }
      Map<String, Object> paging = (Map<String, Object>) list.get("pagination");
      if (!Boolean.TRUE.equals(paging.get("hasMoreItems"))) break;
      skip += 500;
    }
    return out;
  }

    /** 批量按节点 id 读取记录（跨卷/跨盒查询场景） */
  public List<Map<String, Object>> listByIds(String ticket, List<String> nodeIds) {
    List<Map<String, Object>> out = new ArrayList<>();
    for (String nodeId : nodeIds) {
      try {
        Map<String, Object> entry = nodes.getNode(ticket, nodeId);
        if ("finance:record".equals(entry.get("nodeType"))) {
          out.add(toView(entry, null, -1));
        }
      } catch (HttpClientErrorException.NotFound e) {
        // 节点已删除，跳过
      } catch (HttpClientErrorException e) {
        throw translate("记录查询失败: " + nodeId, e);
      }
    }
    return out;
  }

    // ═══════════════════ 内容读取 ═══════════════════

  public ResponseEntity<byte[]> content(String ticket, String nodeId) {
    try {
      return nodes.getContent(ticket, nodeId);
    } catch (HttpClientErrorException e) {
      throw translate("内容读取失败", e);
    }
  }

  // ═══════════════════ 全宗/收集池解析 ═══════════════════

  /** 全宗号 → 节点 id（缓存；未命中时清缓存重扫一次） */
  @SuppressWarnings("unchecked")
  private String resolveFonds(String ticket, String fondsCode) {
    String cached = fondsCache.get(fondsCode);
    if (cached != null) return cached;
    synchronized (fondsCache) {
      if (fondsCache.containsKey(fondsCode)) return fondsCache.get(fondsCode);
      String rootId = resolveRoot(ticket);
      int skip = 0;
      while (true) {
        Map<String, Object> list = nodes.listChildren(ticket, rootId, skip, 200);
        for (Map<String, Object> e : (List<Map<String, Object>>) list.get("entries")) {
          Map<String, Object> entry = (Map<String, Object>) e.get("entry");
          if (!"finance:fonds".equals(entry.get("nodeType"))) continue;
          String code = str(prop(entry, "finance:code"));
          if (!code.isEmpty()) fondsCache.put(code, (String) entry.get("id"));
        }
        Map<String, Object> paging = (Map<String, Object>) list.get("pagination");
        if (!Boolean.TRUE.equals(paging.get("hasMoreItems"))) break;
        skip += 200;
      }
      String found = fondsCache.get(fondsCode);
      if (found == null) throw BizException.badRequest("FONDS_NOT_FOUND", "全宗不存在: " + fondsCode);
      return found;
    }
  }

  private String resolveRoot(String ticket) {
    if (rootNodeId != null) return rootNodeId;
    synchronized (fondsCache) {
      if (rootNodeId != null) return rootNodeId;
      try {
        // 注意：必须用 -root-（Company Home），-my- 对普通用户是个人主目录（P1-① 实测踩坑）
        String companyHomeId = str(nodes.getNode(ticket, "-root-").get("id"));
        rootNodeId = nodes.findChildId(ticket, companyHomeId, ROOT_NAME);
      } catch (HttpClientErrorException e) {
        throw translate("根目录解析失败", e);
      }
      if (rootNodeId == null) throw new BizException(HttpStatus.INTERNAL_SERVER_ERROR, "ROOT_NOT_FOUND",
          "未找到「" + ROOT_NAME + "」根目录，请先在 Alfresco 中建全宗");
      return rootNodeId;
    }
  }

  /** 收集池：不存在则以当前用户身份创建（普通用户靠根目录继承的 Collaborator 权限） */
  private String ensurePool(String ticket, String fondsId) {
    String cached = poolCache.get(fondsId);
    if (cached != null) return cached;
    synchronized (poolCache) {
      if (poolCache.containsKey(fondsId)) return poolCache.get(fondsId);
      String poolId;
      try {
        poolId = nodes.findChildId(ticket, fondsId, POOL_NAME);
        if (poolId == null) {
          Map<String, Object> created = nodes.createFolder(ticket, fondsId, POOL_NAME);
          poolId = (String) created.get("id");
          log.info("创建收集池: 全宗 {} → {}", fondsId, poolId);
        }
      } catch (HttpClientErrorException e) {
        throw translate("收集池解析失败", e);
      }
      poolCache.put(fondsId, poolId);
      return poolId;
    }
  }

  // ═══════════════════ 视图映射/异常翻译 ═══════════════════

  /** 节点 entry → 前端 RecordView（mime/size 可由上传路径直接给出） */
  @SuppressWarnings("unchecked")
  Map<String, Object> toView(Map<String, Object> entry, String uploadMime, long uploadSize) {
    Map<String, Object> view = new LinkedHashMap<>();
    view.put("nodeId", entry.get("id"));
    view.put("name", entry.get("name"));
    view.put("nodeType", entry.get("nodeType"));
    view.put("archiveCode", prop(entry, "finance:archiveCode"));
    view.put("voucherNo", prop(entry, "finance:voucherNo"));
    view.put("archiveType", prop(entry, "finance:archiveType"));
    view.put("department", prop(entry, "finance:department"));
    Object amount = entry.get("properties") instanceof Map<?, ?> p ? p.get("finance:amount") : null;
    view.put("amount", amount);
    view.put("year", intProp(entry, "finance:year"));
    view.put("month", intProp(entry, "finance:month"));
    view.put("retention", prop(entry, "finance:retention"));
    view.put("recordStatus", prop(entry, "finance:recordStatus"));
    view.put("source", prop(entry, "finance:source"));
    view.put("carrierType", prop(entry, "finance:carrierType"));
    view.put("preparer", prop(entry, "finance:preparer"));
    view.put("voucherCategory", prop(entry, "finance:voucherCategory"));
    view.put("remarks", prop(entry, "finance:recordRemark"));
    Object numbered = entry.get("properties") instanceof Map<?, ?> p2 ? p2.get("finance:numbered") : null;
    view.put("numbered", Boolean.TRUE.equals(numbered));
    view.put("createdAt", entry.get("createdAt"));
    view.put("modifiedAt", entry.get("modifiedAt"));
    Object createdBy = entry.get("createdByUser");
    if (createdBy instanceof Map<?, ?> m) view.put("createdBy", m.get("id"));
    // 内容信息：上传路径直接给出；列表路径读 entry.content
    String mime = uploadMime;
    long size = uploadSize;
    Object content = entry.get("content");
    if (content instanceof Map<?, ?> c) {
      if (mime == null) mime = (String) c.get("mimeType");
      if (size < 0 && c.get("sizeInBytes") instanceof Number n) size = n.longValue();
    }
    view.put("mimeType", mime);
    view.put("sizeInBytes", size < 0 ? 0 : size);
    return view;
  }

  private static String prop(Map<String, Object> entry, String name) {
    Object props = entry.get("properties");
    if (!(props instanceof Map)) return "";
    Object v = ((Map<String, Object>) props).get(name);
    return v == null ? "" : String.valueOf(v);
  }

  @SuppressWarnings("unchecked")
  private static Integer intProp(Map<String, Object> entry, String name) {
    Object props = entry.get("properties");
    if (!(props instanceof Map)) return null;
    Object v = ((Map<String, Object>) props).get(name);
    return v instanceof Number n ? n.intValue() : null;
  }

  private static String str(Object o) {
    return o == null ? "" : String.valueOf(o);
  }

  private static boolean notBlank(String s) {
    return s != null && !s.isBlank();
  }

  /** Alfresco 异常 → 业务异常（401/403 翻译为会话/权限错误，其余透传状态） */
  static BizException translate(String prefix, Exception e) {
    if (e instanceof HttpClientErrorException hce) {
      int status = hce.getStatusCode().value();
      if (status == 401) return new BizException(HttpStatus.UNAUTHORIZED, "SESSION_EXPIRED", "会话已过期，请重新登录");
      if (status == 403) return new BizException(HttpStatus.FORBIDDEN, "FORBIDDEN", "当前账号无档案库写入权限");
      if (status == 404) return new BizException(HttpStatus.NOT_FOUND, "NODE_NOT_FOUND", prefix + "：节点不存在");
      return new BizException(HttpStatus.valueOf(status), "ALFRESCO_ERROR", prefix + ": " + hce.getStatusText());
    }
    return new BizException(HttpStatus.INTERNAL_SERVER_ERROR, "ALFRESCO_ERROR", prefix + ": " + e.getMessage());
  }
}


