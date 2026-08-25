package com.finance.ams.inspection;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import javax.sql.DataSource;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.web.client.HttpClientErrorException;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.finance.ams.alfresco.AlfrescoNodeClient;
import com.finance.ams.api.BizException;
import com.finance.ams.configcenter.ConfigService;
import com.finance.ams.record.RecordService;

/**
 * 四性检测引擎（P3-1）：真实性/完整性/可用性/安全性
 *
 * 体系（2026-08-18 V8 起对齐档案行业标准检测项库）：
 *   检测项库 ams_inspection_item（环节 gd/yj/cq × 四性 × 检测项，「四性检测配置」页勾选启用）
 *   → 引擎按 check_type 注册执行器逐项执行 → 结果落库 ams_inspection_report
 *     （四性状态 + detail_json.items 问题明细）→ 支持人工复检留痕（review）。
 *
 * 检测方案微调（ams_config「inspection.plan」）继续生效：
 *   requiredFields（必填字段清单）/ formatWhitelist（格式白名单）/
 *   sensitiveKeywords（敏感词表）/ 四性维度总开关。
 *
 * 卷级检测 runVolume：组卷工作台「运行四性检测」的真实现（卷内件逐项 + 卷级断号/查重/件数一致）。
 */
@Service
public class InspectionService {

  private static final Logger log = LoggerFactory.getLogger(InspectionService.class);
  private static final List<String> DEFAULT_FORMAT_WHITELIST = List.of(
      "application/pdf", "application/ofd", "text/xml", "application/xml",
      "image/jpeg", "image/png", "image/tiff");
  private static final List<String> DEFAULT_REQUIRED = List.of("档号", "凭证号", "会计年度");
  private static final List<String> SECURITY_LEVELS = List.of("普通", "内部", "秘密", "机密");

  /** 中文必填标签 → 节点属性核查 */
  private static final Map<String, java.util.function.Function<Map<String, Object>, Boolean>> REQUIRED_FIELD_CHECKS = Map.of(
      "题名", p -> !str(p.get("finance:title")).isBlank() || !str(p.get("cm:name")).isBlank(),
      "档号", p -> !str(p.get("finance:archiveCode")).isBlank(),
      "凭证号", p -> !str(p.get("finance:voucherNo")).isBlank(),
      "会计年度", p -> p.get("finance:year") != null,
      "金额合计", p -> p.get("finance:amount") != null,
      "责任者", p -> !str(p.get("finance:preparer")).isBlank(),
      "日期", p -> !str(p.get("finance:voucherDate")).isBlank() || !str(p.get("finance:createdDate")).isBlank(),
      "格式", p -> !str(p.get("cm:mimeType")).isBlank()
  );

  /** 格式标签 → mimeType 匹配前缀 */
  private static final Map<String, List<String>> FORMAT_TOKEN_MAP = Map.of(
      "PDF", List.of("application/pdf"),
      "PDF/A", List.of("application/pdf"),
      "OFD", List.of("application/ofd"),
      "XML", List.of("text/xml", "application/xml"),
      "TXT", List.of("text/plain"),
      "JPG", List.of("image/jpeg"),
      "JPEG", List.of("image/jpeg"),
      "PNG", List.of("image/png"),
      "TIFF", List.of("image/tiff"),
      "OFDXML", List.of("application/ofd", "text/xml")
  );

  private final AlfrescoNodeClient nodes;
  private final JdbcClient jdbc;
  private final ConfigService config;
  private final RecordService records;
  private final ObjectMapper json = new ObjectMapper();

  public InspectionService(AlfrescoNodeClient nodes, DataSource dataSource,
                           ConfigService config, RecordService records) {
    this.nodes = nodes;
    this.jdbc = JdbcClient.create(dataSource);
    this.config = config;
    this.records = records;
  }

  // ═══════════════════ 检测项库（V8） ═══════════════════

  /** 检测项列表（配置页渲染） */
  public List<Map<String, Object>> items() {
    return jdbc.sql("SELECT * FROM ams.ams_inspection_item ORDER BY phase, sort, code").query().listOfRows();
  }

  /** 启用/停用检测项（方案 = 标准库的勾选集合） */
  public Map<String, Object> setItemEnabled(String code, boolean enabled) {
    int n = jdbc.sql("UPDATE ams.ams_inspection_item SET enabled=? WHERE code=?")
        .param(enabled).param(code).update();
    if (n == 0) throw BizException.badRequest("ITEM_NOT_FOUND", "检测项不存在: " + code);
    log.info("检测项 {} → {}", code, enabled ? "启用" : "停用");
    return jdbc.sql("SELECT * FROM ams.ams_inspection_item WHERE code=?").param(code).query().listOfRows().get(0);
  }

  /** 某环节已启用的检测项 */
  private List<Map<String, Object>> enabledItems(String phase) {
    return jdbc.sql("SELECT * FROM ams.ams_inspection_item WHERE phase=? AND enabled=true ORDER BY sort, code")
        .param(phase).query().listOfRows();
  }

  /**
   * 移交环节完整口径（2026-08-25）：移交（推送至保管库）是法定检测节点，
   * 须执行完整四性检测 = 移交环节启用项 ∪ 归档环节启用项（同 check_type 时移交项优先，
   * 避免「文件存在性」这类同型检查重复出两份问题明细）。
   */
  private List<Map<String, Object>> mergedTransferItems() {
    Map<String, Map<String, Object>> byType = new LinkedHashMap<>();
    for (Map<String, Object> it : enabledItems("gd")) {
      byType.put(str(it.get("check_type")) + "|" + str(it.get("dimension")), it);
    }
    for (Map<String, Object> it : enabledItems("yj")) {
      byType.put(str(it.get("check_type")) + "|" + str(it.get("dimension")), it);
    }
    return new ArrayList<>(byType.values());
  }

  // ═══════════════════ 检测方案读取（inspection.plan 微调） ═══════════════════

  private record Plan(
      boolean authenticityOn, boolean completenessOn, boolean usabilityOn, boolean securityOn,
      List<String> requiredFields, List<String> formatWhitelist, List<String> sensitiveKeywords) {}

  private Plan loadPlan() {
    try {
      var entry = config.get("inspection.plan");
      if (entry.isEmpty()) return defaultPlan();
      JsonNode root = json.readTree(entry.get().valueJson());
      return new Plan(
          root.path("authenticity").path("hashEnabled").asBoolean(true),
          root.path("completeness").path("metadataRequiredCheck").asBoolean(true),
          true,
          root.path("security").path("sensitiveCheck").asBoolean(true),
          readStringArray(root.path("completeness").path("requiredFields"), DEFAULT_REQUIRED),
          readStringArray(root.path("usability").path("formatWhitelist"), List.of()),
          readStringArray(root.path("security").path("sensitiveKeywords"), List.of()));
    } catch (Exception e) {
      log.warn("读取检测方案失败，按内置口径执行: {}", e.getMessage());
      return defaultPlan();
    }
  }

  private static Plan defaultPlan() {
    return new Plan(true, true, true, true, DEFAULT_REQUIRED, List.of(), List.of());
  }

  private static List<String> readStringArray(JsonNode node, List<String> fallback) {
    if (!node.isArray()) return fallback;
    List<String> out = new ArrayList<>();
    node.forEach(n -> out.add(n.asText()));
    return out;
  }

  // ═══════════════════ 执行上下文 ═══════════════════

  /** 单件检测上下文（records 与卷内件共用） */
  private record RecCtx(String nodeId, String name, Map<String, Object> props, String mimeType, long fileSize) {}

  /** 单项执行结果 */
  private record ItemResult(String code, String name, String dimension, boolean pass, String note, String target) {}

  @SuppressWarnings("unchecked")
  private RecCtx ctxOf(Map<String, Object> entry) {
    Map<String, Object> props = entry.get("properties") instanceof Map<?, ?> p
        ? (Map<String, Object>) p : Map.of();
    Object content = entry.get("content");
    String mimeType = content instanceof Map<?, ?> c ? String.valueOf(c.get("mimeType")) : "";
    long fileSize = content instanceof Map<?, ?> c && c.get("sizeInBytes") instanceof Number n ? n.longValue() : 0;
    Map<String, Object> full = new LinkedHashMap<>(props);
    full.put("cm:name", entry.get("name"));
    full.put("cm:mimeType", mimeType);
    return new RecCtx(String.valueOf(entry.get("id")), String.valueOf(entry.get("name")), full, mimeType, fileSize);
  }

  // ═══════════════════ 检测执行器（check_type → 检查实现） ═══════════════════

  /** 件级执行（volume 级 check_type 在 runVolume 单独处理，此处遇到返回 null 跳过） */
  private ItemResult execRecord(String checkType, String code, String name, String dimension,
                                RecCtx r, Plan plan) {
    Map<String, Object> p = r.props();
    switch (checkType) {
      case "file-present":
        return new ItemResult(code, name, dimension, r.fileSize() > 0,
            r.fileSize() > 0 ? "" : "无电子文件内容（0 字节）", r.nodeId());
      case "hash-registered": {
        boolean has = !str(p.get("finance:digitalHash")).isBlank() || !str(p.get("finance:contentHash")).isBlank();
        return new ItemResult(code, name, dimension, has, has ? "" : "未登记文件摘要（无法校验防篡改）", r.nodeId());
      }
      case "archive-code-format": {
        String code_ = str(p.get("finance:archiveCode"));
        if (code_.isBlank() || code_.contains("-PEND-") || code_.contains("-VPEND-")) {
          return new ItemResult(code, name, dimension, true, "未赋号（归档前占位），不适用", r.nodeId());
        }
        boolean ok = code_.matches("[A-Za-z0-9\\-·]+");
        return new ItemResult(code, name, dimension, ok,
            ok ? "" : "档号含非法字符（仅允许大写字母/数字/- 和 ·）: " + code_, r.nodeId());
      }
      case "required-fields": {
        if (!plan.completenessOn()) return new ItemResult(code, name, dimension, true, "方案未启用，记通过", r.nodeId());
        List<String> missing = new ArrayList<>();
        for (String label : plan.requiredFields()) {
          var check = REQUIRED_FIELD_CHECKS.get(label);
          if (check == null) continue;
          if (!check.apply(p)) missing.add(label);
        }
        return new ItemResult(code, name, dimension, missing.isEmpty(),
            missing.isEmpty() ? "" : "缺少必填字段: " + String.join("、", missing), r.nodeId());
      }
      case "attachment-presence": {
        boolean has = r.fileSize() > 0 || !str(p.get("finance:sourceDocumentIds")).isBlank();
        return new ItemResult(code, name, dimension, has, has ? "" : "无电子文件且未登记原始凭证附件", r.nodeId());
      }
      case "amount-range": {
        Object amount = p.get("finance:amount");
        if (amount == null) return new ItemResult(code, name, dimension, true, "无金额（非凭证类），不适用", r.nodeId());
        double v = amount instanceof Number n ? n.doubleValue() : Double.NaN;
        boolean ok = !Double.isNaN(v) && v >= 0 && v < 1e15;
        return new ItemResult(code, name, dimension, ok, ok ? "" : "金额超出合理值域: " + amount, r.nodeId());
      }
      case "format-whitelist": {
        if (r.mimeType().isBlank()) {
          return new ItemResult(code, name, dimension, false, "电子文件格式未知（无 mimeType）", r.nodeId());
        }
        List<String> allowedMimes = plan.formatWhitelist().isEmpty()
            ? DEFAULT_FORMAT_WHITELIST
            : plan.formatWhitelist().stream()
                .flatMap(f -> FORMAT_TOKEN_MAP.getOrDefault(f.toUpperCase(), List.of(f)).stream())
                .toList();
        boolean ok = allowedMimes.stream().anyMatch(m -> m.equalsIgnoreCase(r.mimeType()));
        return new ItemResult(code, name, dimension, ok,
            ok ? "" : "格式 " + r.mimeType() + " 不在白名单 " + plan.formatWhitelist(), r.nodeId());
      }
      case "metadata-readable": {
        boolean ok = !r.name().isBlank() && !r.props().isEmpty();
        return new ItemResult(code, name, dimension, ok, ok ? "" : "元数据不可读（题名/属性缺失）", r.nodeId());
      }
      case "date-range": {
        Object year = p.get("finance:year");
        Object month = p.get("finance:month");
        boolean ok = true;
        String note = "";
        if (year instanceof Number y && (y.intValue() < 1900 || y.intValue() > 2100)) {
          ok = false; note = "会计年度越界: " + year;
        }
        if (ok && month != null) {
          int m = month instanceof Number mn ? mn.intValue() : parseIntSafe(String.valueOf(month));
          if (m < 1 || m > 12) { ok = false; note = "月份越界: " + month; }
        }
        return new ItemResult(code, name, dimension, ok, note, r.nodeId());
      }
      case "sensitive-pattern": {
        if (!plan.securityOn()) return new ItemResult(code, name, dimension, true, "方案未启用，记通过", r.nodeId());
        String ocrText = str(p.get("finance:ocrText"));
        boolean hit = !ocrText.isBlank() && (ocrText.matches(".*\\d{17}[\\dXx].*") || ocrText.matches(".*\\d{16,19}.*"));
        return new ItemResult(code, name, dimension, !hit, hit ? "OCR 文本命中身份证/银行卡号模式" : "", r.nodeId());
      }
      case "sensitive-keywords": {
        if (!plan.securityOn()) return new ItemResult(code, name, dimension, true, "方案未启用，记通过", r.nodeId());
        String haystack = (str(p.get("finance:ocrText")) + " " + r.name() + " " + str(p.get("finance:recordRemark")));
        for (String kw : plan.sensitiveKeywords()) {
          if (!kw.isBlank() && haystack.contains(kw)) {
            return new ItemResult(code, name, dimension, false, "命中敏感关键词「" + kw + "」", r.nodeId());
          }
        }
        return new ItemResult(code, name, dimension, true, "", r.nodeId());
      }
      case "security-level-valid": {
        String sl = str(p.get("finance:securityLevel"));
        boolean ok = sl.isBlank() || SECURITY_LEVELS.contains(sl);
        return new ItemResult(code, name, dimension, ok, ok ? "" : "密级标识非法: " + sl, r.nodeId());
      }
      default:
        return null; // volume 级或未知类型，件级跳过
    }
  }

  // ═══════════════════ 单件检测 ═══════════════════

  public Map<String, Object> run(String ticket, String nodeId, String phase) {
    Plan plan = loadPlan();
    Map<String, Object> node;
    try {
      node = nodes.getNode(ticket, nodeId);
    } catch (Exception e) {
      throw BizException.badRequest("NODE_NOT_FOUND", "节点不存在: " + nodeId);
    }
    RecCtx ctx = ctxOf(node);
    String ph = phase != null ? phase : "gd";

    List<ItemResult> results = new ArrayList<>();
    for (Map<String, Object> item : enabledItems(ph)) {
      ItemResult r = execRecord(str(item.get("check_type")), str(item.get("code")), str(item.get("name")),
          str(item.get("dimension")), ctx, plan);
      if (r != null) results.add(r);
    }

    return finishReport(ticket, nodeId, "record", ph, ctx, results, plan);
  }

  /** 汇总四性状态 + 落库 + 件 aspect 回写 */
  private Map<String, Object> finishReport(String ticket, String nodeId, String kind, String phase,
                                           RecCtx ctx, List<ItemResult> results, Plan plan) {
    boolean real = dimPass(results, "real", plan.authenticityOn());
    boolean complete = dimPass(results, "complete", plan.completenessOn());
    boolean usable = dimPass(results, "usable", plan.usabilityOn());
    boolean safe = dimPass(results, "safe", plan.securityOn());
    boolean allPass = real && complete && usable && safe;

    String reportId = UUID.randomUUID().toString();
    String now = LocalDateTime.now().format(DateTimeFormatter.ISO_LOCAL_DATE_TIME);

    jdbc.sql("""
        INSERT INTO ams.ams_inspection_report (id, target_node, target_kind, phase,
          real, complete, usable, safe, detail_json, operator, created_at)
        VALUES (?::uuid, ?, ?, ?, ?, ?, ?, ?, ?::jsonb, ?, ?::timestamptz)
        """)
        .param(reportId).param(nodeId).param(kind).param(phase)
        .param(real).param(complete).param(usable).param(safe)
        .param(detailJson(allPass, results, null))
        .param("")
        .param(now)
        .update();

    if (ctx != null) {
      try {
        nodes.updateNode(ticket, nodeId, Map.of(
            "finance:checkReal", real, "finance:checkComplete", complete,
            "finance:checkUsable", usable, "finance:checkSafe", safe,
            "finance:checkedAt", now, "finance:checkReportRef", reportId));
      } catch (Exception e) {
        log.warn("四性结果回写节点失败: {}", e.getMessage());
      }
    }

    log.info("四性检测[{}]: {} → 真{} 完{} 用{} 安{}", kind, nodeId, real, complete, usable, safe);
    Map<String, Object> out = new LinkedHashMap<>();
    out.put("reportId", reportId);
    out.put("nodeId", nodeId);
    out.put("real", real);
    out.put("complete", complete);
    out.put("usable", usable);
    out.put("safe", safe);
    out.put("allPass", allPass);
    out.put("checkedAt", now);
    out.put("issues", issuesOf(results));
    return out;
  }

  /** 维度判定：维度总开关关闭→记通过；该维度无检测项→通过；否则全项通过 */
  private static boolean dimPass(List<ItemResult> results, String dim, boolean dimOn) {
    if (!dimOn) return true;
    return results.stream().filter(r -> r.dimension().equals(dim)).allMatch(ItemResult::pass);
  }

  private static List<Map<String, Object>> issuesOf(List<ItemResult> results) {
    List<Map<String, Object>> issues = new ArrayList<>();
    for (ItemResult r : results) {
      if (!r.pass() && !r.note().isBlank()) {
        Map<String, Object> issue = new LinkedHashMap<>();
        issue.put("dimension", r.dimension());
        issue.put("code", r.code());
        issue.put("name", r.name());
        issue.put("note", r.note());
        issue.put("target", r.target());
        issues.add(issue);
      }
    }
    return issues;
  }

  private String detailJson(boolean allPass, List<ItemResult> results, List<Map<String, Object>> extra) {
    try {
      List<Map<String, Object>> itemViews = new ArrayList<>();
      List<String> notes = new ArrayList<>();
      for (ItemResult r : results) {
        Map<String, Object> v = new LinkedHashMap<>();
        v.put("code", r.code());
        v.put("name", r.name());
        v.put("dimension", r.dimension());
        v.put("pass", r.pass());
        if (!r.note().isBlank()) v.put("note", r.note());
        if (r.target() != null) v.put("target", r.target());
        itemViews.add(v);
        if (!r.pass() && !r.note().isBlank()) notes.add(r.name() + ": " + r.note());
      }
      Map<String, Object> root = new LinkedHashMap<>();
      root.put("allPass", allPass);
      root.put("summary", notes.isEmpty() ? "全部检测项通过" : String.join("; ", notes));
      root.put("items", itemViews);
      if (extra != null) root.put("volumeIssues", extra);
      return json.writeValueAsString(root);
    } catch (Exception e) {
      return "{\"summary\":\"明细序列化失败\"}";
    }
  }

  // ═══════════════════ 批量检测（收集池） ═══════════════════

  /** 对当前全宗收集池全部件执行检测（配置页「立即执行检测」的真实实现） */
  public Map<String, Object> runBatch(String ticket, String fondsCode, String phase) {
    var pool = records.listPool(ticket,
        new RecordService.PoolQuery(fondsCode, null, null, null, null, 0, 5000));
    int checked = 0, passed = 0, failed = 0;
    List<String> failedNames = new ArrayList<>();
    for (Map<String, Object> item : pool.items()) {
      try {
        Map<String, Object> r = run(ticket, String.valueOf(item.get("nodeId")), phase != null ? phase : "gd");
        checked++;
        if (Boolean.TRUE.equals(r.get("allPass"))) passed++;
        else { failed++; failedNames.add(String.valueOf(item.get("name"))); }
      } catch (Exception e) {
        failed++;
        failedNames.add(String.valueOf(item.get("name")) + "（异常: " + e.getMessage() + "）");
        log.warn("批量检测单件失败: {}", item.get("nodeId"), e);
      }
    }
    log.info("批量四性检测完成: 全宗 {} 检测 {} 件，通过 {} 件", fondsCode, checked, passed);
    Map<String, Object> out = new LinkedHashMap<>();
    out.put("checked", checked);
    out.put("passed", passed);
    out.put("failed", failed);
    out.put("failedNames", failedNames.stream().limit(10).toList());
    return out;
  }

  // ═══════════════════ 卷级检测（组卷工作台真实现，2026-08-18） ═══════════════════

  /**
   * 卷级四性检测：卷内件逐项（件级检测项）+ 卷级检测项
   * （凭证号断号 voucher-no-gap / 卷内查重 voucher-no-dup / 件数一致 volume-count-match）。
   * 返回四性状态 + 问题明细；落一行 target_kind='volume' 的汇总报告（detail_json.items 含件级明细）。
   *
   * @param phase 检测环节：gd 归档 / yj 移交 / cq 长期保存；
   *              yj（移交=推送至保管库，法定检测节点，2026-08-25）会合并 gd 环节启用项，
   *              同 check_type 时 yj 项优先，保证移交时执行完整四性口径。
   */
  public Map<String, Object> runVolume(String ticket, String userId, String volumeId) {
    return runVolume(ticket, userId, volumeId, "gd");
  }

  public Map<String, Object> runVolume(String ticket, String userId, String volumeId, String phase) {
    Plan plan = loadPlan();
    Map<String, Object> vol = requireVolume(ticket, volumeId);
    List<Map<String, Object>> children = childRecords(ticket, volumeId);
    if (children.isEmpty()) {
      throw BizException.badRequest("VOLUME_EMPTY", "空案卷无可检测内容");
    }
    children.sort((a, b) -> {
      Integer na = intProp(a, "finance:volumeItemNo");
      Integer nb = intProp(b, "finance:volumeItemNo");
      return Integer.compare(na == null ? Integer.MAX_VALUE : na, nb == null ? Integer.MAX_VALUE : nb);
    });

    List<RecCtx> ctxs = new ArrayList<>();
    for (Map<String, Object> e : children) ctxs.add(ctxOf(e));

    List<Map<String, Object>> items = "yj".equals(phase) ? mergedTransferItems() : enabledItems(phase);
    List<ItemResult> all = new ArrayList<>();

    // ① 件级检测项 × 卷内每件
    for (RecCtx ctx : ctxs) {
      for (Map<String, Object> item : items) {
        ItemResult r = execRecord(str(item.get("check_type")), str(item.get("code")), str(item.get("name")),
            str(item.get("dimension")), ctx, plan);
        if (r != null) all.add(r);
      }
      // 件 aspect 回写（与本件结果一致）
      List<ItemResult> mine = all.stream().filter(x -> x.target() != null && x.target().equals(ctx.nodeId())).toList();
      try {
        nodes.updateNode(ticket, ctx.nodeId(), Map.of(
            "finance:checkReal", mine.stream().filter(x -> x.dimension().equals("real")).allMatch(ItemResult::pass),
            "finance:checkComplete", mine.stream().filter(x -> x.dimension().equals("complete")).allMatch(ItemResult::pass),
            "finance:checkUsable", mine.stream().filter(x -> x.dimension().equals("usable")).allMatch(ItemResult::pass),
            "finance:checkSafe", mine.stream().filter(x -> x.dimension().equals("safe")).allMatch(ItemResult::pass),
            "finance:checkedAt", LocalDateTime.now().format(DateTimeFormatter.ISO_LOCAL_DATE_TIME)));
      } catch (Exception e) {
        log.warn("卷内件四性回写失败 {}: {}", ctx.nodeId(), e.getMessage());
      }
    }

    // ② 卷级检测项
    List<Map<String, Object>> volumeIssues = new ArrayList<>();
    for (Map<String, Object> item : items) {
      String type = str(item.get("check_type"));
      String code = str(item.get("code"));
      String name = str(item.get("name"));
      String dim = str(item.get("dimension"));
      switch (type) {
        case "voucher-no-gap" -> all.add(checkVoucherGap(code, name, dim, ctxs, volumeIssues));
        case "voucher-no-dup" -> all.add(checkVoucherDup(code, name, dim, ctxs, volumeIssues));
        case "volume-count-match" -> all.add(checkVolumeCount(code, name, dim, vol, ctxs, volumeIssues));
        default -> { /* 件级类型已在①执行 */ }
      }
    }

    Map<String, Object> out = finishReport(ticket, volumeId, "volume", phase, null, all, plan);
    // 卷级问题补进报告 detail_json.volumeIssues
    if (!volumeIssues.isEmpty()) {
      jdbc.sql("UPDATE ams.ams_inspection_report SET detail_json = ?::jsonb WHERE id=?::uuid")
          .param(detailJson(Boolean.TRUE.equals(out.get("allPass")), all, volumeIssues))
          .param(String.valueOf(out.get("reportId")))
          .update();
    }
    out.put("itemCount", ctxs.size());
    log.info("卷级四性检测: {}（{} 件）→ 真{} 完{} 用{} 安{}（操作人 {}）",
        volumeId, ctxs.size(), out.get("real"), out.get("complete"), out.get("usable"), out.get("safe"), userId);
    return out;
  }

  /** 凭证号断号：卷内按件号排序的凭证号同前缀连续（非凭证类卷不适用记通过） */
  private ItemResult checkVoucherGap(String code, String name, String dim,
                                     List<RecCtx> ctxs, List<Map<String, Object>> volumeIssues) {
    record VNo(String prefix, long num) {}
    List<VNo> parsed = new ArrayList<>();
    int blank = 0;
    for (RecCtx ctx : ctxs) {
      String vno = str(ctx.props().get("finance:voucherNo"));
      if (vno.isBlank()) { blank++; continue; }
      var m = java.util.regex.Pattern.compile("^(.+?)-(\\d+)$").matcher(vno);
      if (m.matches()) parsed.add(new VNo(m.group(1), Long.parseLong(m.group(2))));
    }
    if (parsed.size() < 2 || blank > ctxs.size() / 2) {
      return new ItemResult(code, name, dim, true, "非凭证类案卷或凭证号不足，不适用", "volume");
    }
    String prefix = parsed.get(0).prefix();
    List<String> gaps = new ArrayList<>();
    for (int i = 1; i < parsed.size(); i++) {
      VNo prev = parsed.get(i - 1), cur = parsed.get(i);
      if (!prev.prefix().equals(cur.prefix())) continue; // 前缀不同的另起序列，不判断号
      for (long g = prev.num() + 1; g < cur.num(); g++) {
        gaps.add(prefix + "-" + g);
      }
    }
    boolean ok = gaps.isEmpty();
    if (!ok) {
      Map<String, Object> vi = new LinkedHashMap<>();
      vi.put("code", code);
      vi.put("note", "凭证号断号 " + gaps.size() + " 处: " + String.join("、", gaps.stream().limit(10).toList())
          + (gaps.size() > 10 ? " …" : ""));
      volumeIssues.add(vi);
    }
    return new ItemResult(code, name, dim, ok,
        ok ? "" : "凭证号断号 " + gaps.size() + " 处（如 " + String.join("、", gaps.stream().limit(5).toList()) + "）", "volume");
  }

  /** 卷内凭证号查重 */
  private ItemResult checkVoucherDup(String code, String name, String dim,
                                     List<RecCtx> ctxs, List<Map<String, Object>> volumeIssues) {
    Map<String, Integer> seen = new LinkedHashMap<>();
    for (RecCtx ctx : ctxs) {
      String vno = str(ctx.props().get("finance:voucherNo"));
      if (!vno.isBlank()) seen.merge(vno, 1, Integer::sum);
    }
    List<String> dups = seen.entrySet().stream().filter(e -> e.getValue() > 1).map(Map.Entry::getKey).toList();
    boolean ok = dups.isEmpty();
    if (!ok) {
      Map<String, Object> vi = new LinkedHashMap<>();
      vi.put("code", code);
      vi.put("note", "卷内凭证号重复: " + String.join("、", dups));
      volumeIssues.add(vi);
    }
    return new ItemResult(code, name, dim, ok, ok ? "" : "卷内凭证号重复: " + String.join("、", dups), "volume");
  }

  /** 卷头件数与卷内实际件数一致 */
  private ItemResult checkVolumeCount(String code, String name, String dim,
                                      Map<String, Object> vol, List<RecCtx> ctxs,
                                      List<Map<String, Object>> volumeIssues) {
    Integer declared = intProp(vol, "finance:volumeTotalItems");
    boolean ok = declared == null || declared == ctxs.size();
    if (!ok) {
      Map<String, Object> vi = new LinkedHashMap<>();
      vi.put("code", code);
      vi.put("note", "卷头登记 " + declared + " 件，实际 " + ctxs.size() + " 件");
      volumeIssues.add(vi);
    }
    return new ItemResult(code, name, dim, ok,
        ok ? "" : "卷头登记 " + declared + " 件 ≠ 实际 " + ctxs.size() + " 件", "volume");
  }

  // ═══════════════════ 人工复检（留痕） ═══════════════════

  /** 人工复检：更新某维度结论 + 复检人/原因/时间写入 detail_json.reviews */
  @SuppressWarnings("unchecked")
  public Map<String, Object> review(String reportId, String dimension, boolean pass, String reason, String reviewer) {
    if (!List.of("real", "complete", "usable", "safe").contains(dimension)) {
      throw BizException.badRequest("VALIDATION_FAILED", "复检维度须为 real/complete/usable/safe");
    }
    if (reason == null || reason.isBlank()) {
      throw BizException.badRequest("VALIDATION_FAILED", "复检原因不能为空（留痕要求）");
    }
    Map<String, Object> row = jdbc.sql("SELECT * FROM ams.ams_inspection_report WHERE id=?::uuid")
        .param(reportId).query().listOfRows().stream().findFirst()
        .orElseThrow(() -> BizException.badRequest("REPORT_NOT_FOUND", "检测报告不存在: " + reportId));

    String now = LocalDateTime.now().format(DateTimeFormatter.ISO_LOCAL_DATE_TIME);
    Map<String, Object> detail;
    try {
      detail = json.readValue(str(row.get("detail_json")), Map.class);
    } catch (Exception e) {
      detail = new LinkedHashMap<>();
    }
    List<Object> reviews = detail.get("reviews") instanceof List<?> l ? new ArrayList<>(l) : new ArrayList<>();
    reviews.add(Map.of(
        "dimension", dimension,
        "status", pass ? "pass" : "fail",
        "reason", reason,
        "reviewer", reviewer == null ? "" : reviewer,
        "at", now));
    detail.put("reviews", reviews);
    detail.put("allPass", computeAllPass(row, dimension, pass));

    String dimCol = switch (dimension) {
      case "real" -> "real"; case "complete" -> "complete";
      case "usable" -> "usable"; default -> "safe";
    };
    jdbc.sql("UPDATE ams.ams_inspection_report SET " + dimCol + "=?, detail_json=?::jsonb WHERE id=?::uuid")
        .param(pass)
        .param(writeJson(detail))
        .param(reportId)
        .update();
    log.info("人工复检: 报告 {} 维度 {} → {}（{}：{}）", reportId, dimension, pass, reviewer, reason);
    return jdbc.sql("SELECT * FROM ams.ams_inspection_report WHERE id=?::uuid")
        .param(reportId).query().listOfRows().get(0);
  }

  private static boolean computeAllPass(Map<String, Object> row, String dim, boolean pass) {
    boolean real = dim.equals("real") ? pass : bool(row.get("real"));
    boolean complete = dim.equals("complete") ? pass : bool(row.get("complete"));
    boolean usable = dim.equals("usable") ? pass : bool(row.get("usable"));
    boolean safe = dim.equals("safe") ? pass : bool(row.get("safe"));
    return real && complete && usable && safe;
  }

  private String writeJson(Map<String, Object> detail) {
    try {
      return json.writeValueAsString(detail);
    } catch (Exception e) {
      return "{}";
    }
  }

  // ═══════════════════ 报告查询 ═══════════════════

  public List<Map<String, Object>> reports(String targetNodeId) {
    if (targetNodeId != null && !targetNodeId.isBlank()) {
      return jdbc.sql("SELECT * FROM ams.ams_inspection_report WHERE target_node=? ORDER BY created_at DESC")
          .param(targetNodeId).query().listOfRows();
    }
    return jdbc.sql("SELECT * FROM ams.ams_inspection_report ORDER BY created_at DESC LIMIT 100")
        .query().listOfRows();
  }

  // ═══════════════════ 内部工具 ═══════════════════

  private Map<String, Object> requireVolume(String ticket, String volumeId) {
    Map<String, Object> vol;
    try {
      vol = nodes.getNode(ticket, volumeId);
    } catch (HttpClientErrorException e) {
      throw BizException.badRequest("NODE_NOT_FOUND", "案卷不存在: " + volumeId);
    }
    if (!"finance:volume".equals(vol.get("nodeType"))) {
      throw BizException.badRequest("NOT_A_VOLUME", "节点不是案卷: " + volumeId);
    }
    return vol;
  }

  @SuppressWarnings("unchecked")
  private List<Map<String, Object>> childRecords(String ticket, String volumeId) {
    List<Map<String, Object>> out = new ArrayList<>();
    int skip = 0;
    while (true) {
      Map<String, Object> list;
      try {
        list = nodes.listChildren(ticket, volumeId, skip, 500);
      } catch (HttpClientErrorException e) {
        throw BizException.badRequest("QUERY_FAILED", "卷内件查询失败: " + e.getMessage());
      }
      for (Map<String, Object> e : (List<Map<String, Object>>) list.get("entries")) {
        Map<String, Object> entry = (Map<String, Object>) e.get("entry");
        if ("finance:record".equals(entry.get("nodeType"))) out.add(entry);
      }
      Map<String, Object> paging = (Map<String, Object>) list.get("pagination");
      if (!Boolean.TRUE.equals(paging.get("hasMoreItems"))) break;
      skip += 500;
    }
    return out;
  }

  @SuppressWarnings("unchecked")
  private static Integer intProp(Map<String, Object> entry, String name) {
    Object props = entry.get("properties");
    if (!(props instanceof Map)) return null;
    Object v = ((Map<String, Object>) props).get(name);
    return v instanceof Number n ? n.intValue() : null;
  }

  private static int parseIntSafe(String s) {
    try { return Integer.parseInt(s.trim()); } catch (Exception e) { return -1; }
  }

  private static boolean bool(Object o) {
    return Boolean.TRUE.equals(o) || "true".equals(String.valueOf(o));
  }

  private static String str(Object o) { return o == null ? "" : String.valueOf(o); }
}
