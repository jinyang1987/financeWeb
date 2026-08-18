package com.finance.ams.box;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

import javax.sql.DataSource;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
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
 * 建盒由卷域移交归盒时自动完成（VolumeService.transfer）。
 *
 * 盒状态机（2026-08-17 上架补全）：
 *   active 装盒中 → seal → sealed 已封盒 → shelve → stored 在架
 *   stored → unshelve → sealed（下架回已封盒，位置清除）
 *   移交归盒只选 active 盒；stored 盒不可开封/删除（须先下架）。
 * 架位：ams_box_position（盒↔格位一一对应，uq_box_cell 数据库级占用互斥）；
 * 架位文本 finance:location 保留人类可读形式（兼容既有展示）。
 */
@Service
public class BoxService {

  private static final Logger log = LoggerFactory.getLogger(BoxService.class);

  private final AlfrescoNodeClient nodes;
  private final RepoLayout layout;
  private final JdbcClient jdbc;

  public BoxService(AlfrescoNodeClient nodes, RepoLayout layout, DataSource dataSource) {
    this.nodes = nodes;
    this.layout = layout;
    this.jdbc = JdbcClient.create(dataSource);
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

  // ═══════════════════ 盒写操作（2026-08-16 贯通修复，原仅前端乐观更新） ═══════════════════

  /** 封盒：active → sealed（盒满封存，不再接收新卷；在架盒须先下架） */
  public Map<String, Object> seal(String ticket, String boxId) {
    Map<String, Object> box = requireBox(ticket, boxId);
    String status = prop(box, "finance:boxStatus");
    if (!"active".equals(status)) {
      throw new BizException(HttpStatus.CONFLICT, "BOX_STATE",
          "stored".equals(status) ? "在架盒须先下架才能变更状态" : "仅装盒中的档案盒可封盒");
    }
    return updateBoxProps(ticket, box, Map.of("finance:boxStatus", "sealed"));
  }

  /** 开封：sealed → active（重新接收卷） */
  public Map<String, Object> unseal(String ticket, String boxId) {
    Map<String, Object> box = requireBox(ticket, boxId);
    String status = prop(box, "finance:boxStatus");
    if (!"sealed".equals(status)) {
      throw new BizException(HttpStatus.CONFLICT, "BOX_STATE",
          "stored".equals(status) ? "在架盒须先下架才能变更状态" : "仅已封盒的档案盒可开封");
    }
    return updateBoxProps(ticket, box, Map.of("finance:boxStatus", "active"));
  }

  // ═══════════════════ 上架 / 下架（2026-08-17 密集架架位模型） ═══════════════════

  /**
   * 上架（指定架位）：把盒定位到密集架格位（库房-架-列-层-位）。
   *   - active/sealed → stored（新上架）；
   *   - stored → 换架位（幂等重上架：先释放原格位再占用新格位，状态保持 stored；
   *     换到原位 = 无操作直接返回）；
   * 占用互斥：预检 + uq_box_cell 唯一约束兜底（并发安全）；
   * 一致性：格位写入与盒属性回写之间做补偿（失败恢复原格位行），不留孤儿映射。
   */
  public Map<String, Object> shelve(String ticket, String userId, String boxId,
                                    String room, String rack, Integer column, Integer layer, Integer cell) {
    Map<String, Object> box = requireBox(ticket, boxId);
    if (room == null || room.isBlank() || rack == null || rack.isBlank()
        || column == null || layer == null || cell == null) {
      throw BizException.badRequest("VALIDATION_FAILED", "上架须指定完整架位（库房/架/列/层/位）");
    }
    Map<String, Object> rackRow = requireRack(room, rack);
    checkBounds(rackRow, column, layer, cell);

    Map<String, Object> oldPos = positionOf(boxId);
    // 换到原位：幂等无操作
    if (oldPos != null
        && room.equals(str(oldPos.get("room"))) && rack.equals(str(oldPos.get("rack")))
        && column.intValue() == ((Number) oldPos.get("column_no")).intValue()
        && layer.intValue() == ((Number) oldPos.get("layer_no")).intValue()
        && cell.intValue() == ((Number) oldPos.get("cell_no")).intValue()) {
      return finishShelve(ticket, box, room, rack, column, layer, cell);
    }

    ensureCellFree(room, rack, column, layer, cell);
    if (oldPos != null) deletePosition(boxId);
    try {
      insertPosition(boxId, room, rack, column, layer, cell, userId);
    } catch (RuntimeException e) {
      if (oldPos != null) restorePosition(oldPos); // 并发抢占 → 恢复原格位
      throw e;
    }
    try {
      Map<String, Object> view = finishShelve(ticket, box, room, rack, column, layer, cell);
      log.info("上架: {} → {}（操作人 {}）", boxId, locationText(room, rack, column, layer, cell), userId);
      return view;
    } catch (RuntimeException e) {
      // 盒属性回写失败 → 回滚格位（删新位、复原位），不留孤儿映射
      deletePosition(boxId);
      if (oldPos != null) restorePosition(oldPos);
      throw e;
    }
  }

  /** 自动上架：第一个空格位（架序→列→层→位）；在架盒请走「换架位」指定新格位 */
  public Map<String, Object> shelveAuto(String ticket, String userId, String boxId) {
    Map<String, Object> box = requireBox(ticket, boxId);
    if (positionOf(boxId) != null) {
      throw new BizException(HttpStatus.CONFLICT, "BOX_STATE",
          "该盒已在架（" + prop(box, "finance:location") + "），换架位请点选新格位或先下架");
    }
    List<Map<String, Object>> racks = jdbc.sql("SELECT * FROM ams_storage_rack ORDER BY room, sort, rack")
        .query().listOfRows();
    if (racks.isEmpty()) {
      throw new BizException(HttpStatus.CONFLICT, "STORAGE_EMPTY", "库房尚未配置密集架");
    }
    Set<String> occupied = occupiedCells();
    for (Map<String, Object> r : racks) {
      String rm = str(r.get("room"));
      String rk = str(r.get("rack"));
      int cols = ((Number) r.get("column_count")).intValue();
      int lays = ((Number) r.get("layer_count")).intValue();
      int cells = ((Number) r.get("cell_count")).intValue();
      for (int c = 1; c <= cols; c++) {
        for (int l = 1; l <= lays; l++) {
          for (int p = 1; p <= cells; p++) {
            if (!occupied.contains(cellKey(rm, rk, c, l, p))) {
              insertPosition(boxId, rm, rk, c, l, p, userId);
              try {
                Map<String, Object> view = finishShelve(ticket, box, rm, rk, c, l, p);
                log.info("自动上架: {} → {}（操作人 {}）", boxId, locationText(rm, rk, c, l, p), userId);
                return view;
              } catch (RuntimeException e) {
                deletePosition(boxId);
                throw e;
              }
            }
          }
        }
      }
    }
    throw new BizException(HttpStatus.CONFLICT, "STORAGE_FULL", "库房已无空格位，请先新增密集架");
  }

  /** 下架：stored → sealed（位置清除，盒回已封盒待处理；属性回写失败自动恢复格位行） */
  public Map<String, Object> unshelve(String ticket, String boxId) {
    Map<String, Object> box = requireBox(ticket, boxId);
    String status = prop(box, "finance:boxStatus");
    if (!"stored".equals(status)) {
      throw new BizException(HttpStatus.CONFLICT, "BOX_STATE", "仅在架状态的档案盒可下架");
    }
    Map<String, Object> oldPos = positionOf(boxId);
    deletePosition(boxId);
    try {
      Map<String, Object> props = new LinkedHashMap<>();
      props.put("finance:location", null);
      props.put("finance:boxStatus", "sealed");
      Map<String, Object> view = updateBoxProps(ticket, box, props);
      log.info("下架: {}（原 {}）", boxId, prop(box, "finance:location"));
      return view;
    } catch (RuntimeException e) {
      if (oldPos != null) restorePosition(oldPos);
      throw e;
    }
  }

  // ── 上架内部 ──

  private Map<String, Object> finishShelve(String ticket, Map<String, Object> box,
                                           String room, String rack, int column, int layer, int cell) {
    Map<String, Object> props = new LinkedHashMap<>();
    props.put("finance:location", locationText(room, rack, column, layer, cell));
    props.put("finance:boxStatus", "stored");
    Map<String, Object> view = updateBoxProps(ticket, box, props);
    view.put("position", Map.of(
        "room", room, "rack", rack, "column", column, "layer", layer, "cell", cell));
    return view;
  }

  private Map<String, Object> requireRack(String room, String rack) {
    return jdbc.sql("SELECT * FROM ams_storage_rack WHERE room=? AND rack=?")
        .param(room).param(rack).query().listOfRows().stream().findFirst()
        .orElseThrow(() -> BizException.badRequest("RACK_NOT_FOUND", "密集架不存在: " + room + "库房 " + rack + " 架"));
  }

  private void checkBounds(Map<String, Object> rackRow, int column, int layer, int cell) {
    int cols = ((Number) rackRow.get("column_count")).intValue();
    int lays = ((Number) rackRow.get("layer_count")).intValue();
    int cells = ((Number) rackRow.get("cell_count")).intValue();
    if (column < 1 || column > cols || layer < 1 || layer > lays || cell < 1 || cell > cells) {
      throw BizException.badRequest("VALIDATION_FAILED",
          "架位越界（列1-" + cols + "/层1-" + lays + "/位1-" + cells + "）");
    }
  }

  private void ensureCellFree(String room, String rack, int column, int layer, int cell) {
    boolean taken = !jdbc.sql("""
        SELECT 1 FROM ams_box_position WHERE room=? AND rack=? AND column_no=? AND layer_no=? AND cell_no=?
        """).param(room).param(rack).param(column).param(layer).param(cell)
        .query().listOfRows().isEmpty();
    if (taken) {
      throw new BizException(HttpStatus.CONFLICT, "CELL_OCCUPIED",
          "格位 " + locationText(room, rack, column, layer, cell) + " 已被占用，请另选");
    }
  }

  /** 盒当前格位行（未上架为 null） */
  private Map<String, Object> positionOf(String boxId) {
    return jdbc.sql("SELECT * FROM ams_box_position WHERE box_node_id=?")
        .param(boxId).query().listOfRows().stream().findFirst().orElse(null);
  }

  private void deletePosition(String boxId) {
    jdbc.sql("DELETE FROM ams_box_position WHERE box_node_id=?").param(boxId).update();
  }

  /** 恢复既有格位行（保留下架前的 shelved_at/shelved_by 痕迹） */
  private void restorePosition(Map<String, Object> oldPos) {
    try {
      jdbc.sql("""
          INSERT INTO ams_box_position (box_node_id, room, rack, column_no, layer_no, cell_no, shelved_at, shelved_by)
          VALUES (?,?,?,?,?,?,?,?)
          """).param(str(oldPos.get("box_node_id"))).param(str(oldPos.get("room"))).param(str(oldPos.get("rack")))
          .param(((Number) oldPos.get("column_no")).intValue())
          .param(((Number) oldPos.get("layer_no")).intValue())
          .param(((Number) oldPos.get("cell_no")).intValue())
          .param(oldPos.get("shelved_at")).param(str(oldPos.get("shelved_by"))).update();
    } catch (DuplicateKeyException e) {
      log.error("恢复格位失败（原 {}）：{}", locationText(str(oldPos.get("room")), str(oldPos.get("rack")),
          ((Number) oldPos.get("column_no")).intValue(), ((Number) oldPos.get("layer_no")).intValue(),
          ((Number) oldPos.get("cell_no")).intValue()), e.getMessage());
    }
  }

  private void insertPosition(String boxId, String room, String rack, int column, int layer, int cell, String userId) {
    try {
      jdbc.sql("""
          INSERT INTO ams_box_position (box_node_id, room, rack, column_no, layer_no, cell_no, shelved_by)
          VALUES (?,?,?,?,?,?,?)
          """).param(boxId).param(room).param(rack).param(column).param(layer).param(cell)
          .param(userId == null ? "" : userId).update();
    } catch (DuplicateKeyException e) {
      throw new BizException(HttpStatus.CONFLICT, "CELL_OCCUPIED", "格位或盒占用冲突（并发），请刷新后重试");
    }
  }

  private Set<String> occupiedCells() {
    Set<String> set = new HashSet<>();
    for (Map<String, Object> row : jdbc.sql("SELECT room, rack, column_no, layer_no, cell_no FROM ams_box_position")
        .query().listOfRows()) {
      set.add(cellKey(str(row.get("room")), str(row.get("rack")),
          ((Number) row.get("column_no")).intValue(),
          ((Number) row.get("layer_no")).intValue(),
          ((Number) row.get("cell_no")).intValue()));
    }
    return set;
  }

  private static String cellKey(String room, String rack, int column, int layer, int cell) {
    return room + '|' + rack + '|' + column + '|' + layer + '|' + cell;
  }

  private static String locationText(String room, String rack, int column, int layer, int cell) {
    return room + "库·" + rack + "架·" + column + "列·" + layer + "层·" + cell + "位";
  }

  /** 删除空盒（盒内有卷或在架时拒绝，须先移出案卷/下架） */
  public void deleteEmpty(String ticket, String boxId) {
    Map<String, Object> box = requireBox(ticket, boxId);
    if ("stored".equals(prop(box, "finance:boxStatus"))) {
      throw new BizException(HttpStatus.CONFLICT, "BOX_STATE", "在架盒须先下架才能删除");
    }
    List<Map<String, Object>> vols = childrenOfType(ticket, boxId, "finance:volume");
    if (!vols.isEmpty()) {
      throw new BizException(HttpStatus.CONFLICT, "BOX_NOT_EMPTY",
          "盒内还有 " + vols.size() + " 卷，请先移出后再删盒");
    }
    try {
      nodes.deleteNode(ticket, boxId);
    } catch (HttpClientErrorException e) {
      throw RepoLayout.translate("删除档案盒失败", e);
    }
  }

  private Map<String, Object> requireBox(String ticket, String boxId) {
    Map<String, Object> box;
    try {
      box = nodes.getNode(ticket, boxId);
    } catch (HttpClientErrorException e) {
      throw RepoLayout.translate("档案盒查询失败", e);
    }
    if (!"finance:archiveBox".equals(box.get("nodeType"))) {
      throw BizException.badRequest("NOT_A_BOX", "节点不是档案盒: " + boxId);
    }
    return box;
  }

  private Map<String, Object> updateBoxProps(String ticket, Map<String, Object> box, Map<String, Object> props) {
    Map<String, Object> entry;
    try {
      entry = nodes.updateNode(ticket, str(box.get("id")), props);
    } catch (HttpClientErrorException e) {
      throw RepoLayout.translate("档案盒更新失败", e);
    }
    Map<String, Object> fonds = layout.findFondsOf(ticket, str(box.get("id")));
    return toView(entry, prop(fonds, "finance:code"), prop(entry, "finance:typeCode"));
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
