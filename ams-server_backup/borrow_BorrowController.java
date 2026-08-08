package com.finance.ams.borrow;

import java.util.List;
import java.util.Map;

import org.springframework.http.HttpStatus;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.web.bind.annotation.*;

import com.finance.ams.api.BizException;

/**
 * 借阅域端点（P2-1/2/3）
 *
 *   POST /borrow/orders                    提交申请
 *   GET  /borrow/orders                    列表（mine/pendingForRole/status 过滤）
 *   GET  /borrow/orders/{id}               详情
 *   POST /borrow/orders/{id}/approve       审批通过
 *   POST /borrow/orders/{id}/reject        审批驳回
 *   POST /borrow/orders/{id}/terminate     中止
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

  public BorrowController(BorrowService service) {
    this.service = service;
  }

  @PostMapping("/orders")
  public Map<String, Object> submit(
      @RequestHeader(value = "X-User-Id", required = false) String userId,
      @RequestHeader(value = "X-Alfresco-Ticket", required = false) String ticket,
      @RequestBody Map<String, Object> body) {
    requireAuth(userId, ticket);
    return service.submitOrder(userId,
        str(body.get("applicantName")), str(body.get("applicantEmpNo")),
        str(body.get("applicantDept")), body);
  }

  @GetMapping("/orders")
  public List<Map<String, Object>> list(
      @RequestHeader(value = "X-User-Id", required = false) String userId,
      @RequestHeader(value = "X-Alfresco-Ticket", required = false) String ticket,
      @RequestParam(required = false) String mine,
      @RequestParam(required = false) String pendingForRole,
      @RequestParam(required = false) String status) {
    requireAuth(userId, ticket);
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
    return service.approve(id, userId, body != null ? body.get("comment") : null);
  }

  @PostMapping("/orders/{id}/reject")
  public Map<String, Object> reject(
      @RequestHeader(value = "X-User-Id", required = false) String userId,
      @RequestHeader(value = "X-Alfresco-Ticket", required = false) String ticket,
      @PathVariable String id, @RequestBody(required = false) Map<String, String> body) {
    requireAuth(userId, ticket);
    return service.reject(id, userId, body != null ? body.get("comment") : null);
  }

  @PostMapping("/orders/{id}/terminate")
  public Map<String, Object> terminate(
      @RequestHeader(value = "X-User-Id", required = false) String userId,
      @RequestHeader(value = "X-Alfresco-Ticket", required = false) String ticket,
      @PathVariable String id) {
    requireAuth(userId, ticket);
    return service.terminateOrder(id, userId);
  }

  @PostMapping("/fulfillments/{id}/checkout")
  public Map<String, Object> checkout(
      @RequestHeader(value = "X-User-Id", required = false) String userId,
      @RequestHeader(value = "X-Alfresco-Ticket", required = false) String ticket,
      @PathVariable String id) {
    requireAuth(userId, ticket);
    return service.checkout(id, userId);
  }

  @PostMapping("/fulfillments/{id}/return")
  public Map<String, Object> returnBack(
      @RequestHeader(value = "X-User-Id", required = false) String userId,
      @RequestHeader(value = "X-Alfresco-Ticket", required = false) String ticket,
      @PathVariable String id) {
    requireAuth(userId, ticket);
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
    return Map.of("userId", userId2, "blacklisted", service.isBlacklisted(userId2));
  }

  @PostMapping("/daily-check")
  public Map<String, Object> dailyCheck(
      @RequestHeader(value = "X-User-Id", required = false) String userId,
      @RequestHeader(value = "X-Alfresco-Ticket", required = false) String ticket) {
    requireAuth(userId, ticket);
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

  private static String str(Object o) { return o == null ? "" : String.valueOf(o); }
}
