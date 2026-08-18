package com.finance.ams.sourcedoc;

import java.util.List;
import java.util.Map;

import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import com.finance.ams.auth.AuthUser;
import com.finance.ams.auth.PermissionService;

/**
 * 原始凭证域端点（P1-④）
 *
 *   GET  /source-docs?fondsCode=Z001       全宗聚合查询（遍历全部 record 的子件）
 *   GET  /source-docs/by-record/{recordId}  按 record 查询
 *   POST /source-docs/by-record/{recordId}  上传建件（multipart 可选）
 *
 * 认证：X-User-Id + X-Alfresco-Ticket 头。
 * 授权（2026-08-18）：见 PermissionService（查询=catalog+行级过滤；上传=核对工作台；内容=view 操作权）。
 */
@RestController
@RequestMapping("/source-docs")
public class SourceDocController {

  private final SourceDocService service;
  private final PermissionService perm;

  public SourceDocController(SourceDocService service, PermissionService perm) {
    this.service = service;
    this.perm = perm;
  }

  @GetMapping
  public List<Map<String, Object>> listByFonds(
      @RequestHeader(value = "X-User-Id", required = false) String userId,
      @RequestHeader(value = "X-Alfresco-Ticket", required = false) String ticket,
      @RequestParam String fondsCode) {
    AuthUser me = perm.me(userId, ticket);
    perm.requireOperation(me, PermissionService.Op.catalog);
    perm.checkFonds(me, fondsCode);
    return perm.filterRows(me, service.listByFonds(ticket, fondsCode));
  }

  @GetMapping("/by-record/{recordId}")
  public List<Map<String, Object>> listByRecord(
      @RequestHeader(value = "X-User-Id", required = false) String userId,
      @RequestHeader(value = "X-Alfresco-Ticket", required = false) String ticket,
      @PathVariable String recordId) {
    AuthUser me = perm.me(userId, ticket);
    perm.requireOperation(me, PermissionService.Op.catalog);
    return perm.filterRows(me, service.listByRecord(ticket, recordId));
  }

  @PostMapping(value = "/by-record/{recordId}", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
  public Map<String, Object> upload(
      @RequestHeader(value = "X-User-Id", required = false) String userId,
      @RequestHeader(value = "X-Alfresco-Ticket", required = false) String ticket,
      @PathVariable String recordId,
      @RequestPart(value = "file", required = false) MultipartFile file,
      @RequestParam Map<String, String> fields) throws Exception {
    AuthUser me = perm.me(userId, ticket);
    perm.requireFunction(me, "voucher-manager");
    String filename = file != null ? file.getOriginalFilename() : null;
    String mime = file != null ? file.getContentType() : null;
    byte[] bytes = file != null ? file.getBytes() : null;
    return service.create(ticket, recordId, Map.copyOf(fields), filename, mime, bytes);
  }

  @GetMapping("/{docId}/content")
  public ResponseEntity<byte[]> content(
      @RequestHeader(value = "X-User-Id", required = false) String userId,
      @RequestHeader(value = "X-Alfresco-Ticket", required = false) String ticket,
      @PathVariable String docId,
      @RequestParam(defaultValue = "false") boolean download,
      @RequestParam(defaultValue = "附件") String filename) {
    AuthUser me = perm.me(userId, ticket);
    // 操作权 OR 生效借阅授权（授权按件授予，附件向上归属到件判定）
    PermissionService.Op op = download ? PermissionService.Op.download : PermissionService.Op.view;
    perm.requireOperationOrGrant(me, op, service.parentRecordIdOf(ticket, docId));
    return service.content(ticket, docId, download, filename);
  }
}
