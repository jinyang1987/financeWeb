package com.finance.ams.fixity;

import java.util.Map;

import org.springframework.web.bind.annotation.*;

import com.finance.ams.auth.AuthUser;
import com.finance.ams.auth.PermissionService;
import com.finance.ams.api.BizException;

/**
 * 固化（哈希登记/巡检）端点（2026-08-29 T1）。
 *
 *   GET  /inspection/fixity/status            固化登记与巡检状态统计
 *   POST /inspection/fixity/verify/{nodeId}   单件重算比对（手动）
 *   POST /inspection/fixity/patrol            手动触发一轮全库巡检（最久未验批次）
 *   POST /inspection/fixity/backfill          存量补登记 {fondsCode}
 *
 * 授权：快速检测（quick-check）功能码——固化核验是检测能力的组成部分。
 */
@RestController
@RequestMapping("/inspection/fixity")
public class FixityController {

  private final FixityService fixity;
  private final PermissionService perm;

  public FixityController(FixityService fixity, PermissionService perm) {
    this.fixity = fixity;
    this.perm = perm;
  }

  @GetMapping("/status")
  public Map<String, Object> status(
      @RequestHeader(value = "X-User-Id", required = false) String userId,
      @RequestHeader(value = "X-Alfresco-Ticket", required = false) String ticket) {
    AuthUser me = perm.me(userId, ticket);
    perm.requireFunction(me, "quick-check");
    return fixity.status();
  }

  @PostMapping("/verify/{nodeId}")
  public Map<String, Object> verifyOne(
      @RequestHeader(value = "X-User-Id", required = false) String userId,
      @RequestHeader(value = "X-Alfresco-Ticket", required = false) String ticket,
      @PathVariable String nodeId) {
    AuthUser me = perm.me(userId, ticket);
    perm.requireFunction(me, "quick-check");
    FixityService.VerifyResult r = fixity.verify(ticket, nodeId);
    return Map.of("nodeId", nodeId, "ok", r.ok(), "note", r.note(),
        "expected", r.expected(), "actual", r.actual());
  }

  @PostMapping("/patrol")
  public Map<String, Object> patrol(
      @RequestHeader(value = "X-User-Id", required = false) String userId,
      @RequestHeader(value = "X-Alfresco-Ticket", required = false) String ticket) {
    AuthUser me = perm.me(userId, ticket);
    perm.requireFunction(me, "quick-check");
    return fixity.runPatrol(userId == null ? "manual" : userId);
  }

  @PostMapping("/backfill")
  public Map<String, Object> backfill(
      @RequestHeader(value = "X-User-Id", required = false) String userId,
      @RequestHeader(value = "X-Alfresco-Ticket", required = false) String ticket,
      @RequestBody Map<String, String> body) {
    AuthUser me = perm.me(userId, ticket);
    perm.requireFunction(me, "quick-check");
    String fondsCode = body == null ? null : body.get("fondsCode");
    if (fondsCode == null || fondsCode.isBlank()) {
      throw BizException.badRequest("VALIDATION_FAILED", "fondsCode 不能为空");
    }
    return fixity.backfill(ticket, fondsCode, userId == null ? "" : userId);
  }
}
