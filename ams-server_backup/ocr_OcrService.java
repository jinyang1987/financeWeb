package com.finance.ams.ocr;

import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.File;
import java.nio.file.Files;
import java.nio.file.Path;

import javax.imageio.ImageIO;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import net.sourceforge.tess4j.Tesseract;

/**
 * OCR 服务（P3-3 增强）：Tess4J 识别，结果写 finance:ocrText
 *
 * 编排模式：ams-server 接收图片/PDF → 调 Tesseract 容器或本地 Tess4J →
 * 结果写 Alfresco 节点 finance:ocrText → Solr 自动索引 → 事项检索命中。
 *
 * 配置：ams.ocr.enabled=true/false, ams.ocr.language=chi_sim+eng,
 *       ams.ocr.tess-data-path=/usr/share/tesseract/tessdata
 */
@Service
public class OcrService {

  private static final Logger log = LoggerFactory.getLogger(OcrService.class);

  @Value("${ams.ocr.enabled:false}")
  private boolean enabled;

  @Value("${ams.ocr.language:chi_sim+eng}")
  private String language;

  @Value("${ams.ocr.tess-data-path:#{null}}")
  private String tessDataPath;

  /**
   * 对图片字节执行 OCR，返回识别文本。
   * 未启用或失败时返回空串。
   */
  public String recognize(byte[] imageBytes, String mimeType) {
    if (!enabled) {
      log.debug("OCR 未启用（ams.ocr.enabled=false）");
      return "";
    }
    if (mimeType == null || (!mimeType.startsWith("image/") && !"application/pdf".equals(mimeType))) {
      return "";
    }

    Path tempFile = null;
    try {
      // Tess4J 需要文件路径，写临时文件
      String ext = mimeType.contains("png") ? "png" : mimeType.contains("tiff") ? "tiff" : "jpg";
      tempFile = Files.createTempFile("ocr-", "." + ext);
      Files.write(tempFile, imageBytes);

      Tesseract tess = new Tesseract();
      if (tessDataPath != null && !tessDataPath.isBlank()) {
        tess.setDatapath(tessDataPath);
      }
      tess.setLanguage(language);
      tess.setPageSegMode(3); // 全自动分段

      String result = tess.doOCR(tempFile.toFile());
      log.info("OCR 识别完成: {} 字节 → {} 字符", imageBytes.length, result.length());
      return result.trim();
    } catch (Exception e) {
      log.warn("OCR 识别失败: {}", e.getMessage());
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
