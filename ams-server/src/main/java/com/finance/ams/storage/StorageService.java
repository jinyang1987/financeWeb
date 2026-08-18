package com.finance.ams.storage;

import java.util.List;
import java.util.Map;
import java.util.UUID;

import javax.sql.DataSource;

import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;

import com.finance.ams.api.BizException;

/**
 * 实体库房服务（P4-2）：ams_storage_node 树（库房→柜→架→层）
 *
 * 2026-08-17 起新增密集架架位模型（V6）：
 *   ams_storage_rack（库房→密集架布局）+ ams_box_position（盒↔格位占用事实表）。
 *   库房→架→列→层→位 五级坐标，盒与格位一一对应（uq_box_cell 数据库级互斥）。
 */
@Service
public class StorageService {

  private final JdbcClient jdbc;

  public StorageService(DataSource dataSource) {
    this.jdbc = JdbcClient.create(dataSource);
  }

  public List<Map<String, Object>> tree() {
    return jdbc.sql("SELECT * FROM ams_storage_node ORDER BY sort, code").query().listOfRows();
  }

  public Map<String, Object> createNode(String parentId, String kind, String code, String name) {
    String id = UUID.randomUUID().toString();
    jdbc.sql("INSERT INTO ams_storage_node (id, parent_id, kind, code, name, sort) VALUES (?,?,?,?,?,0)")
        .param(id).param(parentId).param(kind).param(code).param(name).update();
    return Map.of("id", id, "parentId", parentId != null ? parentId : "", "kind", kind, "code", code, "name", name);
  }

  public List<Map<String, Object>> occupancy() {
    return jdbc.sql("""
        SELECT s.id, s.code, s.name, s.kind,
          COUNT(DISTINCT f.volume_node_id) AS volume_count
        FROM ams_storage_node s
        LEFT JOIN ams_fulfillment f ON f.status IN ('lent','pending') AND f.volume_node_id IS NOT NULL
        GROUP BY s.id, s.code, s.name, s.kind
        ORDER BY s.code
        """).query().listOfRows();
  }

  // ═══════════════════ 密集架布局（V6） ═══════════════════

  /** 密集架列表（按库房/排序） */
  public List<Map<String, Object>> racks() {
    return jdbc.sql("SELECT * FROM ams_storage_rack ORDER BY room, sort, rack").query().listOfRows();
  }

  /** 新增密集架（维度界限于表 CHECK，1-26列/1-12层/1-40位；库房须已存在） */
  public Map<String, Object> createRack(String room, String roomName, String rack, String rackName,
                                        int columnCount, int layerCount, int cellCount) {
    if (room.isBlank() || rack.isBlank()) {
      throw BizException.badRequest("VALIDATION_FAILED", "库房号与架号不能为空");
    }
    if (columnCount < 1 || columnCount > 26 || layerCount < 1 || layerCount > 12 || cellCount < 1 || cellCount > 40) {
      throw BizException.badRequest("VALIDATION_FAILED", "架维度越界（列1-26/层1-12/位1-40）");
    }
    boolean roomExists = !jdbc.sql("SELECT 1 FROM ams_storage_room WHERE room=?")
        .param(room).query().listOfRows().isEmpty();
    if (!roomExists) {
      throw BizException.badRequest("ROOM_NOT_FOUND", "库房 " + room + " 不存在，请先在库房配置中创建");
    }
    boolean dup = !jdbc.sql("SELECT 1 FROM ams_storage_rack WHERE room=? AND rack=?")
        .param(room).param(rack).query().listOfRows().isEmpty();
    if (dup) {
      throw new BizException(HttpStatus.CONFLICT, "RACK_EXISTS", "库房 " + room + " 已存在架 " + rack);
    }
    String id = UUID.randomUUID().toString();
    int sort = jdbc.sql("SELECT COALESCE(MAX(sort),0)+1 FROM ams_storage_rack WHERE room=?")
        .param(room).query(Integer.class).single();
    jdbc.sql("""
        INSERT INTO ams_storage_rack (id, room, room_name, rack, rack_name, column_count, layer_count, cell_count, sort)
        VALUES (?,?,?,?,?,?,?,?,?)
        """).param(id).param(room).param(roomName.isBlank() ? room + "库房" : roomName)
        .param(rack).param(rackName.isBlank() ? rack + " 架" : rackName)
        .param(columnCount).param(layerCount).param(cellCount).param(sort).update();
    return jdbc.sql("SELECT * FROM ams_storage_rack WHERE id=?").param(id).query().listOfRows().get(0);
  }

  /**
   * 编辑密集架（架名/维度；架号不可改——被架位引用）。
   * 缩容校验：新边界外的格位上不得有在架盒（须先换架位/下架）。
   */
  public Map<String, Object> updateRack(String id, String rackName,
                                        int columnCount, int layerCount, int cellCount) {
    Map<String, Object> rack = jdbc.sql("SELECT * FROM ams_storage_rack WHERE id=?")
        .param(id).query().listOfRows().stream().findFirst()
        .orElseThrow(() -> BizException.badRequest("RACK_NOT_FOUND", "密集架不存在: " + id));
    if (columnCount < 1 || columnCount > 26 || layerCount < 1 || layerCount > 12 || cellCount < 1 || cellCount > 40) {
      throw BizException.badRequest("VALIDATION_FAILED", "架维度越界（列1-26/层1-12/位1-40）");
    }
    String room = str(rack.get("room"));
    String rackCode = str(rack.get("rack"));
    int oldCols = ((Number) rack.get("column_count")).intValue();
    int oldLayers = ((Number) rack.get("layer_count")).intValue();
    int oldCells = ((Number) rack.get("cell_count")).intValue();
    if (columnCount < oldCols || layerCount < oldLayers || cellCount < oldCells) {
      int outside = jdbc.sql("""
          SELECT COUNT(*) FROM ams_box_position
          WHERE room=? AND rack=? AND (column_no > ? OR layer_no > ? OR cell_no > ?)
          """).param(room).param(rackCode)
          .param(columnCount).param(layerCount).param(cellCount)
          .query(Integer.class).single();
      if (outside > 0) {
        throw new BizException(HttpStatus.CONFLICT, "RACK_SHRINK_BLOCKED",
            "新维度外的格位上有 " + outside + " 盒在架，请先将其换架位/下架后再缩容");
      }
    }
    jdbc.sql("""
        UPDATE ams_storage_rack
        SET rack_name = COALESCE(NULLIF(?, ''), rack_name), column_count=?, layer_count=?, cell_count=?
        WHERE id=?
        """).param(rackName == null ? "" : rackName.trim()).param(columnCount).param(layerCount).param(cellCount)
        .param(id).update();
    return jdbc.sql("SELECT * FROM ams_storage_rack WHERE id=?").param(id).query().listOfRows().get(0);
  }

  /** 删除空架（架上有在架盒时拒绝） */
  public void deleteRack(String id) {
    Map<String, Object> rack = jdbc.sql("SELECT * FROM ams_storage_rack WHERE id=?")
        .param(id).query().listOfRows().stream().findFirst()
        .orElseThrow(() -> BizException.badRequest("RACK_NOT_FOUND", "密集架不存在: " + id));
    int used = jdbc.sql("SELECT COUNT(*) FROM ams_box_position WHERE room=? AND rack=?")
        .param(str(rack.get("room"))).param(str(rack.get("rack"))).query(Integer.class).single();
    if (used > 0) {
      throw new BizException(HttpStatus.CONFLICT, "RACK_NOT_EMPTY",
          "架上还有 " + used + " 盒在架，须全部下架后才能删除该架");
    }
    jdbc.sql("DELETE FROM ams_storage_rack WHERE id=?").param(id).update();
  }

  /** 全部盒架位（盒节点 ↔ 格位；前端与 /boxes 列表按 nodeId 关联渲染） */
  public List<Map<String, Object>> positions() {
    return jdbc.sql("SELECT * FROM ams_box_position ORDER BY room, rack, column_no, layer_no, cell_no")
        .query().listOfRows();
  }

  // ═══════════════════ 库房实体（V7，档案库房配置） ═══════════════════

  /** 库房列表（含架数/在架盒数，配置页与库房页共用） */
  public List<Map<String, Object>> rooms() {
    return jdbc.sql("""
        SELECT r.room, r.room_name, r.sort,
          (SELECT COUNT(*) FROM ams_storage_rack k WHERE k.room = r.room) AS rack_count,
          (SELECT COUNT(*) FROM ams_box_position p WHERE p.room = r.room) AS box_count
        FROM ams_storage_room r ORDER BY r.sort, r.room
        """).query().listOfRows();
  }

  /** 新建库房（库房号唯一，创建后不可改——被架/架位引用） */
  public Map<String, Object> createRoom(String room, String roomName) {
    if (room == null || room.isBlank()) {
      throw BizException.badRequest("VALIDATION_FAILED", "库房号不能为空");
    }
    String code = room.trim();
    if (code.length() > 8) {
      throw BizException.badRequest("VALIDATION_FAILED", "库房号不超过 8 位");
    }
    boolean dup = !jdbc.sql("SELECT 1 FROM ams_storage_room WHERE room=?").param(code).query().listOfRows().isEmpty();
    if (dup) {
      throw new BizException(HttpStatus.CONFLICT, "ROOM_EXISTS", "库房 " + code + " 已存在");
    }
    int sort = jdbc.sql("SELECT COALESCE(MAX(sort),0)+1 FROM ams_storage_room").query(Integer.class).single();
    String name = roomName == null || roomName.isBlank() ? "第" + code + "库房" : roomName.trim();
    jdbc.sql("INSERT INTO ams_storage_room (room, room_name, sort) VALUES (?,?,?)")
        .param(code).param(name).param(sort).update();
    return Map.of("room", code, "room_name", name, "sort", sort, "rack_count", 0, "box_count", 0);
  }

  /** 重命名库房（库房号不可改，仅名称） */
  public Map<String, Object> renameRoom(String room, String roomName) {
    if (roomName == null || roomName.isBlank()) {
      throw BizException.badRequest("VALIDATION_FAILED", "库房名称不能为空");
    }
    int n = jdbc.sql("UPDATE ams_storage_room SET room_name=? WHERE room=?")
        .param(roomName.trim()).param(room).update();
    if (n == 0) {
      throw BizException.badRequest("ROOM_NOT_FOUND", "库房不存在: " + room);
    }
    return Map.of("room", room, "room_name", roomName.trim());
  }

  /** 删除空库房（有架/有在架盒时拒绝） */
  public void deleteRoom(String room) {
    int racks = jdbc.sql("SELECT COUNT(*) FROM ams_storage_rack WHERE room=?")
        .param(room).query(Integer.class).single();
    if (racks > 0) {
      throw new BizException(HttpStatus.CONFLICT, "ROOM_NOT_EMPTY",
          "库房内还有 " + racks + " 架密集架，须先删除全部架空架");
    }
    int boxes = jdbc.sql("SELECT COUNT(*) FROM ams_box_position WHERE room=?")
        .param(room).query(Integer.class).single();
    if (boxes > 0) {
      throw new BizException(HttpStatus.CONFLICT, "ROOM_NOT_EMPTY",
          "库房内还有 " + boxes + " 盒在架，须先全部下架");
    }
    int n = jdbc.sql("DELETE FROM ams_storage_room WHERE room=?").param(room).update();
    if (n == 0) {
      throw BizException.badRequest("ROOM_NOT_FOUND", "库房不存在: " + room);
    }
  }

  private static String str(Object o) {
    return o == null ? "" : String.valueOf(o);
  }
}
