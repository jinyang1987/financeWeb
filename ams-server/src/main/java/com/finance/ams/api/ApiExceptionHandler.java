package com.finance.ams.api;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.FieldError;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.servlet.resource.NoResourceFoundException;

import java.util.stream.Collectors;

/**
 * 统一异常处理：业务异常返回一致的错误结构 {code, message, timestamp}
 */
@RestControllerAdvice
public class ApiExceptionHandler {

  private static final Logger log = LoggerFactory.getLogger(ApiExceptionHandler.class);

  /** 业务异常（Service 层抛出，自带 HTTP 状态与错误码） */
  @ExceptionHandler(BizException.class)
  public ResponseEntity<ApiError> handleBiz(BizException e) {
    return ResponseEntity.status(e.getStatus())
        .body(ApiError.of(e.getCode(), e.getMessage()));
  }

  /** 参数校验失败 */
  @ExceptionHandler(MethodArgumentNotValidException.class)
  public ResponseEntity<ApiError> handleValidation(MethodArgumentNotValidException e) {
    String msg = e.getBindingResult().getFieldErrors().stream()
        .map(FieldError::getField)
        .collect(Collectors.joining(", ")) + " 参数不合法";
    return ResponseEntity.badRequest().body(ApiError.of("VALIDATION_FAILED", msg));
  }

  /** 未映射路径（含已下线端点）→ 404，不再落兜底 500 刷错误日志（2026-08-21） */
  @ExceptionHandler(NoResourceFoundException.class)
  public ResponseEntity<ApiError> handleNoResource(NoResourceFoundException e) {
    return ResponseEntity.status(HttpStatus.NOT_FOUND)
        .body(ApiError.of("NOT_FOUND", "接口不存在: " + e.getResourcePath()));
  }

  /** 兜底 */
  @ExceptionHandler(Exception.class)
  public ResponseEntity<ApiError> handleOther(Exception e) {
    log.error("未处理异常", e);
    return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
        .body(ApiError.of("INTERNAL_ERROR", e.getMessage()));
  }
}
