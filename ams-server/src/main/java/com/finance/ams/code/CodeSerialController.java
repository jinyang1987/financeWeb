package com.finance.ams.code;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.finance.ams.auth.AuthUser;
import com.finance.ams.auth.PermissionService;

/**
 * 档号流水端点：取号（原子递增）与查询当前值
 * 授权（2026-08-18）：见 PermissionService（组卷工作台/档号规则配置双口径）。
 */
@RestController
@RequestMapping("/code")
public class CodeSerialController {

  private final CodeSerialService service;
  private final PermissionService perm;

  public CodeSerialController(CodeSerialService service, PermissionService perm) {
    this.service = service;
    this.perm = perm;
  }

  public record NextRequest(
      @NotBlank String scope,      // BOX | VOLUME | ITEM
      @NotBlank String fondsCode,  // Z001
      @NotBlank String typeCode,   // KP/KB/FB/QT
      @NotNull Integer year,
      String boxNo                 // ITEM 段的父盒作用域（可空）
  ) {}

  public record NextResponse(String scope, String fondsCode, String typeCode, int year, String boxNo, int value) {}

  @PostMapping("/next")
  public NextResponse next(
      @RequestHeader(value = "X-User-Id", required = false) String userId,
      @RequestHeader(value = "X-Alfresco-Ticket", required = false) String ticket,
      @Validated @RequestBody NextRequest req) {
    AuthUser me = perm.me(userId, ticket);
    perm.requireFunction(me, "volume-workspace", "archive-code-config");
    var scope = new CodeSerialService.SerialScope(
        req.scope().toUpperCase(), req.fondsCode().toUpperCase(), req.typeCode().toUpperCase(),
        req.year(), req.boxNo());
    int value = service.next(scope);
    return new NextResponse(scope.scope(), scope.fondsCode(), scope.typeCode(), scope.year(), scope.boxNo(), value);
  }

  @GetMapping("/peek")
  public NextResponse peek(
      @RequestHeader(value = "X-User-Id", required = false) String userId,
      @RequestHeader(value = "X-Alfresco-Ticket", required = false) String ticket,
      String scope, String fondsCode, String typeCode, Integer year, String boxNo) {
    AuthUser me = perm.me(userId, ticket);
    perm.requireFunction(me, "volume-workspace", "archive-code-config");
    var s = new CodeSerialService.SerialScope(
        scope.toUpperCase(), fondsCode.toUpperCase(), typeCode.toUpperCase(), year, boxNo);
    return new NextResponse(s.scope(), s.fondsCode(), s.typeCode(), s.year(), s.boxNo(), service.peek(s));
  }
}
