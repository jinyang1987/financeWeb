package com.finance.ams.openapi;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.LocalDate;
import java.time.YearMonth;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Base64;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

import javax.sql.DataSource;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import com.finance.ams.alfresco.AlfrescoClient;
import com.finance.ams.api.BizException;
import com.finance.ams.inspection.InspectionService;
import com.finance.ams.record.RecordService;
import com.finance.ams.volume.VolumeService;

/**
 * 推送接入服务 v2（统一四类契约，2026-08-16）
 *
 * 统一数据契约：不管哪套财务系统（用友/金蝶/浪潮/自研ERP），都按同一结构推送
 * 四大类会计资料（79号令第六条）：
 *   category = voucher(会计凭证) | ledger(会计账簿) | report(财务会计报告) | other(其他会计资料)
 *
 * 去向路由（destination）：
 *   auto-archive 直接入库：建件 → 四性检测(可选) → 按类别自动组卷 → 确认取号
 *   to-volume   送组卷工作台：建件入收集池（仅件数据），人工组卷
 *   （2026-08-21 收敛：核对工作台已移除，抓取/推送/手动统一进组卷工作台；
 *    历史遗留 to-check / to-review 一律归一为 to-volume 处理）
 *
 * 全链路日志：每步写 ams_push_log；收集台账：每条写 ams_collect_item。
 * 幂等：external_id + source_system 去重，重复推送自动 skipped。
 *
 * 端点：
 *   POST /open/v1/token             AppKey/AppSecret → 访问令牌（Bearer）
 *   POST /open/v1/archives          单件推送
 *   POST /open/v1/archives/batch    批量推送（统一四类契约）
 *   GET  /open/v1/batches/{batchNo} 回执查询
 *   POST /open/v1/simulate          模拟推送（演示：生成四类样例走真实管道）
 */
@Service
public class OpenPushService {

  private static final Logger log = LoggerFactory.getLogger(OpenPushService.class);

  /** 去向常量 */
  public static final String DEST_AUTO = "auto-archive";
  public static final String DEST_VOLUME = "to-volume";
  public static final String DEST_CHECK = "to-check";
  public static final String DEST_REVIEW = "to-review";

  private final JdbcClient jdbc;
  private final RecordService records;
  private final VolumeService volumes;
  private final InspectionService inspection;
  private final CollectItemService collectItems;
  private final PushLogService logs;
  private final FieldMapService fieldMaps;
  private final AlfrescoClient alfresco;
  private final RestTemplate http = new RestTemplate();

  private final String seedAdminUser;
  private final String seedAdminPassword;

  /** token 缓存：appKey → (token, expireAt)。单实例进程内，TTL 2h */
  private final Map<String, TokenEntry> tokenCache = new ConcurrentHashMap<>();

  private record TokenEntry(String token, long expireAt) {}

  /** 成功入池条目（去向路由用） */
  private record OkItem(String nodeId, String category, String archiveType, Integer year,
                        String fondsCode, String retention) {}

  public OpenPushService(DataSource dataSource, RecordService records, VolumeService volumes,
                         InspectionService inspection, CollectItemService collectItems,
                         PushLogService logs, FieldMapService fieldMaps, AlfrescoClient alfresco,
                         @Value("${ams.seed.admin-user:admin}") String seedAdminUser,
                         @Value("${ams.seed.admin-password:admin}") String seedAdminPassword) {
    this.jdbc = JdbcClient.create(dataSource);
    this.records = records;
    this.volumes = volumes;
    this.inspection = inspection;
    this.collectItems = collectItems;
    this.logs = logs;
    this.fieldMaps = fieldMaps;
    this.alfresco = alfresco;
    this.seedAdminUser = seedAdminUser;
    this.seedAdminPassword = seedAdminPassword;
  }

  // ═══════════════════ 接入认证 ═══════════════════

  /** AppKey/AppSecret → 访问令牌 */
  public Map<String, Object> issueToken(String appKey, String appSecret) {
    var app = findApp(appKey);
    if (app == null || !appSecret.equals(app.get("app_secret"))) {
      throw new BizException(HttpStatus.UNAUTHORIZED, "AUTH_FAILED", "AppKey 或 AppSecret 错误");
    }
    if (!"active".equals(String.valueOf(app.get("status")))) {
      throw new BizException(HttpStatus.FORBIDDEN, "APP_DISABLED", "接入应用已停用");
    }
    String token = "pk_" + UUID.randomUUID().toString().replace("-", "") + "_" + sha256(appKey).substring(0, 12);
    tokenCache.put(appKey, new TokenEntry(token, System.currentTimeMillis() + 2 * 3600_000L));
    log.info("推送接入签发令牌: appKey={}（{}）", appKey, app.get("app_name"));
    return Map.of(
        "access_token", token,
        "token_type", "Bearer",
        "expires_in", 7200);
  }

  /** 校验 Bearer token，返回应用记录 */
  public Map<String, Object> requireApp(String authorization) {
    if (authorization == null || !authorization.startsWith("Bearer ")) {
      throw new BizException(HttpStatus.UNAUTHORIZED, "NO_TOKEN", "缺少 Bearer 访问令牌");
    }
    String token = authorization.substring("Bearer ".length()).trim();
    return tokenCache.entrySet().stream()
        .filter(e -> e.getValue().token().equals(token))
        .findFirst()
        .map(e -> {
          if (e.getValue().expireAt() < System.currentTimeMillis()) {
            tokenCache.remove(e.getKey());
            throw new BizException(HttpStatus.UNAUTHORIZED, "TOKEN_EXPIRED", "访问令牌已过期，请重新获取");
          }
          Map<String, Object> app = findApp(e.getKey());
          if (app == null || !"active".equals(String.valueOf(app.get("status")))) {
            throw new BizException(HttpStatus.FORBIDDEN, "APP_DISABLED", "接入应用已停用");
          }
          return app;
        })
        .orElseThrow(() -> new BizException(HttpStatus.UNAUTHORIZED, "TOKEN_INVALID", "访问令牌无效"));
  }

  // ═══════════════════ 单件推送 ═══════════════════

  /**
   * 单件推送（兼容旧格式 { metadata, fileBase64 } 与新契约 { 标准字段..., files[] }）。
   * 支持 category / destination / runFourChecks。
   */
  public Map<String, Object> pushSingle(Map<String, Object> app, Map<String, Object> body) {
    String destination = destOf(body, app);
    @SuppressWarnings("unchecked")
    Map<String, Object> meta = body.get("metadata") instanceof Map<?, ?> m
        ? (Map<String, Object>) m : body;
    String externalId = str(meta.get("externalId"));
    String sourceSystem = str(meta.getOrDefault("sourceSystem", app.get("source_system")));
    if (externalId.isBlank()) {
      throw BizException.badRequest("VALIDATION_FAILED", "externalId 不能为空（幂等键）");
    }
    if (alreadyPushed(sourceSystem, externalId)) {
      return Map.of("status", "skipped", "externalId", externalId, "message", "重复推送（已受理过）");
    }

    FilePayload file = fileOf(body, meta, externalId);
    String ticket = adminTicket();
    String category = categoryOf(meta, str(body.get("category")));
    boolean fourChecks = body.get("runFourChecks") instanceof Boolean b && b;

    long pushId = createBatch(app, body, str(body.get("period")), category, destination);
    String batchNo = batchNoOf(pushId);
    logs.info(batchNo, "accept", "单件推送受理：" + externalId + "（类别 " + category + "，去向 " + destination + "）");

    try {
      Map<String, Object> r = pushItem(app, pushId, batchNo, meta, category, destination);
      if (!"success".equals(r.get("status"))) { // skipped（重复推送）
        finishBatch(pushId, "success", 1, 0, 0, "重复推送已跳过");
        Map<String, Object> out = new LinkedHashMap<>(r);
        out.put("batchNo", batchNo);
        return out;
      }
      int fourPass = 0;
      if (fourChecks) {
        fourPass = runFourChecks(ticket, batchNo, List.of(str(r.get("nodeId"))));
      }
      String fonds = str(meta.getOrDefault("fondsCode", app.get("fonds_code")));
      String routeNote = routeDestination(ticket, "openapi:" + app.get("app_name"),
          batchNo, destination, List.of(new OkItem(str(r.get("nodeId")), category,
              str(r.get("archiveType")), intObj(meta.get("year")), fonds,
              str(r.getOrDefault("retention", "")))));
      finishBatch(pushId, "success", 1, 1, 0, routeNote);
      logs.info(batchNo, "receipt", "单件推送完成：" + r.get("voucherNo") + "，" + routeNote);
      Map<String, Object> out = new LinkedHashMap<>(r);
      out.put("batchNo", batchNo);
      out.put("fourChecksPassed", fourPass);
      out.put("route", routeNote);
      return out;
    } catch (BizException e) {
      finishBatch(pushId, "failed", 1, 0, 1, e.getMessage());
      logs.error(batchNo, "create", "单件推送失败：" + e.getMessage(), null);
      throw e;
    }
  }

  // ═══════════════════ 批量推送（统一四类契约） ═══════════════════

  /**
   * 批量推送 v2：
   * { batchNo?, period?, category?, destination?, runFourChecks?, format: standard|raw, items: [...] }
   */
  public Map<String, Object> pushBatch(Map<String, Object> app, Map<String, Object> body) {
    @SuppressWarnings("unchecked")
    List<Map<String, Object>> items = body.get("items") instanceof List<?> l
        ? (List<Map<String, Object>>) l : List.of();
    if (items.isEmpty()) throw BizException.badRequest("VALIDATION_FAILED", "items 不能为空");
    if (items.size() > 500) throw BizException.badRequest("VALIDATION_FAILED", "单批最多 500 条");

    String period = str(body.get("period"));
    String batchCategory = str(body.get("category"));
    String destination = destOf(body, app);
    boolean fourChecks = body.get("runFourChecks") instanceof Boolean b && b;
    boolean rawFormat = "raw".equals(str(body.get("format")));
    String sourceSystem = str(app.get("source_system"));

    long pushId = createBatch(app, body, period, batchCategory, destination);
    String batchNo = batchNoOf(pushId);
    logs.info(batchNo, "accept", String.format("批次受理：%s 推送 %d 条（类别 %s，去向 %s，四性 %s）",
        app.get("app_name"), items.size(), batchCategory.isBlank() ? "混合" : batchCategory,
        destination, fourChecks ? "开启" : "关闭"));

    String ticket = adminTicket();
    int success = 0, failed = 0, skipped = 0;
    List<OkItem> oks = new ArrayList<>();
    StringBuilder notes = new StringBuilder();

    for (int i = 0; i < items.size(); i++) {
      Map<String, Object> rawItem = items.get(i);
      String externalId = str(rawItem.get("externalId"));
      try {
        Map<String, Object> item = rawItem;
        if (rawFormat) {
          String cat = categoryOf(rawItem, batchCategory);
          item = fieldMaps.apply(sourceSystem, cat, rawItem);
          logs.info(batchNo, "map", "字段映射转换（" + sourceSystem + "）：" + externalId);
        }
        Map<String, Object> r = pushItem(app, pushId, batchNo, item,
            categoryOf(item, batchCategory), destination);
        String st = str(r.get("status"));
        if ("success".equals(st)) {
          success++;
          oks.add(new OkItem(str(r.get("nodeId")), str(r.get("category")),
              str(r.get("archiveType")), intObj(item.get("year")),
              str(r.get("fondsCode")), str(r.get("retention"))));
        } else if ("skipped".equals(st)) {
          skipped++;
        }
      } catch (Exception e) {
        failed++;
        notes.append("第").append(i + 1).append("条: ").append(e.getMessage()).append("；");
        insertFailedItem(pushId, rawItem, e.getMessage());
        logs.error(batchNo, "create", "第" + (i + 1) + "条入池失败：" + e.getMessage(), externalId);
      }
    }

    // ── 四性检测（可选） ──
    int fourPass = 0;
    if (fourChecks && !oks.isEmpty()) {
      fourPass = runFourChecks(ticket, batchNo, oks.stream().map(OkItem::nodeId).toList());
      notes.append("四性检测通过 ").append(fourPass).append("/").append(oks.size()).append("；");
    }

    // ── 去向路由 ──
    String routeNote = routeDestination(ticket, "openapi:" + app.get("app_name"), batchNo, destination, oks);
    notes.append(routeNote);

    String status = failed == 0 ? "success" : (success > 0 ? "partial" : "failed");
    finishBatch(pushId, status, items.size(), success, failed, notes.toString());
    logs.info(batchNo, "receipt", String.format("批次完成：成功 %d、跳过 %d、失败 %d。%s",
        success, skipped, failed, routeNote));
    log.info("推送批次完成: {}（{} 成功 / {} 跳过 / {} 失败）", batchNo, success, skipped, failed);

    Map<String, Object> out = new LinkedHashMap<>();
    out.put("batchNo", batchNo);
    out.put("status", status);
    out.put("total", items.size());
    out.put("success", success);
    out.put("skipped", skipped);
    out.put("failed", failed);
    out.put("fourChecksPassed", fourPass);
    out.put("route", routeNote);
    out.put("message", notes.toString());
    return out;
  }

  // ═══════════════════ 条目入池（四类统一） ═══════════════════

  /**
   * 单条标准契约条目入池。
   * 标准字段：externalId/year/month?/retention?/department?/preparer?/summary?/amount?/files[]
   * 类型块：voucher{voucherNo,voucherWord,voucherCategory,entries[],attachedBillCount}
   *        ledger{ledgerType,subjectCode,subjectName}
   *        report{reportName,reportPeriod}
   *        other{materialType,materialNo}
   */
  @SuppressWarnings("unchecked")
  private Map<String, Object> pushItem(Map<String, Object> app, long pushId, String batchNo,
                                       Map<String, Object> item, String category, String destination) {
    // 兼容旧格式：{ metadata:{...}, fileBase64 }
    Map<String, Object> meta = item.get("metadata") instanceof Map<?, ?> m
        ? (Map<String, Object>) m : item;

    String externalId = str(meta.get("externalId"));
    String sourceSystem = str(meta.getOrDefault("sourceSystem", app.get("source_system")));
    String fondsCode = str(meta.getOrDefault("fondsCode", app.get("fonds_code")));
    if (externalId.isBlank()) throw BizException.badRequest("VALIDATION_FAILED", "externalId 不能为空（幂等键）");
    if (alreadyPushed(sourceSystem, externalId)) {
      insertPushItem(pushId, sourceSystem, externalId, "", "", category, null, null, null, null,
          "skipped", "重复推送");
      logs.info(batchNo, "validate", "重复推送跳过：" + externalId);
      return Map.of("status", "skipped", "externalId", externalId, "category", category);
    }

    FilePayload file = fileOf(item, meta, externalId);
    Integer year = intObj(meta.get("year"));
    Integer month = intObj(meta.get("month"));
    if (year == null) throw BizException.badRequest("VALIDATION_FAILED", "year 不能为空");

    // ── 类别 → 档案类型/保管期限/凭证字号 ──
    String archiveType;
    String retention = str(meta.get("retention"));
    String voucherNo;
    String voucherCategory = null;
    String remarks = null;
    RecordService.VoucherMeta voucherMeta = null;

    switch (category) {
      case "ledger" -> {
        Map<String, Object> ledger = subMap(meta, "ledger");
        String ledgerType = str(ledger.getOrDefault("ledgerType", "明细账"));
        archiveType = "会计账簿";
        if (retention.isBlank()) retention = "30年";
        voucherNo = "账-" + ledgerType + "-" + year;
        remarks = "账簿类型：" + ledgerType
            + (str(ledger.get("subjectName")).isBlank() ? "" : "；科目：" + ledger.get("subjectName"));
      }
      case "report" -> {
        Map<String, Object> report = subMap(meta, "report");
        String reportName = str(report.getOrDefault("reportName", "财务会计报告"));
        String reportPeriod = str(report.getOrDefault("reportPeriod", "月度"));
        archiveType = "财务报告";
        if (retention.isBlank()) retention = "年度".equals(reportPeriod) ? "永久" : "10年";
        voucherNo = "报-" + reportName + "-" + year + "年" + reportPeriod;
        remarks = "报告期间：" + reportPeriod;
        voucherCategory = reportPeriod;
      }
      case "other" -> {
        Map<String, Object> other = subMap(meta, "other");
        String materialType = str(other.getOrDefault("materialType", "其他会计资料"));
        archiveType = "其他会计资料";
        if (retention.isBlank()) retention = "10年";
        voucherNo = "其-" + materialType + "-" + year;
        remarks = "资料类别：" + materialType
            + (str(other.get("materialNo")).isBlank() ? "" : "；编号：" + other.get("materialNo"));
        voucherCategory = materialType;
      }
      default -> { // voucher
        category = "voucher";
        Map<String, Object> voucher = subMap(meta, "voucher");
        archiveType = "记账凭证";
        if (retention.isBlank()) retention = "30年";
        voucherNo = str(meta.get("voucherNo"));
        if (voucherNo.isBlank()) voucherNo = str(voucher.get("voucherNo"));
        if (voucherNo.isBlank()) voucherNo = "凭-" + externalId;
        voucherCategory = str(voucher.get("voucherCategory"));
        Object entries = voucher.get("entries");
        String entriesJson = entries instanceof List<?> || entries instanceof Map<?, ?>
            ? toJson(entries) : str(entries);
        Integer attached = intObj(voucher.get("attachedBillCount"));
        voucherMeta = new RecordService.VoucherMeta(
            str(voucher.get("voucherWord")), str(meta.get("voucherDate")),
            year + (month != null ? "-" + String.format("%02d", month) : ""),
            str(meta.get("auditor")), str(meta.get("tallyMan")),
            entriesJson.isBlank() ? null : entriesJson, attached,
            sourceSystem, externalId, str(meta.get("summary")));
      }
    }

    var cmd = new RecordService.CreateCmd(
        fondsCode, voucherNo, archiveType, str(meta.get("department")),
        doubleObj(meta.get("amount")), year, month, retention,
        "digital-native", "electronic",
        str(meta.getOrDefault("preparer", "推送系统:" + sourceSystem)),
        voucherCategory, remarks, voucherMeta);

    Map<String, Object> view;
    try {
      view = records.create("openapi:" + app.get("app_name"), adminTicket(), cmd,
          file.fileName(), file.mimeType(), file.bytes());
    } catch (Exception e) {
      throw new BizException(HttpStatus.BAD_REQUEST, "PUSH_FAILED", "推送入池失败: " + e.getMessage());
    }
    String nodeId = String.valueOf(view.get("nodeId"));
    String archiveCode = String.valueOf(view.get("archiveCode"));
    insertPushItem(pushId, sourceSystem, externalId, voucherNo, archiveType, category,
        str(meta.get("summary")), doubleObj(meta.get("amount")), nodeId, archiveCode, "success", null);
    collectItems.record(nodeId, fondsCode, "demo-simulator".equals(sourceSystem) ? "simulate" : "open-push",
        batchNo, category, destination, DEST_CHECK.equals(destination) ? "pending" : "na",
        externalId, voucherNo, archiveType);
    logs.info(batchNo, "create", String.format("%s 入池（%s，%s年%s月，%s）→ %s",
        voucherNo, archiveType, year, month == null ? "-" : month, retention, nodeId));
    log.info("推送入池: {}（{}，来源 {}，去向 {}）", voucherNo, nodeId, sourceSystem, destination);

    Map<String, Object> out = new LinkedHashMap<>();
    out.put("status", "success");
    out.put("externalId", externalId);
    out.put("nodeId", nodeId);
    out.put("archiveCode", archiveCode);
    out.put("voucherNo", voucherNo);
    out.put("archiveType", archiveType);
    out.put("category", category);
    out.put("fondsCode", fondsCode);
    out.put("retention", retention);
    out.put("recordStatus", "仅件数据");
    return out;
  }

  // ═══════════════════ 四性检测 / 去向路由 ═══════════════════

  /** 批量四性检测，返回通过数 */
  private int runFourChecks(String ticket, String batchNo, List<String> nodeIds) {
    int pass = 0;
    for (String nodeId : nodeIds) {
      try {
        Map<String, Object> r = inspection.run(ticket, nodeId, "collect");
        boolean allPass = r.get("allPass") instanceof Boolean b && b;
        if (allPass) pass++;
        logs.log(batchNo, allPass ? "info" : "warn", "fourchecks",
            (allPass ? "四性检测通过：" : "四性检测存在不通过项：") + nodeId, null);
      } catch (Exception e) {
        logs.warn(batchNo, "fourchecks", "四性检测执行失败：" + nodeId + "（" + e.getMessage() + "）");
      }
    }
    return pass;
  }

  /** 去向路由：auto-archive 自动组卷 / to-review 转审核 / to-check、to-volume 台账已登记 */
  private String routeDestination(String ticket, String operator, String batchNo,
                                  String destination, List<OkItem> oks) {
    if (oks.isEmpty()) return "";
    switch (destination) {
      case DEST_AUTO -> {
        int vols = autoGroupVolumes(ticket, operator, batchNo, oks);
        return "已自动组卷 " + vols + " 卷（" + oks.size() + " 件）";
      }
      case DEST_REVIEW -> {
        for (OkItem ok : oks) {
          collectItems.enterReviewLibrary(ticket, ok.nodeId(), "system", "推送批次 " + batchNo + " 转审核");
        }
        logs.info(batchNo, "route", oks.size() + " 条已转审核库（档案整理→核对工作台·待审核）");
        return "已转审核库 " + oks.size() + " 条";
      }
      case DEST_CHECK -> {
        logs.info(batchNo, "route", oks.size() + " 条已进入核对工作台·收集池待核对队列");
        return "已进入核对工作台待核对队列 " + oks.size() + " 条";
      }
      default -> {
        logs.info(batchNo, "route", oks.size() + " 条已进入组卷工作台待组卷池");
        return "已进入组卷工作台待组卷池 " + oks.size() + " 条";
      }
    }
  }

  /** 按「类别+保管期限」分组自动组卷（不同保管期限严禁混装同一卷） */
  private int autoGroupVolumes(String ticket, String operator, String batchNo, List<OkItem> oks) {
    Map<String, List<OkItem>> groups = new LinkedHashMap<>();
    for (OkItem ok : oks) {
      groups.computeIfAbsent(ok.category() + "|" + ok.retention(), k -> new ArrayList<>()).add(ok);
    }
    int volCount = 0;
    for (var e : groups.entrySet()) {
      List<OkItem> items = e.getValue();
      OkItem first = items.get(0);
      try {
        int year = items.stream().map(OkItem::year).filter(java.util.Objects::nonNull)
            .findFirst().orElse(LocalDate.now().getYear());
        String title;
        String archiveType;
        String typeCode;
        String retention = first.retention().isBlank() ? "30年" : first.retention();
        switch (first.category()) {
          case "ledger" -> { title = year + "年会计账簿卷"; archiveType = "会计账簿"; typeCode = "KB"; }
          case "report" -> { title = year + "年财务会计报告卷（" + retention + "）"; archiveType = "财务报告"; typeCode = "FB"; }
          case "other" -> { title = year + "年其他会计资料卷"; archiveType = "其他会计资料"; typeCode = "QT"; }
          default -> { title = year + "年记账凭证卷"; archiveType = "记账凭证"; typeCode = "KP"; }
        }
        String dateFrom = YearMonth.of(year, 1).atDay(1).toString();
        String dateTo = YearMonth.of(year, 12).atEndOfMonth().toString();
        String fonds = first.fondsCode().isBlank() ? "Z001" : first.fondsCode();
        var createCmd = new VolumeService.CreateCmd(
            fonds, title, archiveType, typeCode, year, retention, null,
            dateFrom, dateTo, "electronic", "普通");
        Map<String, Object> vol = volumes.create(operator, ticket, createCmd);
        String volumeId = String.valueOf(vol.get("nodeId"));
        volumes.addItems(ticket, volumeId, items.stream().map(OkItem::nodeId).toList(), null);
        Map<String, Object> confirmed = volumes.confirm(ticket, operator, volumeId);
        volCount++;
        Object vc = confirmed.get("volumeCode");
        logs.info(batchNo, "group", String.format("自动组卷《%s》%d 件%s",
            title, items.size(), vc != null && !str(vc).isBlank() ? "，档号 " + vc : ""));
      } catch (Exception ex) {
        logs.error(batchNo, "group", "自动组卷失败（" + first.category() + "/" + first.retention()
            + "）：" + ex.getMessage(), null);
      }
    }
    return volCount;
  }

  // ═══════════════════ 批次后续操作（管理端） ═══════════════════

  /** 批次成功条目（管理端批次操作用） */
  public List<Map<String, Object>> successItemsOfBatch(String batchNo) {
    Map<String, Object> batch = findBatch(batchNo);
    return jdbc.sql("""
        SELECT id, external_id, COALESCE(voucher_no,'') AS voucher_no,
               COALESCE(archive_type,'') AS archive_type, COALESCE(category,'') AS category,
               record_node_id, COALESCE(archive_code,'') AS archive_code, status
        FROM ams.ams_open_push_item
        WHERE push_id = ? AND status = 'success' AND record_node_id IS NOT NULL ORDER BY id
        """)
        .param(batch.get("id"))
        .query((rs, i) -> row(
            "id", rs.getLong("id"),
            "externalId", rs.getString("external_id"),
            "voucherNo", rs.getString("voucher_no"),
            "archiveType", rs.getString("archive_type"),
            "category", rs.getString("category"),
            "recordNodeId", rs.getString("record_node_id"),
            "archiveCode", rs.getString("archive_code"),
            "status", rs.getString("status")))
        .list();
  }

  /** 批次运行四性检测（管理端） */
  public Map<String, Object> runFourChecksForBatch(String ticket, String batchNo) {
    List<Map<String, Object>> items = successItemsOfBatch(batchNo);
    if (items.isEmpty()) throw BizException.badRequest("NO_ITEMS", "该批次无成功入池条目");
    int pass = runFourChecks(ticket, batchNo, items.stream()
        .map(it -> String.valueOf(it.get("recordNodeId"))).toList());
    return Map.of("checked", items.size(), "passed", pass, "failed", items.size() - pass);
  }

  /** 批次转审核库（管理端） */
  public Map<String, Object> routeBatchToReview(String ticket, String userId, String batchNo) {
    List<Map<String, Object>> items = successItemsOfBatch(batchNo);
    if (items.isEmpty()) throw BizException.badRequest("NO_ITEMS", "该批次无成功入池条目");
    int n = 0;
    for (Map<String, Object> it : items) {
      collectItems.enterReviewLibrary(ticket, String.valueOf(it.get("recordNodeId")),
          userId, "推送批次 " + batchNo + " 转审核");
      n++;
    }
    logs.info(batchNo, "route", n + " 条已转审核库（操作人 " + userId + "）");
    return Map.of("routed", n);
  }

  /** 批次自动组卷（管理端） */
  public Map<String, Object> autoGroupBatch(String ticket, String userId, String batchNo) {
    Map<String, Object> batch = findBatch(batchNo);
    List<Map<String, Object>> items = successItemsOfBatch(batchNo);
    if (items.isEmpty()) throw BizException.badRequest("NO_ITEMS", "该批次无成功入池条目");
    List<OkItem> oks = new ArrayList<>();
    for (Map<String, Object> it : items) {
      String cat = str(it.get("category"));
      if (cat.isBlank()) cat = switch (str(it.get("archiveType"))) {
        case "会计账簿" -> "ledger";
        case "财务报告" -> "report";
        case "其他会计资料" -> "other";
        default -> "voucher";
      };
      oks.add(new OkItem(str(it.get("recordNodeId")), cat, str(it.get("archiveType")),
          str(batch.get("period")).length() >= 4
              ? Integer.parseInt(str(batch.get("period")).substring(0, 4)) : null,
          str(batch.get("fonds_code")), ""));
    }
    int vols = autoGroupVolumes(ticket, userId, batchNo, oks);
    return Map.of("volumes", vols, "items", oks.size());
  }

  // ═══════════════════ 模拟推送（演示：四类样例走真实管道） ═══════════════════

  /** 生成四类样例数据并通过真实推送管道入档 */
  public Map<String, Object> simulate(String operator, Map<String, Object> body) {
    String category = str(body.getOrDefault("category", "all"));
    int count = Math.min(Math.max(intOr(body.get("count"), 3), 1), 20);
    String destination = str(body.getOrDefault("destination", DEST_CHECK));
    boolean fourChecks = !(body.get("runFourChecks") instanceof Boolean b) || b;

    Map<String, Object> app = ensureDemoApp(operator);
    String period = YearMonth.now().toString();
    List<Map<String, Object>> items = new ArrayList<>();
    List<String> cats = "all".equals(category) || category.isBlank()
        ? List.of("voucher", "ledger", "report", "other") : List.of(category);
    for (String c : cats) items.addAll(sampleItems(c, count, period));

    Map<String, Object> batch = new LinkedHashMap<>();
    batch.put("period", period);
    batch.put("category", cats.size() == 1 ? cats.get(0) : "");
    batch.put("destination", destination);
    batch.put("runFourChecks", fourChecks);
    batch.put("items", items);
    logs.info("", "simulate", String.format("模拟推送：%s 四类样例 %d 条（去向 %s）",
        category, items.size(), destination));
    return pushBatch(app, batch);
  }

  /** 确保演示应用存在 */
  private Map<String, Object> ensureDemoApp(String operator) {
    Map<String, Object> app = jdbc.sql("""
        SELECT id, app_key, app_secret, app_name, source_system, fonds_code, status, default_destination
        FROM ams.ams_open_app WHERE source_system = 'demo-simulator' LIMIT 1
        """)
        .query((rs, i) -> row(
            "id", rs.getLong("id"), "app_key", rs.getString("app_key"),
            "app_secret", rs.getString("app_secret"), "app_name", rs.getString("app_name"),
            "source_system", rs.getString("source_system"), "fonds_code", rs.getString("fonds_code"),
            "status", rs.getString("status"), "default_destination", rs.getString("default_destination")))
        .optional().orElse(null);
    if (app != null) return app;
    Long id = jdbc.sql("""
        INSERT INTO ams.ams_open_app (app_key, app_secret, app_name, source_system, fonds_code, remark, created_by)
        VALUES ('AK_DEMO_SIMULATOR', 'SK_DEMO', '模拟推送演示', 'demo-simulator', 'Z001',
                '系统内置演示应用：模拟推送四类会计档案样例数据', ?) RETURNING id
        """)
        .param(operator)
        .query(Long.class).single();
    log.info("创建模拟推送演示应用: id={}", id);
    return row("id", id, "app_key", "AK_DEMO_SIMULATOR", "app_secret", "SK_DEMO",
        "app_name", "模拟推送演示", "source_system", "demo-simulator",
        "fonds_code", "Z001", "status", "active", "default_destination", DEST_CHECK);
  }

  /** 按类别生成仿真样例条目 */
  private List<Map<String, Object>> sampleItems(String category, int count, String period) {
    List<Map<String, Object>> out = new ArrayList<>();
    int year = Integer.parseInt(period.substring(0, 4));
    int month = Integer.parseInt(period.substring(5, 7));
    String[] depts = {"财务部", "采购部", "销售部", "行政部"};
    byte[] pdf = minimalPdf();
    String b64 = Base64.getEncoder().encodeToString(pdf);

    for (int i = 1; i <= count; i++) {
      Map<String, Object> item = new LinkedHashMap<>();
      String ext = "SIM-" + category.toUpperCase() + "-" + period.replace("-", "") + "-" + String.format("%03d", i);
      item.put("externalId", ext);
      item.put("year", year);
      item.put("month", month);
      item.put("department", depts[i % depts.length]);
      item.put("preparer", "模拟推送");
      item.put("files", List.of(Map.of(
          "fileName", ext + ".pdf", "mimeType", "application/pdf", "fileBase64", b64)));

      switch (category) {
        case "ledger" -> {
          String[] types = {"总账", "明细账", "日记账", "辅助账簿"};
          String t = types[(i - 1) % types.length];
          item.put("summary", year + "年度" + t + "电子账簿");
          item.put("ledger", Map.of("ledgerType", t,
              "subjectCode", String.format("%04d", 1001 + i),
              "subjectName", "银行存款".equals(t) ? "银行存款" : "管理费用"));
        }
        case "report" -> {
          String[] names = {"资产负债表", "利润表", "现金流量表"};
          String[] periods = {"月度", "季度", "年度"};
          String name = names[(i - 1) % names.length];
          String rp = periods[(i - 1) % periods.length];
          item.put("summary", year + "年" + rp + name);
          item.put("amount", 1000000.00 + i * 50000);
          item.put("report", Map.of("reportName", name, "reportPeriod", rp));
        }
        case "other" -> {
          String[] types = {"银行余额调节表", "银行对账单", "纳税申报表", "会计档案移交清册"};
          String t = types[(i - 1) % types.length];
          item.put("summary", year + "年" + month + "月" + t);
          item.put("other", Map.of("materialType", t,
              "materialNo", "QT-" + period.replace("-", "") + "-" + String.format("%03d", i)));
        }
        default -> { // voucher
          double amount = 800 + i * 137.5;
          String[] summaries = {"采购办公用品", "支付差旅费报销", "支付水电费", "收到销售货款", "计提本月折旧"};
          String voucherNo = "记-" + String.format("%03d", 100 + i);
          item.put("voucherNo", voucherNo);
          item.put("summary", summaries[(i - 1) % summaries.length]);
          item.put("amount", amount);
          item.put("voucher", Map.of(
              "voucherNo", voucherNo, "voucherWord", "记", "voucherCategory", "转账凭证",
              "attachedBillCount", 1 + i % 3,
              "entries", List.of(
                  Map.of("line", 1, "summary", summaries[(i - 1) % summaries.length],
                      "subjectCode", "6602", "subjectName", "管理费用", "debit", amount, "credit", 0),
                  Map.of("line", 2, "summary", summaries[(i - 1) % summaries.length],
                      "subjectCode", "1002", "subjectName", "银行存款", "debit", 0, "credit", amount))));
        }
      }
      out.add(item);
    }
    return out;
  }

  /** 最小合法单页 PDF（无内容流，演示文件用） */
  private static byte[] minimalPdf() {
    String[] objs = {
        "<< /Type /Catalog /Pages 2 0 R >>",
        "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] >>",
    };
    StringBuilder sb = new StringBuilder("%PDF-1.4\n");
    int[] off = new int[objs.length];
    for (int i = 0; i < objs.length; i++) {
      off[i] = sb.length();
      sb.append(i + 1).append(" 0 obj ").append(objs[i]).append("\nendobj\n");
    }
    int xref = sb.length();
    sb.append("xref\n0 ").append(objs.length + 1).append("\n0000000000 65535 f \n");
    for (int o : off) sb.append(String.format("%010d 00000 n \n", o));
    sb.append("trailer << /Size ").append(objs.length + 1)
        .append(" /Root 1 0 R >>\nstartxref\n").append(xref).append("\n%%EOF");
    return sb.toString().getBytes(StandardCharsets.ISO_8859_1);
  }

  // ═══════════════════ 回执查询 ═══════════════════

  public Map<String, Object> batchReceipt(String batchNo) {
    Map<String, Object> batch = findBatch(batchNo);
    List<Map<String, Object>> items = jdbc.sql("""
        SELECT id, external_id, voucher_no, archive_type, COALESCE(category,'') AS category,
               COALESCE(summary,'') AS summary, amount, record_node_id, archive_code,
               status, COALESCE(error,'') AS error, created_at::text AS created_at
        FROM ams.ams_open_push_item WHERE push_id=? ORDER BY id
        """)
        .param(batch.get("id"))
        .query((rs, i) -> row(
            "id", rs.getLong("id"),
            "external_id", rs.getString("external_id"),
            "voucher_no", rs.getString("voucher_no"),
            "archive_type", rs.getString("archive_type"),
            "category", rs.getString("category"),
            "summary", rs.getString("summary"),
            "amount", rs.getObject("amount"),
            "record_node_id", rs.getString("record_node_id"),
            "archive_code", rs.getString("archive_code"),
            "status", rs.getString("status"),
            "error", rs.getString("error"),
            "created_at", rs.getString("created_at")))
        .list();
    batch = new LinkedHashMap<>(batch);
    batch.put("items", items);
    return batch;
  }

  // ═══════════════════ 接入应用管理（供系统管理页使用） ═══════════════════

  /** 签发接入应用 */
  public Map<String, Object> createApp(String operator, Map<String, Object> body) {
    String appName = str(body.get("appName"));
    String sourceSystem = str(body.get("sourceSystem"));
    if (appName.isBlank() || sourceSystem.isBlank()) {
      throw BizException.badRequest("VALIDATION_FAILED", "appName / sourceSystem 不能为空");
    }
    String appKey = "AK_" + UUID.randomUUID().toString().replace("-", "").substring(0, 16).toUpperCase();
    String appSecret = "SK_" + UUID.randomUUID().toString().replace("-", "").substring(0, 24).toUpperCase();
    String fondsCode = str(body.getOrDefault("fondsCode", "Z001"));
    String remark = str(body.get("remark"));
    String defaultDest = destOrDefault(body.get("defaultDestination"));
    Long id = jdbc.sql("""
        INSERT INTO ams.ams_open_app (app_key, app_secret, app_name, source_system, fonds_code,
          remark, created_by, default_destination)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id
        """)
        .params(appKey, appSecret, appName, sourceSystem, fondsCode,
            remark.isBlank() ? null : remark, operator, defaultDest)
        .query(Long.class).single();
    log.info("签发推送接入应用: {}（{}，默认去向 {}）", appName, sourceSystem, defaultDest);
    return Map.of("id", id, "appKey", appKey, "appSecret", appSecret, "appName", appName);
  }

  /** 更新接入应用默认去向 */
  public void updateAppDestination(long appId, String destination) {
    jdbc.sql("UPDATE ams.ams_open_app SET default_destination = ? WHERE id = ?")
        .params(destOrDefault(destination), appId).update();
  }

  /** 接入应用列表（secret 脱敏） */
  public List<Map<String, Object>> listApps() {
    return jdbc.sql("""
        SELECT id, app_key, app_name, source_system, fonds_code, status,
               COALESCE(remark,'') AS remark, COALESCE(created_by,'') AS created_by,
               created_at::text AS created_at, default_destination
        FROM ams.ams_open_app ORDER BY id DESC
        """)
        .query((rs, i) -> row(
            "id", rs.getLong("id"),
            "appKey", rs.getString("app_key"),
            "appName", rs.getString("app_name"),
            "sourceSystem", rs.getString("source_system"),
            "fondsCode", rs.getString("fonds_code"),
            "status", rs.getString("status"),
            "remark", rs.getString("remark"),
            "createdBy", rs.getString("created_by"),
            "createdAt", rs.getString("created_at"),
            "defaultDestination", rs.getString("default_destination")))
        .list();
  }

  /** 推送批次历史（近 N 条） */
  public List<Map<String, Object>> listBatches(int limit) {
    return jdbc.sql("""
        SELECT p.id, p.batch_no, p.fonds_code, p.status, p.total_count, p.success_count,
               p.fail_count, COALESCE(p.message,'') AS message,
               COALESCE(a.app_name,'') AS app_name, COALESCE(a.source_system,'') AS source_system,
               COALESCE(p.period,'') AS period, COALESCE(p.category,'') AS category,
               COALESCE(p.destination,'') AS destination,
               p.created_at::text AS created_at, p.finished_at::text AS finished_at
        FROM ams.ams_open_push p LEFT JOIN ams.ams_open_app a ON p.app_id=a.id
        ORDER BY p.id DESC LIMIT ?
        """)
        .param(Math.min(Math.max(limit, 1), 200))
        .query((rs, i) -> row(
            "id", rs.getLong("id"),
            "batch_no", rs.getString("batch_no"),
            "fonds_code", rs.getString("fonds_code"),
            "status", rs.getString("status"),
            "total_count", rs.getInt("total_count"),
            "success_count", rs.getInt("success_count"),
            "fail_count", rs.getInt("fail_count"),
            "message", rs.getString("message"),
            "app_name", rs.getString("app_name"),
            "source_system", rs.getString("source_system"),
            "period", rs.getString("period"),
            "category", rs.getString("category"),
            "destination", rs.getString("destination"),
            "created_at", rs.getString("created_at"),
            "finished_at", rs.getString("finished_at") == null ? "" : rs.getString("finished_at")))
        .list();
  }

  // ═══════════════════ 内部 ═══════════════════

  private String adminTicket() {
    try {
      return alfresco.loginTicket(seedAdminUser, seedAdminPassword);
    } catch (Exception e) {
      throw new BizException(HttpStatus.INTERNAL_SERVER_ERROR, "SEED_AUTH_FAILED",
          "推送服务无法建立归档会话: " + e.getMessage());
    }
  }

  private Map<String, Object> findApp(String appKey) {
    return jdbc.sql("""
        SELECT id, app_key, app_secret, app_name, source_system, fonds_code, status, default_destination
        FROM ams.ams_open_app WHERE app_key=?
        """)
        .param(appKey)
        .query((rs, i) -> row(
            "id", rs.getLong("id"),
            "app_key", rs.getString("app_key"),
            "app_secret", rs.getString("app_secret"),
            "app_name", rs.getString("app_name"),
            "source_system", rs.getString("source_system"),
            "fonds_code", rs.getString("fonds_code"),
            "status", rs.getString("status"),
            "default_destination", rs.getString("default_destination")))
        .optional().orElse(null);
  }

  private Map<String, Object> findBatch(String batchNo) {
    return jdbc.sql("""
        SELECT id, batch_no, fonds_code, status, total_count, success_count, fail_count,
               COALESCE(message,'') AS message, COALESCE(period,'') AS period,
               COALESCE(category,'') AS category, COALESCE(destination,'') AS destination,
               created_at::text AS created_at, finished_at::text AS finished_at
        FROM ams.ams_open_push WHERE batch_no=?
        """)
        .param(batchNo)
        .query((rs, i) -> row(
            "id", rs.getLong("id"),
            "batch_no", rs.getString("batch_no"),
            "fonds_code", rs.getString("fonds_code"),
            "status", rs.getString("status"),
            "total_count", rs.getInt("total_count"),
            "success_count", rs.getInt("success_count"),
            "fail_count", rs.getInt("fail_count"),
            "message", rs.getString("message"),
            "period", rs.getString("period"),
            "category", rs.getString("category"),
            "destination", rs.getString("destination"),
            "created_at", rs.getString("created_at"),
            "finished_at", rs.getString("finished_at") == null ? "" : rs.getString("finished_at")))
        .optional()
        .orElseThrow(() -> BizException.notFound("推送批次 " + batchNo));
  }

  private boolean alreadyPushed(String sourceSystem, String externalId) {
    return !jdbc.sql("""
        SELECT 1 FROM ams.ams_open_push_item
        WHERE source_system=? AND external_id=? AND status='success' LIMIT 1
        """)
        .param(sourceSystem).param(externalId).query(Integer.class).list().isEmpty();
  }

  private long createBatch(Map<String, Object> app, Map<String, Object> body,
                           String period, String category, String destination) {
    String today = LocalDate.now().format(DateTimeFormatter.BASIC_ISO_DATE);
    int seq = jdbc.sql("SELECT count(*) FROM ams.ams_open_push WHERE batch_no LIKE 'PUSH-' || ? || '-%'")
        .param(today).query(Integer.class).single() + 1;
    String batchNo = "PUSH-" + today + "-" + String.format("%03d", seq);
    Long id = jdbc.sql("""
        INSERT INTO ams.ams_open_push (batch_no, app_id, fonds_code, status, operator,
          period, category, destination)
        VALUES (?, ?, ?, 'accepted', ?, ?, ?, ?) RETURNING id
        """)
        .params(batchNo, app.get("id"),
            str(body.getOrDefault("fondsCode", app.get("fonds_code"))),
            "openapi:" + app.get("app_name"),
            period.isBlank() ? null : period,
            category.isBlank() ? null : category,
            destination)
        .query(Long.class).single();
    return id;
  }

  private String batchNoOf(long pushId) {
    return jdbc.sql("SELECT batch_no FROM ams.ams_open_push WHERE id=?")
        .param(pushId).query(String.class).single();
  }

  private void insertPushItem(long pushId, String sourceSystem, String externalId,
                              String voucherNo, String archiveType, String category, String summary,
                              Double amount, String nodeId, String archiveCode, String status, String error) {
    jdbc.sql("""
        INSERT INTO ams.ams_open_push_item
          (push_id, external_id, source_system, voucher_no, archive_type, category, summary,
           amount, record_node_id, archive_code, status, error)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """)
        .params(pushId, externalId, sourceSystem, voucherNo, archiveType, category, summary,
            amount, nodeId, archiveCode, status, error)
        .update();
  }

  private void insertFailedItem(long pushId, Map<String, Object> item, String error) {
    String externalId = str(item.get("externalId"));
    if (externalId.isBlank() && item.get("metadata") instanceof Map<?, ?> m) {
      externalId = str(m.get("externalId"));
    }
    jdbc.sql("""
        INSERT INTO ams.ams_open_push_item (push_id, external_id, status, error)
        VALUES (?, ?, 'failed', ?)
        """)
        .params(pushId, externalId.isBlank() ? null : externalId, error)
        .update();
  }

  private void finishBatch(long pushId, String status, int total, int success, int failed, String message) {
    jdbc.sql("""
        UPDATE ams.ams_open_push SET status=?, total_count=?, success_count=?, fail_count=?,
          message=?, finished_at=now() WHERE id=?
        """)
        .params(status, total, success, failed,
            message == null || message.isBlank() ? null : message, pushId)
        .update();
  }

  /** 条目文件解析：新契约 files[0] 或旧格式 fileBase64 */
  @SuppressWarnings("unchecked")
  private FilePayload fileOf(Map<String, Object> body, Map<String, Object> meta, String externalId) {
    String b64 = null, fileName = null, mimeType = null;
    if (meta.get("files") instanceof List<?> fl && !fl.isEmpty() && fl.get(0) instanceof Map<?, ?> f0) {
      Map<String, Object> f = (Map<String, Object>) f0;
      b64 = str(f.get("fileBase64"));
      fileName = str(f.get("fileName"));
      mimeType = str(f.get("mimeType"));
    }
    if (b64 == null || b64.isBlank()) b64 = str(body.get("fileBase64"));
    if (fileName == null || fileName.isBlank()) fileName = str(body.getOrDefault("fileName", externalId + ".pdf"));
    if (mimeType == null || mimeType.isBlank()) mimeType = str(body.getOrDefault("mimeType", "application/pdf"));
    byte[] bytes;
    try {
      bytes = Base64.getDecoder().decode(b64 == null ? "" : b64);
    } catch (IllegalArgumentException e) {
      throw BizException.badRequest("VALIDATION_FAILED", "fileBase64 不是合法的 Base64");
    }
    if (bytes.length == 0) throw BizException.badRequest("VALIDATION_FAILED", "文件内容为空（files[0].fileBase64）");
    if (bytes.length > 50 * 1024 * 1024) throw BizException.badRequest("VALIDATION_FAILED", "文件超过 50MB 上限");
    return new FilePayload(fileName, mimeType, bytes);
  }

  private record FilePayload(String fileName, String mimeType, byte[] bytes) {}

  /** 类别判定：条目 category 字段 → 类型块存在性 → 批次类别 → 默认 voucher */
  private String categoryOf(Map<String, Object> item, String batchCategory) {
    String c = str(item.get("category"));
    if (c.isBlank()) {
      if (item.get("ledger") instanceof Map<?, ?>) c = "ledger";
      else if (item.get("report") instanceof Map<?, ?>) c = "report";
      else if (item.get("other") instanceof Map<?, ?>) c = "other";
      else if (item.get("voucher") instanceof Map<?, ?> || item.get("voucherNo") != null) c = "voucher";
    }
    if (c.isBlank()) c = batchCategory;
    if (c.isBlank()) c = "voucher";
    return List.of("voucher", "ledger", "report", "other").contains(c) ? c : "voucher";
  }

  private String destOf(Map<String, Object> body, Map<String, Object> app) {
    String d = str(body.get("destination"));
    if (d.isBlank()) d = str(app.get("default_destination"));
    return destOrDefault(d);
  }

  private static String destOrDefault(Object d) {
    String s = d == null ? "" : String.valueOf(d);
    return switch (s) {
      case DEST_AUTO -> s;
      // 2026-08-21 收敛：核对工作台已移除，统一进组卷工作台——
      // 历史遗留 to-check / to-review 归一为 to-volume，不再产生待核对台账/审核库孤儿数据
      case DEST_CHECK, DEST_REVIEW -> DEST_VOLUME;
      default -> DEST_VOLUME;
    };
  }

  @SuppressWarnings("unchecked")
  private static Map<String, Object> subMap(Map<String, Object> meta, String key) {
    return meta.get(key) instanceof Map<?, ?> m ? (Map<String, Object>) m : Map.of();
  }

  private String toJson(Object o) {
    try {
      return new com.fasterxml.jackson.databind.ObjectMapper().writeValueAsString(o);
    } catch (Exception e) {
      return "";
    }
  }

  private static String sha256(String s) {
    try {
      MessageDigest md = MessageDigest.getInstance("SHA-256");
      return HexFormat.of().formatHex(md.digest(s.getBytes(StandardCharsets.UTF_8)));
    } catch (Exception e) {
      return s;
    }
  }

  /** 变长 key-value → LinkedHashMap（避开 Map.of 10 对上限） */
  private static Map<String, Object> row(Object... kv) {
    Map<String, Object> m = new LinkedHashMap<>();
    for (int i = 0; i + 1 < kv.length; i += 2) m.put(String.valueOf(kv[i]), kv[i + 1]);
    return m;
  }

  private static String str(Object o) { return o == null ? "" : String.valueOf(o); }

  private static Integer intObj(Object o) {
    if (o instanceof Number n) return n.intValue();
    if (o instanceof String s && !s.isBlank()) {
      try { return Integer.parseInt(s.trim()); } catch (NumberFormatException ignored) { }
    }
    return null;
  }

  private static int intOr(Object o, int def) {
    Integer v = intObj(o);
    return v == null ? def : v;
  }

  private static Double doubleObj(Object o) {
    if (o instanceof Number n) return n.doubleValue();
    if (o instanceof String s && !s.isBlank()) {
      try { return Double.parseDouble(s.trim()); } catch (NumberFormatException ignored) { }
    }
    return null;
  }
}
