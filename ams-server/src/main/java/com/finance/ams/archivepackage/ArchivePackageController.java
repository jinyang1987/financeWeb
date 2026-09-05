package com.finance.ams.archivepackage;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;

import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.finance.ams.auth.AuthUser;
import com.finance.ams.auth.PermissionService;

/**
 * 归档信息包端点（2026-09-05 批次五 T15，启用 V1 ams_package 死表）
 *
 *   POST /packages                  生成信息包（真 ZIP：封装说明 + 卷元数据 + 件内容；包级 SHA-256）
 *   GET  /packages                  信息包列表
 *   GET  /packages/{no}/download    下载 ZIP（下载即验真：包级摘要一致性校验）
 *   POST /packages/{no}/transfer    发送（created → transferred）
 *   POST /packages/{no}/receive     接收回执（transferred → received）
 *
 * 授权：写操作=归档打包功能码（archive-package / volume-workspace）；查询=catalog。
 */
@RestController
@RequestMapping("/packages")
public class ArchivePackageController {

  private final ArchivePackageService service;
  private final PermissionService perm;

  public ArchivePackageController(ArchivePackageService service, PermissionService perm) {
    this.service = service;
    this.perm = perm;
  }

  @PostMapping
  public Map<String, Object> create(
      @RequestHeader(value = "X-User-Id", required = false) String userId,
      @RequestHeader(value = "X-Alfresco-Ticket", required = false) String ticket,
      @RequestBody Map<String, Object> body) {
    AuthUser me = perm.me(userId, ticket);
    perm.requireFunction(me, "volume-workspace", "archive-package");
    perm.checkFonds(me, str(body.get("fondsCode")));
    @SuppressWarnings("unchecked")
    List<String> volumeNodes = (List<String>) body.get("volumeNodes");
    var cmd = new ArchivePackageService.CreateCmd(
        str(body.get("fondsCode")), str(body.get("name")),
        str(body.get("unitKind")), volumeNodes, me.account());
    return service.create(ticket, me.account(), cmd);
  }

  @GetMapping
  public List<Map<String, Object>> list(
      @RequestHeader(value = "X-User-Id", required = false) String userId,
      @RequestHeader(value = "X-Alfresco-Ticket", required = false) String ticket) {
    AuthUser me = perm.me(userId, ticket);
    perm.requireOperation(me, PermissionService.Op.catalog);
    return service.list();
  }

  @GetMapping("/{packageNo}/download")
  public ResponseEntity<byte[]> download(
      @RequestHeader(value = "X-User-Id", required = false) String userId,
      @RequestHeader(value = "X-Alfresco-Ticket", required = false) String ticket,
      @PathVariable String packageNo) {
    AuthUser me = perm.me(userId, ticket);
    perm.requireOperation(me, PermissionService.Op.download);
    Map<String, Object> content = service.download(ticket, packageNo);
    byte[] bytes = (byte[]) content.get("bytes");
    String encoded = URLEncoder.encode(String.valueOf(content.get("filename")), StandardCharsets.UTF_8)
        .replace("+", "%20");
    return ResponseEntity.ok()
        .contentType(MediaType.APPLICATION_OCTET_STREAM)
        .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename*=UTF-8''" + encoded)
        .header("X-Package-Checksum-Match", String.valueOf(content.get("checksumMatch")))
        .body(bytes);
  }

  @PostMapping("/{packageNo}/transfer")
  public Map<String, Object> transfer(
      @RequestHeader(value = "X-User-Id", required = false) String userId,
      @RequestHeader(value = "X-Alfresco-Ticket", required = false) String ticket,
      @PathVariable String packageNo) {
    AuthUser me = perm.me(userId, ticket);
    perm.requireFunction(me, "volume-workspace", "archive-package");
    return service.transfer(me.account(), packageNo);
  }

  @PostMapping("/{packageNo}/receive")
  public Map<String, Object> receive(
      @RequestHeader(value = "X-User-Id", required = false) String userId,
      @RequestHeader(value = "X-Alfresco-Ticket", required = false) String ticket,
      @PathVariable String packageNo) {
    AuthUser me = perm.me(userId, ticket);
    perm.requireFunction(me, "volume-workspace", "archive-package");
    return service.receive(me.account(), packageNo);
  }

  private static String str(Object o) {
    return o == null ? "" : String.valueOf(o);
  }
}
