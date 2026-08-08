package com.finance.ams.watermark;

import java.awt.Color;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.pdfbox.pdmodel.font.Standard14Fonts;
import org.apache.pdfbox.pdmodel.graphics.state.PDExtendedGraphicsState;
import org.apache.pdfbox.util.Matrix;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.finance.ams.configcenter.ConfigService;

/**
 * 水印烧录服务（P3-2 增强）：PDFBox 逐页平铺文本水印
 *
 * 策略来自 ams_config('watermark')，zustand persist 包装：
 *   {state:{config:{enabled, text, layout, rotation, opacity, fontSize, density}}}
 *
 * 烧录场景：下载（download）/ 打印（print），预览（preview）由前端 canvas 叠加。
 */
@Service
public class WatermarkService {

  private static final Logger log = LoggerFactory.getLogger(WatermarkService.class);
  private final ConfigService config;
  private final ObjectMapper json = new ObjectMapper();

  public WatermarkService(ConfigService config) {
    this.config = config;
  }

  /**
   * 对 PDF 字节流烧录水印，返回烧录后的字节。
   * 非 PDF 或配置关闭时原样返回。
   *
   * @param pdfBytes   原始 PDF 字节
   * @param userName   当前用户姓名（水印文本组成部分）
   * @param empNo      工号
   * @param scene      场景（download/print）
   * @return 烧录后字节（可能与输入相同）
   */
  public byte[] burn(byte[] pdfBytes, String userName, String empNo, String scene) {
    WatermarkConfig cfg = loadConfig();
    if (!cfg.enabled) return pdfBytes;

    String timestamp = LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm"));
    String text = cfg.text
        .replace("{name}", userName != null ? userName : "")
        .replace("{empNo}", empNo != null ? empNo : "")
        .replace("{time}", timestamp)
        .replace("{scene}", "download".equals(scene) ? "下载" : "打印");

    try (PDDocument doc = PDDocument.load(new ByteArrayInputStream(pdfBytes))) {
      PDExtendedGraphicsState gs = new PDExtendedGraphicsState();
      gs.setNonStrokingAlphaConstant(cfg.opacity);
      gs.setStrokingAlphaConstant(cfg.opacity);

      var font = new PDType1Font(Standard14Fonts.FontName.HELVETICA);

      for (PDPage page : doc.getPages()) {
        float pageW = page.getMediaBox().getWidth();
        float pageH = page.getMediaBox().getHeight();

        try (PDPageContentStream cs = new PDPageContentStream(doc, page, PDPageContentStream.AppendMode.APPEND, true, true)) {
          cs.setGraphicsStateParameters(gs);
          cs.setNonStrokingColor(new Color(128, 128, 128));

          if ("tile".equals(cfg.layout)) {
            // 平铺模式：按 density 间距铺满
            float step = cfg.density > 0 ? cfg.density : 200;
            for (float y = -pageH; y < pageH * 2; y += step) {
              for (float x = -pageW; x < pageW * 2; x += step * 1.5f) {
                cs.beginText();
                cs.setFont(font, cfg.fontSize);
                Matrix matrix = Matrix.getRotateInstance(
                    Math.toRadians(cfg.rotation), x, y);
                cs.setTextMatrix(matrix);
                cs.showText(text);
                cs.endText();
              }
            }
          } else {
            // 居中模式：页面中心单行
            cs.beginText();
            cs.setFont(font, cfg.fontSize * 2);
            float textWidth = font.getStringWidth(text) / 1000 * cfg.fontSize * 2;
            Matrix matrix = Matrix.getRotateInstance(
                Math.toRadians(cfg.rotation),
                (pageW - textWidth) / 2, pageH / 2);
            cs.setTextMatrix(matrix);
            cs.showText(text);
            cs.endText();
          }
        }
      }

      ByteArrayOutputStream out = new ByteArrayOutputStream();
      doc.save(out);
      log.info("水印烧录完成: {} 页, 场景={}, 用户={}", doc.getNumberOfPages(), scene, userName);
      return out.toByteArray();
    } catch (Exception e) {
      log.warn("水印烧录失败（返回原文件）: {}", e.getMessage());
      return pdfBytes;
    }
  }

  /** 判断 MIME 是否为 PDF（仅 PDF 可烧录） */
  public boolean isPdf(String mimeType) {
    return "application/pdf".equalsIgnoreCase(mimeType);
  }

  // ═══════════════════ 配置读取 ═══════════════════

  private record WatermarkConfig(
      boolean enabled, String text, String layout,
      float rotation, float opacity, float fontSize, float density) {}

  private WatermarkConfig loadConfig() {
    try {
      var entry = config.get("watermark");
      if (entry.isEmpty()) return defaultConfig();
      JsonNode root = json.readTree(entry.get().valueJson());
      JsonNode c = root.path("state").path("config");
      if (c.isMissingNode()) c = root;
      return new WatermarkConfig(
          c.path("enabled").asBoolean(true),
          c.path("text").asText("{name} {empNo} {time} 仅供{scene}使用"),
          c.path("layout").asText("tile"),
          (float) c.path("rotation").asDouble(-30),
          (float) c.path("opacity").asDouble(0.08),
          (float) c.path("fontSize").asDouble(14),
          (float) c.path("density").asDouble(200));
    } catch (Exception e) {
      return defaultConfig();
    }
  }

  private static WatermarkConfig defaultConfig() {
    return new WatermarkConfig(true,
        "{name} {empNo} {time} 仅供{scene}使用",
        "tile", -30f, 0.08f, 14f, 200f);
  }
}
