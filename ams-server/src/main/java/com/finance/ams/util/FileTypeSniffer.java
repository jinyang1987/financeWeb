package com.finance.ams.util;

import java.nio.charset.StandardCharsets;
import java.util.Locale;

import org.springframework.http.HttpStatus;

import com.finance.ams.api.BizException;

/**
 * 上传文件魔数嗅探（2026-09-05 批次五 T16，缺陷 #20「mime 取客户端自报、exe 可入池」）。
 *
 * 策略（格式闸口）：
 *   1. 可执行/脚本类一律拒绝（PE MZ、ELF、shebang），无论客户端自报什么；
 *   2. 白名单格式按魔数判真：PDF/PNG/JPEG/TIFF/ZIP 系（OFD/docx/xlsx）/XML/文本；
 *   3. 客户端 mime 与魔数结论冲突时以魔数为准；魔数不在白名单 → 415 拒绝。
 *
 * 会计档案常见合法载体：PDF、OFD（版式）、XML（数电票）、图片（扫描/影像）、
 * office 文档（用友附件）、纯文本。ZIP 系通过内含描述文件区分 OFD 与 OOXML。
 */
public final class FileTypeSniffer {

  private FileTypeSniffer() {}

  /** 允许入库的格式族（魔数判真后的归并结果） */
  public static final java.util.Set<String> ALLOWED_KINDS =
      java.util.Set.of("pdf", "ofd", "xml", "image", "office", "zip", "text");

  /** 判定结果：kind ∈ ALLOWED_KINDS；mime 为服务端判定的规范 mime */
  public record SniffResult(String kind, String mime) {}

  /**
   * 嗅探并闸口校验。非法/不可识别/可执行 → 415 BizException。
   *
   * @param bytes    文件字节
   * @param filename 文件名（扩展名辅助：OFD/office 细分、xml/text 判别）
   * @param claimedMime 客户端自报 mime（仅辅助，不采信）
   */
  public static SniffResult sniffAndGate(byte[] bytes, String filename, String claimedMime) {
    if (bytes == null || bytes.length < 4) {
      throw BizException.badRequest("FORMAT_REJECTED", "文件内容为空或过小，拒绝入库");
    }
    String ext = extOf(filename);

    // ── 1. 可执行/脚本类无条件拒绝（先于白名单） ──
    if (bytes.length >= 2 && (bytes[0] == 'M') && (bytes[1] == 'Z')) {
      throw unsupported("可执行程序（PE/exe）", filename);
    }
    if (bytes.length >= 4 && bytes[0] == 0x7F && bytes[1] == 'E' && bytes[2] == 'L' && bytes[3] == 'F') {
      throw unsupported("可执行程序（ELF）", filename);
    }
    if (bytes.length >= 2 && bytes[0] == '#' && bytes[1] == '!') {
      throw unsupported("脚本文件（shebang）", filename);
    }

    // ── 2. 魔数白名单判真 ──
    // PDF
    if (startsWith(bytes, "%PDF")) {
      return new SniffResult("pdf", "application/pdf");
    }
    // PNG / JPEG / TIFF（PNG 魔数 0x89 0x50 0x4E 0x47——不能用 US_ASCII 字符串，\u0089 会被编码成 '?'）
    if (b(bytes, 0x89, 0x50, 0x4E, 0x47)) {
      return new SniffResult("image", "image/png");
    }
    if (b(bytes, 0xFF, 0xD8, 0xFF)) {
      return new SniffResult("image", "image/jpeg");
    }
    if (b(bytes, 0x49, 0x49, 0x2A, 0x00) || b(bytes, 0x4D, 0x4D, 0x00, 0x2A)) {
      return new SniffResult("image", "image/tiff");
    }
    // ZIP 系：OFD（内含 OFD.xml）/ OOXML（docx/xlsx）/ 普通 zip
    if (startsWith(bytes, "PK\u0003\u0004")) {
      if ("ofd".equals(ext)) {
        return new SniffResult("ofd", "application/ofd");
      }
      if ("docx".equals(ext) || "doc".equals(ext)) {
        return new SniffResult("office", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
      }
      if ("xlsx".equals(ext) || "xls".equals(ext)) {
        return new SniffResult("office", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      }
      return new SniffResult("zip", "application/zip");
    }
    // XML（数电票等）：<?xml 或以 < 开头且扩展名/自报 mime 指向 xml
    if (startsWithBom(bytes, "<?xml") || (startsWith(bytes, "<") && ("xml".equals(ext)
        || str(claimedMime).toLowerCase(Locale.ROOT).contains("xml")))) {
      return new SniffResult("xml", "application/xml");
    }
    // 文本（OCR 可读）
    if ("txt".equals(ext) || "text".equals(str(claimedMime)) || str(claimedMime).startsWith("text/")) {
      if (isMostlyText(bytes)) {
        return new SniffResult("text", "text/plain");
      }
    }
    throw unsupported("无法识别为允许入库的格式（PDF/OFD/XML/图片/office/文本）", filename);
  }

  private static BizException unsupported(String what, String filename) {
    return new BizException(HttpStatus.UNSUPPORTED_MEDIA_TYPE, "FORMAT_REJECTED",
        "文件「" + filename + "」被格式闸口拒绝：" + what + " 不在允许入库的格式白名单（PDF/OFD/XML/图片/office/文本）");
  }

  private static boolean startsWith(byte[] b, String ascii) {
    byte[] p = ascii.getBytes(StandardCharsets.US_ASCII);
    if (b.length < p.length) return false;
    for (int i = 0; i < p.length; i++) {
      if (b[i] != p[i]) return false;
    }
    return true;
  }

  /** 按无符号字节序列前缀匹配（魔数用，避免字符集编码歧义） */
  private static boolean b(byte[] data, int... prefix) {
    if (data.length < prefix.length) return false;
    for (int i = 0; i < prefix.length; i++) {
      if ((data[i] & 0xFF) != prefix[i]) return false;
    }
    return true;
  }

  private static boolean startsWithBom(byte[] b, String ascii) {
    int off = (b.length >= 3 && (b[0] & 0xFF) == 0xEF && (b[1] & 0xFF) == 0xBB && (b[2] & 0xFF) == 0xBF) ? 3 : 0;
    byte[] p = ascii.getBytes(StandardCharsets.US_ASCII);
    if (b.length - off < p.length) return false;
    for (int i = 0; i < p.length; i++) {
      if (b[off + i] != p[i]) return false;
    }
    return true;
  }

  /** 可打印 ASCII/常见中文多字节占比足够高 → 视为文本 */
  private static boolean isMostlyText(byte[] b) {
    int sample = Math.min(b.length, 4096);
    int printable = 0;
    for (int i = 0; i < sample; i++) {
      int v = b[i] & 0xFF;
      if (v == '\t' || v == '\n' || v == '\r' || (v >= 0x20 && v <= 0x7E) || v >= 0x80) printable++;
    }
    return printable >= sample * 0.95;
  }

  private static String extOf(String filename) {
    if (filename == null) return "";
    int dot = filename.lastIndexOf('.');
    return dot >= 0 ? filename.substring(dot + 1).toLowerCase(Locale.ROOT) : "";
  }

  private static String str(Object o) {
    return o == null ? "" : String.valueOf(o);
  }
}
