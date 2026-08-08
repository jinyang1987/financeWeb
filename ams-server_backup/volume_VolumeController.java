package com.finance.ams.volume;

import java.util.List;
import java.util.Map;

import org.springframework.http.HttpStatus;
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
 *   POST   /volumes/{id}/transfer        移交归盒（自动找/建盒）
 *   POST   /volumes/{id}/return          退回组卷工作台
 *
 * 认证：X-User-Id + X-Alfresco-Ticket 头（同 /records 规约）。
 */
@RestController
@RequestMapping("/volumes")
public class VolumeController {

  private final VolumeService service;

  public VolumeController(VolumeService service) {
    this.service = service;
  }

  // ── 建卷 ──

  @PostMapping
  public Map<String, Object> create(
      @RequestHeader(value = "X-User-Id", required = false) String userId,
      @RequestHeader(value = "X-Alfresco-Ticket", required = false) String ticket,
      @RequestBody Map<String, Object> body) {
    requireAuth(userId, ticket);
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
    requireAuth(userId, ticket);
    return service.list(ticket, new VolumeService.ListQuery(fondsCode, year, typeCode, status));
  }

  // ── 更新 / 删除 ──

  @PutMapping("/{volumeId}")
  @SuppressWarnings("unchecked")
  public Map<String, Object> update(
      @RequestHeader(value = "X-User-Id", required = false) String userId,
      @RequestHeader(value = "X-Alfresco-Ticket", required = false) String ticket,
      @PathVariable String volumeId,
      @RequestBody Map<String, String> body) {
    requireAuth(userId, ticket);
    return service.update(ticket, volumeId, body);
  }

  @DeleteMapping("/{volumeId}")
  public Map<String, Object> delete(
      @RequestHeader(value = "X-User-Id", required = false) String userId,
      @RequestHeader(value = "X-Alfresco-Ticket", required = false) String ticket,
      @PathVariable String volumeId) {
    requireAuth(userId, ticket);
    service.deleteEmpty(ticket, volumeId);
    return Map.of("deleted", true);
  }

  // ── 卷内件 ──

  @GetMapping("/{volumeId}/items")
  public List<Map<String, Object>> items(
      @RequestHeader(value = "X-User-Id", required = false) String userId,
      @RequestHeader(value = "X-Alfresco-Ticket", required = false) String ticket,
      @PathVariable String volumeId) {
    requireAuth(userId, ticket);
    return service.items(ticket, volumeId);
  }

  @PostMapping("/{volumeId}/items")
  @SuppressWarnings("unchecked")
  public List<Map<String, Object>> addItems(
      @RequestHeader(value = "X-User-Id", required = false) String userId,
      @RequestHeader(value = "X-Alfresco-Ticket", required = false) String ticket,
      @PathVariable String volumeId,
      @RequestBody Map<String, Object> body) {
    requireAuth(userId, ticket);
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
    requireAuth(userId, ticket);
    return service.removeItem(ticket, volumeId, recordId);
  }

  @PutMapping("/{volumeId}/items/order")
  @SuppressWarnings("unchecked")
  public List<Map<String, Object>> reorder(
      @RequestHeader(value = "X-User-Id", required = false) String userId,
      @RequestHeader(value = "X-Alfresco-Ticket", required = false) String ticket,
      @PathVariable String volumeId,
      @RequestBody Map<String, Object> body) {
    requireAuth(userId, ticket);
    return service.reorder(ticket, volumeId, (List<String>) body.get("orderedRecordIds"));
  }

  // ── 状态机 ──

  @PostMapping("/{volumeId}/confirm")
  public Map<String, Object> confirm(
      @RequestHeader(value = "X-User-Id", required = false) String userId,
      @RequestHeader(value = "X-Alfresco-Ticket", required = false) String ticket,
      @PathVariable String volumeId) {
    requireAuth(userId, ticket);
    return service.confirm(ticket, userId, volumeId);
  }

  @PostMapping("/{volumeId}/unconfirm")
  public Map<String, Object> unconfirm(
      @RequestHeader(value = "X-User-Id", required = false) String userId,
      @RequestHeader(value = "X-Alfresco-Ticket", required = false) String ticket,
      @PathVariable String volumeId) {
    requireAuth(userId, ticket);
    return service.unconfirm(ticket, volumeId);
  }

  @PostMapping("/{volumeId}/decompose")
  public Map<String, Object> decompose(
      @RequestHeader(value = "X-User-Id", required = false) String userId,
      @RequestHeader(value = "X-Alfresco-Ticket", required = false) String ticket,
      @PathVariable String volumeId) {
    requireAuth(userId, ticket);
    int count = service.decompose(ticket, volumeId);
    return Map.of("decomposed", true, "itemCount", count);
  }

  @PostMapping("/{volumeId}/transfer")
  public Map<String, Object> transfer(
      @RequestHeader(value = "X-User-Id", required = false) String userId,
      @RequestHeader(value = "X-Alfresco-Ticket", required = false) String ticket,
      @PathVariable String volumeId) {
    requireAuth(userId, ticket);
    return service.transfer(ticket, userId, volumeId);
  }

  @PostMapping("/{volumeId}/return")
  public Map<String, Object> returnBack(
      @RequestHeader(value = "X-User-Id", required = false) String userId,
      @RequestHeader(value = "X-Alfresco-Ticket", required = false) String ticket,
      @PathVariable String volumeId) {
    requireAuth(userId, ticket);
    return service.returnToWorkbench(ticket, volumeId);
  }

  // ── 内部 ──

  private void requireAuth(String userId, String ticket) {
    if (userId == null || userId.isBlank() || ticket == null || ticket.isBlank()) {
      throw new BizException(HttpStatus.UNAUTHORIZED, "SESSION_EXPIRED", "缺少会话凭据，请重新登录");
    }
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
