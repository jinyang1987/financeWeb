package com.finance.ams.auth;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import javax.sql.DataSource;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.finance.ams.alfresco.AlfrescoAdminClient;
import com.finance.ams.api.BizException;
import com.finance.ams.oplog.OperationLogService;

/**
 * 人员管理端点（2026-08-18 权限补强）
 *
 *   GET /users                    用户视图列表（Alfresco people + ams_user_ext + 角色组）
 *   PUT /users/{id}/clearance     人员密级调整 {clearance: 0-3}
 *
 * 授权：sys-personnel 功能码（admin + security_officer；人员密级是保密员核心职责，三员分立）。
 * 人员密级变更写审计链（对应参考模型 S_LOG_OPERPOWER 授权审计）。
 *
 * 角色归属仍由 Alfresco 组承载（GROUP_ROLE_*），本端点只读展示不直接改组——
 * 避免双写源；密级是 ams 侧自有属性，可安全直写。
 *
 * Alfresco 读取走 admin 特权客户端：ACS 中非 admin 账号读他人 people/groups 返回 403，
 * 本端点已由 sys-personnel 功能码闸口限定（保密员/admin），服务端以管理员身份代读。
 */
@RestController
@RequestMapping("/users")
public class UsersController {

  private final AlfrescoAdminClient alfresco;
  private final PermissionService perm;
  private final OperationLogService oplog;
  private final JdbcClient jdbc;

  public UsersController(AlfrescoAdminClient alfresco, PermissionService perm,
                         OperationLogService oplog, DataSource dataSource) {
    this.alfresco = alfresco;
    this.perm = perm;
    this.oplog = oplog;
    this.jdbc = JdbcClient.create(dataSource);
  }

  /** 用户视图列表：people（名）× ext（工号/部门/岗位/密级）× 组（角色） */
  @GetMapping
  public List<Map<String, Object>> list(
      @RequestHeader(value = "X-User-Id", required = false) String userId,
      @RequestHeader(value = "X-Alfresco-Ticket", required = false) String ticket) {
    AuthUser me = perm.me(userId, ticket);
    perm.requireFunction(me, "sys-personnel");

    Map<String, Map<String, Object>> extByUser = new HashMap<>();
    jdbc.sql("SELECT user_id, emp_no, position, dept_path, supervisor_id, avatar_color, security_clearance FROM ams_user_ext")
        .query((rs, i) -> {
          Map<String, Object> m = new HashMap<String, Object>();
          m.put("empNo", rs.getString("emp_no"));
          m.put("position", rs.getString("position") == null ? "" : rs.getString("position"));
          m.put("dept", rs.getString("dept_path") == null ? "" : rs.getString("dept_path"));
          m.put("supervisorId", rs.getString("supervisor_id") == null ? "" : rs.getString("supervisor_id"));
          m.put("avatarColor", rs.getString("avatar_color") == null ? "" : rs.getString("avatar_color"));
          m.put("clearance", rs.getInt("security_clearance"));
          return Map.entry(rs.getString("user_id"), m);
        })
        .list()
        .forEach(e -> extByUser.put(e.getKey(), e.getValue()));

    List<Map<String, Object>> out = new ArrayList<>();
    for (Map<String, Object> person : alfresco.listPeople()) {
      String account = String.valueOf(person.get("id"));
      // 角色解析与 AuthService 同一规则：GROUP_ROLE_XXX → RoleKey；admin 恒 admin
      List<String> roles = new ArrayList<>();
      if ("admin".equals(account)) {
        roles.add("admin");
      } else {
        for (String g : alfresco.personGroupIds(account)) {
          String upper = g.toUpperCase();
          if (upper.startsWith("GROUP_ROLE_")) roles.add(upper.substring("GROUP_ROLE_".length()).toLowerCase());
        }
        if (roles.isEmpty()) roles.add("employee");
      }

      Map<String, Object> ext = extByUser.getOrDefault(account, Map.of());
      Map<String, Object> view = new HashMap<>();
      view.put("account", account);
      String firstName = String.valueOf(person.getOrDefault("firstName", ""));
      String lastName = String.valueOf(person.getOrDefault("lastName", ""));
      String display = String.valueOf(person.getOrDefault("displayName", ""));
      view.put("name", !display.isBlank() && !"null".equals(display) ? display
          : (firstName + lastName).isBlank() ? account : firstName + lastName);
      view.put("enabled", Boolean.TRUE.equals(person.get("enabled")));
      view.put("empNo", ext.getOrDefault("empNo", ""));
      view.put("dept", ext.getOrDefault("dept", ""));
      view.put("position", ext.getOrDefault("position", ""));
      view.put("supervisorId", ext.getOrDefault("supervisorId", ""));
      view.put("avatarColor", ext.getOrDefault("avatarColor", ""));
      view.put("clearance", ext.getOrDefault("clearance", 1));
      view.put("roles", roles);
      out.add(view);
    }
    return out;
  }

  public record ClearanceRequest(Integer clearance) {}

  /** 人员密级调整（0普通/1内部/2秘密/3机密）；写 ext 并上审计链 */
  @PutMapping("/{id}/clearance")
  public Map<String, Object> updateClearance(
      @RequestHeader(value = "X-User-Id", required = false) String userId,
      @RequestHeader(value = "X-Alfresco-Ticket", required = false) String ticket,
      @PathVariable String id,
      @RequestBody ClearanceRequest req) {
    AuthUser me = perm.me(userId, ticket);
    perm.requireFunction(me, "sys-personnel");
    if (req.clearance() == null || req.clearance() < 0 || req.clearance() > 3) {
      throw BizException.badRequest("VALIDATION_FAILED", "密级取值须为 0普通/1内部/2秘密/3机密");
    }

    Integer old = jdbc.sql("SELECT security_clearance FROM ams_user_ext WHERE user_id = ?")
        .param(id).query(Integer.class).optional().orElse(null);
    if (old == null) {
      throw BizException.notFound("用户扩展档案 " + id + "（请先完成 seed 建档）");
    }
    jdbc.sql("UPDATE ams_user_ext SET security_clearance = ?, updated_at = now() WHERE user_id = ?")
        .param(req.clearance()).param(id).update();

    String[] labels = {"普通", "内部", "秘密", "机密"};
    oplog.append(me.account(), me.name(), "人员密级变更", id, null,
        "人员 " + id + " 密级 " + labels[old] + " → " + labels[req.clearance()]);
    return Map.of("account", id, "clearance", req.clearance());
  }
}
