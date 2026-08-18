package com.finance.ams.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

import com.finance.ams.auth.AuthInterceptor;

/**
 * CORS 配置（开发期前端 vite :5000 直连场景备用；生产走同源代理）
 * + 全局认证拦截器注册（2026-08-18 权限补强）
 */
@Configuration
public class WebConfig implements WebMvcConfigurer {

  @Value("${ams.cors.allowed-origins:http://localhost:5000}")
  private String allowedOrigins;

  private final AuthInterceptor authInterceptor;

  public WebConfig(AuthInterceptor authInterceptor) {
    this.authInterceptor = authInterceptor;
  }

  @Override
  public void addInterceptors(InterceptorRegistry registry) {
    registry.addInterceptor(authInterceptor)
        .addPathPatterns("/**")
        // 登录端点（凭据交换）、健康检查与开放推送（Bearer 自有认证）不拦
        .excludePathPatterns("/auth/login", "/health", "/open/v1/**");
  }

  @Override
  public void addCorsMappings(CorsRegistry registry) {
    registry.addMapping("/**")
        .allowedOrigins(allowedOrigins.split(","))
        .allowedMethods("GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS")
        .allowedHeaders("*")
        .maxAge(3600);
  }
}
