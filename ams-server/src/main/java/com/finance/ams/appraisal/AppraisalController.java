package com.finance.ams.appraisal;

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
 * 鉴定销毁端点（2026-08-16 启用 ams_appraisal）
 *
 *   GET  /appraisals/due-volumes        到期案卷实时测算（fondsCode 必传）
 *   POST /appraisals/scan               到期卷登记为待鉴定任务（幂等）
 *   GET  /appraisals                    鉴定记录列表（status 过滤）
 *   POST /appraisals/{id}/review        评审（decision=destroy/retain + meetingNote）
 *   POST /appraisals/{id}/execute-destroy  销毁执行（删卷节点+留痕）
 *
 * 授权（2026-08-18）：见 PermissionService（鉴定销毁功能码）。
 */
@RestController
@RequestMapping("/appraisals")
public class AppraisalController {

  private final AppraisalService service;
  private final PermissionService perm;

  public AppraisalController(AppraisalService service, PermissionService perm) {
    this.service = service;
    this.perm = perm;
  }

  private AuthUser guard(String userId, String ticket) {
    AuthUser me = perm.me(userId, ticket);
    perm.requireFunction(me, "appraisal-manage");
    return me;
  }

  @GetMapping("/due-volumes")
  public List<Map<String, Object>> dueVolumes(
      @RequestHeader(value = "X-User-Id", required = false) String userId,
      @RequestHeader(value = "X-Alfresco-Ticket", required = false) String ticket,
      @RequestParam String fondsCode) {
    guard(userId, ticket);
    return service.dueVolumes(ticket, fondsCode);
  }

  @PostMapping("/scan")
  public Map<String, Object> scan(
      @RequestHeader(value = "X-User-Id", required = false) String userId,
      @RequestHeader(value = "X-Alfresco-Ticket", required = false) String ticket,
      @RequestParam String fondsCode) {
    guard(userId, ticket);
    return service.scan(ticket, fondsCode, userId);
  }

  @GetMapping
  public List<Map<String, Object>> list(
      @RequestHeader(value = "X-User-Id", required = false) String userId,
      @RequestHeader(value = "X-Alfresco-Ticket", required = false) String ticket,
      @RequestParam(required = false) String status) {
    guard(userId, ticket);
    return service.list(status);
  }

  @PostMapping("/{id}/review")
  public Map<String, Object> review(
      @RequestHeader(value = "X-User-Id", required = false) String userId,
      @RequestHeader(value = "X-Alfresco-Ticket", required = false) String ticket,
      @PathVariable String id,
      @RequestBody Map<String, Object> body) {
    guard(userId, ticket);
    return service.review(userId, id, str(body.get("decision")), str(body.get("meetingNote")));
  }

  @PostMapping("/{id}/execute-destroy")
  public Map<String, Object> executeDestroy(
      @RequestHeader(value = "X-User-Id", required = false) String userId,
      @RequestHeader(value = "X-Alfresco-Ticket", required = false) String ticket,
      @PathVariable String id) {
    guard(userId, ticket);
    return service.executeDestroy(ticket, userId, id);
  }

  private static String str(Object o) {
    return o == null ? "" : String.valueOf(o);
  }
}
