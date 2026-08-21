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
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import com.finance.ams.api.BizException;
import com.finance.ams.auth.AuthUser;
import com.finance.ams.auth.PermissionService;
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
 * 授权（2026-08-18 三维权限）：
 *   - 查询类：catalog 操作权 + 全宗准入 + 行级过滤（密级/部门/创建人）；
 *   - 内容读取：view/download/print 操作权 + 节点密级 ≤ 人员有效密级；
 *   - 写入类（上传/删除/OCR）：核对工作台功能码。
 */
@RestController
@RequestMapping("/records")
public class RecordController {

  private final RecordService service;
  private final WatermarkService watermarks;
  private final OcrService ocr;
  private final AlfrescoNodeClient nodes;
  private final PermissionService perm;
  private final RecordIndexService index;
  private final org.springframework.context.ApplicationEventPublisher events;

  public RecordController(RecordService service, WatermarkService watermarks,
                          OcrService ocr, AlfrescoNodeClient nodes, PermissionService perm,
                          RecordIndexService index,
                          org.springframework.context.ApplicationEventPublisher events) {
    this.service = service;
    this.watermarks = watermarks;
    this.ocr = ocr;
    this.nodes = nodes;
    this.perm = perm;
    this.index = index;
    this.events = events;
  }

  // ── 上传建件 ──

  @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
  public Map<String, Object> upload(
      @RequestHeader(value = "X-User-Id", required = false) String userId,
      @RequestHeader(value = "X-Alfresco-Ticket", required = false) String ticket,
      @RequestPart("file") MultipartFile file,
      @RequestParam Map<String, String> f) throws Exception {
    AuthUser me = perm.me(userId, ticket);
    // 上传建件 = 收集/整理动作：核对工作台或收集中台功能码 + 全宗准入
    perm.requireFunction(me, "voucher-manager", "archive-rcv", "volume-workspace");
    perm.checkFonds(me, f.get("fondsCode"));

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

  // ── 删除（仅收集池「仅件数据」记录；已组卷须先拆件；v2.6 起逻辑删除入回收站） ──

  @DeleteMapping("/{nodeId}")
  public ResponseEntity<Void> delete(
      @RequestHeader(value = "X-User-Id", required = false) String userId,
      @RequestHeader(value = "X-Alfresco-Ticket", required = false) String ticket,
      @PathVariable String nodeId) {
    AuthUser me = perm.me(userId, ticket);
    perm.requireFunction(me, "voucher-manager");
    service.delete(ticket, me.account(), nodeId);
    return ResponseEntity.noContent().build();
  }

  // ── 回收站（v2.6：逻辑删除件列表 / 恢复 / 彻底删除） ──

  /** GET /recycle?fondsCode= — 回收站件列表（按删除时间倒序；不可搜索、不参与组卷） */
  @GetMapping("/recycle")
  public List<Map<String, Object>> listRecycle(
      @RequestHeader(value = "X-User-Id", required = false) String userId,
      @RequestHeader(value = "X-Alfresco-Ticket", required = false) String ticket,
      @RequestParam String fondsCode) {
    AuthUser me = perm.me(userId, ticket);
    perm.requireFunction(me, "voucher-manager");
    perm.checkFonds(me, fondsCode);
    return service.listRecycle(ticket, fondsCode);
  }

  /** POST /recycle/{nodeId}/restore — 恢复：移回收集池 + 清除删除标记（可重新组卷/检索） */
  @PostMapping("/recycle/{nodeId}/restore")
  public Map<String, Object> restoreRecycle(
      @RequestHeader(value = "X-User-Id", required = false) String userId,
      @RequestHeader(value = "X-Alfresco-Ticket", required = false) String ticket,
      @PathVariable String nodeId) {
    AuthUser me = perm.me(userId, ticket);
    perm.requireFunction(me, "voucher-manager");
    service.restoreRecycle(ticket, nodeId);
    return Map.of("nodeId", nodeId, "restored", true);
  }

  /** DELETE /recycle/{nodeId} — 彻底删除（不可恢复，物理删除；仅回收站内件） */
  @DeleteMapping("/recycle/{nodeId}")
  public ResponseEntity<Void> purgeRecycle(
      @RequestHeader(value = "X-User-Id", required = false) String userId,
      @RequestHeader(value = "X-Alfresco-Ticket", required = false) String ticket,
      @PathVariable String nodeId) {
    AuthUser me = perm.me(userId, ticket);
    perm.requireFunction(me, "voucher-manager");
    service.purgeRecycle(ticket, nodeId);
    return ResponseEntity.noContent().build();
  }

  // ── 组件挂接（先组件再组卷，2026-08-20） ──

  /**
   * PUT /records/{nodeId}/parent — 原始凭证件挂接到所属记账凭证（body.parentRecordId 空=解挂）。
   * 校验链在 RecordService.linkParent：两端 record / 子件必原始凭证 / 父件非原始凭证 / 双方池内 / 同全宗 / 防自环。
   */
  @PutMapping("/{nodeId}/parent")
  public Map<String, Object> linkParent(
      @RequestHeader(value = "X-User-Id", required = false) String userId,
      @RequestHeader(value = "X-Alfresco-Ticket", required = false) String ticket,
      @PathVariable String nodeId,
      @RequestBody(required = false) Map<String, String> body) {
    AuthUser me = perm.me(userId, ticket);
    perm.requireFunction(me, "voucher-manager", "archive-rcv", "volume-workspace");
    perm.checkFonds(me, service.fondsCodeOf(ticket, nodeId));
    String parentId = body == null ? null : body.get("parentRecordId");
    service.linkParent(ticket, nodeId, parentId);
    return Map.of("nodeId", nodeId, "parentRecordId", parentId == null ? "" : parentId);
  }

  // ── 收集池列表 / 全量件列表 ──

  /**
   * GET /records?scope=pool|all
   *   scope=pool（默认）：收集池未组卷件（组卷/核对工作台口径）；
   *   scope=all：全宗下全部件（池 ∪ 案卷库卷内件 ∪ 盒库卷内件），
   *   每条带 volumeId/volumeCode/boxId/boxNo 归属（档案查询/打包/借阅车/统计口径）。
   */
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
      @RequestParam(defaultValue = "500") int maxItems,
      @RequestParam(defaultValue = "pool") String scope) {
    AuthUser me = perm.me(userId, ticket);
    // 目录查看操作权（QX 第 1 位）+ 全宗准入（档案库维度）+ 行级过滤（密级/部门/创建人）
    perm.requireOperation(me, PermissionService.Op.catalog);
    perm.checkFonds(me, fondsCode);
    var q = new RecordService.PoolQuery(fondsCode, archiveType, year, month, keyword, skipCount, maxItems, scope);
    var rowFilter = perm.recordRowFilter(me);
    return "all".equalsIgnoreCase(scope)
        ? service.listAll(ticket, q, rowFilter)
        : service.listPool(ticket, q, rowFilter);
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
    AuthUser me = perm.me(userId, ticket);
    perm.requireOperation(me, PermissionService.Op.catalog);
    return service.listByParent(ticket, volumeId, perm.recordRowFilter(me));
  }

  /**
   * 按档案盒 id 读取盒内全部记录（遍历盒下所有案卷的子件）。
   */
  @GetMapping("/by-box/{boxId}")
  public List<Map<String, Object>> byBox(
      @RequestHeader(value = "X-User-Id", required = false) String userId,
      @RequestHeader(value = "X-Alfresco-Ticket", required = false) String ticket,
      @PathVariable String boxId) {
    AuthUser me = perm.me(userId, ticket);
    perm.requireOperation(me, PermissionService.Op.catalog);
    return service.listByBox(ticket, boxId, perm.recordRowFilter(me));
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
    AuthUser me = perm.me(userId, ticket);
    PermissionService.Op op = download ? PermissionService.Op.download
        : print ? PermissionService.Op.print : PermissionService.Op.view;
    // 临时赋权旁路：生效借阅授权（审批链授权）直通；否则走直接访问闸口（操作权 + 密级上限）
    if (!perm.hasActiveGrant(me.account(), nodeId, op)) {
      // 操作权分级（QX 码）：下载/打印/在线查看分别校验
      perm.requireOperation(me, op);
      // 节点密级 ≤ 人员有效密级（行级过滤在单点读取上的等价闸口）
      Map<String, Object> node = nodes.getNode(ticket, nodeId);
      Object lv = node.get("properties") instanceof Map<?, ?> p ? p.get("finance:securityLevel") : null;
      String nodeLevel = lv == null ? "普通" : String.valueOf(lv);
      if (PermissionService.levelOf(nodeLevel) > perm.effectiveClearance(me)) {
        throw new BizException(HttpStatus.FORBIDDEN, "FORBIDDEN",
            "该文件密级（" + nodeLevel + "）超出您的有效密级，请通过借阅审批申请调阅");
      }
    }
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
    AuthUser me = perm.me(userId, ticket);
    perm.requireFunction(me, "voucher-manager");
    ResponseEntity<byte[]> upstream = service.content(ticket, nodeId);
    String mime = upstream.getHeaders().getContentType() != null
        ? upstream.getHeaders().getContentType().toString() : "";
    String text = ocr.recognize(upstream.getBody(), mime);
    // 写入节点 finance:ocrText → V10 读模型增量投影（正文可全文检索）
    if (!text.isBlank()) {
      nodes.updateNode(ticket, nodeId, Map.of("finance:ocrText", text));
      events.publishEvent(RecordsChangedEvent.refreshOne(nodeId));
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
    AuthUser me = perm.me(userId, ticket);
    perm.requireFunction(me, "voucher-manager", "archive-rcv");
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

  // ── 全文检索读模型端点（V10，2026-08-18） ──

  /**
   * GET /records/search — 服务端真分页全文检索（pg_trgm 任意子串，含 ocrText 正文）。
   * 检索门户页态化主入口；行级权限 SQL 下推 + 内存双重保险。
   * 返回形状与 /records 一致（items/totalItems/skipCount/maxItems），前端 dto 复用。
   */
  @GetMapping("/search")
  public Map<String, Object> search(
      @RequestHeader(value = "X-User-Id", required = false) String userId,
      @RequestHeader(value = "X-Alfresco-Ticket", required = false) String ticket,
      @RequestParam String fondsCode,
      @RequestParam(required = false) String q,
      @RequestParam(required = false) String archiveType,
      @RequestParam(required = false) String category,
      @RequestParam(required = false) Integer year,
      @RequestParam(required = false) Integer month,
      @RequestParam(required = false) String subject,
      @RequestParam(required = false) String dept,
      @RequestParam(required = false) String preparer,
      @RequestParam(required = false) String counterparty,
      @RequestParam(required = false) String documentNo,
      @RequestParam(required = false) String voucherNo,
      @RequestParam(required = false) Double amountFrom,
      @RequestParam(required = false) Double amountTo,
      @RequestParam(required = false) String recordStatus,
      @RequestParam(defaultValue = "0") int skipCount,
      @RequestParam(defaultValue = "20") int maxItems) {
    AuthUser me = perm.me(userId, ticket);
    perm.requireOperation(me, PermissionService.Op.catalog);
    perm.checkFonds(me, fondsCode);
    return index.search(me, new RecordIndexService.SearchQuery(
        fondsCode, q, archiveType, category, year, month, subject, dept, preparer, counterparty,
        documentNo, voucherNo, amountFrom, amountTo, recordStatus,
        Math.max(0, skipCount), Math.min(Math.max(1, maxItems), 200)));
  }

  /** GET /records/facets — 分面下拉（年度/类别/科目/部门/制单人，带权限下推） */
  @GetMapping("/facets")
  public Map<String, Object> facets(
      @RequestHeader(value = "X-User-Id", required = false) String userId,
      @RequestHeader(value = "X-Alfresco-Ticket", required = false) String ticket,
      @RequestParam String fondsCode,
      @RequestParam(required = false) String archiveType,
      @RequestParam(required = false) Integer year) {
    AuthUser me = perm.me(userId, ticket);
    perm.requireOperation(me, PermissionService.Op.catalog);
    perm.checkFonds(me, fondsCode);
    return index.facets(me, fondsCode, archiveType, year);
  }

  /** GET /records/stats — 门户首页统计（总量/已组卷凭证数，带权限下推） */
  @GetMapping("/stats")
  public Map<String, Object> stats(
      @RequestHeader(value = "X-User-Id", required = false) String userId,
      @RequestHeader(value = "X-Alfresco-Ticket", required = false) String ticket,
      @RequestParam String fondsCode) {
    AuthUser me = perm.me(userId, ticket);
    perm.requireOperation(me, PermissionService.Op.catalog);
    perm.checkFonds(me, fondsCode);
    return index.stats(me, fondsCode);
  }

  /** POST /records/index/rebuild — 读模型全量对账（仅系统管理员；带外漂移/启动失败时手动触发） */
  @PostMapping("/index/rebuild")
  public Map<String, Object> rebuildIndex(
      @RequestHeader(value = "X-User-Id", required = false) String userId,
      @RequestHeader(value = "X-Alfresco-Ticket", required = false) String ticket) {
    AuthUser me = perm.me(userId, ticket);
    if (!me.roles().contains(PermissionService.ROLE_ADMIN)) {
      throw new BizException(HttpStatus.FORBIDDEN, "FORBIDDEN", "仅系统管理员可执行读模型对账");
    }
    return index.rebuild();
  }

  // ── 内部 ──

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



