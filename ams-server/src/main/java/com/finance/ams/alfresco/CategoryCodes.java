package com.finance.ams.alfresco;

import java.util.Map;

/**
 * 档案类别代码归一化（与前端 volumeStore.toCategoryCode/inferTypeCode 严格对齐）
 *
 * 两套类别代码体系：
 *   DA/T 数字代码（01-04）—— 档号段用（件/卷的 archiveTypeCode）
 *   视图大类代码（KP/KB/FB/QT）—— 目录归类/档案盒/分类视图用
 * 归档归类必须先归一，否则移交案卷落不进对应类型目录（2026-07-18 归档归类 4 根因之一）。
 */
public final class CategoryCodes {

  private CategoryCodes() {}

  /** DA/T 数字代码 → 视图大类代码 */
  private static final Map<String, String> NUM_TO_CAT = Map.of(
      "01", "KP", "02", "KB", "03", "FB", "04", "QT");

  /** 中文类别名 → DA/T 数字代码 */
  private static final Map<String, String> NAME_TO_NUM = Map.of(
      "记账凭证", "01", "会计凭证", "01", "原始凭证", "01",
      "会计账簿", "02",
      "财务报告", "03", "财务报表", "03",
      "其他会计资料", "04");

  /** 视图大类代码 → 中文名 */
  private static final Map<String, String> CAT_TO_NAME = Map.of(
      "KP", "会计凭证", "KB", "会计账簿", "FB", "财务报表", "QT", "其他会计资料");

  /** 中文类别名 → 数字代码（无法识别归 04） */
  public static String inferTypeCode(String archiveType) {
    return NAME_TO_NUM.getOrDefault(archiveType == null ? "" : archiveType, "04");
  }

  /** 任意类别标识 → 视图大类代码（KP/KB/FB/QT）。兼容数字代码/字母代码/空值+中文名推断 */
  public static String toCategoryCode(String archiveTypeCode, String archiveType) {
    if (archiveTypeCode != null && NUM_TO_CAT.containsKey(archiveTypeCode)) return NUM_TO_CAT.get(archiveTypeCode);
    if (archiveTypeCode != null && CAT_TO_NAME.containsKey(archiveTypeCode)) return archiveTypeCode;
    if (archiveType != null && !archiveType.isBlank()) {
      return NUM_TO_CAT.getOrDefault(inferTypeCode(archiveType), "QT");
    }
    return "QT";
  }

  /** 视图大类代码 → DA/T 数字代码（KP→'01'） */
  public static String toNumericCode(String categoryCode) {
    return switch (categoryCode == null ? "" : categoryCode) {
      case "KP" -> "01";
      case "KB" -> "02";
      case "FB" -> "03";
      default -> "04";
    };
  }

  /** 视图大类代码 → 中文类别名 */
  public static String categoryName(String categoryCode) {
    return CAT_TO_NAME.getOrDefault(categoryCode, "其他会计资料");
  }

  /** 保管期限 → 期限代码（与前端 inferRetentionCode 对齐：永久→Y，30年→D30，10年→D10） */
  public static String inferRetentionCode(String retention) {
    if (retention == null || retention.isBlank()) return "D30";
    if ("永久".equals(retention)) return "Y";
    var m = java.util.regex.Pattern.compile("(\\d+)").matcher(retention);
    return m.find() ? "D" + m.group(1) : "D30";
  }
}
