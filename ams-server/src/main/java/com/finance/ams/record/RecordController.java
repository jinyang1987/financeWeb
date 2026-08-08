package com.finance.ams.record;

import java.net.URLEncoder;
import java.util.List;
import java.nio.charset.StandardCharsets;
import java.util.Map;

import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import com.finance.ams.api.BizException;
import com.finance.ams.watermark.WatermarkService;
import com.finance.ams.ocr.OcrService;
import com.finance.ams.alfresco.AlfrescoNodeClient;

/**
 * 件域端点（P1-①）
 *
 *   POST   /records                  上传建件（multipart：file + 元数据字段）
 *   GET    /records                  收集池列表（fondsCode 必传；year/month/archiveType/keyword 过滤）
 *   GET    /records/{nodeId}/content 内容读取（inline 预览 / download 下载）
 *
 * 认证：X-User-Id + X-Alfresco-Ticket 头，调用 Alfresco 全部以用户 ticket 执行（权限生效）。
 */
@RestController
@RequestMapping("/records")
public class RecordController {

  private final RecordService service;
  private final WatermarkService watermarks;
  private final OcrService ocr;
  private final AlfrescoNodeClient nodes;

  public RecordController(RecordService service, WatermarkService watermarks,
                          OcrService ocr, AlfrescoNodeClient nodes) {
    this.service = service;
    this.watermarks = watermarks;
    this.ocr = ocr;
    this.nodes = nodes;
  }

  // ── 上传建件 ──

  @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
  public Map<String, Object> upload(
      @RequestHeader(value = "X-User-Id", required = false) String userId,
      @RequestHeader(value = "X-Alfresco-Ticket", required = false) String ticket,
      @RequestPart("file") MultipartFile file,
      @RequestParam Map<String, String> f) throws Exception {
    requireAuth(userId, ticket);

    var cmd = new RecordService.CreateCmd(
        f.get("fondsCode"),
        f.get("voucherNo"),
        f.get("archiveType"),
        f.get("department"),
        parseDouble(f.get("amount")),
        parseInt(f.get("year")),
        parseInt(f.get("month")),
        f.get("retention"),
        defaultIfBlank(f.get("source"), "digital-native"),
        defaultIfBlank(f.get("carrierType"), "electronic"),
        f.get("preparer"),
        f.get("voucherCategory"),
        f.get("remarks"));

    String filename = file.getOriginalFilename() == null ? "未命名文件" : file.getOriginalFilename();
    String mime = file.getContentType() == null ? "application/octet-stream" : file.getContentType();
    return service.create(userId, ticket, cmd, filename, mime, file.getBytes());
  }

  // ── 删除（仅收集池「仅件数据」记录；已组卷须先拆件） ──

  @DeleteMapping("/{nodeId}")
  public ResponseEntity<Void> delete(
      @RequestHeader(value = "X-User-Id", required = false) String userId,
      @RequestHeader(value = "X-Alfresco-Ticket", required = false) String ticket,
      @PathVariable String nodeId) {
    requireAuth(userId, ticket);
    service.delete(ticket, nodeId);
    return ResponseEntity.noContent().build();
  }

  // ── 收集池列表 ──

  @GetMapping
  public RecordService.PoolResult list(
      @RequestHeader(value = "X-User-Id", required = false) String userId,
      @RequestHeader(value = "X-Alfresco-Ticket", required = false) String ticket,
      @RequestParam String fondsCode,
      @RequestParam(required = false) String archiveType,
      @RequestParam(required = false) Integer year,
      @RequestParam(required = false) Integer month,
      @RequestParam(required = false) String keyword,
      @RequestParam(defaultValue = "0") int skipCount,
      @RequestParam(defaultValue = "500") int maxItems) {
    requireAuth(userId, ticket);
    return service.listPool(ticket,
        new RecordService.PoolQuery(fondsCode, archiveType, year, month, keyword, skipCount, maxItems));
  }

  // ── 卷内件全量读取（P1-③ 读视图） ──

  /**
   * 按案卷 id 读取卷内全部记录（完整 RecordView 格式，含 voucherCategory/subType 等筛选字段）。
   * 供财务分类视图/档案查询使用。
   */
  @GetMapping("/by-volume/{volumeId}")
  public List<Map<String, Object>> byVolume(
      @RequestHeader(value = "X-User-Id", required = false) String userId,
      @RequestHeader(value = "X-Alfresco-Ticket", required = false) String ticket,
      @PathVariable String volumeId) {
    requireAuth(userId, ticket);
    return service.listByParent(ticket, volumeId);
  }

  /**
   * 按档案盒 id 读取盒内全部记录（遍历盒下所有案卷的子件）。
   */
  @GetMapping("/by-box/{boxId}")
  public List<Map<String, Object>> byBox(
      @RequestHeader(value = "X-User-Id", required = false) String userId,
      @RequestHeader(value = "X-Alfresco-Ticket", required = false) String ticket,
      @PathVariable String boxId) {
    requireAuth(userId, ticket);
    return service.listByBox(ticket, boxId);
  }

    // ── 内容读取（预览/下载） ──

  @GetMapping("/{nodeId}/content")
  public ResponseEntity<byte[]> content(
      @RequestHeader(value = "X-User-Id", required = false) String userId,
      @RequestHeader(value = "X-Alfresco-Ticket", required = false) String ticket,
      @PathVariable String nodeId,
      @RequestParam(defaultValue = "false") boolean download,
      @RequestParam(defaultValue = "false") boolean print,
      @RequestParam(defaultValue = "file") String filename) {
    requireAuth(userId, ticket);
    ResponseEntity<byte[]> upstream = service.content(ticket, nodeId);
    MediaType mime = upstream.getHeaders().getContentType() == null
        ? MediaType.APPLICATION_OCTET_STREAM : upstream.getHeaders().getContentType();
    byte[] body = upstream.getBody();

    // P3-2 增强：下载/打印时 PDF 水印烧录
    if ((download || print) && body != null && watermarks.isPdf(mime.toString())) {
      String scene = download ? "download" : "print";
      body = watermarks.burn(body, userId, "", scene);
    }

    String encoded = URLEncoder.encode(filename, StandardCharsets.UTF_8).replace("+", "%20");
    return ResponseEntity.status(upstream.getStatusCode())
        .contentType(mime)
        .header(HttpHeaders.CONTENT_DISPOSITION,
            (download ? "attachment" : "inline") + "; filename*=UTF-8''" + encoded)
        .body(body);
  }

  // ── OCR 识别（P3-3 增强：手动触发） ──

  @PostMapping("/{nodeId}/ocr")
  public Map<String, Object> runOcr(
      @RequestHeader(value = "X-User-Id", required = false) String userId,
      @RequestHeader(value = "X-Alfresco-Ticket", required = false) String ticket,
      @PathVariable String nodeId) {
    requireAuth(userId, ticket);
    ResponseEntity<byte[]> upstream = service.content(ticket, nodeId);
    String mime = upstream.getHeaders().getContentType() != null
        ? upstream.getHeaders().getContentType().toString() : "";
    String text = ocr.recognize(upstream.getBody(), mime);
    // 写入节点 finance:ocrText → Solr 自动索引
    if (!text.isBlank()) {
      nodes.updateNode(ticket, nodeId, Map.of("finance:ocrText", text));
    }
    return Map.of("nodeId", nodeId, "ocrText", text, "length", text.length(), "enabled", ocr.isEnabled());
  }

  /**
   * 无状态 OCR 预识别（上传向导用）：接收文件直接返回识别文本，不建节点。
   * 前端拿到文本后做规则归类（记账凭证/原始凭证）与字段抽取，人工校验后才正式建件。
   */
  @PostMapping(value = "/ocr-scan", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
  public Map<String, Object> ocrScan(
      @RequestHeader(value = "X-User-Id", required = false) String userId,
      @RequestHeader(value = "X-Alfresco-Ticket", required = false) String ticket,
      @RequestPart("file") MultipartFile file) throws Exception {
    requireAuth(userId, ticket);
    String mime = file.getContentType() == null ? "application/octet-stream" : file.getContentType();
    long start = System.currentTimeMillis();
    String text = ocr.recognize(file.getBytes(), mime);
    return Map.of(
        "enabled", ocr.isEnabled(),
        "name", file.getOriginalFilename() == null ? "" : file.getOriginalFilename(),
        "ocrText", text,
        "length", text.length(),
        "elapsedMs", System.currentTimeMillis() - start);
  }

  // ── 内部 ──

  private void requireAuth(String userId, String ticket) {
    if (userId == null || userId.isBlank() || ticket == null || ticket.isBlank()) {
      throw new BizException(HttpStatus.UNAUTHORIZED, "SESSION_EXPIRED", "缺少会话凭据，请重新登录");
    }
  }

  private static Integer parseInt(String s) {
    if (s == null || s.isBlank()) return null;
    try { return Integer.valueOf(s.trim()); } catch (NumberFormatException e) {
      throw BizException.badRequest("VALIDATION_FAILED", "数值参数不合法: " + s);
    }
  }

  private static Double parseDouble(String s) {
    if (s == null || s.isBlank()) return null;
    try { return Double.valueOf(s.trim()); } catch (NumberFormatException e) {
      throw BizException.badRequest("VALIDATION_FAILED", "金额参数不合法: " + s);
    }
  }

  private static String defaultIfBlank(String s, String def) {
    return s == null || s.isBlank() ? def : s;
  }
}



