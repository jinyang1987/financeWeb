package com.finance.ams.appraisal;

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

  /**
   * POST /{id}/sign — 销毁三方签批链（T13）。
   * body: { role: applicant|archives|supervisor, note?, unsettledCheck?, unsettledNote? }
   * 申请单位签批时必须 unsettledCheck=true（未结清债权债务核查声明）+ unsettledNote。
   */
  @PostMapping("/{id}/sign")
  public Map<String, Object> sign(
      @RequestHeader(value = "X-User-Id", required = false) String userId,
      @RequestHeader(value = "X-Alfresco-Ticket", required = false) String ticket,
      @PathVariable String id,
      @RequestBody Map<String, Object> body) {
    guard(userId, ticket);
    return service.sign(userId, id, str(body.get("role")), str(body.get("note")),
        body.get("unsettledCheck") instanceof Boolean b ? b : null, str(body.get("unsettledNote")));
  }

  /** POST /{id}/register — 生成销毁清册（法定字段 HTML，随档留存；幂等） */
  @PostMapping("/{id}/register")
  public Map<String, Object> generateRegister(
      @RequestHeader(value = "X-User-Id", required = false) String userId,
      @RequestHeader(value = "X-Alfresco-Ticket", required = false) String ticket,
      @PathVariable String id) {
    guard(userId, ticket);
    return service.generateRegister(ticket, userId, id);
  }

  /** GET /{id}/register-file — 下载销毁清册 HTML（打印/备案；浏览器带会话头 fetch） */
  @GetMapping("/{id}/register-file")
  public ResponseEntity<byte[]> downloadRegister(
      @RequestHeader(value = "X-User-Id", required = false) String userId,
      @RequestHeader(value = "X-Alfresco-Ticket", required = false) String ticket,
      @PathVariable String id) throws java.io.UnsupportedEncodingException {
    guard(userId, ticket);
    Map<String, Object> content = service.registerContent(ticket, id);
    byte[] bytes = (byte[]) content.get("bytes");
    String filename = String.valueOf(content.get("filename"));
    String encoded = java.net.URLEncoder.encode(filename, java.nio.charset.StandardCharsets.UTF_8)
        .replace("+", "%20");
    return ResponseEntity.ok()
        .contentType(MediaType.TEXT_HTML)
        .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename*=UTF-8''" + encoded)
        .body(bytes);
  }

  /**
   * POST /{id}/execute-destroy — 销毁执行（T13 法定前置全检）。
   * body: { supervisorNote }（共同监销记录，必填：监销人/时间/销毁方式）。
   * 服务端校验：清册已生成 + 监销人已签批；执行后做不可恢复性验证并留痕。
   */
  @PostMapping("/{id}/execute-destroy")
  public Map<String, Object> executeDestroy(
      @RequestHeader(value = "X-User-Id", required = false) String userId,
      @RequestHeader(value = "X-Alfresco-Ticket", required = false) String ticket,
      @PathVariable String id,
      @RequestBody(required = false) Map<String, Object> body) {
    guard(userId, ticket);
    return service.executeDestroy(ticket, userId, id, body == null ? "" : str(body.get("supervisorNote")));
  }

  private static String str(Object o) {
    return o == null ? "" : String.valueOf(o);
  }
}
