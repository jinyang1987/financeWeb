package com.finance.ams.sourcedoc;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.client.HttpClientErrorException;

import com.finance.ams.alfresco.AlfrescoNodeClient;
import com.finance.ams.alfresco.RepoLayout;
import com.finance.ams.api.BizException;

/**
 * 原始凭证域服务（P1-④）
 *
 * 原始凭证 = finance:sourceDocument 节点，是 finance:record 的子节点。
 * 本服务提供：
 *   - 按全宗聚合查询（遍历收集池+案卷库+盒库全部 record 的子件）
 *   - 按 record 查询（单件下的原始凭证列表）
 *   - 上传建件（在指定 record 下建 finance:sourceDocument 子节点）
 */
@Service
public class SourceDocService {

  private static final Logger log = LoggerFactory.getLogger(SourceDocService.class);

  private final AlfrescoNodeClient nodes;
  private final RepoLayout layout;

  public SourceDocService(AlfrescoNodeClient nodes, RepoLayout layout) {
    this.nodes = nodes;
    this.layout = layout;
  }

  /**
   * 按全宗聚合查询全部原始凭证（遍历收集池+案卷库+盒库）。
   * 演示规模（数百件）下全量遍历可接受；大规模时改 Solr 查询。
   */
  public List<Map<String, Object>> listByFonds(String ticket, String fondsCode) {
    String fondsId = layout.fonds(ticket, fondsCode);
    List<Map<String, Object>> out = new ArrayList<>();

    // 1. 收集池
    String poolId = layout.pool(ticket, fondsId);
    collectSourceDocs(ticket, poolId, out);

    // 2. 案卷库（draft/confirmed 卷内的件）
    String volumesRoot = layout.ensureChild(ticket, fondsId, RepoLayout.VOLUMES_ROOT);
    collectFromTree(ticket, volumesRoot, out);

    // 3. 盒库（transferred 卷内的件）
    String boxesRoot = layout.ensureChild(ticket, fondsId, RepoLayout.BOXES_ROOT);
    collectFromTree(ticket, boxesRoot, out);

    return out;
  }

  /** 按 record 节点 id 查询其下全部原始凭证 */
  public List<Map<String, Object>> listByRecord(String ticket, String recordId) {
    List<Map<String, Object>> out = new ArrayList<>();
    collectSourceDocs(ticket, recordId, out);
    return out;
  }

  /** 在指定 record 下建原始凭证节点 */
  public Map<String, Object> create(String ticket, String recordId, Map<String, Object> fields,
                                    String filename, String mimetype, byte[] bytes) {
    Map<String, Object> props = new LinkedHashMap<>();
    props.put("finance:documentNo", str(fields.get("documentNo")));
    props.put("finance:docTypeCode", str(fields.get("docTypeCode")));
    props.put("finance:docTypeName", str(fields.get("docTypeName")));
    if (fields.get("transactionDate") != null) props.put("finance:transactionDate", str(fields.get("transactionDate")));
    if (fields.get("amountLower") != null) props.put("finance:amountLower", fields.get("amountLower"));
    if (fields.get("amountUpper") != null) props.put("finance:amountUpper", str(fields.get("amountUpper")));
    if (fields.get("counterpartyName") != null) props.put("finance:counterpartyName", str(fields.get("counterpartyName")));
    if (fields.get("counterpartyTaxId") != null) props.put("finance:counterpartyTaxId", str(fields.get("counterpartyTaxId")));
    if (fields.get("summary") != null) props.put("finance:summary", str(fields.get("summary")));
    if (fields.get("businessCategory") != null) props.put("finance:businessCategory", str(fields.get("businessCategory")));
    if (fields.get("parentVoucherNo") != null) props.put("finance:parentVoucherNo", str(fields.get("parentVoucherNo")));
    if (fields.get("attachmentSequence") != null) props.put("finance:attachmentSequence", fields.get("attachmentSequence"));

    String name = (filename != null && !filename.isBlank()) ? filename : "source-doc";
    Map<String, Object> entry;
    try {
      entry = nodes.createNode(ticket, recordId, name, "finance:sourceDocument", props);
    } catch (HttpClientErrorException e) {
      throw RepoLayout.translate("创建原始凭证失败", e);
    }
    if (bytes != null && bytes.length > 0 && mimetype != null) {
      try {
        nodes.putContent(ticket, (String) entry.get("id"), bytes, mimetype);
      } catch (Exception e) {
        log.warn("原始凭证内容写入失败（节点已建）: {}", e.getMessage());
      }
    }
    log.info("创建原始凭证: {} → {}", fields.get("documentNo"), entry.get("id"));
    return toView(entry);
  }

  // ═══════════════════ 内部遍历 ═══════════════════

  /** 递归遍历目录树，收集所有 finance:record 节点下的 sourceDocument 子件 */
  @SuppressWarnings("unchecked")
  private void collectFromTree(String ticket, String dirId, List<Map<String, Object>> out) {
    int skip = 0;
    while (true) {
      Map<String, Object> list;
      try {
        list = nodes.listChildren(ticket, dirId, skip, 500);
      } catch (HttpClientErrorException.NotFound e) {
        return;
      } catch (HttpClientErrorException e) {
        throw RepoLayout.translate("目录遍历失败", e);
      }
      for (Map<String, Object> e : (List<Map<String, Object>>) list.get("entries")) {
        Map<String, Object> entry = (Map<String, Object>) e.get("entry");
        String nodeType = (String) entry.get("nodeType");
        if ("finance:record".equals(nodeType)) {
          collectSourceDocs(ticket, (String) entry.get("id"), out);
        } else if (Boolean.TRUE.equals(entry.get("isFolder"))) {
          collectFromTree(ticket, (String) entry.get("id"), out);
        }
      }
      Map<String, Object> paging = (Map<String, Object>) list.get("pagination");
      if (!Boolean.TRUE.equals(paging.get("hasMoreItems"))) break;
      skip += 500;
    }
  }

  /** 读取指定父节点下的 finance:sourceDocument 子节点 */
  @SuppressWarnings("unchecked")
  private void collectSourceDocs(String ticket, String parentId, List<Map<String, Object>> out) {
    int skip = 0;
    while (true) {
      Map<String, Object> list;
      try {
        list = nodes.listChildren(ticket, parentId, skip, 500);
      } catch (HttpClientErrorException.NotFound e) {
        return;
      } catch (HttpClientErrorException e) {
        return; // 权限不足等，静默跳过
      }
      for (Map<String, Object> e : (List<Map<String, Object>>) list.get("entries")) {
        Map<String, Object> entry = (Map<String, Object>) e.get("entry");
        if ("finance:sourceDocument".equals(entry.get("nodeType"))) {
          out.add(toView(entry));
        }
      }
      Map<String, Object> paging = (Map<String, Object>) list.get("pagination");
      if (!Boolean.TRUE.equals(paging.get("hasMoreItems"))) break;
      skip += 500;
    }
  }

  // ═══════════════════ 视图映射 ═══════════════════

  @SuppressWarnings("unchecked")
  Map<String, Object> toView(Map<String, Object> entry) {
    Map<String, Object> view = new LinkedHashMap<>();
    view.put("nodeId", entry.get("id"));
    view.put("name", entry.get("name"));
    view.put("documentNo", prop(entry, "finance:documentNo"));
    view.put("docTypeCode", prop(entry, "finance:docTypeCode"));
    view.put("docTypeName", prop(entry, "finance:docTypeName"));
    view.put("transactionDate", prop(entry, "finance:transactionDate"));
    Object amount = entry.get("properties") instanceof Map<?, ?> p ? p.get("finance:amountLower") : null;
    view.put("amountLower", amount instanceof Number n ? n.doubleValue() : 0.0);
    view.put("amountUpper", prop(entry, "finance:amountUpper"));
    view.put("counterpartyName", prop(entry, "finance:counterpartyName"));
    view.put("counterpartyTaxId", prop(entry, "finance:counterpartyTaxId"));
    view.put("counterpartyAddress", prop(entry, "finance:counterpartyAddress"));
    view.put("counterpartyBankAccount", prop(entry, "finance:counterpartyBankAccount"));
    view.put("summary", prop(entry, "finance:summary"));
    view.put("businessCategory", prop(entry, "finance:businessCategory"));
    view.put("preparer", prop(entry, "finance:preparer"));
    view.put("reviewer", prop(entry, "finance:reviewer"));
    view.put("attachmentCount", intProp(entry, "finance:attachmentCount"));
    view.put("parentVoucherNo", prop(entry, "finance:parentVoucherNo"));
    view.put("attachmentSequence", intProp(entry, "finance:attachmentSequence"));
    view.put("extFields", prop(entry, "finance:extFields"));
    view.put("createdAt", entry.get("createdAt"));
    view.put("modifiedAt", entry.get("modifiedAt"));
    Object content = entry.get("content");
    if (content instanceof Map<?, ?> c) {
      view.put("mimeType", c.get("mimeType"));
      view.put("sizeInBytes", c.get("sizeInBytes") instanceof Number n ? n.longValue() : 0L);
    }
    return view;
  }

  @SuppressWarnings("unchecked")
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
}
