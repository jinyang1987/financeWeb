package com.finance.ams.auth;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;

import javax.sql.DataSource;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;

import com.finance.ams.alfresco.AlfrescoClient;
import com.finance.ams.alfresco.AlfrescoAdminClient;
import com.finance.ams.api.BizException;

/**
 * 认证服务：账密 → Alfresco ticket → 会话（内存，滑动过期）+ 角色解析
 *
 * 角色解析：Alfresco 组 GROUP_ROLE_XXX → RoleKey（dept_manager/cfo/hrvp/archivist/...）；
 * 内置 admin 账号恒为 admin 角色。
 */
@Service
public class AuthService {

  private static final Logger log = LoggerFactory.getLogger(AuthService.class);
  private static final Duration SESSION_TTL = Duration.ofHours(12);

  private final AlfrescoClient alfresco;
  private final AlfrescoAdminClient alfrescoAdmin;
  private final JdbcClient jdbc;

  /** ticket → 会话 */
  private final Map<String, SessionRecord> sessions = new ConcurrentHashMap<>();

  private record SessionRecord(String userId, String ticket, AuthUser user, Instant lastAccess) {}

  public AuthService(AlfrescoClient alfresco, AlfrescoAdminClient alfrescoAdmin, DataSource dataSource) {
    this.alfresco = alfresco;
    this.alfrescoAdmin = alfrescoAdmin;
    this.jdbc = JdbcClient.create(dataSource);
  }

  /** 登录：账密 → ticket → 用户视图 */
  public LoginResult login(String account, String password) {
    final String ticket;
    try {
      ticket = alfresco.loginTicket(account, password);
    } catch (Exception e) {
      throw BizException.badRequest("AUTH_FAILED", "用户名或密码错误");
    }
    AuthUser user = buildUser(account, ticket);
    sessions.put(ticket, new SessionRecord(account, ticket, user, Instant.now()));
    log.info("用户登录: {} (roles={})", account, user.roles());
    return new LoginResult(ticket, user);
  }

  /** 会话校验（前端刷新恢复）：ticket + userId → 用户视图 */
  public AuthUser me(String userId, String ticket) {
    SessionRecord rec = sessions.get(ticket);
    if (rec == null || !rec.userId().equals(userId) ||
        rec.lastAccess().plus(SESSION_TTL).isBefore(Instant.now())) {
      // 内存会话不命中（服务重启后），尝试用 ticket 直接校验重建
      try {
        AuthUser user = buildUser(userId, ticket);
        sessions.put(ticket, new SessionRecord(userId, ticket, user, Instant.now()));
        return user;
      } catch (Exception e) {
        throw new BizException(HttpStatus.UNAUTHORIZED, "SESSION_EXPIRED", "会话已过期，请重新登录");
      }
    }
    sessions.put(ticket, new SessionRecord(rec.userId(), ticket, rec.user(), Instant.now()));
    return rec.user();
  }

  /** 登出：销毁会话 + Alfresco ticket */
  public void logout(String userId, String ticket) {
    if (ticket != null) {
      sessions.remove(ticket);
      alfresco.deleteTicket(userId, ticket);
    }
  }

  /** 为前端 Alfresco 直连换发有效 ticket（服务端 admin 凭证，自动续期） */
  public String alfrescoTicket() {
    return alfrescoAdmin.getAdminTicket();
  }

  // ── 内部 ──

  @SuppressWarnings("unchecked")
  private AuthUser buildUser(String account, String ticket) {
    Map<String, Object> person;
    List<String> groups;
    try {
      person = alfresco.validateTicket(account, ticket);
      groups = alfresco.personGroupIds(account, ticket);
    } catch (Exception e) {
      throw new BizException(HttpStatus.UNAUTHORIZED, "SESSION_EXPIRED", "ticket 校验失败");
    }

    // 姓名
    String firstName = (String) person.getOrDefault("firstName", "");
    String lastName = (String) person.getOrDefault("lastName", "");
    String display = (String) person.getOrDefault("displayName", "");
    String name = !display.isBlank() ? display : (firstName + lastName).isBlank() ? account : firstName + lastName;

    // 角色：GROUP_ROLE_XXX → RoleKey；admin 恒 admin
    List<String> roles = new ArrayList<>();
    if ("admin".equals(account)) {
      roles.add("admin");
    } else {
      for (String g : groups) {
        String upper = g.toUpperCase();
        if (upper.startsWith("GROUP_ROLE_")) {
          roles.add(upper.substring("GROUP_ROLE_".length()).toLowerCase());
        }
      }
      if (roles.isEmpty()) roles.add("employee");
    }

    // 扩展字段（ams_user_ext，P0-6 seed 后有值）
    Optional<Map<String, Object>> ext = jdbc.sql(
            "SELECT emp_no, position, dept_path, supervisor_id, avatar_color FROM ams_user_ext WHERE user_id = ?")
        .param(account)
        .query((rs, i) -> Map.<String, Object>of(
            "emp_no", rs.getString("emp_no"),
            "position", rs.getString("position") == null ? "" : rs.getString("position"),
            "dept_path", rs.getString("dept_path") == null ? "" : rs.getString("dept_path"),
            "supervisor_id", rs.getString("supervisor_id") == null ? "" : rs.getString("supervisor_id"),
            "avatar_color", rs.getString("avatar_color") == null ? "" : rs.getString("avatar_color")))
        .optional();

    String supervisor = ext.map(e -> (String) e.get("supervisor_id")).orElse("");
    return new AuthUser(
        account,
        account,
        name,
        ext.map(e -> (String) e.get("emp_no")).orElse(""),
        ext.map(e -> (String) e.get("dept_path")).orElse(""),
        ext.map(e -> (String) e.get("position")).orElse(""),
        roles,
        supervisor.isBlank() ? null : supervisor,
        ext.map(e -> (String) e.get("avatar_color")).orElse(null));
  }

  public record LoginResult(String ticket, AuthUser user) {}
}
