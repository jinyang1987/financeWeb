package com.finance.ams.ocr;

import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.concurrent.TimeUnit;

import javax.imageio.ImageIO;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.rendering.ImageType;
import org.apache.pdfbox.rendering.PDFRenderer;
import org.apache.pdfbox.text.PDFTextStripper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import net.sourceforge.tess4j.Tesseract;

/**
 * OCR 服务（P3-3）：图片/PDF → 文本，结果用于识别归类与 finance:ocrText 回写
 *
 * 引擎优先级：
 *   1. docker 模式（默认）：`docker exec -i <tesseract 容器> tesseract stdin stdout`
 *      —— AIO compose 里 tesseract4re 容器是工具箱（command=tail -f /dev/null，无 REST 进程），
 *         本机无原生 tesseract，docker exec 是唯一可用引擎。
 *   2. local 模式：Tess4J 原生调用（需宿主机装 tesseract + tessdata），docker 不可用时兜底。
 *
 * PDF 双通道：先 PDFBox 抽文本层（机打/数电票 PDF 零成本、零误差）；
 *            文本层过薄（扫描件）再逐页渲染 300dpi 图 → OCR（页数封顶 ams.ocr.max-pages）。
 *
 * 配置：ams.ocr.enabled=true, ams.ocr.engine=docker|local,
 *       ams.ocr.docker-container=docker-alfresco-aio-tesseract-1,
 *       ams.ocr.language=chi_sim+eng, ams.ocr.max-pages=3, ams.ocr.timeout-seconds=60
 */
@Service
public class OcrService {

  private static final Logger log = LoggerFactory.getLogger(OcrService.class);

  @Value("${ams.ocr.enabled:true}")
  private boolean enabled;

  @Value("${ams.ocr.engine:docker}")
  private String engine;

  @Value("${ams.ocr.docker-container:docker-alfresco-aio-tesseract-1}")
  private String dockerContainer;

  @Value("${ams.ocr.language:chi_sim+eng}")
  private String language;

  @Value("${ams.ocr.tess-data-path:#{null}}")
  private String tessDataPath;

  @Value("${ams.ocr.max-pages:3}")
  private int maxPages;

  @Value("${ams.ocr.timeout-seconds:60}")
  private int timeoutSeconds;

  /** 文本层低于该字符数视为扫描件，转图片 OCR */
  private static final int TEXT_LAYER_MIN_CHARS = 50;

  /**
   * 对图片/PDF 字节执行 OCR（或文本抽取），返回识别文本。
   * 未启用、类型不支持或失败时返回空串。
   */
  public String recognize(byte[] bytes, String mimeType) {
    if (!enabled) {
      log.debug("OCR 未启用（ams.ocr.enabled=false）");
      return "";
    }
    if (bytes == null || bytes.length == 0 || mimeType == null) return "";

    try {
      if ("application/pdf".equals(mimeType)) {
        return recognizePdf(bytes);
      }
      if (mimeType.startsWith("image/")) {
        return ocrImage(bytes, mimeType);
      }
      // T16（缺陷 #21）：OFD 版式文件文本抽取——OFD 为 ZIP 容器，TextObject/TextCode 节点
      // 携带版面文字，直接抽取（零成本、零误差），不依赖 OCR 引擎；失败回退 OCR 无通道。
      if ("application/ofd".equals(mimeType) || mimeType.contains("ofd")) {
        return extractOfdText(bytes);
      }
      return "";
    } catch (Exception e) {
      log.warn("OCR 识别失败: {}", e.getMessage());
      return "";
    }
  }

  /**
   * OFD 文本抽取（T16 全文索引覆盖）：遍历 ZIP 条目，抽取 <TextCode> 文本节点
   * （OFD 版式文字的标准载体）。抽取顺序按条目名（Document→Page 顺序）保证阅读序。
   */
  private String extractOfdText(byte[] bytes) {
    try (java.util.zip.ZipInputStream zis = new java.util.zip.ZipInputStream(new ByteArrayInputStream(bytes))) {
      StringBuilder sb = new StringBuilder();
      java.util.Map<String, String> texts = new java.util.TreeMap<>();
      java.util.zip.ZipEntry entry;
      while ((entry = zis.getNextEntry()) != null) {
        String name = entry.getName();
        if (entry.isDirectory() || !name.toLowerCase().endsWith(".xml")) continue;
        String xml = new String(zis.readAllBytes(), StandardCharsets.UTF_8);
        if (!xml.contains("TextCode")) continue;
        // 逐个 <TextCode ...>文本</TextCode> 抽取（含自闭合空节点跳过）
        java.util.regex.Matcher m = java.util.regex.Pattern
            .compile("<TextCode[^>]*>([^<]*)</TextCode>").matcher(xml);
        StringBuilder pageText = new StringBuilder();
        while (m.find()) {
          String t = m.group(1).trim();
          if (!t.isEmpty()) pageText.append(t);
        }
        if (pageText.length() > 0) texts.put(name, pageText.toString());
      }
      for (String t : texts.values()) sb.append(t).append('\n');
      String out = sb.toString().trim();
      log.info("OFD 文本抽取: {} 字节 → {} 字符（{} 个含文本条目）", bytes.length, out.length(), texts.size());
      return out;
    } catch (Exception e) {
      log.warn("OFD 文本抽取失败: {}", e.getMessage());
      return "";
    }
  }

  // ── PDF：文本层优先，扫描件转图片 OCR ──

  private String recognizePdf(byte[] pdfBytes) {
    try (PDDocument doc = Loader.loadPDF(pdfBytes)) {
      String text = new PDFTextStripper().getText(doc);
      if (text != null && text.trim().length() >= TEXT_LAYER_MIN_CHARS) {
        log.info("PDF 文本层抽取: {} 字符（未走 OCR）", text.trim().length());
        return text.trim();
      }
      // 扫描件：逐页渲染 → OCR
      StringBuilder sb = new StringBuilder();
      PDFRenderer renderer = new PDFRenderer(doc);
      int pages = Math.min(doc.getNumberOfPages(), Math.max(1, maxPages));
      for (int i = 0; i < pages; i++) {
        BufferedImage img = renderer.renderImageWithDPI(i, 300, ImageType.RGB);
        ByteArrayOutputStream buf = new ByteArrayOutputStream();
        ImageIO.write(img, "png", buf);
        String pageText = ocrImage(buf.toByteArray(), "image/png");
        if (!pageText.isBlank()) sb.append(pageText).append('\n');
      }
      return sb.toString().trim();
    } catch (Exception e) {
      log.warn("PDF 识别失败: {}", e.getMessage());
      return "";
    }
  }

  // ── 图片 OCR：docker 优先，local 兜底 ──

  private String ocrImage(byte[] imageBytes, String mimeType) {
    if ("docker".equalsIgnoreCase(engine)) {
      String text = ocrImageViaDocker(imageBytes);
      if (text != null) return text;
      log.warn("docker OCR 失败，尝试 local Tess4J 兜底");
    }
    return ocrImageViaLocalTess4j(imageBytes, mimeType);
  }

  /** docker exec -i <容器> tesseract stdin stdout —— 管道喂字节，无需落盘 */
  private String ocrImageViaDocker(byte[] imageBytes) {
    Process proc = null;
    try {
      proc = new ProcessBuilder(
          "docker", "exec", "-i", dockerContainer,
          "tesseract", "stdin", "stdout", "-l", language, "--dpi", "300")
          .redirectErrorStream(false)
          .start();
      try (var os = proc.getOutputStream()) {
        os.write(imageBytes);
        os.flush();
      }
      boolean done = proc.waitFor(timeoutSeconds, TimeUnit.SECONDS);
      if (!done) {
        proc.destroyForcibly();
        log.warn("docker OCR 超时（{}s）", timeoutSeconds);
        return null;
      }
      String out = new String(proc.getInputStream().readAllBytes(), StandardCharsets.UTF_8);
      if (proc.exitValue() != 0) {
        String err = new String(proc.getErrorStream().readAllBytes(), StandardCharsets.UTF_8);
        log.warn("docker OCR 退出码 {}: {}", proc.exitValue(), err.trim());
        return null;
      }
      log.info("OCR 识别完成(docker): {} 字节 → {} 字符", imageBytes.length, out.trim().length());
      return out.trim();
    } catch (Exception e) {
      log.warn("docker OCR 调用失败: {}", e.getMessage());
      return null;
    } finally {
      if (proc != null && proc.isAlive()) proc.destroyForcibly();
    }
  }

  /** Tess4J 原生兜底（需宿主机安装 tesseract + tessdata） */
  private String ocrImageViaLocalTess4j(byte[] imageBytes, String mimeType) {
    Path tempFile = null;
    try {
      String ext = mimeType != null && mimeType.contains("png") ? "png"
          : mimeType != null && mimeType.contains("tiff") ? "tiff" : "jpg";
      tempFile = Files.createTempFile("ocr-", "." + ext);
      Files.write(tempFile, imageBytes);

      Tesseract tess = new Tesseract();
      if (tessDataPath != null && !tessDataPath.isBlank()) {
        tess.setDatapath(tessDataPath);
      }
      tess.setLanguage(language);
      tess.setPageSegMode(3);
      String result = tess.doOCR(tempFile.toFile());
      log.info("OCR 识别完成(local): {} 字节 → {} 字符", imageBytes.length, result.length());
      return result.trim();
    } catch (Throwable e) {
      // Tess4J 原生库缺失会抛 UnsatisfiedLinkError 等 Error，须一并吞掉
      log.warn("local Tess4J 不可用: {}", e.getMessage());
      return "";
    } finally {
      if (tempFile != null) {
        try { Files.deleteIfExists(tempFile); } catch (Exception ignored) {}
      }
    }
  }

  /** 是否启用 */
  public boolean isEnabled() {
    return enabled;
  }
}
