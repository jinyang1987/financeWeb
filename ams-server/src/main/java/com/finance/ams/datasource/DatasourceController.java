package com.finance.ams.datasource;

import java.util.List;
import java.util.Map;

import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.finance.ams.api.BizException;
import com.finance.ams.auth.AuthUser;
import com.finance.ams.auth.PermissionService;

/**
 * 多数据源配置端点（2026-08-09）
 *
 *   GET  /datasources           数据源列表（secret 脱敏）
 *   GET  /datasources/{id}      单个数据源
 *   PUT  /datasources/{id}      保存/更新（secret 传空=保持原值）
 *   DELETE /datasources/{id}    删除
 *
 * 权限：连接配置功能码（sys-connection；默认 admin/档案主管/档案管理员，矩阵可调）。
 * 授权（2026-08-18）：见 PermissionService（原硬编码角色清单收敛为功能码）。
 */
@RestController
@RequestMapping("/datasources")
public class DatasourceController {

  private final DatasourceConfigService service;
  private final PermissionService perm;

  public DatasourceController(DatasourceConfigService service, PermissionService perm) {
    this.service = service;
    this.perm = perm;
  }

  @GetMapping
  public List<DatasourceConfigService.SourceView> list(
      @RequestHeader(value = "X-User-Id", required = false) String userId,
      @RequestHeader(value = "X-Alfresco-Ticket", required = false) String ticket) {
    AuthUser me = perm.me(userId, ticket);
    perm.requireFunction(me, "sys-connection");
    return service.list();
  }

  @GetMapping("/{id}")
  public DatasourceConfigService.SourceView get(
      @RequestHeader(value = "X-User-Id", required = false) String userId,
      @RequestHeader(value = "X-Alfresco-Ticket", required = false) String ticket,
      @PathVariable String id) {
    AuthUser me = perm.me(userId, ticket);
    perm.requireFunction(me, "sys-connection");
    DatasourceConfigService.SourceView view = service.get(id);
    if (view == null) throw BizException.notFound("数据源 " + id);
    return view;
  }

  @PutMapping("/{id}")
  public DatasourceConfigService.SourceView save(
      @RequestHeader(value = "X-User-Id", required = false) String userId,
      @RequestHeader(value = "X-Alfresco-Ticket", required = false) String ticket,
      @PathVariable String id,
      @RequestBody Map<String, Object> body) {
    AuthUser me = perm.me(userId, ticket);
    perm.requireFunction(me, "sys-connection");
    body.put("id", id);
    return service.save(userId, body);
  }

  @DeleteMapping("/{id}")
  public Map<String, Object> delete(
      @RequestHeader(value = "X-User-Id", required = false) String userId,
      @RequestHeader(value = "X-Alfresco-Ticket", required = false) String ticket,
      @PathVariable String id) {
    AuthUser me = perm.me(userId, ticket);
    perm.requireFunction(me, "sys-connection");
    service.delete(userId, id);
    return Map.of("deleted", id);
  }
}
