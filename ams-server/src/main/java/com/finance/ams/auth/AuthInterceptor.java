package com.finance.ams.auth;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;

import com.finance.ams.api.BizException;

/**
 * 全局认证拦截器（2026-08-18）：统一会话闸口
 *
 * 背景：ConfigController 等端点历史上不做任何认证（权限体系自助提权通道），
 * 各 Controller 自行 requireAuth 存在遗漏面。收敛为拦截器统一拦截：
 *
 *   - 放行：POST /auth/login（登录）、/open/v1/**（推送方 Bearer 自有认证）、OPTIONS 预检
 *   - 拦截：其余全部端点必须携带 X-User-Id + X-Alfresco-Ticket 且会话有效
 *     （authService.me 命中内存会话时为纯 map 查询，无 Alfresco 往返开销）
 *
 * 会话验证通过后写入 request attribute（AuthUser），Controller 侧
 * PermissionService.me() 复用同一内存会话，不重复校验。
 */
@Component
public class AuthInterceptor implements HandlerInterceptor {

  public static final String ATTR_USER = "ams.authUser";

  private final AuthService authService;

  public AuthInterceptor(AuthService authService) {
    this.authService = authService;
  }

  @Override
  public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) {
    if ("OPTIONS".equalsIgnoreCase(request.getMethod())) return true;

    String userId = request.getHeader("X-User-Id");
    String ticket = request.getHeader("X-Alfresco-Ticket");
    if (userId == null || userId.isBlank() || ticket == null || ticket.isBlank()) {
      throw new BizException(HttpStatus.UNAUTHORIZED, "SESSION_EXPIRED", "缺少会话凭据，请重新登录");
    }
    AuthUser user = authService.me(userId, ticket);
    request.setAttribute(ATTR_USER, user);
    return true;
  }
}
