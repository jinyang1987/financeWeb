package com.finance.ams.storage;

import java.util.List;
import java.util.Map;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

import com.finance.ams.api.BizException;

@RestController
@RequestMapping("/storage")
public class StorageController {

  private final StorageService service;

  public StorageController(StorageService service) { this.service = service; }

  @GetMapping("/tree")
  public List<Map<String, Object>> tree(
      @RequestHeader(value = "X-User-Id", required = false) String userId,
      @RequestHeader(value = "X-Alfresco-Ticket", required = false) String ticket) {
    requireAuth(userId, ticket);
    return service.tree();
  }

  @PostMapping("/nodes")
  public Map<String, Object> create(
      @RequestHeader(value = "X-User-Id", required = false) String userId,
      @RequestHeader(value = "X-Alfresco-Ticket", required = false) String ticket,
      @RequestBody Map<String, String> body) {
    requireAuth(userId, ticket);
    return service.createNode(body.get("parentId"), body.get("kind"), body.get("code"), body.get("name"));
  }

  @GetMapping("/occupancy")
  public List<Map<String, Object>> occupancy(
      @RequestHeader(value = "X-User-Id", required = false) String userId,
      @RequestHeader(value = "X-Alfresco-Ticket", required = false) String ticket) {
    requireAuth(userId, ticket);
    return service.occupancy();
  }

  private void requireAuth(String userId, String ticket) {
    if (userId == null || userId.isBlank()) throw new BizException(HttpStatus.UNAUTHORIZED, "SESSION_EXPIRED", "缺少会话凭据");
  }
}
