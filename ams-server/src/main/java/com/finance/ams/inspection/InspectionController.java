package com.finance.ams.inspection;

import java.util.List;
import java.util.Map;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

import com.finance.ams.api.BizException;

@RestController
@RequestMapping("/inspection")
public class InspectionController {

  private final InspectionService service;

  public InspectionController(InspectionService service) { this.service = service; }

  @PostMapping("/run")
  public Map<String, Object> run(
      @RequestHeader(value = "X-User-Id", required = false) String userId,
      @RequestHeader(value = "X-Alfresco-Ticket", required = false) String ticket,
      @RequestBody Map<String, String> body) {
    requireAuth(userId, ticket);
    return service.run(ticket, body.get("nodeId"), body.get("phase"));
  }

  @GetMapping("/reports")
  public List<Map<String, Object>> reports(
      @RequestHeader(value = "X-User-Id", required = false) String userId,
      @RequestHeader(value = "X-Alfresco-Ticket", required = false) String ticket,
      @RequestParam(required = false) String target) {
    requireAuth(userId, ticket);
    return service.reports(target);
  }

  private void requireAuth(String userId, String ticket) {
    if (userId == null || userId.isBlank() || ticket == null || ticket.isBlank())
      throw new BizException(HttpStatus.UNAUTHORIZED, "SESSION_EXPIRED", "缺少会话凭据，请重新登录");
  }
}
