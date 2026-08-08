package com.finance.ams.auth;

/**
 * 登录用户视图（与前端 UserAccount 形状对齐）
 */
public record AuthUser(
    String id,
    String account,
    String name,
    String empNo,
    String dept,
    String position,
    java.util.List<String> roles,
    String supervisorId,
    String avatarColor
) {}
