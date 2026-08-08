package com.finance.ams.box;

import java.util.List;
import java.util.Map;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.finance.ams.api.BizException;

/**
 * 盒域端点（P1-②，只读）
 *
 *   GET /boxes                盒列表（fondsCode 必传；year/typeCode/status 过滤）
 *   GET /boxes/{id}/volumes   盒内案卷列表
 *
 * 认证：X-User-Id + X-Alfresco-Ticket 头（同 /records 规约）。
 */
@RestController
@RequestMapping("/boxes")
public class BoxController {

  private final BoxService service;

  public BoxController(BoxService service) {
    this.service = service;
  }

  @GetMapping
  public List<Map<String, Object>> list(
      @RequestHeader(value = "X-User-Id", required = false) String userId,
      @RequestHeader(value = "X-Alfresco-Ticket", required = false) String ticket,
      @RequestParam String fondsCode,
      @RequestParam(required = false) Integer year,
      @RequestParam(required = false) String typeCode,
      @RequestParam(required = false) String status) {
    requireAuth(userId, ticket);
    return service.list(ticket, new BoxService.ListQuery(fondsCode, year, typeCode, status));
  }

  @GetMapping("/{boxId}/volumes")
  public List<Map<String, Object>> volumes(
      @RequestHeader(value = "X-User-Id", required = false) String userId,
      @RequestHeader(value = "X-Alfresco-Ticket", required = false) String ticket,
      @PathVariable String boxId) {
    requireAuth(userId, ticket);
    return service.boxVolumes(ticket, boxId);
  }

  private void requireAuth(String userId, String ticket) {
    if (userId == null || userId.isBlank() || ticket == null || ticket.isBlank()) {
      throw new BizException(HttpStatus.UNAUTHORIZED, "SESSION_EXPIRED", "缺少会话凭据，请重新登录");
    }
  }
}
