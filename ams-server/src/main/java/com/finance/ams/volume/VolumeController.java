package com.finance.ams.volume;

import java.util.List;
import java.util.Map;

import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.finance.ams.api.BizException;
import com.finance.ams.auth.AuthUser;
import com.finance.ams.auth.PermissionService;

/**
 * 卷域端点（P1-② 组卷写路径）
 *
 *   POST   /volumes                        建卷（草稿）
 *   GET    /volumes                      卷列表（fondsCode 必传；year/typeCode/status 过滤）
 *   PUT    /volumes/{id}                 更新案卷元数据
 *   DELETE /volumes/{id}                 删除空草稿案卷
 *   GET    /volumes/{id}/items           卷内件列表
 *   POST   /volumes/{id}/items           加件入卷 {recordIds, position?}
 *   DELETE /volumes/{id}/items/{recordId} 拆件回收集池（空卷自动销毁）
 *   PUT    /volumes/{id}/items/order     卷内重排 {orderedRecordIds}
 *   POST   /volumes/{id}/confirm         确认组卷（赋号时机消费 ams_config）
 *   POST   /volumes/{id}/unconfirm       撤销确认
 *   POST   /volumes/{id}/decompose       拆卷（件全部回池）
 *   POST   /volumes/{id}/split           拆分（选定件出新卷，继承类别/年度/期限）
 *   POST   /volumes/{id}/merge           合并（来源草稿卷并入本卷，来源删除）
 *   POST   /volumes/{id}/move-items      转卷（选定件移入目标草稿卷）
 *   POST   /volumes/{id}/transfer        移交归盒（自动找/建盒）
 *   POST   /volumes/{id}/return          退回组卷工作台
 *
 * 认证：X-User-Id + X-Alfresco-Ticket 头（同 /records 规约）。
 * 授权（2026-08-18）：写操作=组卷工作台功能码；查询=catalog 操作权+全宗准入+行级过滤。
 */
@RestController
@RequestMapping("/volumes")
public class VolumeController {

  private final VolumeService service;
  private final PermissionService perm;

  public VolumeController(VolumeService service, PermissionService perm) {
    this.service = service;
    this.perm = perm;
  }

  // ── 建卷 ──

  @PostMapping
  public Map<String, Object> create(
      @RequestHeader(value = "X-User-Id", required = false) String userId,
      @RequestHeader(value = "X-Alfresco-Ticket", required = false) String ticket,
      @RequestBody Map<String, Object> body) {
    AuthUser me = guard(userId, ticket, "volume-workspace");
    perm.checkFonds(me, str(body.get("fondsCode")));
    var cmd = new VolumeService.CreateCmd(
        str(body.get("fondsCode")),
        str(body.get("title")),
        str(body.get("archiveType")),
        str(body.get("archiveTypeCode")),
        intVal(body.get("year")),
        str(body.get("retention")),
        str(body.get("retentionCode")),
        str(body.get("dateFrom")),
        str(body.get("dateTo")),
        str(body.get("carrierType")),
        str(body.get("securityLevel")));
    return service.create(userId, ticket, cmd);
  }

  // ── 卷列表 ──

  @GetMapping
  public List<Map<String, Object>> list(
      @RequestHeader(value = "X-User-Id", required = false) String userId,
      @RequestHeader(value = "X-Alfresco-Ticket", required = false) String ticket,
      @RequestParam String fondsCode,
      @RequestParam(required = false) Integer year,
      @RequestParam(required = false) String typeCode,
      @RequestParam(required = false) String status) {
    AuthUser me = perm.me(userId, ticket);
    perm.requireOperation(me, PermissionService.Op.catalog);
    perm.checkFonds(me, fondsCode);
    return perm.filterRows(me,
        service.list(ticket, new VolumeService.ListQuery(fondsCode, year, typeCode, status)));
  }

  // ── 更新 / 删除 ──

  @PutMapping("/{volumeId}")
  @SuppressWarnings("unchecked")
  public Map<String, Object> update(
      @RequestHeader(value = "X-User-Id", required = false) String userId,
      @RequestHeader(value = "X-Alfresco-Ticket", required = false) String ticket,
      @PathVariable String volumeId,
      @RequestBody Map<String, String> body) {
    guard(userId, ticket, "volume-workspace");
    return service.update(ticket, volumeId, body);
  }

  @DeleteMapping("/{volumeId}")
  public Map<String, Object> delete(
      @RequestHeader(value = "X-User-Id", required = false) String userId,
      @RequestHeader(value = "X-Alfresco-Ticket", required = false) String ticket,
      @PathVariable String volumeId) {
    guard(userId, ticket, "volume-workspace");
    service.deleteEmpty(ticket, volumeId);
    return Map.of("deleted", true);
  }

  // ── 卷内件 ──

  @GetMapping("/{volumeId}/items")
  public List<Map<String, Object>> items(
      @RequestHeader(value = "X-User-Id", required = false) String userId,
      @RequestHeader(value = "X-Alfresco-Ticket", required = false) String ticket,
      @PathVariable String volumeId) {
    AuthUser me = perm.me(userId, ticket);
    perm.requireOperation(me, PermissionService.Op.catalog);
    return service.items(ticket, volumeId);
  }

  @PostMapping("/{volumeId}/items")
  @SuppressWarnings("unchecked")
  public List<Map<String, Object>> addItems(
      @RequestHeader(value = "X-User-Id", required = false) String userId,
      @RequestHeader(value = "X-Alfresco-Ticket", required = false) String ticket,
      @PathVariable String volumeId,
      @RequestBody Map<String, Object> body) {
    guard(userId, ticket, "volume-workspace");
    List<String> recordIds = (List<String>) body.get("recordIds");
    Integer position = intVal(body.get("position"));
    return service.addItems(ticket, volumeId, recordIds, position);
  }

  @DeleteMapping("/{volumeId}/items/{recordId}")
  public Map<String, Object> removeItem(
      @RequestHeader(value = "X-User-Id", required = false) String userId,
      @RequestHeader(value = "X-Alfresco-Ticket", required = false) String ticket,
      @PathVariable String volumeId,
      @PathVariable String recordId) {
    guard(userId, ticket, "volume-workspace");
    return service.removeItem(ticket, volumeId, recordId);
  }

  @PutMapping("/{volumeId}/items/order")
  @SuppressWarnings("unchecked")
  public List<Map<String, Object>> reorder(
      @RequestHeader(value = "X-User-Id", required = false) String userId,
      @RequestHeader(value = "X-Alfresco-Ticket", required = false) String ticket,
      @PathVariable String volumeId,
      @RequestBody Map<String, Object> body) {
    guard(userId, ticket, "volume-workspace");
    return service.reorder(ticket, volumeId, (List<String>) body.get("orderedRecordIds"));
  }

  // ── 状态机 ──

  @PostMapping("/{volumeId}/confirm")
  public Map<String, Object> confirm(
      @RequestHeader(value = "X-User-Id", required = false) String userId,
      @RequestHeader(value = "X-Alfresco-Ticket", required = false) String ticket,
      @PathVariable String volumeId) {
    guard(userId, ticket, "volume-workspace");
    return service.confirm(ticket, userId, volumeId);
  }

  @PostMapping("/{volumeId}/unconfirm")
  public Map<String, Object> unconfirm(
      @RequestHeader(value = "X-User-Id", required = false) String userId,
      @RequestHeader(value = "X-Alfresco-Ticket", required = false) String ticket,
      @PathVariable String volumeId) {
    guard(userId, ticket, "volume-workspace");
    return service.unconfirm(ticket, volumeId);
  }

  @PostMapping("/{volumeId}/decompose")
  public Map<String, Object> decompose(
      @RequestHeader(value = "X-User-Id", required = false) String userId,
      @RequestHeader(value = "X-Alfresco-Ticket", required = false) String ticket,
      @PathVariable String volumeId) {
    guard(userId, ticket, "volume-workspace");
    int count = service.decompose(ticket, volumeId);
    return Map.of("decomposed", true, "itemCount", count);
  }

  /**
   * 拆分：卷内选定件拆出为新案卷（继承源卷类别/年度/期限）
   * body: { recordIds: [...], title?: 新案卷题名 }
   */
  @PostMapping("/{volumeId}/split")
  @SuppressWarnings("unchecked")
  public Map<String, Object> split(
      @RequestHeader(value = "X-User-Id", required = false) String userId,
      @RequestHeader(value = "X-Alfresco-Ticket", required = false) String ticket,
      @PathVariable String volumeId,
      @RequestBody Map<String, Object> body) {
    guard(userId, ticket, "volume-workspace");
    return service.split(ticket, userId, volumeId,
        (List<String>) body.get("recordIds"), str(body.get("title")));
  }

  /**
   * 合并：多个来源草稿卷并入本卷（来源卷删除）
   * body: { sourceVolumeIds: [...] }
   */
  @PostMapping("/{volumeId}/merge")
  @SuppressWarnings("unchecked")
  public Map<String, Object> merge(
      @RequestHeader(value = "X-User-Id", required = false) String userId,
      @RequestHeader(value = "X-Alfresco-Ticket", required = false) String ticket,
      @PathVariable String volumeId,
      @RequestBody Map<String, Object> body) {
    guard(userId, ticket, "volume-workspace");
    return service.merge(ticket, userId, (List<String>) body.get("sourceVolumeIds"), volumeId);
  }

  /**
   * 转卷：卷内选定件移入目标草稿卷（跨案卷迁移，不回收集池）
   * body: { recordIds: [...], targetVolumeId }
   */
  @PostMapping("/{volumeId}/move-items")
  @SuppressWarnings("unchecked")
  public Map<String, Object> moveItems(
      @RequestHeader(value = "X-User-Id", required = false) String userId,
      @RequestHeader(value = "X-Alfresco-Ticket", required = false) String ticket,
      @PathVariable String volumeId,
      @RequestBody Map<String, Object> body) {
    guard(userId, ticket, "volume-workspace");
    return service.moveItems(ticket, userId, volumeId,
        (List<String>) body.get("recordIds"), str(body.get("targetVolumeId")));
  }

  @PostMapping("/{volumeId}/transfer")
  public Map<String, Object> transfer(
      @RequestHeader(value = "X-User-Id", required = false) String userId,
      @RequestHeader(value = "X-Alfresco-Ticket", required = false) String ticket,
      @PathVariable String volumeId) {
    guard(userId, ticket, "volume-workspace");
    return service.transfer(ticket, userId, volumeId);
  }

  @PostMapping("/{volumeId}/return")
  public Map<String, Object> returnBack(
      @RequestHeader(value = "X-User-Id", required = false) String userId,
      @RequestHeader(value = "X-Alfresco-Ticket", required = false) String ticket,
      @PathVariable String volumeId) {
    guard(userId, ticket, "volume-workspace");
    return service.returnToWorkbench(ticket, volumeId);
  }

  // ── 内部 ──

  /** 功能码守卫：会话 + 指定功能权限（写操作统一组卷工作台口径） */
  private AuthUser guard(String userId, String ticket, String functionKey) {
    AuthUser me = perm.me(userId, ticket);
    perm.requireFunction(me, functionKey);
    return me;
  }

  private static String str(Object o) {
    return o == null ? "" : String.valueOf(o);
  }

  private static Integer intVal(Object o) {
    if (o == null) return null;
    if (o instanceof Number n) return n.intValue();
    String s = String.valueOf(o).trim();
    if (s.isEmpty()) return null;
    try { return Integer.valueOf(s); } catch (NumberFormatException e) {
      throw BizException.badRequest("VALIDATION_FAILED", "数值参数不合法: " + s);
    }
  }
}
