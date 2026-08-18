package com.finance.ams.transfer;

import java.util.List;
import java.util.Map;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.finance.ams.auth.AuthUser;
import com.finance.ams.auth.PermissionService;

/**
 * 对外移交批次端点（2026-08-16 启用 ams_transfer_batch）
 *
 *   GET    /transfers                 批次列表（status 过滤；resolveVolumes=true 附卷明细）
 *   GET    /transfers/{id}            批次详情（附卷明细）
 *   POST   /transfers                 发起移交（pending）
 *   POST   /transfers/{id}/prepare    生成移交清册（pending → prepared）
 *   POST   /transfers/{id}/receive    签收（prepared → received）
 *   POST   /transfers/{id}/reject     退回（prepared → pending）
 *   DELETE /transfers/{id}            删除（仅 pending）
 *
 * 授权（2026-08-18）：见 PermissionService（案卷移交管理/档案移交双功能码）。
 */
@RestController
@RequestMapping("/transfers")
public class TransferController {

  private final TransferService service;
  private final PermissionService perm;

  public TransferController(TransferService service, PermissionService perm) {
    this.service = service;
    this.perm = perm;
  }

  private AuthUser guard(String userId, String ticket) {
    AuthUser me = perm.me(userId, ticket);
    perm.requireFunction(me, "transfer-manage", "archive-transfer");
    return me;
  }

  @GetMapping
  public List<Map<String, Object>> list(
      @RequestHeader(value = "X-User-Id", required = false) String userId,
      @RequestHeader(value = "X-Alfresco-Ticket", required = false) String ticket,
      @RequestParam(required = false) String status,
      @RequestParam(defaultValue = "false") boolean resolveVolumes) {
    guard(userId, ticket);
    return service.list(ticket, status, resolveVolumes);
  }

  @GetMapping("/{id}")
  public Map<String, Object> detail(
      @RequestHeader(value = "X-User-Id", required = false) String userId,
      @RequestHeader(value = "X-Alfresco-Ticket", required = false) String ticket,
      @PathVariable String id) {
    guard(userId, ticket);
    return service.detail(ticket, id);
  }

  @PostMapping
  public Map<String, Object> create(
      @RequestHeader(value = "X-User-Id", required = false) String userId,
      @RequestHeader(value = "X-Alfresco-Ticket", required = false) String ticket,
      @RequestBody Map<String, Object> body) {
    guard(userId, ticket);
    @SuppressWarnings("unchecked")
    List<String> volumeNodes = (List<String>) body.get("volumeNodes");
    var cmd = new TransferService.CreateCmd(
        str(body.get("fromDept")), str(body.get("toDept")),
        str(body.get("fromPerson")), str(body.get("toPerson")),
        volumeNodes, str(body.get("transferDate")));
    return service.create(userId, ticket, cmd);
  }

  @PostMapping("/{id}/prepare")
  public Map<String, Object> prepare(
      @RequestHeader(value = "X-User-Id", required = false) String userId,
      @RequestHeader(value = "X-Alfresco-Ticket", required = false) String ticket,
      @PathVariable String id) {
    guard(userId, ticket);
    return service.prepare(userId, id);
  }

  @PostMapping("/{id}/receive")
  public Map<String, Object> receive(
      @RequestHeader(value = "X-User-Id", required = false) String userId,
      @RequestHeader(value = "X-Alfresco-Ticket", required = false) String ticket,
      @PathVariable String id) {
    guard(userId, ticket);
    return service.receive(userId, id);
  }

  @PostMapping("/{id}/reject")
  public Map<String, Object> reject(
      @RequestHeader(value = "X-User-Id", required = false) String userId,
      @RequestHeader(value = "X-Alfresco-Ticket", required = false) String ticket,
      @PathVariable String id,
      @RequestBody(required = false) Map<String, Object> body) {
    guard(userId, ticket);
    return service.reject(userId, id, body == null ? "" : str(body.get("reason")));
  }

  @DeleteMapping("/{id}")
  public ResponseEntity<Void> delete(
      @RequestHeader(value = "X-User-Id", required = false) String userId,
      @RequestHeader(value = "X-Alfresco-Ticket", required = false) String ticket,
      @PathVariable String id) {
    guard(userId, ticket);
    service.delete(userId, id);
    return ResponseEntity.noContent().build();
  }

  private static String str(Object o) {
    return o == null ? "" : String.valueOf(o);
  }
}
