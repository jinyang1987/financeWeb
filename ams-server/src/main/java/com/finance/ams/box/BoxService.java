package com.finance.ams.box;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.springframework.stereotype.Service;
import org.springframework.web.client.HttpClientErrorException;

import com.finance.ams.alfresco.AlfrescoNodeClient;
import com.finance.ams.alfresco.CategoryCodes;
import com.finance.ams.alfresco.RepoLayout;
import com.finance.ams.api.BizException;

/**
 * 盒域服务（P1-②，只读列表）
 *
 * 档案盒 = finance:archiveBox 文件夹节点，落点 /{全宗}/盒库/{大类}/{年度}/。
 * 建盒由卷域移交归盒时自动完成（VolumeService.transfer），本域暂不提供写端点。
 */
@Service
public class BoxService {

  private final AlfrescoNodeClient nodes;
  private final RepoLayout layout;

  public BoxService(AlfrescoNodeClient nodes, RepoLayout layout) {
    this.nodes = nodes;
    this.layout = layout;
  }

  public record ListQuery(String fondsCode, Integer year, String typeCode, String status) {}

  /** 盒列表：扫描盒库树；volumeCount 以盒内实际案卷数为准（属性值为冗余） */
  public List<Map<String, Object>> list(String ticket, ListQuery q) {
    if (q.fondsCode() == null || q.fondsCode().isBlank()) {
      throw BizException.badRequest("VALIDATION_FAILED", "fondsCode 不能为空");
    }
    String fondsId = layout.fonds(ticket, q.fondsCode());
    String rootId = layout.ensureChild(ticket, fondsId, RepoLayout.BOXES_ROOT);

    List<Map<String, Object>> out = new ArrayList<>();
    for (Map<String, Object> catDir : childFolders(ticket, rootId)) {
      String cat = str(catDir.get("name"));
      if (q.typeCode() != null && !cat.equalsIgnoreCase(CategoryCodes.toCategoryCode(q.typeCode(), null))) continue;
      for (Map<String, Object> yearDir : childFolders(ticket, str(catDir.get("id")))) {
        if (q.year() != null && !String.valueOf(q.year()).equals(str(yearDir.get("name")))) continue;
        for (Map<String, Object> box : childrenOfType(ticket, str(yearDir.get("id")), "finance:archiveBox")) {
          Map<String, Object> view = toView(box, q.fondsCode(), cat);
          if (q.status() != null && !q.status().equals(view.get("status"))) continue;
          // 实际卷数（子节点统计，事务读）
          int actualVolumes = childrenOfType(ticket, str(box.get("id")), "finance:volume").size();
          view.put("volumeCountActual", actualVolumes);
          out.add(view);
        }
      }
    }
    out.sort(Comparator.comparing(v -> str(v.get("boxNo"))));
    return out;
  }

  /** 盒内案卷 id 列表（归盒详情/移交单渲染用） */
  public List<Map<String, Object>> boxVolumes(String ticket, String boxId) {
    List<Map<String, Object>> vols = childrenOfType(ticket, boxId, "finance:volume");
    List<Map<String, Object>> out = new ArrayList<>();
    for (Map<String, Object> v : vols) {
      Map<String, Object> view = new LinkedHashMap<>();
      view.put("nodeId", v.get("id"));
      view.put("name", v.get("name"));
      String code = prop(v, "finance:volumeCode");
      view.put("volumeCode", code.contains("-VPEND-") ? "" : code);
      view.put("title", prop(v, "finance:title"));
      view.put("status", prop(v, "finance:volumeStatus"));
      view.put("totalItems", intProp(v, "finance:volumeTotalItems"));
      out.add(view);
    }
    return out;
  }

  // ═══════════════════ 内部 ═══════════════════

  Map<String, Object> toView(Map<String, Object> entry, String fondsCode, String catFromPath) {
    Map<String, Object> view = new LinkedHashMap<>();
    view.put("nodeId", entry.get("id"));
    view.put("name", entry.get("name"));
    view.put("boxNo", prop(entry, "finance:boxNo"));
    view.put("boxName", prop(entry, "finance:boxName"));
    String cat = prop(entry, "finance:typeCode");
    view.put("typeCode", cat.isEmpty() ? catFromPath : cat);
    view.put("archiveTypeCode", CategoryCodes.toNumericCode(cat.isEmpty() ? catFromPath : cat));
    view.put("fondsCode", fondsCode);
    view.put("year", intProp(entry, "finance:boxYear"));
    view.put("retention", prop(entry, "finance:boxRetention"));
    view.put("status", prop(entry, "finance:boxStatus"));
    view.put("securityLevel", prop(entry, "finance:boxSecurityLevel"));
    view.put("location", prop(entry, "finance:location"));
    view.put("volumeCount", intProp(entry, "finance:volumeCount"));
    view.put("totalItems", intProp(entry, "finance:boxTotalItems"));
    view.put("volumeCodeRange", prop(entry, "finance:volumeCodeRange"));
    view.put("remarks", prop(entry, "finance:boxRemark"));
    view.put("createdAt", entry.get("createdAt"));
    view.put("modifiedAt", entry.get("modifiedAt"));
    return view;
  }

  @SuppressWarnings("unchecked")
  private List<Map<String, Object>> childFolders(String ticket, String parentId) {
    List<Map<String, Object>> out = new ArrayList<>();
    int skip = 0;
    while (true) {
      Map<String, Object> list;
      try {
        list = nodes.listChildren(ticket, parentId, skip, 500);
      } catch (HttpClientErrorException.NotFound e) {
        return out;
      } catch (HttpClientErrorException e) {
        throw RepoLayout.translate("目录扫描失败", e);
      }
      for (Map<String, Object> e : (List<Map<String, Object>>) list.get("entries")) {
        Map<String, Object> entry = (Map<String, Object>) e.get("entry");
        if (Boolean.TRUE.equals(entry.get("isFolder"))) out.add(entry);
      }
      Map<String, Object> paging = (Map<String, Object>) list.get("pagination");
      if (!Boolean.TRUE.equals(paging.get("hasMoreItems"))) break;
      skip += 500;
    }
    return out;
  }

  @SuppressWarnings("unchecked")
  private List<Map<String, Object>> childrenOfType(String ticket, String parentId, String nodeType) {
    List<Map<String, Object>> out = new ArrayList<>();
    int skip = 0;
    while (true) {
      Map<String, Object> list;
      try {
        list = nodes.listChildren(ticket, parentId, skip, 500);
      } catch (HttpClientErrorException e) {
        throw RepoLayout.translate("子节点扫描失败", e);
      }
      for (Map<String, Object> e : (List<Map<String, Object>>) list.get("entries")) {
        Map<String, Object> entry = (Map<String, Object>) e.get("entry");
        if (nodeType.equals(entry.get("nodeType"))) out.add(entry);
      }
      Map<String, Object> paging = (Map<String, Object>) list.get("pagination");
      if (!Boolean.TRUE.equals(paging.get("hasMoreItems"))) break;
      skip += 500;
    }
    return out;
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
