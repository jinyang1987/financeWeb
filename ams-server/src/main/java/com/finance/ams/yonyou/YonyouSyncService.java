package com.finance.ams.yonyou;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.YearMonth;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicBoolean;

import javax.sql.DataSource;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.finance.ams.alfresco.AlfrescoClient;
import com.finance.ams.api.BizException;
import com.finance.ams.configcenter.ConfigService;
import com.finance.ams.record.RecordService;
import com.finance.ams.sourcedoc.SourceDocService;
import com.finance.ams.volume.VolumeService;

/**
 * 用友 BIP → 会计档案 同步编排服务
 *
 * 流程（依据《用友BIP集成设计-2026-08-08.md》）：
 *  ① 本地锁防并发双跑（单实例 ams-server）
 *  ② 建批次（running）→ 账簿解析（accbookCode/GUID 双形态：凭证链用编码，报表链用 GUID）
 *  ③ 凭证列表按期间分页拉取（必须 periodStart/periodEnd 同传——空条件沙箱返回 0 条）
 *  ④ 逐张：幂等查重 → 详情补拉（审核/记账人，容错）→ 附件查询（有则下载建原始凭证子件）
 *     → 转换层映射 → 版式 PDF 生成 → RecordService.create 入收集池 → 明细 success
 *     单张失败不阻断批次（明细 failed + error）
 *  ⑤ 报表：余额表/发生表按期间查，items 非空才生成表格式 PDF 归档（空则如实记 0，不伪造）
 *  ⑥ autoGroup：成功件按"记账凭证+期间"自动建卷 → 加件 → 确认（消费赋号时机配置）
 *  ⑦ 批次汇总：success/partial/failed + 耗时
 *
 * 幂等：ams_sync_item 部分唯一索引 (item_type, external_id) WHERE status='success'，
 *       重跑同一期间已归档凭证自动 skipped。
 */
@Service
public class YonyouSyncService {

  private static final Logger log = LoggerFactory.getLogger(YonyouSyncService.class);

  static final String CONFIG_CONN = "yonyou.connection";
  static final String CONFIG_SCHEDULE = "yonyou.schedule";

  private final JdbcClient jdbc;
  private final YonyouClient client;
  private final YonyouTransformer transformer;
  private final VoucherPdfRenderer pdf;
  private final RecordService records;
  private final SourceDocService sourceDocs;
  private final VolumeService volumes;
  private final AlfrescoClient alfresco;
  private final com.finance.ams.alfresco.AlfrescoNodeClient nodes;
  private final ConfigService config;
  private final ObjectMapper json = new ObjectMapper();
  private final RestTemplate http = new RestTemplate();

  private final String seedAdminUser;
  private final String seedAdminPassword;

  /** 同步全局锁（防手动/自动并发双跑） */
  private final AtomicBoolean running = new AtomicBoolean(false);
  /** 账簿缓存（GUID 与编码极少变更） */
  private volatile Map<String, String> accbookCache;

  private final com.finance.ams.openapi.CollectItemService collectItems;
  private final com.finance.ams.openapi.PushLogService pushLogs;

  public YonyouSyncService(DataSource dataSource, YonyouClient client, YonyouTransformer transformer,
                           VoucherPdfRenderer pdf, RecordService records, SourceDocService sourceDocs,
                           VolumeService volumes, AlfrescoClient alfresco,
                           com.finance.ams.alfresco.AlfrescoNodeClient nodes, ConfigService config,
                           com.finance.ams.openapi.CollectItemService collectItems,
                           com.finance.ams.openapi.PushLogService pushLogs,
                           @Value("${ams.seed.admin-user:admin}") String seedAdminUser,
                           @Value("${ams.seed.admin-password:admin}") String seedAdminPassword) {
    this.jdbc = JdbcClient.create(dataSource);
    this.client = client;
    this.transformer = transformer;
    this.pdf = pdf;
    this.records = records;
    this.sourceDocs = sourceDocs;
    this.volumes = volumes;
    this.alfresco = alfresco;
    this.nodes = nodes;
    this.config = config;
    this.collectItems = collectItems;
    this.pushLogs = pushLogs;
    this.seedAdminUser = seedAdminUser;
    this.seedAdminPassword = seedAdminPassword;
  }

  public boolean isRunning() { return running.get(); }

  // ═══════════════════ 同步主流程 ═══════════════════

  /**
   * 执行一个期间的同步。
   *
   * @param period     会计期间 yyyy-MM
   * @param trigger    manual | auto
   * @param operator   触发人 userId（auto 时为 scheduler）
   * @param userTicket 手动同步时触发用户的 Alfresco ticket（建件权限/审计）；auto 传 null 用 seed admin
   * @param autoGroup  null=读调度配置；true/false=本次覆盖
   * @param review     null/false=入收集池（仅件数据，可直接组卷）；true=入审核库（待审核，审核通过后再组卷）
   */
  public Map<String, Object> syncNow(String period, String trigger, String operator,
                                     String userTicket, Boolean autoGroup, Boolean review) {
    return syncNow(period, trigger, operator, userTicket, autoGroup, review, null);
  }

  /**
   * 执行一个期间的同步（v2：去向模型）。
   *
   * @param destination auto-archive=直接入库（自动组卷）| to-volume=送组卷工作台 |
   *                    to-check=送核对工作台 | to-review=进审核库；null=按 autoGroup/review 旧语义
   */
  public Map<String, Object> syncNow(String period, String trigger, String operator,
                                     String userTicket, Boolean autoGroup, Boolean review,
                                     String destination) {
    if (period == null || !period.matches("\\d{4}-\\d{2}"))
      throw BizException.badRequest("VALIDATION_FAILED", "会计期间格式须为 yyyy-MM");
    if (!running.compareAndSet(false, true))
      throw new BizException(HttpStatus.CONFLICT, "SYNC_RUNNING", "已有同步任务在执行中，请稍后");

    long batchId = -1;
    String ticket = userTicket;
    try {
      // 服务端身份（自动调度或 ticket 缺失时）
      if (ticket == null || ticket.isBlank()) {
        ticket = alfresco.loginTicket(seedAdminUser, seedAdminPassword);
      }
      YonyouClient.Conn conn = client.conn();
      Map<String, String> book = resolveAccbook();
      boolean doGroup = autoGroup != null ? autoGroup : scheduleConfig().autoGroup();
      boolean toReview = review != null && review;
      // ── 去向模型（destination 优先于旧 autoGroup/review 语义） ──
      String dest = destination == null ? "" : destination;
      switch (dest) {
        case "auto-archive" -> { doGroup = true; toReview = false; }
        case "to-volume" -> { doGroup = false; toReview = false; }
        case "to-check" -> { doGroup = false; toReview = false; }
        case "to-review" -> { doGroup = false; toReview = true; }
        default -> { /* 旧语义：autoGroup/review 参数 */ }
      }
      // 进审核库时不允许自动组卷（须审核通过后才能组卷）
      if (toReview) doGroup = false;
      if (dest.isBlank()) dest = toReview ? "to-review" : (doGroup ? "auto-archive" : "to-volume");

      batchId = createBatch(period, trigger, operator);
      String batchNo = jdbc.sql("SELECT batch_no FROM ams_sync_batch WHERE id = ?")
          .param(batchId).query(String.class).single();
      pushLogs.info(batchNo, "accept", String.format("用友抓取同步受理：期间 %s（%s），去向 %s",
          period, "auto".equals(trigger) ? "自动调度" : "手动触发", dest));
      long t0 = System.currentTimeMillis();
      int success = 0, skipped = 0, failed = 0, reportCount = 0;
      List<String> successNodeIds = new ArrayList<>();
      List<String> successVoucherNos = new ArrayList<>();
      List<String> successExternalIds = new ArrayList<>();
      StringBuilder notes = new StringBuilder();

      // ── 凭证链 ──
      List<Map<String, Object>> vouchers = fetchAllVouchers(book.get("code"), period);
      int total = vouchers.size();
      if (total == 0) notes.append("该期间用友侧无凭证数据；");

      // 附件批量预查（每 50 张一批）
      Map<String, List<Map<String, Object>>> filesMap = queryFilesBatched(vouchers);

      for (Map<String, Object> rec : vouchers) {
        Object headerObj = rec.get("header");
        if (!(headerObj instanceof Map)) continue;
        @SuppressWarnings("unchecked")
        Map<String, Object> header = (Map<String, Object>) rec.get("header");
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> body = rec.get("body") instanceof List<?> l
            ? (List<Map<String, Object>>) l : List.of();
        String externalId = String.valueOf(header.get("id"));
        String voucherNo = String.valueOf(header.getOrDefault("displayname", ""));

        if (alreadySynced("voucher", externalId)) {
          insertItem(batchId, "voucher", externalId, voucherNo, null, null, "skipped", null, null, "重复同步跳过（已归档）");
          skipped++;
          continue;
        }
        try {
          // 详情补拉（审核人/记账人仅在详情接口；失败不阻断，用列表数据）
          Map<String, Object> detail = tryDetail(externalId);
          if (detail != null) {
            header = mergeHeader(header, detail);
            Object bodies = detail.get("bodies");
            if (bodies instanceof List<?> l && !l.isEmpty()) {
              @SuppressWarnings("unchecked")
              List<Map<String, Object>> bl = (List<Map<String, Object>>) l;
              body = bl;
            }
          }

          var t = transformer.transform(header, body, conn.fondsCode());
          byte[] pdfBytes = pdf.render(t.pdfView());
          String filename = "记账凭证-" + t.voucherNo() + "-" + period + ".pdf";

          var view = records.create(operator, ticket, t.cmd(), filename, "application/pdf", pdfBytes);
          String nodeId = String.valueOf(view.get("nodeId"));
          String archiveCode = String.valueOf(view.get("archiveCode"));

          // 附件（best-effort）：有电子附件则建原始凭证子件
          int attachOk = syncAttachments(ticket, nodeId, t.voucherNo(), filesMap.get(externalId), notes);

          insertItem(batchId, "voucher", externalId, t.voucherNo(), t.summary(), t.debitTotal(),
              "success", nodeId, archiveCode,
              attachOk > 0 ? "含 " + attachOk + " 个电子附件" : null);
          successNodeIds.add(nodeId);
          successVoucherNos.add(t.voucherNo());
          successExternalIds.add(externalId);
          success++;
        } catch (Exception e) {
          log.warn("凭证同步失败 {}（{}）: {}", voucherNo, externalId, e.getMessage());
          insertItem(batchId, "voucher", externalId, voucherNo, null, null, "failed", null, null, e.getMessage());
          failed++;
        }
      }

      // ── 报表链（诚实策略：有数据才归档） ──
      reportCount += syncReport(ticket, operator, batchId, book, period, "balance", "科目余额表", conn.fondsCode(), notes);
      reportCount += syncReport(ticket, operator, batchId, book, period, "profit", "利润发生表", conn.fondsCode(), notes);

      // ── 进审核库（可选）：同步成功件置「待审核」，先审核后组卷 ──
      if (toReview && !successNodeIds.isEmpty()) {
        int moved = 0;
        for (String nodeId : successNodeIds) {
          try {
            collectItems.enterReviewLibrary(ticket, nodeId, operator, "抓取批次 " + batchNo + " 转审核");
            moved++;
          } catch (Exception e) {
            log.warn("进审核库失败 {}: {}", nodeId, e.getMessage());
          }
        }
        notes.append("已入审核库 ").append(moved).append(" 件（审核通过后可组卷）；");
        pushLogs.info(batchNo, "route", moved + " 件已转审核库（档案整理→核对工作台·待审核）");
      }

      // ── 收集台账：每条成功件统一登记（支撑核对工作台待核对/去向追踪） ──
      for (int i = 0; i < successNodeIds.size(); i++) {
        collectItems.record(successNodeIds.get(i), conn.fondsCode(), "yonyou-pull", batchNo,
            "voucher", dest, "to-check".equals(dest) ? "pending" : "na",
            successExternalIds.get(i), successVoucherNos.get(i), "记账凭证");
      }
      if ("to-check".equals(dest) && !successNodeIds.isEmpty()) {
        notes.append("已进入核对工作台待核对队列 ").append(successNodeIds.size()).append(" 件；");
        pushLogs.info(batchNo, "route", successNodeIds.size() + " 件已进入核对工作台·收集池待核对队列");
      } else if ("to-volume".equals(dest) && !successNodeIds.isEmpty()) {
        notes.append("已进入组卷工作台待组卷池 ").append(successNodeIds.size()).append(" 件；");
      }

      // ── 自动组卷 ──
      String volumeNodeId = null;
      if (doGroup && !successNodeIds.isEmpty()) {
        try {
          volumeNodeId = autoGroup(ticket, operator, conn.fondsCode(), period, successNodeIds, notes);
        } catch (Exception e) {
          log.warn("自动组卷失败: {}", e.getMessage());
          notes.append("自动组卷失败：").append(e.getMessage()).append("；");
        }
      }

      // ── 批次汇总 ──
      String status = failed == 0 ? "success" : (success > 0 || reportCount > 0 ? "partial" : "failed");
      if (total == 0 && reportCount == 0) status = "success";
      finishBatch(batchId, status, total, success, skipped, failed, reportCount, volumeNodeId,
          notes.toString(), t0);
      pushLogs.info(batchNo, "receipt", String.format("抓取同步完成：凭证 %d/%d 成功、%d 跳过、%d 失败、报表 %d。%s",
          success, total, skipped, failed, reportCount, notes));
      log.info("同步完成: 期间 {} 批次 {} —— 凭证 {}/{} 成功、{} 跳过、{} 失败、报表 {}、耗时 {}ms",
          period, batchId, success, total, skipped, failed, reportCount, System.currentTimeMillis() - t0);
      return batchView(batchId);
    } catch (BizException e) {
      if (batchId > 0) finishBatch(batchId, "failed", 0, 0, 0, 0, 0, null, e.getMessage(), 0);
      throw e;
    } catch (Exception e) {
      if (batchId > 0) finishBatch(batchId, "failed", 0, 0, 0, 0, 0, null, e.getMessage(), 0);
      throw new BizException(HttpStatus.INTERNAL_SERVER_ERROR, "SYNC_FAILED", "同步失败: " + e.getMessage());
    } finally {
      running.set(false);
    }
  }

  // ═══════════════════ 凭证拉取 ═══════════════════

  @SuppressWarnings("unchecked")
  private List<Map<String, Object>> fetchAllVouchers(String accbookCode, String period) {
    List<Map<String, Object>> all = new ArrayList<>();
    int page = 1;
    while (true) {
      Map<String, Object> resp = client.queryVouchers(accbookCode, period, page, 50);
      Object data = resp.get("data");
      if (!(data instanceof Map)) break;
      Map<String, Object> d = (Map<String, Object>) data;
      Object list = d.get("recordList");
      if (list instanceof List<?> l) {
        for (Object o : l) if (o instanceof Map) all.add((Map<String, Object>) o);
        long recordCount = d.get("recordCount") instanceof Number n ? n.longValue() : all.size();
        if (l.isEmpty() || all.size() >= recordCount) break;
      } else break;
      page++;
      if (page > 100) break; // 安全阀（5000 张/期间）
    }
    return all;
  }

  /** 凭证详情补拉（审核人/记账人只存在于详情；404/失败返回 null 用列表数据） */
  @SuppressWarnings("unchecked")
  private Map<String, Object> tryDetail(String voucherId) {
    try {
      Map<String, Object> resp = client.queryVoucherDetail(voucherId);
      if ("200".equals(String.valueOf(resp.get("code"))) && resp.get("data") instanceof Map<?, ?> m
          && !m.isEmpty()) {
        return (Map<String, Object>) m;
      }
    } catch (Exception e) {
      log.debug("凭证详情补拉失败 {}: {}", voucherId, e.getMessage());
    }
    return null;
  }

  /** 详情字段并入列表 header（详情优先的字段：auditorObj/tallyManObj/makerObj） */
  private Map<String, Object> mergeHeader(Map<String, Object> header, Map<String, Object> detail) {
    Map<String, Object> merged = new LinkedHashMap<>(header);
    for (String k : List.of("auditorObj", "tallyManObj", "makerObj", "voucherTypeObj",
        "accBookObj", "makeTime", "periodUnion", "attachedBill",
        "totalDebitOrg", "totalCreditOrg")) {
      Object v = detail.get(k);
      if (v != null) merged.put(k, v);
    }
    return merged;
  }

  // ═══════════════════ 附件同步（best-effort） ═══════════════════

  @SuppressWarnings("unchecked")
  private Map<String, List<Map<String, Object>>> queryFilesBatched(List<Map<String, Object>> vouchers) {
    Map<String, List<Map<String, Object>>> out = new LinkedHashMap<>();
    List<String> ids = vouchers.stream()
        .map(v -> v.get("header"))
        .filter(Map.class::isInstance).map(Map.class::cast)
        .map(h -> String.valueOf(h.get("id")))
        .toList();
    for (int i = 0; i < ids.size(); i += 50) {
      try {
        Map<String, Object> resp = client.queryBusinessFiles(ids.subList(i, Math.min(i + 50, ids.size())));
        if (resp.get("data") instanceof Map<?, ?> d) {
          for (Map.Entry<?, ?> e : d.entrySet()) {
            if (e.getValue() instanceof List<?> l && !l.isEmpty()) {
              List<Map<String, Object>> files = new ArrayList<>();
              for (Object o : l) if (o instanceof Map) files.add((Map<String, Object>) o);
              out.put(String.valueOf(e.getKey()), files);
            }
          }
        }
      } catch (Exception e) {
        log.debug("附件批量查询失败: {}", e.getMessage());
      }
    }
    return out;
  }

  /** 下载凭证电子附件并建原始凭证子件；返回成功附件数 */
  private int syncAttachments(String ticket, String recordNodeId, String voucherNo,
                              List<Map<String, Object>> files, StringBuilder notes) {
    if (files == null || files.isEmpty()) return 0;
    int ok = 0;
    int seq = 0;
    for (Map<String, Object> f : files) {
      seq++;
      String fileName = str(f.get("fileName"));
      String filePath = str(f.get("filePath"));
      if (filePath.isBlank()) continue;
      try {
        byte[] bytes = http.getForObject(filePath, byte[].class);
        if (bytes == null || bytes.length == 0) continue;
        Map<String, Object> fields = new LinkedHashMap<>();
        fields.put("documentNo", voucherNo + "-FJ-" + seq);
        fields.put("docTypeCode", "QT");
        fields.put("docTypeName", "外来电子附件");
        fields.put("parentVoucherNo", voucherNo);
        fields.put("attachmentSequence", seq);
        String mime = fileName.toLowerCase().endsWith(".pdf") ? "application/pdf"
            : fileName.toLowerCase().endsWith(".ofd") ? "application/ofd" : "application/octet-stream";
        sourceDocs.create(ticket, recordNodeId, fields, fileName.isBlank() ? "附件-" + seq : fileName, mime, bytes);
        ok++;
      } catch (Exception e) {
        notes.append("凭证 ").append(voucherNo).append(" 附件 ").append(fileName).append(" 同步失败：")
            .append(e.getMessage()).append("；");
      }
    }
    return ok;
  }

  // ═══════════════════ 报表同步 ═══════════════════

  /**
   * 报表同步：items 非空才生成表格 PDF 入档（archiveType=财务报告）。
   * @return 归档份数（0/1）
   */
  @SuppressWarnings("unchecked")
  private int syncReport(String ticket, String operator, long batchId, Map<String, String> book,
                         String period, String kind, String title, String fondsCode, StringBuilder notes) {
    try {
      Map<String, Object> resp = "balance".equals(kind)
          ? client.queryBalanceReport(book.get("guid"), period)
          : client.queryProfitReport(book.get("guid"), period);
      Object data = resp.get("data");
      if (!(data instanceof Map)) return 0;
      Object items = ((Map<String, Object>) data).get("items");
      if (!(items instanceof List) || ((List<?>) items).isEmpty()) {
        notes.append(title).append("：该期间无报表数据；");
        return 0;
      }
      List<Map<String, Object>> rows = (List<Map<String, Object>>) items;

      String[] heads = "balance".equals(kind)
          ? new String[]{"项目编码", "项目名称", "年初余额", "期末余额"}
          : new String[]{"项目编码", "项目名称", "本期发生", "上期发生", "累计发生"};
      String[] keys = "balance".equals(kind)
          ? new String[]{"code", "name", "BEGINNING", "TERMINAL"}
          : new String[]{"code", "name", "OCCUR", "UP_OCCUR", "GRAND"};
      List<List<String>> table = new ArrayList<>();
      for (Map<String, Object> it : rows) {
        List<String> row = new ArrayList<>();
        for (String k : keys) row.add(str(it.get(k)));
        table.add(row);
      }
      byte[] bytes = pdf.renderSimpleTable(title + "（" + period + "）", book.get("name"), heads, table);
      String filename = title + "-" + period + ".pdf";

      String externalId = kind + "-" + period + "-" + book.get("guid");
      if (alreadySynced("report", externalId)) {
        insertItem(batchId, "report", externalId, title + "-" + period, null, null, "skipped", null, null, "重复同步跳过");
        return 0;
      }
      var cmd = new RecordService.CreateCmd(
          fondsCode, title + "-" + period, "财务报告", null,
          null, Integer.parseInt(period.substring(0, 4)), Integer.parseInt(period.substring(5, 7)), "10年",
          "digital-native", "electronic", operator, null,
          "用友BIP " + title + "（期间 " + period + "，项目 " + rows.size() + " 项）",
          new RecordService.VoucherMeta(null, null, period, null, null, null, null, "用友BIP", externalId,
              title + "（" + book.get("name") + " " + period + "）"));
      var view = records.create(operator, ticket, cmd, filename, "application/pdf", bytes);
      insertItem(batchId, "report", externalId, title + "-" + period, null, null,
          "success", String.valueOf(view.get("nodeId")), String.valueOf(view.get("archiveCode")),
          rows.size() + " 个报表项目");
      return 1;
    } catch (Exception e) {
      log.warn("报表同步失败 {} {}: {}", kind, period, e.getMessage());
      notes.append(title).append("同步失败：").append(e.getMessage()).append("；");
      return 0;
    }
  }

  // ═══════════════════ 自动组卷 ═══════════════════

  /** 建卷《{年}年{月}月记账凭证卷》→ 加件 → 确认（消费赋号时机配置）；返回卷节点 id */
  private String autoGroup(String ticket, String operator, String fondsCode, String period,
                           List<String> recordNodeIds, StringBuilder notes) {
    int year = Integer.parseInt(period.substring(0, 4));
    int month = Integer.parseInt(period.substring(5, 7));
    YearMonth ym = YearMonth.of(year, month);
    String title = year + "年" + month + "月记账凭证卷";
    var createCmd = new VolumeService.CreateCmd(
        fondsCode, title, "记账凭证", "KP", year, "30年", "D30",
        ym.atDay(1).toString(), ym.atEndOfMonth().toString(), "electronic", "普通");
    Map<String, Object> vol = volumes.create(operator, ticket, createCmd);
    String volumeId = String.valueOf(vol.get("nodeId"));   // toView 键名为 nodeId（非 id）
    volumes.addItems(ticket, volumeId, recordNodeIds, null);
    Map<String, Object> confirmed = volumes.confirm(ticket, operator, volumeId);
    notes.append("自动组卷：《").append(title).append("》").append(recordNodeIds.size()).append(" 件");
    Object vc = confirmed.get("volumeCode");
    if (vc != null && !String.valueOf(vc).isBlank()) notes.append("，档号 ").append(vc);
    notes.append("；");
    return volumeId;
  }

  // ═══════════════════ 账簿缓存 ═══════════════════

  private Map<String, String> resolveAccbook() {
    if (accbookCache != null) return accbookCache;
    synchronized (this) {
      if (accbookCache != null) return accbookCache;
      Map<String, Object> book = client.queryAccbook();
      accbookCache = Map.of(
          "guid", String.valueOf(book.get("id")),
          "code", String.valueOf(book.get("code")),
          "name", String.valueOf(book.getOrDefault("name", "")));
      log.info("用友账簿解析: {}（code={}）", accbookCache.get("name"), accbookCache.get("code"));
      return accbookCache;
    }
  }

  /** 连接配置变更后调用，丢弃账簿缓存 */
  public void invalidateAccbookCache() { accbookCache = null; }

  // ═══════════════════ 批次/明细持久化 ═══════════════════

  private long createBatch(String period, String trigger, String operator) {
    String today = LocalDate.now().format(DateTimeFormatter.BASIC_ISO_DATE);
    int seq = jdbc.sql("SELECT count(*) FROM ams_sync_batch WHERE batch_no LIKE 'SYNC-' || ? || '-%'")
        .param(today).query(Integer.class).single() + 1;
    String batchNo = "SYNC-" + today + "-" + String.format("%03d", seq);
    return jdbc.sql("""
        INSERT INTO ams_sync_batch (batch_no, period, trigger_type, operator)
        VALUES (?, ?, ?, ?) RETURNING id
        """)
        .params(batchNo, period, trigger, operator == null || operator.isBlank() ? "scheduler" : operator)
        .query(Long.class).single();
  }

  private void finishBatch(long batchId, String status, int total, int success, int skipped,
                           int failed, int reportCount, String volumeNodeId, String message, long t0) {
    jdbc.sql("""
        UPDATE ams_sync_batch SET status=?, total_count=?, success_count=?, skip_count=?,
          fail_count=?, report_count=?, volume_node_id=?, message=?, finished_at=now()
        WHERE id=?
        """)
        .params(status, total, success, skipped, failed, reportCount, volumeNodeId,
            message == null || message.isBlank() ? null : message, batchId)
        .update();
  }

  private void insertItem(long batchId, String itemType, String externalId, String voucherNo,
                          String summary, BigDecimal amount, String status,
                          String recordNodeId, String archiveCode, String error) {
    jdbc.sql("""
        INSERT INTO ams_sync_item (batch_id, item_type, external_id, voucher_no, summary, amount,
          status, record_node_id, archive_code, error)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """)
        .params(batchId, itemType, externalId, voucherNo, summary, amount, status, recordNodeId, archiveCode, error)
        .update();
  }

  /** 幂等判定：该外部单据是否已成功入档过 */
  private boolean alreadySynced(String itemType, String externalId) {
    return !jdbc.sql("SELECT 1 FROM ams_sync_item WHERE item_type=? AND external_id=? AND status='success' LIMIT 1")
        .params(itemType, externalId).query(Integer.class).list().isEmpty();
  }

  // ═══════════════════ 查询视图 ═══════════════════

  /** 批次列表（近 N 条） */
  public List<Map<String, Object>> listBatches(int limit) {
    return jdbc.sql("""
        SELECT id, batch_no, period, trigger_type, status, total_count, success_count,
               skip_count, fail_count, report_count, volume_node_id, message, operator,
               started_at::text AS started_at, finished_at::text AS finished_at,
               EXTRACT(EPOCH FROM (finished_at - started_at))::int AS elapsed_seconds
        FROM ams_sync_batch ORDER BY id DESC LIMIT ?
        """)
        .param(Math.min(Math.max(limit, 1), 200))
        .query((rs, i) -> rowToMap(rs)).list();
  }

  /** 批次详情 + 明细 */
  public Map<String, Object> batchDetail(long batchId) {
    Map<String, Object> batch = batchView(batchId);
    List<Map<String, Object>> items = jdbc.sql("""
        SELECT id, item_type, external_id, voucher_no, summary, amount, status,
               record_node_id, archive_code, error, created_at::text AS created_at
        FROM ams_sync_item WHERE batch_id=? ORDER BY id
        """)
        .param(batchId)
        .query((rs, i) -> rowToMap(rs)).list();
    batch.put("items", items);
    return batch;
  }

  private Map<String, Object> batchView(long batchId) {
    return jdbc.sql("""
        SELECT id, batch_no, period, trigger_type, status, total_count, success_count,
               skip_count, fail_count, report_count, volume_node_id, message, operator,
               started_at::text AS started_at, finished_at::text AS finished_at,
               EXTRACT(EPOCH FROM (finished_at - started_at))::int AS elapsed_seconds
        FROM ams_sync_batch WHERE id=?
        """)
        .param(batchId)
        .query((rs, i) -> rowToMap(rs)).optional()
        .orElseThrow(() -> BizException.notFound("同步批次 " + batchId));
  }

  private static Map<String, Object> rowToMap(java.sql.ResultSet rs) throws java.sql.SQLException {
    Map<String, Object> m = new LinkedHashMap<>();
    var md = rs.getMetaData();
    for (int i = 1; i <= md.getColumnCount(); i++) {
      m.put(md.getColumnLabel(i), rs.getObject(i));
    }
    return m;
  }

  // ═══════════════════ 调度配置读写 ═══════════════════

  public record ScheduleConfig(boolean enabled, String cron, boolean autoGroup,
                               String destination, String description) {}

  /**
   * 读调度配置。
   * 优先：系统管理→连接配置→数据源连接（datasource.config 中 yonyou 源的
   * scheduleEnabled/scheduleCron/defaultDestination，2026-08-16 配置收敛后的正式入口）。
   * 回退：旧 yonyou.schedule 配置。默认：关，每月1日 02:30，同步上月，自动组卷开。
   */
  public ScheduleConfig scheduleConfig() {
    try {
      var ds = config.get("datasource.config");
      if (ds.isPresent()) {
        var root = json.readTree(ds.get().valueJson());
        for (var s : root.path("sources")) {
          if (!"yonyou".equals(s.path("type").asText(""))) continue;
          var cfg = s.path("config");
          String cron = cfg.path("scheduleCron").asText("");
          if (!cron.isBlank()) {
            String dest = cfg.path("defaultDestination").asText("");
            return new ScheduleConfig(
                cfg.path("scheduleEnabled").asBoolean(false), cron,
                "auto-archive".equals(dest), dest, "");
          }
        }
      }
    } catch (Exception ignored) { /* 回退旧配置 */ }
    return config.get(CONFIG_SCHEDULE).map(e -> {
      try {
        var n = json.readTree(e.valueJson());
        return new ScheduleConfig(
            n.path("enabled").asBoolean(false),
            n.path("cron").asText("0 30 2 1 * *"),
            n.path("autoGroup").asBoolean(true),
            n.path("destination").asText(""),
            n.path("description").asText(""));
      } catch (Exception ex) {
        return defaults();
      }
    }).orElseGet(YonyouSyncService::defaults);
  }

  private static ScheduleConfig defaults() {
    return new ScheduleConfig(false, "0 30 2 1 * *", true, "", "");
  }

  /** 写调度配置 */
  public void saveSchedule(ScheduleConfig cfg, String updatedBy) {
    try {
      Map<String, Object> v = new LinkedHashMap<>();
      v.put("enabled", cfg.enabled());
      v.put("cron", cfg.cron());
      v.put("autoGroup", cfg.autoGroup());
      v.put("destination", cfg.destination());
      v.put("description", cfg.description());
      config.put(CONFIG_SCHEDULE, json.writeValueAsString(v), updatedBy);
    } catch (Exception e) {
      throw BizException.badRequest("CONFIG_SAVE_FAILED", "调度配置保存失败: " + e.getMessage());
    }
  }

  /** 上一会计期间（yyyy-MM） */
  public static String previousPeriod() {
    return YearMonth.now().minusMonths(1).toString();
  }

  private static String str(Object o) { return o == null ? "" : String.valueOf(o); }
}
