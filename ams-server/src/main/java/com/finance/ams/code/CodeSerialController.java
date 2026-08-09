package com.finance.ams.code;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

import org.springframework.http.HttpStatus;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.finance.ams.api.BizException;

/**
 * 档号流水端点：取号（原子递增）与查询当前值
 */
@RestController
@RequestMapping("/code")
public class CodeSerialController {

  private final CodeSerialService service;

  public CodeSerialController(CodeSerialService service) {
    this.service = service;
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
    requireAuth(userId, ticket);
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
    requireAuth(userId, ticket);
    var s = new CodeSerialService.SerialScope(
        scope.toUpperCase(), fondsCode.toUpperCase(), typeCode.toUpperCase(), year, boxNo);
    return new NextResponse(s.scope(), s.fondsCode(), s.typeCode(), s.year(), s.boxNo(), service.peek(s));
  }

  private void requireAuth(String userId, String ticket) {
    if (userId == null || userId.isBlank() || ticket == null || ticket.isBlank()) {
      throw new BizException(HttpStatus.UNAUTHORIZED, "SESSION_EXPIRED", "缺少会话凭据，请重新登录");
    }
  }
}
