package com.finance.ams.review;

import java.util.List;
import java.util.Map;

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
 * 审核库端点（2026-08-09）
 *
 *   GET  /review/pending                审核库列表（fondsCode 必传）
 *   GET  /review/records/{nodeId}/history  某记录审核历史
 *   POST /review/records/{nodeId}/enter    进审核库（仅件数据 → 待审核）
 *   POST /review/records/{nodeId}/approve  审核通过（待审核 → 仅件数据）
 *   POST /review/records/{nodeId}/reject   审核驳回（待审核 → 仅件数据 + 意见）
 *
 * 权限：核对工作台功能码（voucher-manager；默认 admin/档案主管/档案管理员，矩阵可调）。
 * 授权（2026-08-18）：见 PermissionService（原硬编码角色清单收敛为功能码）。
 */
@RestController
@RequestMapping("/review")
public class ReviewController {

  private final ReviewService service;
  private final PermissionService perm;

  public ReviewController(ReviewService service, PermissionService perm) {
    this.service = service;
    this.perm = perm;
  }

  @GetMapping("/pending")
  public List<Map<String, Object>> pending(
      @RequestHeader(value = "X-User-Id", required = false) String userId,
      @RequestHeader(value = "X-Alfresco-Ticket", required = false) String ticket,
      @RequestParam String fondsCode,
      @RequestParam(required = false) String archiveType,
      @RequestParam(required = false) Integer year,
      @RequestParam(required = false) Integer month) {
    AuthUser me = perm.me(userId, ticket);
    perm.requireFunction(me, "voucher-manager");
    return service.pendingList(ticket, fondsCode, archiveType, year, month);
  }

  @GetMapping("/processed")
  public List<Map<String, Object>> processed(
      @RequestHeader(value = "X-User-Id", required = false) String userId,
      @RequestHeader(value = "X-Alfresco-Ticket", required = false) String ticket,
      @RequestParam String fondsCode) {
    AuthUser me = perm.me(userId, ticket);
    perm.requireFunction(me, "voucher-manager");
    return service.processedList(ticket, fondsCode);
  }

  @GetMapping("/records/{nodeId}/history")
  public List<Map<String, Object>> history(
      @RequestHeader(value = "X-User-Id", required = false) String userId,
      @RequestHeader(value = "X-Alfresco-Ticket", required = false) String ticket,
      @PathVariable String nodeId) {
    AuthUser me = perm.me(userId, ticket);
    perm.requireFunction(me, "voucher-manager");
    return service.reviewHistory(nodeId);
  }

  @PostMapping("/records/{nodeId}/enter")
  public Map<String, Object> enter(
      @RequestHeader(value = "X-User-Id", required = false) String userId,
      @RequestHeader(value = "X-Alfresco-Ticket", required = false) String ticket,
      @PathVariable String nodeId,
      @RequestBody(required = false) Map<String, Object> body) {
    AuthUser me = perm.me(userId, ticket);
    perm.requireFunction(me, "voucher-manager");
    return service.enter(ticket, userId, nodeId, comment(body));
  }

  @PostMapping("/records/{nodeId}/approve")
  public Map<String, Object> approve(
      @RequestHeader(value = "X-User-Id", required = false) String userId,
      @RequestHeader(value = "X-Alfresco-Ticket", required = false) String ticket,
      @PathVariable String nodeId,
      @RequestBody(required = false) Map<String, Object> body) {
    AuthUser me = perm.me(userId, ticket);
    perm.requireFunction(me, "voucher-manager");
    return service.approve(ticket, userId, nodeId, comment(body));
  }

  @PostMapping("/records/{nodeId}/reject")
  public Map<String, Object> reject(
      @RequestHeader(value = "X-User-Id", required = false) String userId,
      @RequestHeader(value = "X-Alfresco-Ticket", required = false) String ticket,
      @PathVariable String nodeId,
      @RequestBody(required = false) Map<String, Object> body) {
    AuthUser me = perm.me(userId, ticket);
    perm.requireFunction(me, "voucher-manager");
    return service.reject(ticket, userId, nodeId, comment(body));
  }

  // ═══════════════════ 内部 ═══════════════════

  private static String comment(Map<String, Object> body) {
    if (body == null) return "";
    Object c = body.get("comment");
    return c == null ? "" : String.valueOf(c);
  }
}
