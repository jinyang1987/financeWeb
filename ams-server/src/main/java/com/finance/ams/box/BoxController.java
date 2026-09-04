package com.finance.ams.box;

import java.util.List;
import java.util.Map;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.finance.ams.api.BizException;
import com.finance.ams.auth.AuthUser;
import com.finance.ams.auth.PermissionService;
import com.finance.ams.oplog.OperationLogService;

/**
 * 盒域端点（P1-②）
 *
 *   GET  /boxes                盒列表（fondsCode 必传；year/typeCode/status 过滤）
 *   GET  /boxes/{id}/volumes   盒内案卷列表
 *   PUT  /boxes/{id}           盒级元数据录入/修改（2026-08-29 T9，含人工字段）
 *
 * 认证：X-User-Id + X-Alfresco-Ticket 头（同 /records 规约）。
 * 授权（2026-08-18）：查询=catalog+全宗准入+行级过滤；封盒/删除=组卷工作台；上下架=实体库房。
 */
@RestController
@RequestMapping("/boxes")
public class BoxController {

  private final BoxService service;
  private final PermissionService perm;
  private final OperationLogService oplog;

  public BoxController(BoxService service, PermissionService perm, OperationLogService oplog) {
    this.service = service;
    this.perm = perm;
    this.oplog = oplog;
  }

  @GetMapping
  public List<Map<String, Object>> list(
      @RequestHeader(value = "X-User-Id", required = false) String userId,
      @RequestHeader(value = "X-Alfresco-Ticket", required = false) String ticket,
      @RequestParam String fondsCode,
      @RequestParam(required = false) Integer year,
      @RequestParam(required = false) String typeCode,
      @RequestParam(required = false) String status) {
    AuthUser me = perm.me(userId, ticket);
    perm.requireOperation(me, PermissionService.Op.catalog);
    perm.checkFonds(me, fondsCode);
    return perm.filterRows(me,
        service.list(ticket, new BoxService.ListQuery(fondsCode, year, typeCode, status)));
  }

  @GetMapping("/{boxId}/volumes")
  public List<Map<String, Object>> volumes(
      @RequestHeader(value = "X-User-Id", required = false) String userId,
      @RequestHeader(value = "X-Alfresco-Ticket", required = false) String ticket,
      @PathVariable String boxId) {
    AuthUser me = perm.me(userId, ticket);
    perm.requireOperation(me, PermissionService.Op.catalog);
    return service.boxVolumes(ticket, boxId);
  }

  // ── 盒写操作（2026-08-16 贯通修复，原前端仅乐观更新） ──

  /**
   * PUT /boxes/{boxId} — 盒级元数据录入/修改（2026-08-29 T9：人工字段写路径）。
   * 白名单：盒名称/密级/备注 + 装盒人/装盒日期/整理人/审核人/审核日期/双套制关联；
   * T10 审计留痕：旧值/新值 diff 落操作日志（DA/T 94-2022 附录 E.7）。
   */
  @PutMapping("/{boxId}")
  @SuppressWarnings("unchecked")
  public java.util.Map<String, Object> updateMetadata(
      @RequestHeader(value = "X-User-Id", required = false) String userId,
      @RequestHeader(value = "X-Alfresco-Ticket", required = false) String ticket,
      @PathVariable String boxId,
      @RequestBody java.util.Map<String, String> body,
      jakarta.servlet.http.HttpServletRequest request) {
    AuthUser me = perm.me(userId, ticket);
    perm.requireFunction(me, "volume-workspace", "digital-warehouse");
    java.util.Map<String, Object> result = service.updateMetadata(ticket, boxId, body);
    java.util.List<java.util.Map<String, Object>> changes =
        (java.util.List<java.util.Map<String, Object>>) result.get("changes");
    if (changes != null && !changes.isEmpty()) {
      String detail = "修改 " + changes.size() + " 项：";
      for (java.util.Map<String, Object> c : changes) {
        detail += str(c.get("prop")) + "「" + str(c.get("old")) + "」→「" + str(c.get("new")) + "」；";
      }
      if (detail.length() > 900) detail = detail.substring(0, 900) + "…";
      oplog.append(me.account(), me.name(), "盒元数据修改", boxId, null,
          detail, OperationLogService.clientIp(request));
    }
    @SuppressWarnings("unchecked")
    java.util.Map<String, Object> view = (java.util.Map<String, Object>) result.get("view");
    return view;
  }

  /** 封盒（active → sealed） */
  @PostMapping("/{boxId}/seal")
  public Map<String, Object> seal(
      @RequestHeader(value = "X-User-Id", required = false) String userId,
      @RequestHeader(value = "X-Alfresco-Ticket", required = false) String ticket,
      @PathVariable String boxId) {
    AuthUser me = perm.me(userId, ticket);
    perm.requireFunction(me, "volume-workspace");
    return service.seal(ticket, boxId);
  }

  /** 开封（sealed → active） */
  @PostMapping("/{boxId}/unseal")
  public Map<String, Object> unseal(
      @RequestHeader(value = "X-User-Id", required = false) String userId,
      @RequestHeader(value = "X-Alfresco-Ticket", required = false) String ticket,
      @PathVariable String boxId) {
    AuthUser me = perm.me(userId, ticket);
    perm.requireFunction(me, "volume-workspace");
    return service.unseal(ticket, boxId);
  }

  /**
   * 上架（密集架格位定位，active/sealed → stored）
   * body 二选一：
   *   { "auto": true }                                              自动分配第一个空格位
   *   { "room":"01", "rack":"A", "column":3, "layer":2, "cell":1 }  指定架位
   */
  @PostMapping("/{boxId}/shelve")
  public Map<String, Object> shelve(
      @RequestHeader(value = "X-User-Id", required = false) String userId,
      @RequestHeader(value = "X-Alfresco-Ticket", required = false) String ticket,
      @PathVariable String boxId,
      @RequestBody(required = false) Map<String, Object> body) {
    AuthUser me = perm.me(userId, ticket);
    perm.requireFunction(me, "digital-warehouse");
    boolean auto = body != null && Boolean.TRUE.equals(body.get("auto"));
    if (auto) {
      return service.shelveAuto(ticket, userId, boxId);
    }
    return service.shelve(ticket, userId, boxId,
        body == null ? "" : str(body.get("room")),
        body == null ? "" : str(body.get("rack")),
        body == null ? null : intVal(body.get("column")),
        body == null ? null : intVal(body.get("layer")),
        body == null ? null : intVal(body.get("cell")));
  }

  /** 下架（stored → sealed，架位清除） */
  @PostMapping("/{boxId}/unshelve")
  public Map<String, Object> unshelve(
      @RequestHeader(value = "X-User-Id", required = false) String userId,
      @RequestHeader(value = "X-Alfresco-Ticket", required = false) String ticket,
      @PathVariable String boxId) {
    AuthUser me = perm.me(userId, ticket);
    perm.requireFunction(me, "digital-warehouse");
    return service.unshelve(ticket, boxId);
  }

  /** 删除空盒（盒内有卷拒绝） */
  @DeleteMapping("/{boxId}")
  public ResponseEntity<Void> delete(
      @RequestHeader(value = "X-User-Id", required = false) String userId,
      @RequestHeader(value = "X-Alfresco-Ticket", required = false) String ticket,
      @PathVariable String boxId) {
    AuthUser me = perm.me(userId, ticket);
    perm.requireFunction(me, "volume-workspace");
    service.deleteEmpty(ticket, boxId);
    return ResponseEntity.noContent().build();
  }

  private static String str(Object o) {
    return o == null ? "" : String.valueOf(o);
  }

  private static Integer intVal(Object o) {
    if (o == null) return null;
    if (o instanceof Number n) return n.intValue();
    String s = String.valueOf(o).trim();
    if (s.isEmpty()) return null;
    try { return Integer.valueOf(s); } catch (NumberFormatException e) {
      throw BizException.badRequest("VALIDATION_FAILED", "数值参数不合法: " + s);
    }
  }
}
