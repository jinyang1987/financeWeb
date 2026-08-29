package com.finance.ams.inspection;

import java.util.List;
import java.util.Map;

import org.springframework.web.bind.annotation.*;

import com.finance.ams.api.BizException;
import com.finance.ams.auth.AuthUser;
import com.finance.ams.auth.PermissionService;

/**
 * 四性检测端点。
 * 授权（2026-08-18）：见 PermissionService（检测执行=组卷工作台；报告=catalog；检测项管理=四性检测配置）。
 */
@RestController
@RequestMapping("/inspection")
public class InspectionController {

  private final InspectionService service;
  private final PermissionService perm;

  public InspectionController(InspectionService service, PermissionService perm) {
    this.service = service;
    this.perm = perm;
  }

  @PostMapping("/run")
  public Map<String, Object> run(
      @RequestHeader(value = "X-User-Id", required = false) String userId,
      @RequestHeader(value = "X-Alfresco-Ticket", required = false) String ticket,
      @RequestBody Map<String, String> body) {
    AuthUser me = perm.me(userId, ticket);
    perm.requireFunction(me, "volume-workspace");
    return service.run(ticket, userId, body.get("nodeId"), body.get("phase"));
  }

  /** 批量检测当前全宗收集池（配置页「立即执行检测」入口，2026-08-16） */
  @PostMapping("/run-batch")
  public Map<String, Object> runBatch(
      @RequestHeader(value = "X-User-Id", required = false) String userId,
      @RequestHeader(value = "X-Alfresco-Ticket", required = false) String ticket,
      @RequestBody Map<String, String> body) {
    AuthUser me = perm.me(userId, ticket);
    // 联动：配置页（inspection-config）与组卷工作台（volume-workspace）双入口
    perm.requireFunction(me, "volume-workspace", "inspection-config");
    String fondsCode = body == null ? null : body.get("fondsCode");
    if (fondsCode == null || fondsCode.isBlank()) {
      throw BizException.badRequest("VALIDATION_FAILED", "fondsCode 不能为空");
    }
    return service.runBatch(ticket, userId, fondsCode, body.get("phase"));
  }

  @GetMapping("/reports")
  public Object reports(
      @RequestHeader(value = "X-User-Id", required = false) String userId,
      @RequestHeader(value = "X-Alfresco-Ticket", required = false) String ticket,
      @RequestParam(required = false) String target,
      @RequestParam(required = false) Integer page,
      @RequestParam(required = false) Integer size) {
    AuthUser me = perm.me(userId, ticket);
    perm.requireOperation(me, PermissionService.Op.catalog);
    // T4：带 page/size 时返回分页结构 {items,total,page,size}；缺省保持旧数组形态（前端兼容期）
    if (page != null || size != null) {
      return service.reportsPaged(target, page == null ? 0 : page, size == null ? 20 : size);
    }
    return service.reports(target);
  }

  /** 检测项标准库列表（环节×四性×检测项，配置页渲染） */
  @GetMapping("/items")
  public List<Map<String, Object>> items(
      @RequestHeader(value = "X-User-Id", required = false) String userId,
      @RequestHeader(value = "X-Alfresco-Ticket", required = false) String ticket) {
    AuthUser me = perm.me(userId, ticket);
    perm.requireFunction(me, "inspection-config");
    return service.items();
  }

  /** 启用/停用检测项 {enabled} */
  @PutMapping("/items/{code}")
  public Map<String, Object> setItemEnabled(
      @RequestHeader(value = "X-User-Id", required = false) String userId,
      @RequestHeader(value = "X-Alfresco-Ticket", required = false) String ticket,
      @PathVariable String code,
      @RequestBody Map<String, Object> body) {
    AuthUser me = perm.me(userId, ticket);
    perm.requireFunction(me, "inspection-config");
    return service.setItemEnabled(code, body != null && Boolean.TRUE.equals(body.get("enabled")));
  }

  /** 卷级四性检测（移交时自动执行；快速检测页手动执行，2026-08-25） */
  @PostMapping("/run-volume")
  public Map<String, Object> runVolume(
      @RequestHeader(value = "X-User-Id", required = false) String userId,
      @RequestHeader(value = "X-Alfresco-Ticket", required = false) String ticket,
      @RequestBody Map<String, String> body) {
    AuthUser me = perm.me(userId, ticket);
    perm.requireFunction(me, "volume-workspace", "quick-check");
    String volumeId = body == null ? null : body.get("volumeId");
    if (volumeId == null || volumeId.isBlank()) {
      throw BizException.badRequest("VALIDATION_FAILED", "volumeId 不能为空");
    }
    String phase = body.get("phase");
    return service.runVolume(ticket, userId, volumeId,
        phase == null || phase.isBlank() ? "yj" : phase);
  }

  /** 人工复检 {reportId, dimension, status, reason}（留痕：复检人/原因/时间） */
  @PostMapping("/review")
  public Map<String, Object> review(
      @RequestHeader(value = "X-User-Id", required = false) String userId,
      @RequestHeader(value = "X-Alfresco-Ticket", required = false) String ticket,
      @RequestBody Map<String, Object> body) {
    AuthUser me = perm.me(userId, ticket);
    perm.requireFunction(me, "volume-workspace", "quick-check");
    return service.review(ticket,
        str(body == null ? null : body.get("reportId")),
        str(body == null ? null : body.get("dimension")),
        body != null && Boolean.TRUE.equals(body.get("pass")),
        str(body == null ? null : body.get("reason")),
        userId);
  }

  private static String str(Object o) {
    return o == null ? "" : String.valueOf(o);
  }
}
