package com.finance.ams.storage;

import java.util.List;
import java.util.Map;

import org.springframework.web.bind.annotation.*;

import com.finance.ams.api.BizException;
import com.finance.ams.auth.AuthUser;
import com.finance.ams.auth.PermissionService;

/**
 * 库房/密集架端点。
 * 授权（2026-08-18）：见 PermissionService（查询=catalog 操作权；写=库房配置功能码）。
 */
@RestController
@RequestMapping("/storage")
public class StorageController {

  private final StorageService service;
  private final PermissionService perm;

  public StorageController(StorageService service, PermissionService perm) {
    this.service = service;
    this.perm = perm;
  }

  @GetMapping("/tree")
  public List<Map<String, Object>> tree(
      @RequestHeader(value = "X-User-Id", required = false) String userId,
      @RequestHeader(value = "X-Alfresco-Ticket", required = false) String ticket) {
    AuthUser me = perm.me(userId, ticket);
    perm.requireOperation(me, PermissionService.Op.catalog);
    return service.tree();
  }

  @PostMapping("/nodes")
  public Map<String, Object> create(
      @RequestHeader(value = "X-User-Id", required = false) String userId,
      @RequestHeader(value = "X-Alfresco-Ticket", required = false) String ticket,
      @RequestBody Map<String, String> body) {
    AuthUser me = perm.me(userId, ticket);
    perm.requireFunction(me, "sys-storage");
    return service.createNode(body.get("parentId"), body.get("kind"), body.get("code"), body.get("name"));
  }

  @GetMapping("/occupancy")
  public List<Map<String, Object>> occupancy(
      @RequestHeader(value = "X-User-Id", required = false) String userId,
      @RequestHeader(value = "X-Alfresco-Ticket", required = false) String ticket) {
    AuthUser me = perm.me(userId, ticket);
    perm.requireOperation(me, PermissionService.Op.catalog);
    return service.occupancy();
  }

  // ── 密集架布局与架位（V6，2026-08-17） ──

  /** 密集架列表（库房→架→列×层×位） */
  @GetMapping("/racks")
  public List<Map<String, Object>> racks(
      @RequestHeader(value = "X-User-Id", required = false) String userId,
      @RequestHeader(value = "X-Alfresco-Ticket", required = false) String ticket) {
    AuthUser me = perm.me(userId, ticket);
    perm.requireOperation(me, PermissionService.Op.catalog);
    return service.racks();
  }

  /** 新增密集架 {room, roomName?, rack, rackName?, columnCount, layerCount, cellCount} */
  @PostMapping("/racks")
  public Map<String, Object> createRack(
      @RequestHeader(value = "X-User-Id", required = false) String userId,
      @RequestHeader(value = "X-Alfresco-Ticket", required = false) String ticket,
      @RequestBody Map<String, Object> body) {
    AuthUser me = perm.me(userId, ticket);
    perm.requireFunction(me, "sys-storage");
    return service.createRack(
        str(body.get("room")), str(body.get("roomName")), str(body.get("rack")), str(body.get("rackName")),
        intVal(body.get("columnCount")), intVal(body.get("layerCount")), intVal(body.get("cellCount")));
  }

  /** 删除空架（有在架盒时拒绝） */
  @DeleteMapping("/racks/{id}")
  public Map<String, Object> deleteRack(
      @RequestHeader(value = "X-User-Id", required = false) String userId,
      @RequestHeader(value = "X-Alfresco-Ticket", required = false) String ticket,
      @PathVariable String id) {
    AuthUser me = perm.me(userId, ticket);
    perm.requireFunction(me, "sys-storage");
    service.deleteRack(id);
    return Map.of("deleted", true);
  }

  /** 全部盒架位（盒节点 ↔ 格位占用事实） */
  @GetMapping("/positions")
  public List<Map<String, Object>> positions(
      @RequestHeader(value = "X-User-Id", required = false) String userId,
      @RequestHeader(value = "X-Alfresco-Ticket", required = false) String ticket) {
    AuthUser me = perm.me(userId, ticket);
    perm.requireOperation(me, PermissionService.Op.catalog);
    return service.positions();
  }

  // ── 库房实体（V7，档案库房配置） ──

  /** 库房列表（含架数/在架盒数） */
  @GetMapping("/rooms")
  public List<Map<String, Object>> rooms(
      @RequestHeader(value = "X-User-Id", required = false) String userId,
      @RequestHeader(value = "X-Alfresco-Ticket", required = false) String ticket) {
    AuthUser me = perm.me(userId, ticket);
    perm.requireOperation(me, PermissionService.Op.catalog);
    return service.rooms();
  }

  /** 新建库房 {room, roomName?}（库房号唯一，创建后不可改） */
  @PostMapping("/rooms")
  public Map<String, Object> createRoom(
      @RequestHeader(value = "X-User-Id", required = false) String userId,
      @RequestHeader(value = "X-Alfresco-Ticket", required = false) String ticket,
      @RequestBody Map<String, Object> body) {
    AuthUser me = perm.me(userId, ticket);
    perm.requireFunction(me, "sys-storage");
    return service.createRoom(str(body.get("room")), str(body.get("roomName")));
  }

  /** 重命名库房 {roomName}（库房号不可改） */
  @PutMapping("/rooms/{room}")
  public Map<String, Object> renameRoom(
      @RequestHeader(value = "X-User-Id", required = false) String userId,
      @RequestHeader(value = "X-Alfresco-Ticket", required = false) String ticket,
      @PathVariable String room,
      @RequestBody Map<String, Object> body) {
    AuthUser me = perm.me(userId, ticket);
    perm.requireFunction(me, "sys-storage");
    return service.renameRoom(room, str(body.get("roomName")));
  }

  /** 删除空库房（有架/有在架盒时拒绝） */
  @DeleteMapping("/rooms/{room}")
  public Map<String, Object> deleteRoom(
      @RequestHeader(value = "X-User-Id", required = false) String userId,
      @RequestHeader(value = "X-Alfresco-Ticket", required = false) String ticket,
      @PathVariable String room) {
    AuthUser me = perm.me(userId, ticket);
    perm.requireFunction(me, "sys-storage");
    service.deleteRoom(room);
    return Map.of("deleted", true);
  }

  /** 编辑密集架 {rackName?, columnCount, layerCount, cellCount}（架号不可改；缩容须无占用） */
  @PutMapping("/racks/{id}")
  public Map<String, Object> updateRack(
      @RequestHeader(value = "X-User-Id", required = false) String userId,
      @RequestHeader(value = "X-Alfresco-Ticket", required = false) String ticket,
      @PathVariable String id,
      @RequestBody Map<String, Object> body) {
    AuthUser me = perm.me(userId, ticket);
    perm.requireFunction(me, "sys-storage");
    return service.updateRack(id, str(body.get("rackName")),
        intVal(body.get("columnCount")), intVal(body.get("layerCount")), intVal(body.get("cellCount")));
  }

  private static String str(Object o) {
    return o == null ? "" : String.valueOf(o);
  }

  private static int intVal(Object o) {
    if (o instanceof Number n) return n.intValue();
    String s = str(o).trim();
    if (s.isEmpty()) return 0;
    try { return Integer.parseInt(s); } catch (NumberFormatException e) {
      throw BizException.badRequest("VALIDATION_FAILED", "数值参数不合法: " + s);
    }
  }
}
