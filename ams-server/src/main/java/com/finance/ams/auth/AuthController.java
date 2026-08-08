package com.finance.ams.auth;

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
}
