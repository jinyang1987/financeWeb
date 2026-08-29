package com.finance.ams.util;

import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.List;

/**
 * 内容哈希工具（2026-08-29 T1 真实性底座）。
 * 全系统唯一的文件内容摘要口径：SHA-256，64 位小写 hex。
 */
public final class HashUtil {

  private HashUtil() {}

  /** 字节内容 SHA-256（小写 hex，64 字符） */
  public static String sha256Hex(byte[] bytes) {
    try {
      MessageDigest md = MessageDigest.getInstance("SHA-256");
      byte[] digest = md.digest(bytes);
      StringBuilder sb = new StringBuilder(64);
      for (byte b : digest) sb.append(Character.forDigit((b >> 4) & 0xF, 16)).append(Character.forDigit(b & 0xF, 16));
      return sb.toString();
    } catch (NoSuchAlgorithmException e) {
      throw new IllegalStateException("JDK 缺少 SHA-256", e);
    }
  }

  /**
   * 案卷聚合摘要：卷内件按件号排序后的件哈希依次拼接（换行分隔）再取 SHA-256。
   * 登记（confirm 赋号时）与复核（hash-verify / 巡检）必须使用同一口径，严禁各自实现。
   */
  public static String aggregateSha256(List<String> itemHashes) {
    return sha256Hex(String.join("\n", itemHashes).getBytes(java.nio.charset.StandardCharsets.UTF_8));
  }

  /** 合法 SHA-256 hex 判定 */
  public static boolean isSha256Hex(String s) {
    return s != null && s.matches("[0-9a-f]{64}");
  }
}
