package com.finance.ams.record;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.function.Predicate;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;
import org.springframework.web.client.HttpClientErrorException;

import com.finance.ams.alfresco.AlfrescoNodeClient;
import com.finance.ams.alfresco.RepoLayout;
import com.finance.ams.api.BizException;

/**
 * 件域服务（P1-①）：上传建件 / 收集池列表 / 内容读取
 *
 * 节点落点：/会计档案管理/{全宗}/_收集池/{件}（finance:record，cm:content 子类）。
 * 确认组卷时由卷域服务把节点 move 进案卷目录（nodeRef 不变）。
 *
 * 设计要点：
 *  - 列表走 children API（数据库事务读），上传后立即可见，不依赖 Solr 索引；
 *  - 全宗/收集池节点 id 进程内缓存（fonds 极少变更；404 时自动清缓存重解析一次）；
 *  - 件级档号在建件时为临时值 PEND-xxxxxxxx，确认组卷赋号时替换为正式档号。
 */
@Service
public class RecordService {

  private static final Logger log = LoggerFactory.getLogger(RecordService.class);

  /** 全宗根目录名（/Company Home 下） */
  static final String ROOT_NAME = "会计档案管理";
  /** 收集池目录名（每个全宗下一个） */
  static final String POOL_NAME = "_收集池";
  /** 回收站目录名（每个全宗下一个；逻辑删除件移入，可恢复） */
  static final String RECYCLE_NAME = "_回收站";
  /** 件级临时档号标记（未赋号）：全宗号 + 此后缀 + uuid8 */
  static final String PENDING_CODE_SUFFIX = "-PEND-";

  private final AlfrescoNodeClient nodes;
  private final RepoLayout layout;
  private final ApplicationEventPublisher events;
  private final com.finance.ams.fixity.FixityService fixity;

  /** 全宗号 → 全宗节点 id */
  private final Map<String, String> fondsCache = new ConcurrentHashMap<>();
  /** 全宗节点 id → 收集池节点 id */
  private final Map<String, String> poolCache = new ConcurrentHashMap<>();
  /** 根目录（会计档案管理）节点 id */
  private volatile String rootNodeId;

  public RecordService(AlfrescoNodeClient nodes, RepoLayout layout, ApplicationEventPublisher events,
                       com.finance.ams.fixity.FixityService fixity) {
    this.nodes = nodes;
    this.layout = layout;
    this.events = events;
    this.fixity = fixity;
  }

  // ═══════════════════ 上传建件 ═══════════════════

  public record CreateCmd(
      String fondsCode, String voucherNo, String archiveType, String department,
      Double amount, Integer year, Integer month, String retention,
      String source, String carrierType, String preparer, String voucherCategory,
      String remarks, VoucherMeta voucherMeta, SourceDocMeta sourceDocMeta) {

    /** 兼容旧签名（无凭证扩展元数据、无原始凭证元数据） */
    public CreateCmd(String fondsCode, String voucherNo, String archiveType, String department,
                     Double amount, Integer year, Integer month, String retention,
                     String source, String carrierType, String preparer, String voucherCategory,
                     String remarks) {
      this(fondsCode, voucherNo, archiveType, department, amount, year, month, retention,
          source, carrierType, preparer, voucherCategory, remarks, null, null);
    }

    /** 兼容旧签名（有凭证扩展元数据、无原始凭证元数据） */
    public CreateCmd(String fondsCode, String voucherNo, String archiveType, String department,
                     Double amount, Integer year, Integer month, String retention,
                     String source, String carrierType, String preparer, String voucherCategory,
                     String remarks, VoucherMeta voucherMeta) {
      this(fondsCode, voucherNo, archiveType, department, amount, year, month, retention,
          source, carrierType, preparer, voucherCategory, remarks, voucherMeta, null);
    }
  }

  /**
   * 凭证扩展元数据（finance-model v2.2 件级属性，用友BIP同步/凭证类件专用）。
   * description 落 Alfresco 标准属性 cm:description（摘要）。
   */
  public record VoucherMeta(
      String voucherWord, String voucherDate, String period,
      String auditor, String tallyMan, String entriesJson,
      Integer attachedBillCount, String sourceSystem, String externalId,
      String description) {}

  /**
   * 原始凭证富元数据（finance-model v2.7 件级 srcDoc* 属性；方案A 载体统一到 record）。
   * 原始凭证 = voucherCategory='原始凭证' 的件，承载 96 类目录编码 + 票据信息 + 类型扩展字段。
   * 字段依据 DA/T 95-2022 + 发票/财政票据规定（目录见 financeWeb/src/types/sourceDocument.ts）。
   * 金额/业务日期/制单人/审核人等公共项复用既有件级属性（amount/voucherDate/preparer/auditor）。
   */
  public record SourceDocMeta(
      String docTypeCode, String docTypeName, String docNo,
      String counterpartyName, String counterpartyTaxId,
      String summary, String amountUpper, String businessCategory,
      String extFieldsJson) {}

  /**
   * 上传建件：建 finance:record 节点（全属性）→ 写入文件内容；内容失败回滚删节点。
   */
  public Map<String, Object> create(String userId, String ticket, CreateCmd cmd,
                                    String filename, String mimetype, byte[] bytes) {
    validate(cmd, filename, bytes);
    String fondsId = resolveFonds(ticket, cmd.fondsCode());
    String poolId = ensurePool(ticket, fondsId);

    Map<String, Object> props = new LinkedHashMap<>();
    // 临时档号：{全宗号}-PEND-xxxxxxxx。带全宗前缀是为了让前端按 archiveCode 前缀的
    // 全宗过滤逻辑继续生效；确认组卷赋号时替换为正式档号（P0-7 流水）。
    props.put("finance:archiveCode", cmd.fondsCode().toUpperCase() + PENDING_CODE_SUFFIX
        + UUID.randomUUID().toString().substring(0, 8));
    props.put("finance:voucherNo", cmd.voucherNo());
    props.put("finance:archiveType", cmd.archiveType());
    if (notBlank(cmd.department())) props.put("finance:department", cmd.department());
    if (cmd.amount() != null) props.put("finance:amount", cmd.amount());
    props.put("finance:year", cmd.year());
    if (cmd.month() != null) props.put("finance:month", cmd.month());
    if (notBlank(cmd.retention())) props.put("finance:retention", cmd.retention());
    props.put("finance:recordStatus", "仅件数据");
    props.put("finance:source", cmd.source());
    props.put("finance:carrierType", cmd.carrierType());
    if (notBlank(cmd.preparer())) props.put("finance:preparer", cmd.preparer());
    if (notBlank(cmd.voucherCategory())) props.put("finance:voucherCategory", cmd.voucherCategory());
    if (notBlank(cmd.remarks())) props.put("finance:recordRemark", cmd.remarks());
    props.put("finance:numbered", false);
    // v2.2 凭证扩展元数据（用友BIP同步等凭证类件）
    VoucherMeta vm = cmd.voucherMeta();
    if (vm != null) {
      if (notBlank(vm.voucherWord())) props.put("finance:voucherWord", vm.voucherWord());
      if (notBlank(vm.voucherDate())) props.put("finance:voucherDate", vm.voucherDate());
      if (notBlank(vm.period())) props.put("finance:period", vm.period());
      if (notBlank(vm.auditor())) props.put("finance:auditor", vm.auditor());
      if (notBlank(vm.tallyMan())) props.put("finance:tallyMan", vm.tallyMan());
      if (notBlank(vm.entriesJson())) props.put("finance:entries", vm.entriesJson());
      if (vm.attachedBillCount() != null) props.put("finance:attachedBillCount", vm.attachedBillCount());
      if (notBlank(vm.sourceSystem())) props.put("finance:sourceSystem", vm.sourceSystem());
      if (notBlank(vm.externalId())) props.put("finance:externalId", vm.externalId());
      if (notBlank(vm.description())) props.put("cm:description", vm.description());
    }
    // v2.7 原始凭证富元数据（方案A：原始凭证=件，类型与票据信息落 srcDoc* 属性）
    SourceDocMeta sd = cmd.sourceDocMeta();
    if (sd != null) {
      if (notBlank(sd.docTypeCode())) props.put("finance:srcDocTypeCode", sd.docTypeCode());
      if (notBlank(sd.docTypeName())) props.put("finance:srcDocTypeName", sd.docTypeName());
      if (notBlank(sd.docNo())) props.put("finance:srcDocNo", sd.docNo());
      if (notBlank(sd.counterpartyName())) props.put("finance:srcDocCounterpartyName", sd.counterpartyName());
      if (notBlank(sd.counterpartyTaxId())) props.put("finance:srcDocCounterpartyTaxId", sd.counterpartyTaxId());
      if (notBlank(sd.summary())) props.put("finance:srcDocSummary", sd.summary());
      if (notBlank(sd.amountUpper())) props.put("finance:srcDocAmountUpper", sd.amountUpper());
      if (notBlank(sd.businessCategory())) props.put("finance:srcDocBusinessCategory", sd.businessCategory());
      if (notBlank(sd.extFieldsJson())) props.put("finance:srcDocExtFields", sd.extFieldsJson());
    }

    // ═══ 数电票/电子发票 XML 源文件识别（2026-08-29 T2）═══
    // 财政部规定：数电票归档必须保存含数字签名的 XML 源文件。此处对 XML 做防御性解析：
    // 票面要素回填 srcDoc*（调用方显式传入优先）、纯文本进 ocrText（全文索引管道）、
    // 签名元素存在性记入扩展字段。解析失败按原始字节归档，绝不阻断归档。
    if (isXmlContent(mimetype, filename)) {
      try {
        var px = com.finance.ams.sourcedoc.XmlInvoiceParser.parse(bytes);
        if (!px.plainText().isBlank()) {
          props.put("finance:ocrText", com.finance.ams.sourcedoc.XmlInvoiceParser.capText(px.plainText(), 40000));
        }
        if (px.looksLikeInvoice()) {
          if (isBlankProp(props, "finance:srcDocTypeCode")) {
            props.put("finance:srcDocTypeCode", "vat-electronic-invoice");
            props.put("finance:srcDocTypeName", "全面数字化电子发票（数电票）");
          }
          props.put("finance:srcDocExtFields", JSON.writeValueAsString(
              mergeExtFields(props.get("finance:srcDocExtFields"), px)));
          if (isBlankProp(props, "finance:srcDocNo") && px.fields().containsKey("invoiceNo")) {
            props.put("finance:srcDocNo", px.fields().get("invoiceNo"));
          }
          // 收票入账场景：对方单位=销售方（出票场景由业务系统显式传入覆盖）
          if (isBlankProp(props, "finance:srcDocCounterpartyName") && px.fields().containsKey("sellerName")) {
            props.put("finance:srcDocCounterpartyName", px.fields().get("sellerName"));
          }
          if (isBlankProp(props, "finance:srcDocCounterpartyTaxId") && px.fields().containsKey("sellerTaxId")) {
            props.put("finance:srcDocCounterpartyTaxId", px.fields().get("sellerTaxId"));
          }
          if (!props.containsKey("finance:amount") && px.fields().containsKey("totalAmount")) {
            try {
              props.put("finance:amount", Double.parseDouble(px.fields().get("totalAmount")));
            } catch (NumberFormatException ignored) { /* 价税合计非数字时跳过 */ }
          }
          if (isBlankProp(props, "finance:voucherDate") && px.fields().containsKey("issueDate")) {
            String d = px.fields().get("issueDate");
            if (d.matches("\\d{4}-\\d{2}-\\d{2}")) props.put("finance:voucherDate", d);
          }
        }
        log.info("XML 源文件解析: {} → 发票识别={} 签名元素={} 提取字段={}",
            filename, px.looksLikeInvoice(), px.hasSignature(), px.fields().keySet());
      } catch (Exception e) {
        log.warn("XML 解析失败，按原始字节归档（不影响归档）: {} — {}", filename, e.getMessage());
      }
    }

    Map<String, Object> entry = createWithRenameRetry(ticket, poolId, sanitizeName(filename), "finance:record", props);
    String nodeId = (String) entry.get("id");
    try {
      nodes.putContent(ticket, nodeId, bytes, mimetype);
    } catch (Exception e) {
      try { nodes.deleteNode(ticket, nodeId); } catch (Exception ignored) { /* 回滚尽力而为 */ }
      throw translate("内容写入失败，节点已回滚", e);
    }
    // 固化登记（2026-08-29 T1 真实性底座）：SHA-256 + 字节数 + 格式落 PG 固化登记表，
    // 覆盖手工上传/开放推送/用友同步三入口（均汇聚于本方法）。登记失败不阻断建件，
    // 由存量补登记（POST /inspection/fixity/backfill）与定期巡检收口。
    try {
      fixity.register(nodeId, bytes, mimetype, userId);
    } catch (Exception e) {
      log.error("固化登记失败（文件已入库，待补登记）: {}", nodeId, e);
    }
    log.info("建件成功: {} → {}（{}，{} 字节，操作人 {}）", cmd.voucherNo(), nodeId, filename, bytes.length, userId);
    events.publishEvent(RecordsChangedEvent.refreshOne(nodeId)); // V10 读模型同步
    return toView(entry, mimetype, bytes.length);
  }

  /**
   * 删除收集池记录（v2.6 起为「逻辑删除」，不再物理删除）。
   * 守卫：仅「仅件数据」状态可删——已组卷/已归档记录须先在组卷工作台拆件，
   * 否则会破坏卷内引用完整性（2026-07-29 假删除 bug 修复配套端点）。
   *
   * 逻辑删除流程：置 finance:deleted/finance:deletedBy → 节点 move 到回收站目录
   * （/{全宗}/_回收站/），数据与元数据完整保留，可从回收站恢复。
   * v2.6.1 起回收站不提供彻底删除——物理销毁属档案鉴定业务，走鉴定销毁流程。
   */
  @SuppressWarnings("unchecked")
  public void delete(String ticket, String userId, String nodeId) {
    Map<String, Object> entry;
    try {
      entry = nodes.getNodeWithPath(ticket, nodeId);
    } catch (HttpClientErrorException e) {
      throw BizException.badRequest("NOT_FOUND", "记录不存在: " + nodeId);
    }
    if (!"finance:record".equals(entry.get("nodeType"))) {
      throw BizException.badRequest("NOT_RECORD", "目标不是档案记录节点: " + nodeId);
    }
    Object props = entry.get("properties");
    String status = props instanceof Map<?, ?> p && p.get("finance:recordStatus") != null
        ? String.valueOf(p.get("finance:recordStatus")) : "";
    if (!"仅件数据".equals(status)) {
      throw new BizException(HttpStatus.CONFLICT, "NOT_DELETABLE",
          "仅「仅件数据」状态的记录可删除（当前: " + status + "）；已组卷请先在组卷工作台拆件");
    }
    // 已在回收站（防重复入站）
    String deletedAt = props instanceof Map<?, ?> p2 && p2.get("finance:deleted") != null
        ? String.valueOf(p2.get("finance:deleted")) : "";
    if (!deletedAt.isEmpty()) {
      throw BizException.badRequest("ALREADY_DELETED", "该记录已在回收站，无需重复删除");
    }

    try {
      // ① 打删除标记（置位 finance:deleted + 删除人）
      nodes.updateNode(ticket, nodeId, Map.of(
          "finance:deleted", java.time.OffsetDateTime.now().toString(),
          "finance:deletedBy", userId == null ? "" : userId));
      // ② 移入回收站目录（数据/元数据完整保留）
      String fondsId = str(layout.findFondsOf(ticket, nodeId).get("id"));
      String recycleId = recycleDir(ticket, fondsId);
      moveNodeTo(ticket, nodeId, recycleId);
      log.info("记录移入回收站: {}（{}，操作人 {}）", nodeId, status, userId);
    } catch (HttpClientErrorException e) {
      // 回滚删除标记（移入失败时保持原状，避免"标删未移"的悬空件）
      try { nodes.updateNode(ticket, nodeId, Map.of("finance:deleted", "", "finance:deletedBy", "")); } catch (Exception ignored) { /* 尽力而为 */ }
      throw translate("删除失败", e);
    }
    events.publishEvent(RecordsChangedEvent.removed(nodeId)); // 回收站件不再参与检索/组卷
  }

  /**
   * 回收站列表（/{全宗}/_回收站/ 下 finance:record 件，按删除时间倒序）。
   * 直接走 children 事务读，不依赖 Solr 索引；空回收站目录返回空列表。
   */
  @SuppressWarnings("unchecked")
  public List<Map<String, Object>> listRecycle(String ticket, String fondsCode) {
    if (!notBlank(fondsCode)) throw BizException.badRequest("VALIDATION_FAILED", "fondsCode 不能为空");
    String fondsId = resolveFonds(ticket, fondsCode);
    String recycleId;
    try {
      String found = nodes.findChildId(ticket, fondsId, RECYCLE_NAME);
      if (found == null) return new ArrayList<>(); // 从未删过 → 回收站目录尚不存在
      recycleId = found;
    } catch (HttpClientErrorException e) {
      throw translate("回收站解析失败", e);
    }
    List<Map<String, Object>> views = new ArrayList<>();
    for (Map<String, Object> e : childrenOfType(ticket, recycleId, "finance:record")) {
      views.add(toView(e, null, -1));
    }
    views.sort(Comparator.comparing(v -> str(v.get("deletedAt")), Comparator.reverseOrder()));
    return views;
  }

  /**
   * 恢复回收站记录：清除删除标记 → 移回收集池，重入组卷池/检索。
   * 守卫：仅回收站内（finance:deleted 置位）的记录可恢复。
   */
  public void restoreRecycle(String ticket, String nodeId) {
    Map<String, Object> entry;
    try {
      entry = nodes.getNodeWithPath(ticket, nodeId);
    } catch (HttpClientErrorException e) {
      throw BizException.badRequest("NOT_FOUND", "记录不存在: " + nodeId);
    }
    if (!"finance:record".equals(entry.get("nodeType"))) {
      throw BizException.badRequest("NOT_RECORD", "目标不是档案记录节点: " + nodeId);
    }
    Object props = entry.get("properties");
    String deletedAt = props instanceof Map<?, ?> p && p.get("finance:deleted") != null
        ? String.valueOf(p.get("finance:deleted")) : "";
    if (deletedAt.isEmpty()) {
      throw BizException.badRequest("NOT_DELETED", "该记录不在回收站，无需恢复");
    }
    try {
      String fondsId = str(layout.findFondsOf(ticket, nodeId).get("id"));
      String poolId = ensurePool(ticket, fondsId);
      moveNodeTo(ticket, nodeId, poolId);
      nodes.updateNode(ticket, nodeId, Map.of("finance:deleted", "", "finance:deletedBy", ""));
      log.info("记录从回收站恢复: {}", nodeId);
    } catch (HttpClientErrorException e) {
      // 恢复失败时尽量回滚：若已移回池但清标失败，把件重新标记并移回回收站，保持回收站态一致
      try {
        String fondsId = str(layout.findFondsOf(ticket, nodeId).get("id"));
        String recycleId = recycleDir(ticket, fondsId);
        nodes.updateNode(ticket, nodeId, Map.of("finance:deleted", java.time.OffsetDateTime.now().toString()));
        moveNodeTo(ticket, nodeId, recycleId);
      } catch (Exception ignored) { /* 尽力而为 */ }
      throw translate("恢复失败", e);
    }
    events.publishEvent(RecordsChangedEvent.refreshOne(nodeId)); // 重入读模型
  }

  /**
   * 彻底删除回收站记录（2026-08-25 恢复入口）：物理删除 Alfresco 节点，不可恢复。
   *
   * 守卫：仅回收站内（finance:deleted 置位）且「仅件数据」状态的记录可彻底删除。
   * 入回收站的件必然未组卷/未归档（delete 端点守卫保证），即组卷阶段的未归档件——
   * 按业务规则可直接销毁，无需走鉴定销毁流程；已归档记录不经过本端点。
   */
  public void purgeRecycle(String ticket, String userId, String nodeId) {
    Map<String, Object> entry;
    try {
      entry = nodes.getNodeWithPath(ticket, nodeId);
    } catch (HttpClientErrorException e) {
      throw BizException.badRequest("NOT_FOUND", "记录不存在: " + nodeId);
    }
    if (!"finance:record".equals(entry.get("nodeType"))) {
      throw BizException.badRequest("NOT_RECORD", "目标不是档案记录节点: " + nodeId);
    }
    Object props = entry.get("properties");
    String deletedAt = props instanceof Map<?, ?> p && p.get("finance:deleted") != null
        ? String.valueOf(p.get("finance:deleted")) : "";
    if (deletedAt.isEmpty()) {
      throw BizException.badRequest("NOT_DELETED", "该记录不在回收站，无法彻底删除");
    }
    String status = props instanceof Map<?, ?> p2 && p2.get("finance:recordStatus") != null
        ? String.valueOf(p2.get("finance:recordStatus")) : "";
    if (!"仅件数据".equals(status)) {
      throw new BizException(HttpStatus.CONFLICT, "NOT_PURGEABLE",
          "仅未归档（仅件数据）记录可彻底删除（当前: " + status + "）；已归档档案须走鉴定销毁流程");
    }
    try {
      nodes.deleteNode(ticket, nodeId);
      log.info("记录已彻底删除: {}（操作人 {}）", nodeId, userId);
    } catch (HttpClientErrorException e) {
      throw translate("彻底删除失败", e);
    }
    events.publishEvent(RecordsChangedEvent.removed(nodeId)); // 同步清读模型
  }

  /**
   * 回收站目录 id（不存在则以当前用户身份创建；目录缓存与收集池同策略）。
   */
  private String recycleDir(String ticket, String fondsId) {
    String key = "recycle:" + fondsId;
    String cached = poolCache.get(key);
    if (cached != null) return cached;
    synchronized (poolCache) {
      if (poolCache.containsKey(key)) return poolCache.get(key);
      String recycleId;
      try {
        recycleId = nodes.findChildId(ticket, fondsId, RECYCLE_NAME);
        if (recycleId == null) {
          recycleId = String.valueOf(nodes.createFolder(ticket, fondsId, RECYCLE_NAME).get("id"));
          log.info("创建回收站目录: 全宗 {} → {}", fondsId, recycleId);
        }
      } catch (HttpClientErrorException e) {
        throw translate("回收站目录解析失败", e);
      }
      poolCache.put(key, recycleId);
      return recycleId;
    }
  }

  /**
   * 移动节点到目标目录，同名冲突时自动追加 (2)(3)... 后缀（与建件同名重试同策略）。
   * nodeRef 不变，仅改主父关联。
   */
  private void moveNodeTo(String ticket, String nodeId, String targetParentId) {
    String name = str(nodes.getNode(ticket, nodeId).get("name"));
    String candidate = name;
    for (int i = 2; ; i++) {
      try {
        nodes.moveNode(ticket, nodeId, targetParentId);
        return;
      } catch (HttpClientErrorException.Conflict e) {
        // 目标目录已存在同名子节点：先改名再移动，避免重名冲突
        candidate = appendSuffix(name, i);
        nodes.updateNode(ticket, nodeId, Map.of("cm:name", candidate));
        if (i > 20) throw BizException.badRequest("NAME_CONFLICT", "回收站同名文件过多，请清理后重试: " + name);
      }
    }
  }

  private void validate(CreateCmd cmd, String filename, byte[] bytes) {

    if (!notBlank(cmd.fondsCode())) throw BizException.badRequest("VALIDATION_FAILED", "fondsCode 不能为空");
    if (!notBlank(cmd.voucherNo())) throw BizException.badRequest("VALIDATION_FAILED", "凭证字号不能为空");
    if (!notBlank(cmd.archiveType())) throw BizException.badRequest("VALIDATION_FAILED", "档案类型不能为空");
    if (cmd.year() == null || cmd.year() < 1900 || cmd.year() > 2100)
      throw BizException.badRequest("VALIDATION_FAILED", "会计年度不合法");
    if (cmd.month() != null && (cmd.month() < 1 || cmd.month() > 12))
      throw BizException.badRequest("VALIDATION_FAILED", "会计月份须在 1-12 之间");
    if (notBlank(cmd.retention()) && !List.of("永久", "30年", "10年").contains(cmd.retention()))
      throw BizException.badRequest("VALIDATION_FAILED", "保管期限仅支持：永久/30年/10年");
    if (!List.of("digital-native", "digitized").contains(cmd.source()))
      throw BizException.badRequest("VALIDATION_FAILED", "来源标记仅支持：digital-native/digitized");
    if (!List.of("electronic", "paper").contains(cmd.carrierType()))
      throw BizException.badRequest("VALIDATION_FAILED", "载体类型仅支持：electronic/paper");
    if (!notBlank(filename)) throw BizException.badRequest("VALIDATION_FAILED", "文件名不能为空");
    if (bytes.length == 0) throw BizException.badRequest("VALIDATION_FAILED", "文件内容为空");
  }

  /** cm:name 合法化（Alfresco 禁止 * " < > \ / ? : | 且不能以 . 结尾） */
  private String sanitizeName(String name) {
    String cleaned = name.replaceAll("[*?\"<>\\\\/:|]", "_").trim();
    while (cleaned.endsWith(".")) cleaned = cleaned.substring(0, cleaned.length() - 1);
    return cleaned.isBlank() ? "未命名文件" : cleaned;
  }

  /** 同名冲突时自动追加 (2)(3)... 后缀重建 */
  private Map<String, Object> createWithRenameRetry(String ticket, String parentId, String name,
                                                    String nodeType, Map<String, Object> props) {
    String candidate = name;
    for (int i = 2; ; i++) {
      try {
        return nodes.createNode(ticket, parentId, candidate, nodeType, props);
      } catch (HttpClientErrorException.Conflict e) {
        candidate = appendSuffix(name, i);
        if (i > 20) throw BizException.badRequest("NAME_CONFLICT", "同名文件过多，请重命名后上传: " + name);
      } catch (HttpClientErrorException e) {
        throw translate("建件失败", e);
      }
    }
  }

  private String appendSuffix(String name, int seq) {
    int dot = name.lastIndexOf('.');
    return dot > 0 ? name.substring(0, dot) + " (" + seq + ")" + name.substring(dot)
                   : name + " (" + seq + ")";
  }

  // ═══════════════════ 收集池列表 ═══════════════════

  public record PoolQuery(String fondsCode, String archiveType, Integer year, Integer month,
                          String keyword, int skipCount, int maxItems, String scope) {
    /** 兼容旧签名（默认 scope=pool） */
    public PoolQuery(String fondsCode, String archiveType, Integer year, Integer month,
                     String keyword, int skipCount, int maxItems) {
      this(fondsCode, archiveType, year, month, keyword, skipCount, maxItems, "pool");
    }
  }

  public record PoolResult(List<Map<String, Object>> items, long totalItems, int skipCount, int maxItems) {}

  /** 带父级归属的条目（scope=all 时携带所在卷/盒信息） */
  private record GatheredEntry(Map<String, Object> entry, String volumeId, String volumeCode,
                               String boxId, String boxNo) {}

  /**
   * 收集池列表（未组卷件）：children API 全量拉取 + 内存过滤/分页。
   * 池量级（数百件）下内存过滤完全够用，且规避了 Solr 索引延迟导致的"上传后看不到"。
   */
  public PoolResult listPool(String ticket, PoolQuery q) {
    return listPool(ticket, q, null);
  }

  /** 带行级权限过滤的池列表（2026-08-18：rowFilter 作用于视图，先过滤再分页） */
  public PoolResult listPool(String ticket, PoolQuery q, Predicate<Map<String, Object>> rowFilter) {
    if (!notBlank(q.fondsCode())) throw BizException.badRequest("VALIDATION_FAILED", "fondsCode 不能为空");
    String fondsId = resolveFonds(ticket, q.fondsCode());
    String poolId = ensurePool(ticket, fondsId);

    List<GatheredEntry> gathered = new ArrayList<>();
    for (Map<String, Object> e : childrenOfType(ticket, poolId, "finance:record")) {
      gathered.add(new GatheredEntry(e, "", "", "", ""));
    }
    return filterPage(ticket, gathered, q, rowFilter);
  }

  /**
   * 全量件列表（scope=all，2026-08-16 贯通审计 P0 修复）：
   * 收集池件 ∪ 案卷库卷内件（草稿/已确认）∪ 盒库卷内件（已移交），
   * 每条携带 volumeId/volumeCode/boxId/boxNo 归属信息（池件为空串）。
   *
   * 背景：后台档案查询/档案打包/借阅车结算需要「已组卷」件，而池列表只含未组卷件，
   * 导致已归档件对读侧不可见（三处断链同一根因）。同样走 children 事务读，不依赖 Solr。
   */
  public PoolResult listAll(String ticket, PoolQuery q) {
    return listAll(ticket, q, null);
  }

  /** 带行级权限过滤的全量件列表（2026-08-18） */
  public PoolResult listAll(String ticket, PoolQuery q, Predicate<Map<String, Object>> rowFilter) {
    if (!notBlank(q.fondsCode())) throw BizException.badRequest("VALIDATION_FAILED", "fondsCode 不能为空");
    return filterPage(ticket, gather(ticket, q.fondsCode()), q, rowFilter);
  }

  /**
   * 全量 gather（V10 读模型重建共用，2026-08-18 自 listAll 抽取）：
   * ① 收集池 ∪ ② 案卷库卷内件 ∪ ③ 盒库卷内件，每条带卷/盒归属。
   */
  private List<GatheredEntry> gather(String ticket, String fondsCode) {
    String fondsId = resolveFonds(ticket, fondsCode);
    String poolId = ensurePool(ticket, fondsId);

    List<GatheredEntry> gathered = new ArrayList<>();
    // ① 收集池（未组卷件）
    for (Map<String, Object> e : childrenOfType(ticket, poolId, "finance:record")) {
      gathered.add(new GatheredEntry(e, "", "", "", ""));
    }
    // ② 案卷库：/{全宗}/案卷库/{CAT}/{year}/{volume}/{record}
    String volsRoot = layout.ensureChild(ticket, fondsId, RepoLayout.VOLUMES_ROOT);
    gatherVolumeRecords(ticket, volsRoot, "", "", gathered);
    // ③ 盒库：/{全宗}/盒库/{CAT}/{year}/{box}/{volume}/{record}
    String boxesRoot = layout.ensureChild(ticket, fondsId, RepoLayout.BOXES_ROOT);
    for (Map<String, Object> catDir : childFoldersSafe(ticket, boxesRoot)) {
      for (Map<String, Object> yearDir : childFoldersSafe(ticket, str(catDir.get("id")))) {
        for (Map<String, Object> box : childrenOfType(ticket, str(yearDir.get("id")), "finance:archiveBox")) {
          String boxId = str(box.get("id"));
          String boxNo = prop(box, "finance:boxNo");
          for (Map<String, Object> vol : childrenOfType(ticket, boxId, "finance:volume")) {
            gatherRecordsOfVolume(ticket, vol, boxId, boxNo, gathered);
          }
        }
      }
    }
    return gathered;
  }

  /** gather → 带归属的 RecordView 列表（V10 读模型重建投影源） */
  public List<Map<String, Object>> gatherViews(String ticket, String fondsCode) {
    List<Map<String, Object>> views = new ArrayList<>();
    for (GatheredEntry g : gather(ticket, fondsCode)) {
      Map<String, Object> view = toView(g.entry(), null, -1);
      view.put("volumeId", g.volumeId());
      view.put("volumeCode", g.volumeCode());
      view.put("boxId", g.boxId());
      view.put("boxNo", g.boxNo());
      views.add(view);
    }
    return views;
  }

  /** 库内全部全宗号（V10 rebuild 遍历用；整表重扫灌缓存后取键集） */
  @SuppressWarnings("unchecked")
  public List<String> allFondsCodes(String ticket) {
    String rootId = resolveRoot(ticket);
    synchronized (fondsCache) {
      int skip = 0;
      while (true) {
        Map<String, Object> list = nodes.listChildren(ticket, rootId, skip, 200);
        for (Map<String, Object> e : (List<Map<String, Object>>) list.get("entries")) {
          Map<String, Object> entry = (Map<String, Object>) e.get("entry");
          if (!"finance:fonds".equals(entry.get("nodeType"))) continue;
          String code = str(prop(entry, "finance:code"));
          if (!code.isEmpty()) fondsCache.put(code, (String) entry.get("id"));
        }
        Map<String, Object> paging = (Map<String, Object>) list.get("pagination");
        if (!Boolean.TRUE.equals(paging.get("hasMoreItems"))) break;
        skip += 200;
      }
      return new ArrayList<>(fondsCache.keySet());
    }
  }

  /** 遍历案卷库类目/年度目录树，收集每个案卷的卷内件 */
  private void gatherVolumeRecords(String ticket, String volsRootId, String boxId, String boxNo,
                                   List<GatheredEntry> out) {
    for (Map<String, Object> catDir : childFoldersSafe(ticket, volsRootId)) {
      for (Map<String, Object> yearDir : childFoldersSafe(ticket, str(catDir.get("id")))) {
        for (Map<String, Object> vol : childrenOfType(ticket, str(yearDir.get("id")), "finance:volume")) {
          gatherRecordsOfVolume(ticket, vol, boxId, boxNo, out);
        }
      }
    }
  }

  /** 单个案卷的卷内件 → GatheredEntry（带卷/盒归属） */
  private void gatherRecordsOfVolume(String ticket, Map<String, Object> vol, String boxId, String boxNo,
                                     List<GatheredEntry> out) {
    String volId = str(vol.get("id"));
    String volCode = prop(vol, "finance:volumeCode");
    for (Map<String, Object> r : childrenOfType(ticket, volId, "finance:record")) {
      out.add(new GatheredEntry(r, volId, volCode, boxId, boxNo));
    }
  }

  /** 统一过滤/排序/分页/视图映射（pool 与 all 共用）；rowFilter 为行级权限谓词（null=不过滤），先于分页应用 */
  private PoolResult filterPage(String ticket, List<GatheredEntry> gathered, PoolQuery q,
                                Predicate<Map<String, Object>> rowFilter) {
    String kw = q.keyword() == null ? "" : q.keyword().trim().toLowerCase();
    List<GatheredEntry> filtered = gathered.stream()
        // 回收站件（finance:deleted 置位）不参与任何正常列表/组卷/检索（v2.6 安全兜底）
        .filter(g -> str(prop(g.entry(), "finance:deleted")).isEmpty())
        .filter(g -> q.archiveType() == null || q.archiveType().equals(prop(g.entry(), "finance:archiveType")))
        .filter(g -> q.year() == null || q.year().equals(intProp(g.entry(), "finance:year")))
        .filter(g -> q.month() == null || q.month().equals(intProp(g.entry(), "finance:month")))
        .filter(g -> kw.isEmpty()
            || str(g.entry().get("name")).toLowerCase().contains(kw)
            || str(prop(g.entry(), "finance:voucherNo")).toLowerCase().contains(kw)
            || str(prop(g.entry(), "finance:recordRemark")).toLowerCase().contains(kw))
        .sorted(Comparator.comparing(g -> str(g.entry().get("createdAt")), Comparator.reverseOrder()))
        .toList();

    // 先映射视图（行级过滤需要 securityLevel/department/createdBy 视图键）
    List<Map<String, Object>> views = filtered.stream().map(g -> {
      Map<String, Object> view = toView(g.entry(), null, -1);
      view.put("volumeId", g.volumeId());
      view.put("volumeCode", g.volumeCode());
      view.put("boxId", g.boxId());
      view.put("boxNo", g.boxNo());
      return view;
    }).toList();
    // 行级权限过滤（密级上限/部门范围/创建人），先于计数与分页
    if (rowFilter != null) views = views.stream().filter(rowFilter).toList();

    int from = Math.min(q.skipCount(), views.size());
    int to = Math.min(from + q.maxItems(), views.size());
    return new PoolResult(views.subList(from, to), views.size(), q.skipCount(), q.maxItems());
  }

  // ═══════════════════ 卷内件全量读取（P1-③ 读视图） ═══════════════════

  /**
   * 按父节点 id 读取其下全部 finance:record 子节点（完整 RecordView 格式）。
   * 供读视图（财务分类/档案查询）使用：卷内件需要全属性（voucherCategory/subType 等），
   * 而 VolumeService.items 只返回摘要字段。
   *
   * @param ticket    用户会话
   * @param parentId  父节点 id（finance:volume 或 finance:archiveBox）
   * @return 完整 RecordView 列表（按 volumeItemNo 顺排，无该属性则按创建时间）
   */
  @SuppressWarnings("unchecked")
  public List<Map<String, Object>> listByParent(String ticket, String parentId) {
    // 归属解析（2026-08-25）：父节点是案卷时视图带 volumeId/volumeCode，
    // 案卷已装盒时再带 boxId/boxNo——装盒必然已组卷，财务视图「所属案卷」列依赖此字段
    String volId = "", volCode = "", boxId = "", boxNo = "";
    try {
      Map<String, Object> parent = nodes.getNode(ticket, parentId);
      if ("finance:volume".equals(parent.get("nodeType"))) {
        volId = parentId;
        volCode = prop(parent, "finance:volumeCode");
        Map<String, Object> box = layout.nearestAncestorOfType(ticket, parentId, "finance:archiveBox");
        if (box != null) {
          boxId = str(box.get("id"));
          boxNo = prop(box, "finance:boxNo");
        }
      } else if ("finance:archiveBox".equals(parent.get("nodeType"))) {
        boxId = parentId;
        boxNo = prop(parent, "finance:boxNo");
      }
    } catch (HttpClientErrorException.NotFound e) {
      // 父节点不存在：下方 listChildren 会按空返回
    } catch (Exception e) {
      log.warn("父节点归属解析失败，按空归属返回: {}", e.getMessage());
    }

    List<Map<String, Object>> all = new ArrayList<>();
    int skip = 0;
    while (all.size() < 5000) {
      Map<String, Object> list;
      try {
        list = nodes.listChildren(ticket, parentId, skip, 500);
      } catch (HttpClientErrorException.NotFound e) {
        return all;
      } catch (HttpClientErrorException e) {
        throw translate("卷内件查询失败", e);
      }
      for (Map<String, Object> e : (List<Map<String, Object>>) list.get("entries")) {
        Map<String, Object> entry = (Map<String, Object>) e.get("entry");
        if ("finance:record".equals(entry.get("nodeType"))) all.add(entry);
      }
      Map<String, Object> paging = (Map<String, Object>) list.get("pagination");
      if (!Boolean.TRUE.equals(paging.get("hasMoreItems"))) break;
      skip += 500;
    }
    all.sort(Comparator.comparing(e -> {
      Integer n = intProp(e, "finance:volumeItemNo");
      return n == null ? Integer.MAX_VALUE : n;
    }));
    List<Map<String, Object>> views = all.stream().map(e -> toView(e, null, -1)).toList();
    if (!volId.isEmpty() || !boxId.isEmpty()) {
      for (Map<String, Object> v : views) {
        if (!volId.isEmpty()) {
          v.put("volumeId", volId);
          v.put("volumeCode", volCode);
        }
        if (!boxId.isEmpty()) {
          v.put("boxId", boxId);
          v.put("boxNo", boxNo);
        }
      }
    }
    return views;
  }

  /** 带行级权限过滤的卷内件读取（2026-08-18） */
  public List<Map<String, Object>> listByParent(String ticket, String parentId,
                                                Predicate<Map<String, Object>> rowFilter) {
    List<Map<String, Object>> views = listByParent(ticket, parentId);
    return rowFilter == null ? views : views.stream().filter(rowFilter).toList();
  }

  /**
   * 按档案盒 id 读取盒内全部记录（盒→卷→件两级遍历）。
   * 盒的直接子节点是 finance:volume（文件夹），需逐卷再读子件。
   */
  @SuppressWarnings("unchecked")
  public List<Map<String, Object>> listByBox(String ticket, String boxId) {
    List<Map<String, Object>> out = new ArrayList<>();
    int skip = 0;
    while (true) {
      Map<String, Object> list;
      try {
        list = nodes.listChildren(ticket, boxId, skip, 500);
      } catch (HttpClientErrorException.NotFound e) {
        return out;
      } catch (HttpClientErrorException e) {
        throw translate("盒内卷查询失败", e);
      }
      for (Map<String, Object> e : (List<Map<String, Object>>) list.get("entries")) {
        Map<String, Object> entry = (Map<String, Object>) e.get("entry");
        if ("finance:volume".equals(entry.get("nodeType"))) {
          out.addAll(listByParent(ticket, (String) entry.get("id")));
        }
      }
      Map<String, Object> paging = (Map<String, Object>) list.get("pagination");
      if (!Boolean.TRUE.equals(paging.get("hasMoreItems"))) break;
      skip += 500;
    }
    return out;
  }

  /** 带行级权限过滤的盒内件读取（2026-08-18） */
  public List<Map<String, Object>> listByBox(String ticket, String boxId,
                                             Predicate<Map<String, Object>> rowFilter) {
    List<Map<String, Object>> views = listByBox(ticket, boxId);
    return rowFilter == null ? views : views.stream().filter(rowFilter).toList();
  }

    /** 批量按节点 id 读取记录（跨卷/跨盒查询场景） */
  public List<Map<String, Object>> listByIds(String ticket, List<String> nodeIds) {
    List<Map<String, Object>> out = new ArrayList<>();
    for (String nodeId : nodeIds) {
      try {
        Map<String, Object> entry = nodes.getNode(ticket, nodeId);
        if ("finance:record".equals(entry.get("nodeType"))) {
          out.add(toView(entry, null, -1));
        }
      } catch (HttpClientErrorException.NotFound e) {
        // 节点已删除，跳过
      } catch (HttpClientErrorException e) {
        throw translate("记录查询失败: " + nodeId, e);
      }
    }
    return out;
  }

    // ═══════════════════ 内容读取 ═══════════════════

  public ResponseEntity<byte[]> content(String ticket, String nodeId) {
    try {
      return nodes.getContent(ticket, nodeId);
    } catch (HttpClientErrorException e) {
      throw translate("内容读取失败", e);
    }
  }

  // ═══════════════════ 全宗/收集池解析 ═══════════════════

  /** 全宗号 → 节点 id（缓存；未命中时清缓存重扫一次） */
  @SuppressWarnings("unchecked")
  private String resolveFonds(String ticket, String fondsCode) {
    String cached = fondsCache.get(fondsCode);
    if (cached != null) return cached;
    synchronized (fondsCache) {
      if (fondsCache.containsKey(fondsCode)) return fondsCache.get(fondsCode);
      String rootId = resolveRoot(ticket);
      int skip = 0;
      while (true) {
        Map<String, Object> list = nodes.listChildren(ticket, rootId, skip, 200);
        for (Map<String, Object> e : (List<Map<String, Object>>) list.get("entries")) {
          Map<String, Object> entry = (Map<String, Object>) e.get("entry");
          if (!"finance:fonds".equals(entry.get("nodeType"))) continue;
          String code = str(prop(entry, "finance:code"));
          if (!code.isEmpty()) fondsCache.put(code, (String) entry.get("id"));
        }
        Map<String, Object> paging = (Map<String, Object>) list.get("pagination");
        if (!Boolean.TRUE.equals(paging.get("hasMoreItems"))) break;
        skip += 200;
      }
      String found = fondsCache.get(fondsCode);
      if (found == null) {
        // 诊断日志：记录请求值与库内实际值（排查前端传参不符，如幽灵全宗/不可见字符/大小写）
        log.warn("全宗解析失败: 请求 fondsCode=[{}](len={}), 库内全宗={}, 根目录={}",
            fondsCode, fondsCode == null ? -1 : fondsCode.length(), fondsCache.keySet(), rootId);
        throw BizException.badRequest("FONDS_NOT_FOUND",
            "全宗不存在: " + fondsCode + "（库内现有全宗: " + String.join(",", fondsCache.keySet()) + "）");
      }
      return found;
    }
  }

  private String resolveRoot(String ticket) {
    if (rootNodeId != null) return rootNodeId;
    synchronized (fondsCache) {
      if (rootNodeId != null) return rootNodeId;
      try {
        // 注意：必须用 -root-（Company Home），-my- 对普通用户是个人主目录（P1-① 实测踩坑）
        String companyHomeId = str(nodes.getNode(ticket, "-root-").get("id"));
        rootNodeId = nodes.findChildId(ticket, companyHomeId, ROOT_NAME);
      } catch (HttpClientErrorException e) {
        throw translate("根目录解析失败", e);
      }
      if (rootNodeId == null) throw new BizException(HttpStatus.INTERNAL_SERVER_ERROR, "ROOT_NOT_FOUND",
          "未找到「" + ROOT_NAME + "」根目录，请先在 Alfresco 中建全宗");
      return rootNodeId;
    }
  }

  /** 收集池：不存在则以当前用户身份创建（普通用户靠根目录继承的 Collaborator 权限） */
  private String ensurePool(String ticket, String fondsId) {
    String cached = poolCache.get(fondsId);
    if (cached != null) return cached;
    synchronized (poolCache) {
      if (poolCache.containsKey(fondsId)) return poolCache.get(fondsId);
      String poolId;
      try {
        poolId = nodes.findChildId(ticket, fondsId, POOL_NAME);
        if (poolId == null) {
          Map<String, Object> created = nodes.createFolder(ticket, fondsId, POOL_NAME);
          poolId = (String) created.get("id");
          log.info("创建收集池: 全宗 {} → {}", fondsId, poolId);
        }
      } catch (HttpClientErrorException e) {
        throw translate("收集池解析失败", e);
      }
      poolCache.put(fondsId, poolId);
      return poolId;
    }
  }

  /** 子节点中指定类型的全部条目（分页拉全，上限 5000） */
  @SuppressWarnings("unchecked")
  private List<Map<String, Object>> childrenOfType(String ticket, String parentId, String nodeType) {
    List<Map<String, Object>> out = new ArrayList<>();
    int skip = 0;
    while (out.size() < 5000) {
      Map<String, Object> list = nodes.listChildren(ticket, parentId, skip, 500);
      for (Map<String, Object> e : (List<Map<String, Object>>) list.get("entries")) {
        Map<String, Object> entry = (Map<String, Object>) e.get("entry");
        if (nodeType.equals(entry.get("nodeType"))) out.add(entry);
      }
      Map<String, Object> paging = (Map<String, Object>) list.get("pagination");
      if (!Boolean.TRUE.equals(paging.get("hasMoreItems"))) break;
      skip += 500;
    }
    return out;
  }

  /** 子目录列表（目录不存在时按空处理——从未建过卷/盒的类目） */
  @SuppressWarnings("unchecked")
  private List<Map<String, Object>> childFoldersSafe(String ticket, String parentId) {
    List<Map<String, Object>> out = new ArrayList<>();
    int skip = 0;
    while (true) {
      Map<String, Object> list;
      try {
        list = nodes.listChildren(ticket, parentId, skip, 500);
      } catch (HttpClientErrorException.NotFound e) {
        return out;
      } catch (HttpClientErrorException e) {
        throw translate("目录扫描失败", e);
      }
      for (Map<String, Object> e : (List<Map<String, Object>>) list.get("entries")) {
        Map<String, Object> entry = (Map<String, Object>) e.get("entry");
        if (Boolean.TRUE.equals(entry.get("isFolder"))) out.add(entry);
      }
      Map<String, Object> paging = (Map<String, Object>) list.get("pagination");
      if (!Boolean.TRUE.equals(paging.get("hasMoreItems"))) break;
      skip += 500;
    }
    return out;
  }

  // ═══════════════════ 视图映射/异常翻译 ═══════════════════

  /** 节点 entry → 前端 RecordView（mime/size 可由上传路径直接给出；静态纯函数，读模型投影共用） */
  @SuppressWarnings("unchecked")
  static Map<String, Object> toView(Map<String, Object> entry, String uploadMime, long uploadSize) {
    Map<String, Object> view = new LinkedHashMap<>();
    view.put("nodeId", entry.get("id"));
    view.put("name", entry.get("name"));
    view.put("nodeType", entry.get("nodeType"));
    view.put("archiveCode", prop(entry, "finance:archiveCode"));
    view.put("voucherNo", prop(entry, "finance:voucherNo"));
    view.put("archiveType", prop(entry, "finance:archiveType"));
    view.put("department", prop(entry, "finance:department"));
    Object amount = entry.get("properties") instanceof Map<?, ?> p ? p.get("finance:amount") : null;
    view.put("amount", amount);
    view.put("year", intProp(entry, "finance:year"));
    view.put("month", intProp(entry, "finance:month"));
    view.put("retention", prop(entry, "finance:retention"));
    view.put("recordStatus", prop(entry, "finance:recordStatus"));
    view.put("source", prop(entry, "finance:source"));
    view.put("carrierType", prop(entry, "finance:carrierType"));
    view.put("preparer", prop(entry, "finance:preparer"));
    view.put("voucherCategory", prop(entry, "finance:voucherCategory"));
    view.put("remarks", prop(entry, "finance:recordRemark"));
    // 组件挂接（finance-model v2.3，2026-08-20）：原始凭证件 → 所属记账凭证件
    view.put("parentRecordId", prop(entry, "finance:parentRecordId"));
    // v2.6 回收站：删除标记（仅回收站件有值）
    view.put("deletedAt", prop(entry, "finance:deleted"));
    view.put("deletedBy", prop(entry, "finance:deletedBy"));
    // V10 全文检索读模型补字段（2026-08-18）：科目/往来单位/单据号/正文（OCR 双通道回写）
    view.put("accountSubject", prop(entry, "finance:accountSubject"));
    view.put("ocrText", prop(entry, "finance:ocrText"));
    // v2.7 原始凭证富元数据（方案A：原始凭证=件，读 srcDoc* 属性）
    String srcDocNo = prop(entry, "finance:srcDocNo");
    String srcDocCounterparty = prop(entry, "finance:srcDocCounterpartyName");
    String srcDocSummary = prop(entry, "finance:srcDocSummary");
    view.put("docTypeCode", prop(entry, "finance:srcDocTypeCode"));
    view.put("docTypeName", prop(entry, "finance:srcDocTypeName"));
    view.put("srcDocCounterpartyTaxId", prop(entry, "finance:srcDocCounterpartyTaxId"));
    view.put("srcDocAmountUpper", prop(entry, "finance:srcDocAmountUpper"));
    view.put("srcDocBusinessCategory", prop(entry, "finance:srcDocBusinessCategory"));
    view.put("srcDocExtFields", prop(entry, "finance:srcDocExtFields"));
    // 往来单位/单据号/摘要：OCR 回写值优先，缺省时回落到原始凭证 srcDoc* 值
    String cp = prop(entry, "finance:counterpartyName");
    view.put("counterpartyName", cp.isEmpty() ? srcDocCounterparty : cp);
    String dn = prop(entry, "finance:documentNo");
    view.put("documentNo", dn.isEmpty() ? srcDocNo : dn);
    // v2.2 凭证扩展元数据
    view.put("voucherWord", prop(entry, "finance:voucherWord"));
    view.put("voucherDate", prop(entry, "finance:voucherDate"));
    view.put("period", prop(entry, "finance:period"));
    view.put("auditor", prop(entry, "finance:auditor"));
    view.put("tallyMan", prop(entry, "finance:tallyMan"));
    view.put("entries", prop(entry, "finance:entries"));
    view.put("attachedBillCount", intProp(entry, "finance:attachedBillCount"));
    view.put("sourceSystem", prop(entry, "finance:sourceSystem"));
    view.put("externalId", prop(entry, "finance:externalId"));
    String desc = prop(entry, "cm:description");
    view.put("description", desc.isEmpty() ? srcDocSummary : desc);
    // 行级权限过滤键（2026-08-18）：密级档序判定
    view.put("securityLevel", prop(entry, "finance:securityLevel"));
    Object numbered = entry.get("properties") instanceof Map<?, ?> p2 ? p2.get("finance:numbered") : null;
    view.put("numbered", Boolean.TRUE.equals(numbered));
    view.put("createdAt", entry.get("createdAt"));
    view.put("modifiedAt", entry.get("modifiedAt"));
    Object createdBy = entry.get("createdByUser");
    if (createdBy instanceof Map<?, ?> m) view.put("createdBy", m.get("id"));
    // 内容信息：上传路径直接给出；列表路径读 entry.content
    String mime = uploadMime;
    long size = uploadSize;
    Object content = entry.get("content");
    if (content instanceof Map<?, ?> c) {
      if (mime == null) mime = (String) c.get("mimeType");
      if (size < 0 && c.get("sizeInBytes") instanceof Number n) size = n.longValue();
    }
    view.put("mimeType", mime);
    view.put("sizeInBytes", size < 0 ? 0 : size);
    // 卷/盒归属（scope=all 时由 filterPage 覆盖为真实值；池件/默认路径为空串）
    view.put("volumeId", "");
    view.put("volumeCode", "");
    view.put("boxId", "");
    view.put("boxNo", "");
    return view;
  }

  private static String prop(Map<String, Object> entry, String name) {
    Object props = entry.get("properties");
    if (!(props instanceof Map)) return "";
    Object v = ((Map<String, Object>) props).get(name);
    return v == null ? "" : String.valueOf(v);
  }

  @SuppressWarnings("unchecked")
  private static Integer intProp(Map<String, Object> entry, String name) {
    Object props = entry.get("properties");
    if (!(props instanceof Map)) return null;
    Object v = ((Map<String, Object>) props).get(name);
    return v instanceof Number n ? n.intValue() : null;
  }

  private static String str(Object o) {
    return o == null ? "" : String.valueOf(o);
  }

  private static boolean notBlank(String s) {
    return s != null && !s.isBlank();
  }

  /** XML 内容判定（T2）：mime 含 xml 或扩展名 .xml */
  private static boolean isXmlContent(String mimetype, String filename) {
    String mt = mimetype == null ? "" : mimetype.toLowerCase();
    String fn = filename == null ? "" : filename.toLowerCase();
    return mt.contains("xml") || fn.endsWith(".xml");
  }

  /** 属性空白判定（props 值为 null 或空白字符串） */
  private static boolean isBlankProp(Map<String, Object> props, String key) {
    Object v = props.get(key);
    return v == null || String.valueOf(v).isBlank();
  }

  /**
   * 合并原始凭证扩展字段（T2）：调用方显式 JSON 优先，XML 解析字段补空白；
   * 追加 _xmlParsed/_signaturePresent 两个解析标记键（下划线前缀避免与票面要素冲突）。
   */
  @SuppressWarnings("unchecked")
  private static Map<String, Object> mergeExtFields(Object existingJson, com.finance.ams.sourcedoc.XmlInvoiceParser.Parsed px) {
    Map<String, Object> ext = new LinkedHashMap<>();
    if (existingJson != null && !String.valueOf(existingJson).isBlank()) {
      try {
        Map<String, Object> parsed = JSON.readValue(String.valueOf(existingJson), Map.class);
        if (parsed != null) ext.putAll(parsed);
      } catch (Exception ignored) { /* 旧值非 JSON 时以解析结果为准重建 */ }
    }
    for (Map.Entry<String, String> e : px.fields().entrySet()) {
      ext.putIfAbsent(e.getKey(), e.getValue());
    }
    ext.put("_xmlParsed", true);
    ext.put("_signaturePresent", px.hasSignature());
    return ext;
  }

  private static final com.fasterxml.jackson.databind.ObjectMapper JSON =
      new com.fasterxml.jackson.databind.ObjectMapper();

  /** Alfresco 异常 → 业务异常（401/403 翻译为会话/权限错误，其余透传状态） */
  // ═══════════════════ 组件挂接（先组件再组卷，2026-08-20） ═══════════════════

  /**
   * 挂接/解挂：原始凭证件 → 所属记账凭证件（finance:parentRecordId 软关联）。
   * 校验链：两端都是 finance:record；子件必须是原始凭证、父件必须不是（层级 ≤1，无环）；
   *        双方均在池内（recordStatus=仅件数据）；同全宗；防自环。
   *        入卷/移交后禁止改挂（业务上应走拆件流程）。
   *
   * @param parentRecordId null/空白 = 解挂；否则幂等覆盖式挂接
   */
  public void linkParent(String ticket, String nodeId, String parentRecordId) {
    Map<String, Object> child = requireRecordEntry(ticket, nodeId);
    if (!isSourceDocEntry(child)) {
      throw BizException.badRequest("NOT_SOURCE_DOC", "只有原始凭证件才能挂接到记账凭证: " + nodeId);
    }
    if (!"仅件数据".equals(prop(child, "finance:recordStatus"))) {
      throw BizException.badRequest("NOT_IN_POOL", "该原始凭证已入卷/已移交，如需调整请先在组卷工作台拆件");
    }

    if (parentRecordId == null || parentRecordId.isBlank()) {
      nodes.updateNode(ticket, nodeId, Map.of("finance:parentRecordId", ""));
      events.publishEvent(RecordsChangedEvent.refreshOne(nodeId));
      log.info("组件解挂: {}", nodeId);
      return;
    }

    if (parentRecordId.equals(nodeId)) {
      throw BizException.badRequest("SELF_LINK", "不能挂接到自身");
    }
    Map<String, Object> parent = requireRecordEntry(ticket, parentRecordId);
    if (isSourceDocEntry(parent)) {
      throw BizException.badRequest("PARENT_IS_SOURCE", "原始凭证不能作为所属件，请挂接到记账凭证: " + parentRecordId);
    }
    if (!"仅件数据".equals(prop(parent, "finance:recordStatus"))) {
      throw BizException.badRequest("PARENT_NOT_IN_POOL", "所属记账凭证已入卷/已移交，不能挂接");
    }
    String childFondsId = str(layout.findFondsOf(ticket, nodeId).get("id"));
    String parentFondsId = str(layout.findFondsOf(ticket, parentRecordId).get("id"));
    if (!childFondsId.equals(parentFondsId)) {
      throw BizException.badRequest("CROSS_FONDS", "不能跨全宗挂接");
    }

    nodes.updateNode(ticket, nodeId, Map.of("finance:parentRecordId", parentRecordId));
    events.publishEvent(RecordsChangedEvent.refreshOne(nodeId));
    log.info("组件挂接: {} → {}", nodeId, parentRecordId);
  }

  /**
   * 件级元数据录入/修改（2026-08-25 组卷工作台「元数据录入」）。
   * 仅白名单字段可改；仅收集池件与草稿卷内件（仅件数据/待审核）可编辑——
   * 已确认/已移交件须先退回工作台再改，避免改写已固化的正式档案元数据。
   */
  public Map<String, Object> updateMetadata(String ticket, String nodeId, Map<String, Object> fields) {
    Map<String, Object> entry = requireRecordEntry(ticket, nodeId);
    String status = prop(entry, "finance:recordStatus");
    if (!List.of("仅件数据", "待审核").contains(status)) {
      throw BizException.badRequest("NOT_EDITABLE",
          "该件状态「" + status + "」不可直接修改元数据（已确认/移交件请先退回到组卷工作台）");
    }
    if (fields == null || fields.isEmpty()) {
      throw BizException.badRequest("VALIDATION_FAILED", "未提供任何修改字段");
    }

    Map<String, Object> props = new LinkedHashMap<>();
    // 字符串白名单（前端字段 → 节点属性）
    putStr(fields, "voucherNo", "finance:voucherNo", props);
    putStr(fields, "voucherCategory", "finance:voucherCategory", props);
    putStr(fields, "voucherWord", "finance:voucherWord", props);
    putStr(fields, "voucherDate", "finance:voucherDate", props);
    putStr(fields, "department", "finance:department", props);
    putStr(fields, "preparer", "finance:preparer", props);
    putStr(fields, "auditor", "finance:auditor", props);
    putStr(fields, "tallyMan", "finance:tallyMan", props);
    putStr(fields, "retention", "finance:retention", props);
    putStr(fields, "securityLevel", "finance:securityLevel", props);
    putStr(fields, "carrierType", "finance:carrierType", props);
    putStr(fields, "archiveType", "finance:archiveType", props);
    putStr(fields, "remarks", "finance:recordRemark", props);
    putStr(fields, "summary", "cm:description", props);
    // 数值字段（容忍数字字符串）
    Integer year = asInt(fields.get("year"));
    if (year != null) props.put("finance:year", year);
    Integer month = asInt(fields.get("month"));
    if (month != null) {
      if (month < 1 || month > 12) throw BizException.badRequest("VALIDATION_FAILED", "月份须为 1-12");
      props.put("finance:month", month);
    }
    Double amount = asDouble(fields.get("amount"));
    if (amount != null) props.put("finance:amount", amount);

    if (props.isEmpty()) {
      throw BizException.badRequest("VALIDATION_FAILED", "无可修改的有效字段（仅支持件级白名单元数据）");
    }
    try {
      nodes.updateNode(ticket, nodeId, props);
    } catch (HttpClientErrorException e) {
      throw translate("元数据修改失败", e);
    }
    events.publishEvent(RecordsChangedEvent.refreshOne(nodeId)); // V10 读模型同步
    log.info("件元数据录入: {} 修改 {} 项字段", nodeId, props.size());
    return toView(nodes.getNode(ticket, nodeId), null, -1);
  }

  private static void putStr(Map<String, Object> fields, String key, String propName, Map<String, Object> out) {
    if (fields.get(key) instanceof String s) out.put(propName, s);
  }

  private static Integer asInt(Object v) {
    if (v instanceof Number n) return n.intValue();
    if (v instanceof String s && !s.isBlank()) {
      try { return Integer.parseInt(s.trim()); } catch (NumberFormatException ignored) { }
    }
    return null;
  }

  private static Double asDouble(Object v) {
    if (v instanceof Number n) return n.doubleValue();
    if (v instanceof String s && !s.isBlank()) {
      try { return Double.parseDouble(s.trim()); } catch (NumberFormatException ignored) { }
    }
    return null;
  }

  /** 件所属全宗号（组件挂接的权限校验用） */
  public String fondsCodeOf(String ticket, String nodeId) {
    return prop(layout.findFondsOf(ticket, nodeId), "finance:code");
  }

  /** 件节点读取（404/权限经 translate 翻译；非 finance:record 拒绝） */
  private Map<String, Object> requireRecordEntry(String ticket, String nodeId) {
    Map<String, Object> entry;
    try {
      entry = nodes.getNode(ticket, nodeId);
    } catch (HttpClientErrorException e) {
      throw translate("件查询失败", e);
    }
    if (!"finance:record".equals(str(entry.get("nodeType")))) {
      throw BizException.badRequest("NOT_RECORD", "节点不是档案记录: " + nodeId);
    }
    return entry;
  }

  /** 原始凭证判定（与前端 utils/recordType.ts isSourceDocument 同口径） */
  private static boolean isSourceDocEntry(Map<String, Object> entry) {
    return "原始凭证".equals(prop(entry, "finance:voucherCategory"))
        || prop(entry, "finance:archiveType").contains("原始凭证");
  }

  /**
   * Alfresco 异常翻译。
   * 2026-08-19 起统一委托 RepoLayout.translate：解析错误响应体 briefSummary 并中文化常见原因，
   * 不再用 HTTP/2 下恒为空的 getStatusText()（移交/建件失败无原因的根因）。
   */
  static BizException translate(String prefix, Exception e) {
    return com.finance.ams.alfresco.RepoLayout.translate(prefix, e);
  }}


