package com.finance.ams.yonyou;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.IOException;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.List;

import org.apache.fontbox.ttf.TrueTypeCollection;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.font.PDType0Font;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.pdfbox.pdmodel.font.Standard14Fonts;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

/**
 * 记账凭证版式文件渲染器（PDFBox）
 *
 * 业务背景：用友 BIP 沙箱凭证无电子附件（queryBusinessFiles 全空），
 * 而归档件必须有内容文件；电子会计凭证归档本就要求版式文件（79号令/封装包规范）。
 * 因此同步时按凭证数据生成标准版式 PDF 作为件的电子文件。
 *
 * 版式：A4 纵向，标题 + 头部信息 + 分录表（摘要/科目/借方/贷方）+ 合计（中文大写）+ 签署行。
 * 分录超 18 行自动分页。
 *
 * 中文字体：PDFBox 标准 14 字体不含 CJK，按 msyh.ttc → simsun.ttc → simhei.ttf 顺序
 * 探测系统字体（TrueTypeCollection 取字体制 PDFType0Font 子集嵌入）；全无则回退
 * Helvetica（中文将缺字，仅兜底不断流，日志告警）。
 */
@Component
public class VoucherPdfRenderer {

  private static final Logger log = LoggerFactory.getLogger(VoucherPdfRenderer.class);

  private static final float MARGIN = 40f;
  private static final float PAGE_W = PDRectangle.A4.getWidth();   // 595
  private static final float PAGE_H = PDRectangle.A4.getHeight();  // 842
  private static final int ROWS_PER_PAGE = 18;

  /** 分录行（渲染输入） */
  public record EntryRow(int line, String summary, String subjectCode, String subjectName,
                         BigDecimal debit, BigDecimal credit) {}

  /** 凭证版式输入（header 视图） */
  public record VoucherView(String voucherNo, String voucherWord, String voucherCategory,
                            String period, String voucherDate, String accbookName,
                            String preparer, String auditor, String tallyMan,
                            Integer attachedBillCount, String sourceSystem,
                            BigDecimal debitTotal, BigDecimal creditTotal,
                            String description, List<EntryRow> entries) {}

  /** 加载的字体句柄：font + 需随文档生命周期关闭的底层集合 */
  private record FontHandle(PDType0Font font, TrueTypeCollection ttc) implements AutoCloseable {
    @Override public void close() throws IOException { if (ttc != null) ttc.close(); }
  }

  /** 探测并加载 CJK 字体（调用方负责在文档保存后 close） */
  private FontHandle loadCjkFont(PDDocument doc) throws IOException {
    String[][] candidates = {
        {"C:/Windows/Fonts/msyh.ttc", "Microsoft YaHei"},
        {"C:/Windows/Fonts/msyhbd.ttc", "Microsoft YaHei"},
        {"C:/Windows/Fonts/simsun.ttc", "SimSun"},
        {"C:/Windows/Fonts/simhei.ttf", null},   // 单字体 ttf
        {"/usr/share/fonts/truetype/wqy/wqy-microhei.ttc", "WenQuanYi Micro Hei"},
        {"/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc", "Noto Sans CJK SC"},
    };
    for (String[] c : candidates) {
      File f = new File(c[0]);
      if (!f.isFile()) continue;
      try {
        // 用 TrueTypeCollection 打开字体文件：.ttc 是字体集合，顶层无 'head' 表，
        // 直接 PDType0Font.load(file) 会报 'head' table is mandatory；必须取集合内首个字体。
        // 对 .ttf 同样取首个字体，且无需精确字体名匹配，规避 wqy/noto 等 PostScript 名差异。
        TrueTypeCollection ttc = new TrueTypeCollection(f);
        final org.apache.fontbox.ttf.TrueTypeFont[] holder = {null};
        ttc.processAllFonts(font -> { if (holder[0] == null) holder[0] = font; });
        org.apache.fontbox.ttf.TrueTypeFont raw = holder[0];
        if (raw == null) { ttc.close(); continue; }
        return new FontHandle(PDType0Font.load(doc, raw, true), ttc);
      } catch (Exception e) {
        log.warn("CJK 字体候选加载失败 {}: {}", c[0], e.getMessage());
      }
    }
    log.warn("未找到任何 CJK 字体，凭证 PDF 中文将缺字（回退 Helvetica）");
    return new FontHandle(null, null);
  }

  /** 渲染凭证版式 PDF → 字节数组 */
  public byte[] render(VoucherView v) {
    try (PDDocument doc = new PDDocument()) {
      FontHandle fh = loadCjkFont(doc);
      try {
        PDType1Font latin = new PDType1Font(Standard14Fonts.FontName.HELVETICA);
        List<List<EntryRow>> pages = paginate(v.entries(), ROWS_PER_PAGE);
        for (int p = 0; p < pages.size(); p++) {
          PDPage page = new PDPage(PDRectangle.A4);
          doc.addPage(page);
          try (PDPageContentStream cs = new PDPageContentStream(doc, page)) {
            renderPage(cs, fh.font, latin, v, pages.get(p), p + 1, pages.size());
          }
        }
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        doc.save(out);
        return out.toByteArray();
      } finally {
        fh.close();
      }
    } catch (IOException e) {
      throw new IllegalStateException("凭证版式 PDF 生成失败: " + e.getMessage(), e);
    }
  }

  private void renderPage(PDPageContentStream cs, PDType0Font cjk, PDType1Font latin,
                          VoucherView v, List<EntryRow> rows, int pageNo, int pageCount) throws IOException {
    boolean firstPage = pageNo == 1;
    float y = PAGE_H - MARGIN;

    if (firstPage) {
      // 标题
      String title = "记 账 凭 证";
      float tw = textWidth(cjk, latin, title, 20);
      text(cs, cjk, latin, (PAGE_W - tw) / 2, y, title, 20, true);
      y -= 22;
      // 标题下信息：凭证字号（左） 期间（中） 附单据数（右）
      text(cs, cjk, latin, MARGIN, y, "凭证字号：" + safe(v.voucherNo()), 10, false);
      String periodText = "会计期间：" + safe(v.period());
      text(cs, cjk, latin, (PAGE_W - textWidth(cjk, latin, periodText, 10)) / 2, y, periodText, 10, false);
      String attach = "附单据 " + (v.attachedBillCount() == null ? 0 : v.attachedBillCount()) + " 张";
      text(cs, cjk, latin, PAGE_W - MARGIN - textWidth(cjk, latin, attach, 10), y, attach, 10, false);
      y -= 14;
      text(cs, cjk, latin, MARGIN, y, "核算单位：" + safe(v.accbookName()), 10, false);
      String dateText = "制单日期：" + safe(v.voucherDate());
      text(cs, cjk, latin, PAGE_W - MARGIN - textWidth(cjk, latin, dateText, 10), y, dateText, 10, false);
      y -= 8;
    } else {
      // 续页眉
      text(cs, cjk, latin, MARGIN, y, "记账凭证（续）  凭证字号：" + safe(v.voucherNo()), 10, false);
      y -= 8;
    }

    // ═══ 分录表格 ═══
    float tableW = PAGE_W - MARGIN * 2;
    float[] colW = {tableW * 0.34f, tableW * 0.30f, tableW * 0.18f, tableW * 0.18f};
    String[] heads = {"摘    要", "会 计 科 目", "借 方 金 额", "贷 方 金 额"};
    float rowH = 20f;

    // 表头
    y = drawRow(cs, cjk, latin, y, colW, heads, rowH, true, true);
    // 分录行
    for (EntryRow r : rows) {
      String subject = (r.subjectCode() == null ? "" : r.subjectCode() + " ") + safe(r.subjectName());
      y = drawRow(cs, cjk, latin, y, colW, new String[]{
          safe(r.summary()), subject, money(r.debit()), money(r.credit())}, rowH, false, false);
    }
    // 合计行（每页末行显示；仅最后一页出大写）
    boolean last = pageNo == pageCount;
    String cap = last ? "合计（大写）" + toChineseCapital(nz(v.debitTotal())) : "合计";
    y = drawRow(cs, cjk, latin, y, colW, new String[]{
        cap, "", money(v.debitTotal()), money(v.creditTotal())}, rowH, true, false);

    if (last) {
      y -= 16;
      // 签署行
      text(cs, cjk, latin, MARGIN, y, "制单人：" + safe(v.preparer()), 10, false);
      text(cs, cjk, latin, MARGIN + 140, y, "审核人：" + safe(v.auditor()), 10, false);
      text(cs, cjk, latin, MARGIN + 280, y, "记账人：" + safe(v.tallyMan()), 10, false);
      text(cs, cjk, latin, MARGIN + 420, y, "来源：" + safe(v.sourceSystem()), 10, false);
      if (v.description() != null && !v.description().isBlank()) {
        y -= 14;
        text(cs, cjk, latin, MARGIN, y, "摘要：" + safe(v.description()), 9, false);
      }
    }
    // 页脚页码
    if (pageCount > 1) {
      String pn = "第 " + pageNo + " / " + pageCount + " 页";
      text(cs, cjk, latin, (PAGE_W - textWidth(cjk, latin, pn, 9)) / 2, MARGIN - 10, pn, 9, false);
    }
  }

  /** 画一行（含上下框线与竖线），返回下一行顶 y */
  private float drawRow(PDPageContentStream cs, PDType0Font cjk, PDType1Font latin,
                        float y, float[] colW, String[] cells, float rowH,
                        boolean bold, boolean header) throws IOException {
    float x0 = MARGIN;
    float bottom = y - rowH;
    // 横线
    cs.setLineWidth(header || bold ? 1.2f : 0.6f);
    cs.moveTo(x0, y); cs.lineTo(x0 + sum(colW), y); cs.stroke();
    cs.moveTo(x0, bottom); cs.lineTo(x0 + sum(colW), bottom); cs.stroke();
    // 竖线 + 文字
    float x = x0;
    for (int i = 0; i < colW.length; i++) {
      cs.moveTo(x, y); cs.lineTo(x, bottom); cs.stroke();
      String cell = cells[i] == null ? "" : cells[i];
      // 金额列右对齐，其余左对齐（缩进 4pt）
      float size = 9f;
      float tx;
      if (i >= 2 && !header) {
        tx = x + colW[i] - 4 - textWidth(cjk, latin, cell, size);
      } else {
        tx = x + 4;
      }
      text(cs, cjk, latin, tx, bottom + 6, truncate(cell, 40), size, bold && header);
      x += colW[i];
    }
    cs.moveTo(x, y); cs.lineTo(x, bottom); cs.stroke();
    return bottom;
  }

  /** 写文字：CJK 字体缺失时回退 latin（中文缺字仅兜底） */
  private void text(PDPageContentStream cs, PDType0Font cjk, PDType1Font latin,
                    float x, float y, String s, float size, boolean bold) throws IOException {
    cs.beginText();
    if (cjk != null) {
      cs.setFont(cjk, size);
    } else {
      cs.setFont(latin, size);
    }
    cs.newLineAtOffset(x, y);
    cs.showText(s == null ? "" : s);
    cs.endText();
  }

  private float textWidth(PDType0Font cjk, PDType1Font latin, String s, float size) throws IOException {
    if (s == null || s.isEmpty()) return 0;
    if (cjk != null) return cjk.getStringWidth(s) / 1000 * size;
    return latin.getStringWidth(s.replaceAll("[^\\x20-\\x7E]", "?")) / 1000 * size;
  }

  private static List<List<EntryRow>> paginate(List<EntryRow> rows, int per) {
    List<List<EntryRow>> out = new ArrayList<>();
    if (rows.isEmpty()) { out.add(List.of()); return out; }
    for (int i = 0; i < rows.size(); i += per) out.add(rows.subList(i, Math.min(i + per, rows.size())));
    return out;
  }

  private static String money(BigDecimal v) {
    if (v == null || v.compareTo(BigDecimal.ZERO) == 0) return "";
    return String.format("%,.2f", v.setScale(2, RoundingMode.HALF_UP));
  }

  private static BigDecimal nz(BigDecimal v) { return v == null ? BigDecimal.ZERO : v; }
  private static String safe(String s) { return s == null ? "" : s; }
  private static String truncate(String s, int max) { return s.length() <= max ? s : s.substring(0, max - 1) + "…"; }

  private static float sum(float[] arr) {
    float s = 0;
    for (float v : arr) s += v;
    return s;
  }

  /**
   * 通用报表版式 PDF（科目余额表/利润发生表等）：标题 + 单位行 + 等宽列表格，自动分页。
   */
  public byte[] renderSimpleTable(String title, String accbookName, String[] heads, List<List<String>> rows) {
    try (PDDocument doc = new PDDocument()) {
      FontHandle fh = loadCjkFont(doc);
      try {
        PDType1Font latin = new PDType1Font(Standard14Fonts.FontName.HELVETICA);
        float tableW = PAGE_W - MARGIN * 2;
        float[] colW = new float[heads.length];
        float first = tableW * 0.18f;
        float rest = (tableW - first) / Math.max(heads.length - 1, 1);
        for (int i = 0; i < heads.length; i++) colW[i] = i == 0 ? first : rest;

        List<List<List<String>>> pages = new ArrayList<>();
        for (int i = 0; i < rows.size(); i += ROWS_PER_PAGE + 8) {
          pages.add(rows.subList(i, Math.min(i + ROWS_PER_PAGE + 8, rows.size())));
        }
        if (pages.isEmpty()) pages.add(List.of());

        for (int p = 0; p < pages.size(); p++) {
          PDPage page = new PDPage(PDRectangle.A4);
          doc.addPage(page);
          try (PDPageContentStream cs = new PDPageContentStream(doc, page)) {
            float y = PAGE_H - MARGIN;
            if (p == 0) {
              float tw = textWidth(fh.font, latin, title, 18);
              text(cs, fh.font, latin, (PAGE_W - tw) / 2, y, title, 18, true);
              y -= 20;
              text(cs, fh.font, latin, MARGIN, y, "编制单位：" + (accbookName == null ? "" : accbookName), 10, false);
              y -= 8;
            } else {
              text(cs, fh.font, latin, MARGIN, y, title + "（续）", 10, false);
              y -= 8;
            }
            y = drawRow(cs, fh.font, latin, y, colW, heads, 20f, true, true);
            for (List<String> row : pages.get(p)) {
              y = drawRow(cs, fh.font, latin, y, colW,
                  row.toArray(new String[0]), 18f, false, false);
            }
            if (pages.size() > 1) {
              String pn = "第 " + (p + 1) + " / " + pages.size() + " 页";
              text(cs, fh.font, latin, (PAGE_W - textWidth(fh.font, latin, pn, 9)) / 2, MARGIN - 10, pn, 9, false);
            }
          }
        }
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        doc.save(out);
        return out.toByteArray();
      } finally {
        fh.close();
      }
    } catch (IOException e) {
      throw new IllegalStateException("报表版式 PDF 生成失败: " + e.getMessage(), e);
    }
  }

  // ═══ 人民币大写金额 ═══
  private static final String[] DIGITS = {"零", "壹", "贰", "叁", "肆", "伍", "陆", "柒", "捌", "玖"};
  private static final String[] UNITS = {"", "拾", "佰", "仟"};
  private static final String[] GROUPS = {"", "万", "亿", "万亿"};

  static String toChineseCapital(BigDecimal amount) {
    BigDecimal v = amount.setScale(2, RoundingMode.HALF_UP);
    if (v.compareTo(BigDecimal.ZERO) == 0) return "零元整";
    long integer = v.longValue();
    int jiao = v.remainder(BigDecimal.ONE).movePointRight(1).intValue() % 10;
    int fen = v.remainder(BigDecimal.ONE).movePointRight(2).intValue() % 10;
    StringBuilder sb = new StringBuilder();
    if (integer > 0) {
      String s = String.valueOf(integer);
      int group = 0;
      StringBuilder part = new StringBuilder();
      for (int i = s.length(); i > 0; i -= 4) {
        String seg = s.substring(Math.max(0, i - 4), i);
        String segText = segmentToChinese(seg);
        if (!segText.isEmpty()) {
          part.insert(0, segText + GROUPS[group]);
        } else if (part.length() > 0 && !part.toString().startsWith("零")) {
          part.insert(0, "零");
        }
        group++;
      }
      sb.append(part).append("元");
      if (jiao == 0 && fen == 0) sb.append("整");
    }
    if (jiao > 0) sb.append(DIGITS[jiao]).append("角");
    else if (fen > 0 && integer > 0) sb.append("零");
    if (fen > 0) sb.append(DIGITS[fen]).append("分");
    return sb.toString();
  }

  private static String segmentToChinese(String seg) {
    StringBuilder sb = new StringBuilder();
    boolean zero = false;
    for (int i = 0; i < seg.length(); i++) {
      int d = seg.charAt(i) - '0';
      int unit = seg.length() - 1 - i;
      if (d == 0) {
        zero = true;
      } else {
        if (zero && sb.length() > 0) sb.append("零");
        sb.append(DIGITS[d]).append(UNITS[unit]);
        zero = false;
      }
    }
    return sb.toString();
  }
}
