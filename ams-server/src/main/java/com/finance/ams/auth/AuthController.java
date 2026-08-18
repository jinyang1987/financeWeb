package com.finance.ams.auth;

import java.util.Map;

import jakarta.validation.constraints.NotBlank;

import org.springframework.http.ResponseEntity;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 认证端点：登录/登出/会话校验
 */
@RestController
@RequestMapping("/auth")
public class AuthController {

  private final AuthService authService;

  public AuthController(AuthService authService) {
    this.authService = authService;
  }

  public record LoginRequest(@NotBlank String account, @NotBlank String password) {}
  public record LoginResponse(String ticket, AuthUser user) {}

  @PostMapping("/login")
  public LoginResponse login(@Validated @RequestBody LoginRequest req) {
    AuthService.LoginResult result = authService.login(req.account(), req.password());
    return new LoginResponse(result.ticket(), result.user());
  }

  @PostMapping("/logout")
  public ResponseEntity<Void> logout(
      @RequestHeader(value = "X-User-Id", required = false) String userId,
      @RequestHeader(value = "X-Alfresco-Ticket", required = false) String ticket) {
    authService.logout(userId, ticket);
    return ResponseEntity.noContent().build();
  }

  @GetMapping("/me")
  public AuthUser me(
      @RequestHeader("X-User-Id") String userId,
      @RequestHeader("X-Alfresco-Ticket") String ticket) {
    return authService.me(userId, ticket);
  }

  /**
   * 换发有效 Alfresco ticket（供前端 Alfresco 直连：单位管理/组织人员，
   * 走 alf_ticket 参数；其登录 ticket 会过期，而 ams-server 业务接口因内存会话优先不受影响——
   * 故直连需独立换发 admin 凭证 ticket，过期时前端 401 后自动重试本端点）。
   */
  @GetMapping("/alfresco-ticket")
  public Map<String, String> alfrescoTicket() {
    return Map.of("ticket", authService.alfrescoTicket());
  }
}
