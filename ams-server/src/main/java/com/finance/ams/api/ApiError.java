package com.finance.ams.api;

import java.time.OffsetDateTime;

/**
 * 统一错误响应体
 */
public record ApiError(String code, String message, String timestamp) {

  public static ApiError of(String code, String message) {
    return new ApiError(code, message, OffsetDateTime.now().toString());
  }
}
