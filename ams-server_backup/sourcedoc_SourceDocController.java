package com.finance.ams.sourcedoc;

import java.util.List;
import java.util.Map;

import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import com.finance.ams.api.BizException;

/**
 * 原始凭证域端点（P1-④）
 *
 *   GET  /source-docs?fondsCode=Z001       全宗聚合查询（遍历全部 record 的子件）
 *   GET  /source-docs/by-record/{recordId}  按 record 查询
 *   POST /source-docs/by-record/{recordId}  上传建件（multipart 可选）
 *
 * 认证：X-User-Id + X-Alfresco-Ticket 头。
 */
@RestController
@RequestMapping("/source-docs")
public class SourceDocController {

  private final SourceDocService service;

  public SourceDocController(SourceDocService service) {
    this.service = service;
  }

  @GetMapping
  public List<Map<String, Object>> listByFonds(
      @RequestHeader(value = "X-User-Id", required = false) String userId,
      @RequestHeader(value = "X-Alfresco-Ticket", required = false) String ticket,
      @RequestParam String fondsCode) {
    requireAuth(userId, ticket);
    return service.listByFonds(ticket, fondsCode);
  }

  @GetMapping("/by-record/{recordId}")
  public List<Map<String, Object>> listByRecord(
      @RequestHeader(value = "X-User-Id", required = false) String userId,
      @RequestHeader(value = "X-Alfresco-Ticket", required = false) String ticket,
      @PathVariable String recordId) {
    requireAuth(userId, ticket);
    return service.listByRecord(ticket, recordId);
  }

  @PostMapping(value = "/by-record/{recordId}", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
  public Map<String, Object> upload(
      @RequestHeader(value = "X-User-Id", required = false) String userId,
      @RequestHeader(value = "X-Alfresco-Ticket", required = false) String ticket,
      @PathVariable String recordId,
      @RequestPart(value = "file", required = false) MultipartFile file,
      @RequestParam Map<String, String> fields) throws Exception {
    requireAuth(userId, ticket);
    String filename = file != null ? file.getOriginalFilename() : null;
    String mime = file != null ? file.getContentType() : null;
    byte[] bytes = file != null ? file.getBytes() : null;
    return service.create(ticket, recordId, Map.copyOf(fields), filename, mime, bytes);
  }

  private void requireAuth(String userId, String ticket) {
    if (userId == null || userId.isBlank() || ticket == null || ticket.isBlank()) {
      throw new BizException(HttpStatus.UNAUTHORIZED, "SESSION_EXPIRED", "缺少会话凭据，请重新登录");
    }
  }
}
