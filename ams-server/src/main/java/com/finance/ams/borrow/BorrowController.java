package com.finance.ams.borrow;

import java.util.List;
import java.util.Map;

import org.springframework.http.HttpStatus;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.web.bind.annotation.*;

import com.finance.ams.api.BizException;
import com.finance.ams.auth.AuthService;
import com.finance.ams.auth.AuthUser;
import com.finance.ams.auth.PermissionService;

/**
 * 借阅域端点（P2-1/2/3）
 *
 *   POST /borrow/orders                    提交申请
 *   GET  /borrow/orders                    列表（mine/pendingForRole/status 过滤）
 *   GET  /borrow/orders/{id}               详情
 *   POST /borrow/orders/{id}/approve       审批通过
 *   POST /borrow/orders/{id}/reject        审批驳回
 *   POST /borrow/orders/{id}/cancel        申请人本人撤销（仅审批中）
 *   POST /borrow/orders/{id}/terminate     管理员中止
 *   POST /borrow/fulfillments/{id}/checkout  实体出库
 *   POST /borrow/fulfillments/{id}/return    归还核销
 *   GET  /borrow/availability/{volumeId}   库存查询
 *   GET  /borrow/blacklist/{userId}        黑名单查询
 *   POST /borrow/daily-check               手动巡检
 */
@RestController
@RequestMapping("/borrow")
public class BorrowController {

  private final BorrowService service;
  private final AuthService authService;
  private final PermissionService perm;

  public BorrowController(BorrowService service, AuthService authService, PermissionService perm) {
    this.service = service;
    this.authService = authService;
    this.perm = perm;
  }

  @PostMapping("/orders")
  public Map<String, Object> submit(
      @RequestHeader(value = "X-User-Id", required = false) String userId,
      @RequestHeader(value = "X-Alfresco-Ticket", required = false) String ticket,
      @RequestBody Map<String, Object> body) {
    requireAuth(userId, ticket);
    // 安全：申请人姓名/工号/部门一律以服务端会话（Alfresco ticket 校验）为准，
    // 忽略请求体里任意填写的 applicantName/EmpNo/Dept，防止冒名申请。
    AuthUser me = authService.me(userId, ticket);
    // 借阅操作权（QX 第 4 位）：无 borrow 权的角色（如审计员）不得发起
    perm.requireOperation(me, PermissionService.Op.borrow);
    return service.submitOrder(me.account(), me.name(), me.empNo(), me.dept(), body);
  }

  @GetMapping("/orders")
  public List<Map<String, Object>> list(
      @RequestHeader(value = "X-User-Id", required = false) String userId,
      @RequestHeader(value = "X-Alfresco-Ticket", required = false) String ticket,
      @RequestParam(required = false) String mine,
      @RequestParam(required = false) String pendingForRole,
      @RequestParam(required = false) String status) {
    requireAuth(userId, ticket);
    // 待办按角色取数：必须真实持有该角色（防越权窥探他角待办；admin 豁免）
    if (pendingForRole != null && !pendingForRole.isBlank()) {
      AuthUser me = authService.me(userId, ticket);
      if (!me.roles().contains("admin") && !me.roles().contains(pendingForRole)) {
        throw new BizException(HttpStatus.FORBIDDEN, "FORBIDDEN", "不持有角色 " + pendingForRole + "，无法查询其待办");
      }
    }
    return service.listOrders(mine, pendingForRole, status);
  }

  @GetMapping("/orders/{id}")
  public Map<String, Object> get(
      @RequestHeader(value = "X-User-Id", required = false) String userId,
      @RequestHeader(value = "X-Alfresco-Ticket", required = false) String ticket,
      @PathVariable String id) {
    requireAuth(userId, ticket);
    return service.getOrder(id);
  }

  @PostMapping("/orders/{id}/approve")
  public Map<String, Object> approve(
      @RequestHeader(value = "X-User-Id", required = false) String userId,
      @RequestHeader(value = "X-Alfresco-Ticket", required = false) String ticket,
      @PathVariable String id, @RequestBody(required = false) Map<String, String> body) {
    requireAuth(userId, ticket);
    // 审批步骤角色在服务端按当前步骤严格校验（2026-08-18 越级审批修复，admin 不豁免）
    AuthUser me = currentUser(userId, ticket);
    return service.approve(id, me, body != null ? body.get("comment") : null);
  }

  @PostMapping("/orders/{id}/reject")
  public Map<String, Object> reject(
      @RequestHeader(value = "X-User-Id", required = false) String userId,
      @RequestHeader(value = "X-Alfresco-Ticket", required = false) String ticket,
      @PathVariable String id, @RequestBody(required = false) Map<String, String> body) {
    requireAuth(userId, ticket);
    AuthUser me = currentUser(userId, ticket);
    return service.reject(id, me, body != null ? body.get("comment") : null);
  }

  @PostMapping("/orders/{id}/cancel")
  public Map<String, Object> cancel(
      @RequestHeader(value = "X-User-Id", required = false) String userId,
      @RequestHeader(value = "X-Alfresco-Ticket", required = false) String ticket,
      @PathVariable String id) {
    requireAuth(userId, ticket);
    // 申请人本人撤销（仅审批中）；服务端按会话校验身份，防他人代撤
    AuthUser me = currentUser(userId, ticket);
    return service.cancelOrder(id, me.id());
  }

  @PostMapping("/orders/{id}/terminate")
  public Map<String, Object> terminate(
      @RequestHeader(value = "X-User-Id", required = false) String userId,
      @RequestHeader(value = "X-Alfresco-Ticket", required = false) String ticket,
      @PathVariable String id) {
    requireAuth(userId, ticket);
    requireAnyRole(userId, ticket, "archivist", "archive_director", "admin");
    return service.terminateOrder(id, userId);
  }

  @PostMapping("/fulfillments/{id}/checkout")
  public Map<String, Object> checkout(
      @RequestHeader(value = "X-User-Id", required = false) String userId,
      @RequestHeader(value = "X-Alfresco-Ticket", required = false) String ticket,
      @PathVariable String id) {
    requireAuth(userId, ticket);
    requireAnyRole(userId, ticket, "archivist", "archive_director", "admin");
    return service.checkout(id, userId);
  }

  @PostMapping("/fulfillments/{id}/return")
  public Map<String, Object> returnBack(
      @RequestHeader(value = "X-User-Id", required = false) String userId,
      @RequestHeader(value = "X-Alfresco-Ticket", required = false) String ticket,
      @PathVariable String id) {
    requireAuth(userId, ticket);
    requireAnyRole(userId, ticket, "archivist", "archive_director", "admin");
    return service.returnFulfillment(id, userId);
  }

  @GetMapping("/availability/{volumeId}")
  public Map<String, Object> availability(
      @RequestHeader(value = "X-User-Id", required = false) String userId,
      @RequestHeader(value = "X-Alfresco-Ticket", required = false) String ticket,
      @PathVariable String volumeId) {
    requireAuth(userId, ticket);
    return service.availability(volumeId);
  }

  @GetMapping("/blacklist/{userId}")
  public Map<String, Object> blacklist(
      @RequestHeader(value = "X-User-Id", required = false) String userId,
      @RequestHeader(value = "X-Alfresco-Ticket", required = false) String ticket,
      @PathVariable String userId2) {
    requireAuth(userId, ticket);
    // 黑名单查询：本人或档案管理岗（防批量探查他人逾期信用）
    AuthUser me = currentUser(userId, ticket);
    if (!me.id().equals(userId2) && !me.account().equals(userId2)
        && !me.roles().contains("archivist") && !me.roles().contains("archive_director")
        && !me.roles().contains("admin")) {
      throw new BizException(HttpStatus.FORBIDDEN, "FORBIDDEN", "仅本人或档案管理岗可查询黑名单");
    }
    return Map.of("userId", userId2, "blacklisted", service.isBlacklisted(userId2));
  }

  @PostMapping("/daily-check")
  public Map<String, Object> dailyCheck(
      @RequestHeader(value = "X-User-Id", required = false) String userId,
      @RequestHeader(value = "X-Alfresco-Ticket", required = false) String ticket) {
    requireAuth(userId, ticket);
    requireAnyRole(userId, ticket, "archivist", "archive_director", "admin");
    return service.dailyCheck();
  }

  /** 定时巡检（每日 00:05） */
  @Scheduled(cron = "0 5 0 * * *")
  public void scheduledDailyCheck() {
    service.dailyCheck();
  }

  private void requireAuth(String userId, String ticket) {
    if (userId == null || userId.isBlank() || ticket == null || ticket.isBlank())
      throw new BizException(HttpStatus.UNAUTHORIZED, "SESSION_EXPIRED", "缺少会话凭据");
  }

  /** 校验会话并返回当前用户；ticket 无效/过期时抛 401 */
  private AuthUser currentUser(String userId, String ticket) {
    return authService.me(userId, ticket);
  }

  /** 当前用户是否具备任一所需角色（admin 恒通过） */
  private void requireAnyRole(String userId, String ticket, String... roles) {
    AuthUser me = currentUser(userId, ticket);
    if (me.roles().contains("admin")) return;
    for (String r : roles) {
      if (me.roles().contains(r)) return;
    }
    throw new BizException(HttpStatus.FORBIDDEN, "FORBIDDEN", "无权限执行该操作（需要角色: " + String.join("/", roles) + "）");
  }

  private static String str(Object o) { return o == null ? "" : String.valueOf(o); }
}
