package com.finance.ams.oplog;

import java.util.List;
import java.util.Map;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

import com.finance.ams.api.BizException;
import com.finance.ams.auth.AuthUser;
import com.finance.ams.auth.PermissionService;

/**
 * 审计日志端点（P2-4）
 *   GET /audit/logs  多维分页查询
 *   GET /audit/verify 审计链验真
 *
 * 三员硬分立（2026-08-18）：仅安全审计员（security_auditor）可查，
 * admin 不豁免——管理者不能审计自己（等保口径，对应参考模型三员分立 sjy）。
 */
@RestController
@RequestMapping("/audit")
public class OperationLogController {

  private final OperationLogService service;
  private final PermissionService perm;

  public OperationLogController(OperationLogService service, PermissionService perm) {
    this.service = service;
    this.perm = perm;
  }

  @GetMapping("/logs")
  public Map<String, Object> logs(
      @RequestHeader(value = "X-User-Id", required = false) String userId,
      @RequestHeader(value = "X-Alfresco-Ticket", required = false) String ticket,
      @RequestParam(required = false) String actorId,
      @RequestParam(required = false) String action,
      @RequestParam(required = false) String orderId,
      @RequestParam(defaultValue = "0") int skip,
      @RequestParam(defaultValue = "50") int limit) {
    requireAuditor(userId, ticket);
    List<Map<String, Object>> items = service.query(actorId, action, orderId, skip, limit);
    long total = service.count(actorId, action);
    return Map.of("items", items, "total", total, "skip", skip, "limit", limit);
  }

  /** 审计链验真：重算哈希链，返回 total/verified/unverifiable/broken（2026-08-16） */
  @GetMapping("/verify")
  public Map<String, Object> verify(
      @RequestHeader(value = "X-User-Id", required = false) String userId,
      @RequestHeader(value = "X-Alfresco-Ticket", required = false) String ticket) {
    requireAuditor(userId, ticket);
    return service.verifyChain();
  }

  /** 硬分立闸口：仅安全审计员（admin 不免） */
  private void requireAuditor(String userId, String ticket) {
    if (userId == null || userId.isBlank() || ticket == null || ticket.isBlank())
      throw new BizException(HttpStatus.UNAUTHORIZED, "SESSION_EXPIRED", "缺少会话凭据，请重新登录");
    AuthUser me = perm.me(userId, ticket);
    if (!me.roles().contains(PermissionService.ROLE_AUDITOR)) {
      throw new BizException(HttpStatus.FORBIDDEN, "FORBIDDEN", "安全审计日志仅安全审计员可查（三员分立）");
    }
  }
}

