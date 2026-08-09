package com.finance.ams.oplog;

import java.util.List;
import java.util.Map;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

import com.finance.ams.api.BizException;

/**
 * 审计日志端点（P2-4）
 *   GET /audit/logs  多维分页查询
 */
@RestController
@RequestMapping("/audit")
public class OperationLogController {

  private final OperationLogService service;

  public OperationLogController(OperationLogService service) {
    this.service = service;
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
    if (userId == null || userId.isBlank() || ticket == null || ticket.isBlank())
      throw new BizException(HttpStatus.UNAUTHORIZED, "SESSION_EXPIRED", "缺少会话凭据，请重新登录");
    List<Map<String, Object>> items = service.query(actorId, action, orderId, skip, limit);
    long total = service.count(actorId, action);
    return Map.of("items", items, "total", total, "skip", skip, "limit", limit);
  }
}
