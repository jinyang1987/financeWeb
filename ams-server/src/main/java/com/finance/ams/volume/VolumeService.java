package com.finance.ams.volume;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.client.HttpClientErrorException;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.finance.ams.alfresco.AlfrescoNodeClient;
import com.finance.ams.alfresco.CategoryCodes;
import com.finance.ams.alfresco.RepoLayout;
import com.finance.ams.api.BizException;
import com.finance.ams.code.CodeSerialService;
import com.finance.ams.configcenter.ConfigService;
import com.finance.ams.record.RecordsChangedEvent;

/**
 * 卷域服务（P1-② 组卷写路径）
 *
 * 覆盖：建卷 / 卷列表 / 卷内件（加件/拆件/排序/插入）/ 确认组卷（真取号赋号）/
 *       撤销确认 / 拆卷 / 移交归盒（自动找/建盒）/ 退回。
 *
 * 设计要点：
 *  - 案卷 = finance:volume 文件夹节点（cm:folder 子类），卷内件 = 其子 finance:record 节点；
 *    加件/拆件 = 节点 move（收集池 ↔ 案卷目录），nodeRef 不变。
 *  - 卷级档号在建卷时为占位值 {全宗}-VPEND-xxxxxxxx（volumeCode 为 mandatory 属性，
 *    草稿期无正式档号）；确认组卷且赋号时机=on-confirm 时经 ams_code_serial 真取号替换。
 *  - 档号结构镜像前端 defaultPaperCodeRule（DA/T 13）：
 *    {全宗4}-KU·{类别2}·{年度4}-{期限3}-B{盒流水3}-{卷流水4}，件号 = 卷号-{件号4}。
 *    完整档号规则配置化消费属 P1-④，此处先与前端默认规则保持严格一致。
 *  - 卷内件号 = finance:volumeItemNo（1 起顺排）；件状态流转：
 *    收集池「仅件数据」→ 入草稿卷「待审核」→ 确认「已组卷」；撤销/拆卷回退。
 *  - 空案卷自动销毁（最后一件移除时删除案卷节点），与前端组卷工作台语义一致。
 */
@Service
public class VolumeService {

  private static final Logger log = LoggerFactory.getLogger(VolumeService.class);

  /** 卷级占位档号标记（未赋号） */
  static final String VPENDING_SUFFIX = "-VPEND-";
  /** 件级占位档号标记（与 RecordService 对齐） */
  static final String PENDING_SUFFIX = "-PEND-";

  private final AlfrescoNodeClient nodes;
  private final RepoLayout layout;
  private final CodeSerialService serials;
  private final ConfigService config;
  private final ApplicationEventPublisher events;
  private final ObjectMapper json = new ObjectMapper();

  public VolumeService(AlfrescoNodeClient nodes, RepoLayout layout,
                       CodeSerialService serials, ConfigService config,
                       ApplicationEventPublisher events) {
    this.nodes = nodes;
    this.layout = layout;
    this.serials = serials;
    this.config = config;
    this.events = events;
  }

  // ═══════════════════ 建卷 / 更新 / 删除 ═══════════════════

  /**
   * 卷内日期格式校验（2026-08-20）：finance:dateFrom/dateTo 是 d:date，
   * Alfresco 只收 yyyy-MM / yyyy-MM-dd 且月份须 01-12；"2026-00" 这类值会带出一整屏
   * 模型堆栈——在校验层转成可读中文错误。
   */
  private static String checkedYearMonth(String v, String label) {
    if (v != null && v.matches("^\\d{4}-(0[1-9]|1[0-2])(-(0[1-9]|[12]\\d|3[01]))?$")) return v;
    throw BizException.badRequest("VALIDATION_FAILED",
        label + "格式不合法: " + v + "（应为 yyyy-MM 或 yyyy-MM-dd，月份 01-12）");
  }

  public record CreateCmd(
      String fondsCode, String title, String archiveType, String archiveTypeCode,
      Integer year, String retention, String retentionCode,
      String dateFrom, String dateTo, String carrierType, String securityLevel) {}

  /** 建卷（草稿）：落点 /{全宗}/案卷库/{大类}/{年度}/，档号占位 VPEND */
  public Map<String, Object> create(String userId, String ticket, CreateCmd cmd) {
    if (!notBlank(cmd.fondsCode())) throw BizException.badRequest("VALIDATION_FAILED", "fondsCode 不能为空");
    if (!notBlank(cmd.title())) throw BizException.badRequest("VALIDATION_FAILED", "案卷题名不能为空");
    if (cmd.year() == null || cmd.year() < 1900 || cmd.year() > 2100)
      throw BizException.badRequest("VALIDATION_FAILED", "年度不合法");

    String fondsId = layout.fonds(ticket, cmd.fondsCode());
    String cat = CategoryCodes.toCategoryCode(cmd.archiveTypeCode(), cmd.archiveType());
    String dirId = layout.ensurePath(ticket, fondsId, RepoLayout.VOLUMES_ROOT, cat, String.valueOf(cmd.year()));

    Map<String, Object> props = new LinkedHashMap<>();
    props.put("finance:volumeCode", pendingVolumeCode(cmd.fondsCode()));
    props.put("finance:title", cmd.title());
    props.put("finance:volumeTypeCode", cat);
    if (notBlank(cmd.archiveType())) props.put("finance:volumeArchiveType", cmd.archiveType());
    props.put("finance:volumeYear", cmd.year());
    if (notBlank(cmd.retention())) props.put("finance:volumeRetention", cmd.retention());
    String retentionCode = notBlank(cmd.retentionCode()) ? cmd.retentionCode()
        : CategoryCodes.inferRetentionCode(cmd.retention());
    props.put("finance:retentionCode", retentionCode);
    props.put("finance:volumeStatus", "draft");
    props.put("finance:volumeTotalItems", 0);
    if (notBlank(cmd.dateFrom())) props.put("finance:dateFrom", checkedYearMonth(cmd.dateFrom(), "卷内日期起"));
    if (notBlank(cmd.dateTo())) props.put("finance:dateTo", checkedYearMonth(cmd.dateTo(), "卷内日期止"));
    props.put("finance:createdDate", LocalDate.now().toString());
    props.put("finance:createdBy", userId);
    if (notBlank(cmd.carrierType())) props.put("finance:volumeCarrierType", cmd.carrierType());
    if (notBlank(cmd.securityLevel())) props.put("finance:volumeSecurityLevel", cmd.securityLevel());

    Map<String, Object> entry = createWithRenameRetry(ticket, dirId, sanitizeName(cmd.title()), "finance:volume", props);
    log.info("建卷成功: {} → {}（操作人 {}）", cmd.title(), entry.get("id"), userId);
    return toView(entry, cmd.fondsCode(), "", "");
  }

  /** 更新案卷元数据（仅草稿/已确认可改题名等非状态字段） */
  public Map<String, Object> update(String ticket, String volumeId, Map<String, String> f) {
    Map<String, Object> vol = requireVolume(ticket, volumeId);
    Map<String, Object> props = new LinkedHashMap<>();
    if (notBlank(f.get("title"))) props.put("finance:title", f.get("title"));
    if (notBlank(f.get("retention"))) {
      props.put("finance:volumeRetention", f.get("retention"));
      props.put("finance:retentionCode", CategoryCodes.inferRetentionCode(f.get("retention")));
    }
    if (f.get("dateFrom") != null) props.put("finance:dateFrom", checkedYearMonth(f.get("dateFrom"), "卷内日期起"));
    if (f.get("dateTo") != null) props.put("finance:dateTo", checkedYearMonth(f.get("dateTo"), "卷内日期止"));
    if (f.get("cabinetNo") != null) props.put("finance:cabinetNo", f.get("cabinetNo"));
    if (f.get("shelfNo") != null) props.put("finance:shelfNo", f.get("shelfNo"));
    if (f.get("securityLevel") != null) props.put("finance:volumeSecurityLevel", f.get("securityLevel"));
    if (f.get("carrierType") != null) props.put("finance:volumeCarrierType", f.get("carrierType"));
    if (props.isEmpty()) throw BizException.badRequest("VALIDATION_FAILED", "没有可更新的字段");
    Map<String, Object> entry;
    try {
      entry = nodes.updateNode(ticket, volumeId, props);
    } catch (HttpClientErrorException e) {
      throw RepoLayout.translate("更新案卷失败", e);
    }
    String fondsCode = fondsCodeOf(ticket, vol);
    BoxRef box = boxOf(ticket, volumeId);
    return toView(entry, fondsCode, box.id(), box.no());
  }

  /** 删除空草稿案卷（有件卷走拆卷 decompose） */
  public void deleteEmpty(String ticket, String volumeId) {
    Map<String, Object> vol = requireVolume(ticket, volumeId);
    requireStatus(vol, "draft", "仅草稿案卷可删除");
    List<Map<String, Object>> records = childRecords(ticket, volumeId);
    if (!records.isEmpty()) {
      throw new BizException(HttpStatus.CONFLICT, "VOLUME_NOT_EMPTY", "案卷内还有 " + records.size() + " 件，请先拆卷");
    }
    try {
      nodes.deleteNode(ticket, volumeId);
    } catch (HttpClientErrorException e) {
      throw RepoLayout.translate("删除案卷失败", e);
    }
    log.info("删除空案卷: {}", volumeId);
  }

  // ═══════════════════ 卷列表 ═══════════════════

  public record ListQuery(String fondsCode, Integer year, String typeCode, String status) {}

  /**
   * 卷列表：扫描 案卷库（草稿/已确认）+ 盒库（已移交，附盒信息），
   * children API 事务读，不依赖 Solr。
   */
  public List<Map<String, Object>> list(String ticket, ListQuery q) {
    if (!notBlank(q.fondsCode())) throw BizException.badRequest("VALIDATION_FAILED", "fondsCode 不能为空");
    String fondsId = layout.fonds(ticket, q.fondsCode());
    List<Map<String, Object>> out = new ArrayList<>();

    // 案卷库：/案卷库/{CAT}/{year}/{vol}
    scanVolumeTree(ticket, fondsId, q, out);
    // 盒库：/盒库/{CAT}/{year}/{box}/{vol}（移交后的卷带盒归属）
    scanBoxTree(ticket, fondsId, q, out);

    out.sort(Comparator.comparing(v -> str(v.get("createdAt")), Comparator.reverseOrder()));
    return out;
  }

  private void scanVolumeTree(String ticket, String fondsId, ListQuery q, List<Map<String, Object>> out) {
    String rootId = layout.ensureChild(ticket, fondsId, RepoLayout.VOLUMES_ROOT);
    for (Map<String, Object> catDir : childFolders(ticket, rootId)) {
      String cat = str(catDir.get("name"));
      if (q.typeCode() != null && !cat.equalsIgnoreCase(CategoryCodes.toCategoryCode(q.typeCode(), null))) continue;
      for (Map<String, Object> yearDir : childFolders(ticket, str(catDir.get("id")))) {
        if (q.year() != null && !String.valueOf(q.year()).equals(str(yearDir.get("name")))) continue;
        for (Map<String, Object> vol : childrenOfType(ticket, str(yearDir.get("id")), "finance:volume")) {
          Map<String, Object> view = toView(vol, q.fondsCode(), "", "");
          if (q.status() == null || q.status().equals(view.get("status"))) out.add(view);
        }
      }
    }
  }

  private void scanBoxTree(String ticket, String fondsId, ListQuery q, List<Map<String, Object>> out) {
    String rootId = layout.ensureChild(ticket, fondsId, RepoLayout.BOXES_ROOT);
    for (Map<String, Object> catDir : childFolders(ticket, rootId)) {
      String cat = str(catDir.get("name"));
      if (q.typeCode() != null && !cat.equalsIgnoreCase(CategoryCodes.toCategoryCode(q.typeCode(), null))) continue;
      for (Map<String, Object> yearDir : childFolders(ticket, str(catDir.get("id")))) {
        if (q.year() != null && !String.valueOf(q.year()).equals(str(yearDir.get("name")))) continue;
        for (Map<String, Object> box : childrenOfType(ticket, str(yearDir.get("id")), "finance:archiveBox")) {
          String boxId = str(box.get("id"));
          String boxNo = prop(box, "finance:boxNo");
          for (Map<String, Object> vol : childrenOfType(ticket, boxId, "finance:volume")) {
            Map<String, Object> view = toView(vol, q.fondsCode(), boxId, boxNo);
            if (q.status() == null || q.status().equals(view.get("status"))) out.add(view);
          }
        }
      }
    }
  }

  // ═══════════════════ 卷内件 ═══════════════════

  /** 卷内件列表（按 volumeItemNo 顺排） */
  public List<Map<String, Object>> items(String ticket, String volumeId) {
    requireVolume(ticket, volumeId);
    List<Map<String, Object>> records = childRecords(ticket, volumeId);
    records.sort(Comparator.comparing(r -> {
      Integer n = intProp(r, "finance:volumeItemNo");
      return n == null ? Integer.MAX_VALUE : n;
    }));
    List<Map<String, Object>> out = new ArrayList<>();
    for (Map<String, Object> r : records) out.add(toItemView(r, volumeId));
    return out;
  }

  /** 加件入卷（move 出收集池；position 为 1-based 插入位，缺省追加尾部） */
  public List<Map<String, Object>> addItems(String ticket, String volumeId, List<String> recordIds, Integer position) {
    Map<String, Object> vol = requireVolume(ticket, volumeId);
    requireStatus(vol, "draft", "仅草稿案卷可加件（已确认请先撤销确认）");
    if (recordIds == null || recordIds.isEmpty()) throw BizException.badRequest("VALIDATION_FAILED", "recordIds 不能为空");

    List<Map<String, Object>> existing = childRecords(ticket, volumeId);
    existing.sort(Comparator.comparing(r -> {
      Integer n = intProp(r, "finance:volumeItemNo");
      return n == null ? Integer.MAX_VALUE : n;
    }));

    // 插入位：先把插入位及之后的件号后移
    int insertAt = (position == null) ? existing.size()
        : Math.max(0, Math.min(position - 1, existing.size()));
    if (insertAt < existing.size()) {
      int shift = recordIds.size();
      for (int i = existing.size() - 1; i >= insertAt; i--) {
        updateProps(ticket, str(existing.get(i).get("id")), Map.of("finance:volumeItemNo", i + 1 + shift));
      }
    }

    for (int i = 0; i < recordIds.size(); i++) {
      String recordId = recordIds.get(i);
      try {
        nodes.moveNode(ticket, recordId, volumeId);
      } catch (HttpClientErrorException e) {
        throw RepoLayout.translate("加件入卷失败: " + recordId, e);
      }
      updateProps(ticket, recordId, Map.of(
          "finance:recordStatus", "待审核",
          "finance:volumeItemNo", insertAt + i + 1));
    }
    updateProps(ticket, volumeId, Map.of("finance:volumeTotalItems", existing.size() + recordIds.size()));
    log.info("加件入卷: {} 件 → {}（插入位 {}）", recordIds.size(), volumeId, insertAt + 1);
    events.publishEvent(RecordsChangedEvent.refresh(recordIds)); // V10 读模型同步
    return items(ticket, volumeId);
  }

  /** 拆件回收集池；最后一件移除时案卷自动销毁（返回是否已销毁） */
  public Map<String, Object> removeItem(String ticket, String volumeId, String recordId) {
    Map<String, Object> vol = requireVolume(ticket, volumeId);
    requireStatus(vol, "draft", "仅草稿案卷可拆件（已确认请先撤销确认）");

    Map<String, Object> fonds = layout.findFondsOf(ticket, volumeId);
    String poolId = layout.pool(ticket, str(fonds.get("id")));
    try {
      nodes.moveNode(ticket, recordId, poolId);
    } catch (HttpClientErrorException e) {
      throw RepoLayout.translate("拆件回池失败", e);
    }
    Map<String, Object> clear = new LinkedHashMap<>();
    clear.put("finance:recordStatus", "仅件数据");
    clear.put("finance:volumeItemNo", null);
    updateProps(ticket, recordId, clear);

    // 余下件重新顺排
    List<Map<String, Object>> rest = childRecords(ticket, volumeId);
    rest.sort(Comparator.comparing(r -> {
      Integer n = intProp(r, "finance:volumeItemNo");
      return n == null ? Integer.MAX_VALUE : n;
    }));
    for (int i = 0; i < rest.size(); i++) {
      updateProps(ticket, str(rest.get(i).get("id")), Map.of("finance:volumeItemNo", i + 1));
    }

    // 空案卷自动销毁
    if (rest.isEmpty()) {
      try {
        nodes.deleteNode(ticket, volumeId);
      } catch (HttpClientErrorException e) {
        throw RepoLayout.translate("空案卷销毁失败", e);
      }
      log.info("拆件后案卷为空，自动销毁: {}", volumeId);
      events.publishEvent(RecordsChangedEvent.refreshOne(recordId)); // V10 读模型同步
      return Map.of("destroyed", true, "remaining", 0);
    }
    updateProps(ticket, volumeId, Map.of("finance:volumeTotalItems", rest.size()));
    events.publishEvent(RecordsChangedEvent.refreshOne(recordId)); // V10 读模型同步
    return Map.of("destroyed", false, "remaining", rest.size());
  }

  /** 卷内重排：按给定 recordId 顺序重写件号 */
  public List<Map<String, Object>> reorder(String ticket, String volumeId, List<String> orderedRecordIds) {
    Map<String, Object> vol = requireVolume(ticket, volumeId);
    requireStatus(vol, "draft", "仅草稿案卷可重排");
    List<Map<String, Object>> existing = childRecords(ticket, volumeId);
    if (orderedRecordIds == null || orderedRecordIds.size() != existing.size()) {
      throw BizException.badRequest("VALIDATION_FAILED", "重排列表须覆盖卷内全部件（" + existing.size() + " 件）");
    }
    for (int i = 0; i < orderedRecordIds.size(); i++) {
      updateProps(ticket, orderedRecordIds.get(i), Map.of("finance:volumeItemNo", i + 1));
    }
    return items(ticket, volumeId);
  }

  // ═══════════════════ 确认 / 撤销 / 拆卷 ═══════════════════

  /**
   * 确认组卷：赋号时机=on-confirm 时经 ams_code_serial 真取号
   * （盒流水 scope=box + 卷流水 scope=volume），件级档号 = 卷号-{件号4}。
   */
  public Map<String, Object> confirm(String ticket, String userId, String volumeId) {
    Map<String, Object> vol = requireVolume(ticket, volumeId);
    requireStatus(vol, "draft", "案卷当前状态不可确认: " + prop(vol, "finance:volumeStatus"));

    List<Map<String, Object>> records = childRecords(ticket, volumeId);
    records.sort(Comparator.comparing(r -> {
      Integer n = intProp(r, "finance:volumeItemNo");
      return n == null ? Integer.MAX_VALUE : n;
    }));
    if (records.isEmpty()) throw BizException.badRequest("VOLUME_EMPTY", "空案卷不可确认组卷");

    Map<String, Object> fonds = layout.findFondsOf(ticket, volumeId);
    String fondsCode = prop(fonds, "finance:code");
    String cat = prop(vol, "finance:volumeTypeCode");
    String typeNum = CategoryCodes.toNumericCode(cat);
    int year = intProp(vol, "finance:volumeYear") != null ? intProp(vol, "finance:volumeYear") : LocalDate.now().getYear();
    String retCode = notBlank(prop(vol, "finance:retentionCode")) ? prop(vol, "finance:retentionCode")
        : CategoryCodes.inferRetentionCode(prop(vol, "finance:volumeRetention"));

    Map<String, Object> upd = new LinkedHashMap<>();
    if (assignOnConfirm()) {
      // 流水作用域与 P0-7 /code/next 规约一致：scope=BOX/VOLUME（大写），typeCode=KP/KB/FB/QT
      int boxSerial = serials.next(new CodeSerialService.SerialScope("BOX", fondsCode, cat, year, null));
      int volSerial = serials.next(new CodeSerialService.SerialScope("VOLUME", fondsCode, cat, year, null));
      String volumeCode = buildVolumeCode(fondsCode, typeNum, year, retCode, boxSerial, volSerial);

      String today = LocalDate.now().toString();
      for (Map<String, Object> r : records) {
        int itemNo = intProp(r, "finance:volumeItemNo") != null ? intProp(r, "finance:volumeItemNo") : 1;
        Map<String, Object> ru = new LinkedHashMap<>();
        ru.put("finance:archiveCode", volumeCode + "-" + String.format("%04d", itemNo));
        ru.put("finance:numbered", true);
        ru.put("finance:numberedDate", today);
        ru.put("finance:recordStatus", "已组卷");
        updateProps(ticket, str(r.get("id")), ru);
      }
      upd.put("finance:volumeCode", volumeCode);
      log.info("确认组卷并赋号: {} → {}（{} 件，操作人 {}）", volumeId, volumeCode, records.size(), userId);
    } else {
      for (Map<String, Object> r : records) {
        updateProps(ticket, str(r.get("id")), Map.of("finance:recordStatus", "已组卷"));
      }
      log.info("确认组卷（按配置未赋号）: {}（{} 件，操作人 {}）", volumeId, records.size(), userId);
    }
    upd.put("finance:volumeStatus", "confirmed");
    updateProps(ticket, volumeId, upd);

    events.publishEvent(RecordsChangedEvent.refreshVolume(volumeId)); // V10 读模型同步（档号/状态变化）
    BoxRef box = boxOf(ticket, volumeId);
    return toView(nodes.getNode(ticket, volumeId), fondsCode, box.id(), box.no());
  }

  /** 撤销确认：恢复草稿，正式档号回收为占位值（重新确认时按当前配置再取号） */
  public Map<String, Object> unconfirm(String ticket, String volumeId) {
    Map<String, Object> vol = requireVolume(ticket, volumeId);
    requireStatus(vol, "confirmed", "仅已确认案卷可撤销确认");

    Map<String, Object> fonds = layout.findFondsOf(ticket, volumeId);
    String fondsCode = prop(fonds, "finance:code");

    for (Map<String, Object> r : childRecords(ticket, volumeId)) {
      Map<String, Object> ru = new LinkedHashMap<>();
      ru.put("finance:archiveCode", fondsCode.toUpperCase() + PENDING_SUFFIX
          + UUID.randomUUID().toString().substring(0, 8));
      ru.put("finance:numbered", false);
      ru.put("finance:numberedDate", null);
      ru.put("finance:recordStatus", "待审核");
      updateProps(ticket, str(r.get("id")), ru);
    }
    Map<String, Object> upd = new LinkedHashMap<>();
    upd.put("finance:volumeCode", pendingVolumeCode(fondsCode));
    upd.put("finance:volumeStatus", "draft");
    updateProps(ticket, volumeId, upd);
    log.info("撤销确认: {}", volumeId);
    events.publishEvent(RecordsChangedEvent.refreshVolume(volumeId)); // V10 读模型同步
    return toView(nodes.getNode(ticket, volumeId), fondsCode, "", "");
  }

  /** 拆卷：全部件回收集池后删除案卷节点，返回拆出件数 */
  public int decompose(String ticket, String volumeId) {
    Map<String, Object> vol = requireVolume(ticket, volumeId);
    requireStatus(vol, "draft", "只能拆除草稿状态的案卷，已确认请先撤销确认");

    Map<String, Object> fonds = layout.findFondsOf(ticket, volumeId);
    String poolId = layout.pool(ticket, str(fonds.get("id")));
    List<Map<String, Object>> records = childRecords(ticket, volumeId);
    List<String> ids = new ArrayList<>();
    for (Map<String, Object> r : records) {
      String recordId = str(r.get("id"));
      ids.add(recordId);
      try {
        nodes.moveNode(ticket, recordId, poolId);
      } catch (HttpClientErrorException e) {
        throw RepoLayout.translate("拆卷回池失败: " + recordId, e);
      }
      Map<String, Object> clear = new LinkedHashMap<>();
      clear.put("finance:recordStatus", "仅件数据");
      clear.put("finance:volumeItemNo", null);
      updateProps(ticket, recordId, clear);
    }
    try {
      nodes.deleteNode(ticket, volumeId);
    } catch (HttpClientErrorException e) {
      throw RepoLayout.translate("删除案卷失败", e);
    }
    log.info("拆卷完成: {}（{} 件回池）", volumeId, records.size());
    events.publishEvent(RecordsChangedEvent.refresh(ids)); // V10 读模型同步（卷已销毁）
    return records.size();
  }

  // ═══════════════════ 拆分 / 合并 / 转卷（2026-08-17 组卷操作补全） ═══════════════════
  //
  // 三个操作共享同一条组卷不变式：
  //   - 仅草稿卷参与（已确认须先撤销确认，正式档号才不会被改写）；
  //   - 类别/年度/期限必须一致（DA/T 42-2022 同卷同类同期限原则，确认组卷按卷级属性统一赋号，
  //     混拼会导致档号与件内容不符）；
  //   - 件在任一时刻只归属一个容器（move 语义，不丢件、不重件）；
  //   - 移出侧件号 1..n 重排、计数回写；源卷空壳自动销毁（与拆件语义一致）。
  // Alfresco REST 无跨调用事务，采用「先校验全部前置 → 定序执行 → 失败即时报错」，
  // 与既有 addItems/removeItem/decompose 同级可靠性。

  /**
   * 拆分：卷内选定件拆出为新案卷（继承源卷类别/年度/期限/载体/密级）。
   * 选定件按原卷内顺序入新卷顺排；源卷余件重排，若全部拆出则源卷自动销毁。
   */
  public Map<String, Object> split(String ticket, String userId, String volumeId,
                                   List<String> recordIds, String title) {
    Map<String, Object> src = requireVolume(ticket, volumeId);
    requireStatus(src, "draft", "仅草稿案卷可拆分（已确认请先撤销确认）");

    List<Map<String, Object>> children = childRecords(ticket, volumeId);
    children.sort(itemNoComparator());
    Selection sel = pickSelected(children, recordIds, "拆分明细");

    // 新卷继承源卷属性，落到同一目录（/案卷库/{大类}/{年度}/）
    Map<String, Object> fonds = layout.findFondsOf(ticket, volumeId);
    String fondsCode = prop(fonds, "finance:code");
    String cat = prop(src, "finance:volumeTypeCode");
    int year = intProp(src, "finance:volumeYear") != null ? intProp(src, "finance:volumeYear") : LocalDate.now().getYear();
    String dirId = layout.ensurePath(ticket, str(fonds.get("id")), RepoLayout.VOLUMES_ROOT, cat, String.valueOf(year));

    String newTitle = notBlank(title) ? title.trim() : prop(src, "finance:title") + "（拆分）";
    Map<String, Object> props = new LinkedHashMap<>();
    props.put("finance:volumeCode", pendingVolumeCode(fondsCode));
    props.put("finance:title", newTitle);
    props.put("finance:volumeTypeCode", cat);
    if (notBlank(prop(src, "finance:volumeArchiveType"))) props.put("finance:volumeArchiveType", prop(src, "finance:volumeArchiveType"));
    props.put("finance:volumeYear", year);
    if (notBlank(prop(src, "finance:volumeRetention"))) props.put("finance:volumeRetention", prop(src, "finance:volumeRetention"));
    if (notBlank(prop(src, "finance:retentionCode"))) props.put("finance:retentionCode", prop(src, "finance:retentionCode"));
    props.put("finance:volumeStatus", "draft");
    props.put("finance:volumeTotalItems", sel.picked().size());
    props.put("finance:createdDate", LocalDate.now().toString());
    props.put("finance:createdBy", userId);
    if (notBlank(prop(src, "finance:volumeCarrierType"))) props.put("finance:volumeCarrierType", prop(src, "finance:volumeCarrierType"));
    if (notBlank(prop(src, "finance:volumeSecurityLevel"))) props.put("finance:volumeSecurityLevel", prop(src, "finance:volumeSecurityLevel"));
    Map<String, Object> newVol = createWithRenameRetry(ticket, dirId, sanitizeName(newTitle), "finance:volume", props);
    String newVolId = str(newVol.get("id"));

    // 移件：按原卷内顺序入新卷顺排（件状态保持「待审核」不变）
    for (int i = 0; i < sel.picked().size(); i++) {
      String rid = str(sel.picked().get(i).get("id"));
      try {
        nodes.moveNode(ticket, rid, newVolId);
      } catch (HttpClientErrorException e) {
        throw RepoLayout.translate("拆分移件失败: " + rid, e);
      }
      updateProps(ticket, rid, Map.of("finance:volumeItemNo", i + 1));
    }

    // 源卷：余件重排 + 计数回写；全部拆出时源卷自动销毁
    boolean sourceDestroyed = sel.rest().isEmpty();
    if (sourceDestroyed) {
      try {
        nodes.deleteNode(ticket, volumeId);
      } catch (HttpClientErrorException e) {
        throw RepoLayout.translate("源案卷销毁失败", e);
      }
    } else {
      renumber(ticket, sel.rest());
      updateProps(ticket, volumeId, Map.of("finance:volumeTotalItems", sel.rest().size()));
    }
    log.info("拆分案卷: {} → 新卷 {}（拆出 {} 件，源卷余 {} 件，操作人 {}）",
        volumeId, newVolId, sel.picked().size(), sel.rest().size(), userId);
    events.publishEvent(RecordsChangedEvent.refresh(
        sel.picked().stream().map(r -> str(r.get("id"))).toList())); // V10 读模型同步

    Map<String, Object> out = new LinkedHashMap<>();
    out.put("volume", toView(nodes.getNode(ticket, newVolId), fondsCode, "", ""));
    out.put("moved", sel.picked().size());
    out.put("sourceDestroyed", sourceDestroyed);
    out.put("sourceRemaining", sel.rest().size());
    return out;
  }

  /**
   * 合并：多个来源草稿卷的件按顺序追加到目标卷尾部，来源卷合并后删除。
   * 前置：来源/目标全部草稿且类别/年度/期限一致，目标不得同时是来源。
   */
  public Map<String, Object> merge(String ticket, String userId, List<String> sourceVolumeIds, String targetVolumeId) {
    Map<String, Object> target = requireVolume(ticket, targetVolumeId);
    requireStatus(target, "draft", "目标案卷须为草稿状态（已确认请先撤销确认）");
    if (sourceVolumeIds == null || sourceVolumeIds.isEmpty()) {
      throw BizException.badRequest("VALIDATION_FAILED", "合并来源案卷不能为空");
    }
    Set<String> srcIds = new LinkedHashSet<>(sourceVolumeIds);
    if (srcIds.size() != sourceVolumeIds.size()) {
      throw BizException.badRequest("VALIDATION_FAILED", "合并来源存在重复案卷");
    }
    if (srcIds.contains(targetVolumeId)) {
      throw BizException.badRequest("VALIDATION_FAILED", "目标案卷不能同时作为合并来源");
    }

    // 全部前置校验（存在性/草稿态/一致性）通过后才开始移动，避免半卷合并
    List<Map<String, Object>> sources = new ArrayList<>();
    for (String sid : srcIds) {
      Map<String, Object> sv = requireVolume(ticket, sid);
      requireStatus(sv, "draft", "来源案卷「" + prop(sv, "finance:title") + "」不是草稿状态（已确认请先撤销确认）");
      requireCompatible(target, sv, "合并");
      sources.add(sv);
    }

    int nextNo = childRecords(ticket, targetVolumeId).size() + 1;
    int merged = 0;
    List<String> movedIds = new ArrayList<>();
    for (Map<String, Object> sv : sources) {
      String sid = str(sv.get("id"));
      List<Map<String, Object>> recs = childRecords(ticket, sid);
      recs.sort(itemNoComparator());
      for (Map<String, Object> r : recs) {
        String rid = str(r.get("id"));
        movedIds.add(rid);
        try {
          nodes.moveNode(ticket, rid, targetVolumeId);
        } catch (HttpClientErrorException e) {
          throw RepoLayout.translate("合并移件失败: " + rid, e);
        }
        updateProps(ticket, rid, Map.of("finance:volumeItemNo", nextNo++));
        merged++;
      }
      try {
        nodes.deleteNode(ticket, sid);
      } catch (HttpClientErrorException e) {
        throw RepoLayout.translate("来源案卷删除失败: " + sid, e);
      }
    }
    updateProps(ticket, targetVolumeId, Map.of("finance:volumeTotalItems", nextNo - 1));
    log.info("合并案卷: {} 卷并入 {}（共 {} 件，操作人 {}）", sources.size(), targetVolumeId, merged, userId);
    events.publishEvent(RecordsChangedEvent.refresh(movedIds)); // V10 读模型同步（源卷已销毁）

    Map<String, Object> fonds = layout.findFondsOf(ticket, targetVolumeId);
    BoxRef box = boxOf(ticket, targetVolumeId);
    Map<String, Object> out = new LinkedHashMap<>();
    out.put("volume", toView(nodes.getNode(ticket, targetVolumeId), prop(fonds, "finance:code"), box.id(), box.no()));
    out.put("mergedCount", merged);
    out.put("mergedVolumes", sources.size());
    return out;
  }

  /**
   * 转卷：源卷选定件移入目标草稿卷尾部（跨案卷迁移，不回收集池）。
   * 源卷余件重排；全部移出时源卷自动销毁。
   */
  public Map<String, Object> moveItems(String ticket, String userId, String volumeId,
                                       List<String> recordIds, String targetVolumeId) {
    if (volumeId.equals(targetVolumeId)) {
      throw BizException.badRequest("VALIDATION_FAILED", "源案卷与目标案卷相同，无需转卷");
    }
    Map<String, Object> src = requireVolume(ticket, volumeId);
    Map<String, Object> target = requireVolume(ticket, targetVolumeId);
    requireStatus(src, "draft", "源案卷须为草稿状态（已确认请先撤销确认）");
    requireStatus(target, "draft", "目标案卷须为草稿状态（已确认请先撤销确认）");
    requireCompatible(src, target, "转卷");

    List<Map<String, Object>> children = childRecords(ticket, volumeId);
    children.sort(itemNoComparator());
    Selection sel = pickSelected(children, recordIds, "转卷明细");

    int nextNo = childRecords(ticket, targetVolumeId).size() + 1;
    for (Map<String, Object> r : sel.picked()) {
      String rid = str(r.get("id"));
      try {
        nodes.moveNode(ticket, rid, targetVolumeId);
      } catch (HttpClientErrorException e) {
        throw RepoLayout.translate("转卷移件失败: " + rid, e);
      }
      updateProps(ticket, rid, Map.of("finance:volumeItemNo", nextNo++));
    }

    boolean sourceDestroyed = sel.rest().isEmpty();
    if (sourceDestroyed) {
      try {
        nodes.deleteNode(ticket, volumeId);
      } catch (HttpClientErrorException e) {
        throw RepoLayout.translate("源案卷销毁失败", e);
      }
    } else {
      renumber(ticket, sel.rest());
      updateProps(ticket, volumeId, Map.of("finance:volumeTotalItems", sel.rest().size()));
    }
    log.info("转卷: {} 件 {} → {}（源卷余 {} 件，操作人 {}）",
        sel.picked().size(), volumeId, targetVolumeId, sel.rest().size(), userId);
    events.publishEvent(RecordsChangedEvent.refresh(
        sel.picked().stream().map(r -> str(r.get("id"))).toList())); // V10 读模型同步

    Map<String, Object> out = new LinkedHashMap<>();
    out.put("moved", sel.picked().size());
    out.put("sourceDestroyed", sourceDestroyed);
    out.put("sourceRemaining", sel.rest().size());
    return out;
  }

  /** 选中集拆分：按卷内顺序分出「选中件 / 余件」，并校验明细非空、无重复、全部属于本卷 */
  private Selection pickSelected(List<Map<String, Object>> children, List<String> recordIds, String label) {
    if (recordIds == null || recordIds.isEmpty()) {
      throw BizException.badRequest("VALIDATION_FAILED", label + "不能为空");
    }
    Set<String> ids = new LinkedHashSet<>(recordIds);
    if (ids.size() != recordIds.size()) {
      throw BizException.badRequest("VALIDATION_FAILED", label + "存在重复件");
    }
    List<Map<String, Object>> picked = new ArrayList<>();
    List<Map<String, Object>> rest = new ArrayList<>();
    for (Map<String, Object> r : children) {
      if (ids.contains(str(r.get("id")))) picked.add(r); else rest.add(r);
    }
    if (picked.size() != ids.size()) {
      throw BizException.badRequest("VALIDATION_FAILED", label + "含有不属于本案卷的件");
    }
    return new Selection(picked, rest);
  }

  private record Selection(List<Map<String, Object>> picked, List<Map<String, Object>> rest) {}

  /** 一致性校验：同大类、同年度、同保管期限才可合卷/转卷（DA/T 42-2022 组卷原则） */
  private void requireCompatible(Map<String, Object> a, Map<String, Object> b, String op) {
    boolean ok = Objects.equals(prop(a, "finance:volumeTypeCode"), prop(b, "finance:volumeTypeCode"))
        && Objects.equals(intProp(a, "finance:volumeYear"), intProp(b, "finance:volumeYear"))
        && Objects.equals(prop(a, "finance:retentionCode"), prop(b, "finance:retentionCode"));
    if (!ok) {
      throw new BizException(HttpStatus.CONFLICT, "VOLUME_INCOMPATIBLE",
          op + "要求案卷类别/年度/保管期限一致：「" + prop(a, "finance:title") + "」与「" + prop(b, "finance:title") + "」不匹配");
    }
  }

  /** 卷内件按件号顺排比较器（无件号排尾） */
  private static Comparator<Map<String, Object>> itemNoComparator() {
    return Comparator.comparing(r -> {
      Integer n = intProp(r, "finance:volumeItemNo");
      return n == null ? Integer.MAX_VALUE : n;
    });
  }

  /** 余件按当前顺序重写件号 1..n（children 须已按期望顺序排好） */
  private void renumber(String ticket, List<Map<String, Object>> children) {
    for (int i = 0; i < children.size(); i++) {
      updateProps(ticket, str(children.get(i).get("id")), Map.of("finance:volumeItemNo", i + 1));
    }
  }

  // ═══════════════════ 移交归盒 / 退回 ═══════════════════

  /**
   * 移交归盒：在 /{全宗}/盒库/{大类}/{年度}/ 找 active 盒（无则自动建盒），
   * 案卷 move 进盒并置 transferred；盒计数同步。
   */
  public Map<String, Object> transfer(String ticket, String userId, String volumeId) {
    Map<String, Object> vol = requireVolume(ticket, volumeId);
    requireStatus(vol, "confirmed", "案卷须先确认组卷才能移交，当前状态: " + prop(vol, "finance:volumeStatus"));

    Map<String, Object> fonds = layout.findFondsOf(ticket, volumeId);
    String fondsId = str(fonds.get("id"));
    String fondsCode = prop(fonds, "finance:code");
    String cat = prop(vol, "finance:volumeTypeCode");
    int year = intProp(vol, "finance:volumeYear") != null ? intProp(vol, "finance:volumeYear") : LocalDate.now().getYear();
    int totalItems = intProp(vol, "finance:volumeTotalItems") != null ? intProp(vol, "finance:volumeTotalItems") : 0;

    String boxesDir = layout.ensurePath(ticket, fondsId, RepoLayout.BOXES_ROOT, cat, String.valueOf(year));

    // 找该目录下第一个 active 盒；无则建盒
    Map<String, Object> box = null;
    List<Map<String, Object>> boxes = childrenOfType(ticket, boxesDir, "finance:archiveBox");
    for (Map<String, Object> b : boxes) {
      if ("active".equals(prop(b, "finance:boxStatus"))) { box = b; break; }
    }
    if (box == null) {
      int seq = boxes.size() + 1;
      String boxNo = "BOX-" + year + "-" + cat + "-" + String.format("%03d", seq);
      Map<String, Object> props = new LinkedHashMap<>();
      props.put("finance:boxNo", boxNo);
      props.put("finance:boxName", year + "年" + CategoryCodes.categoryName(cat) + " 第" + String.format("%03d", seq) + "盒");
      props.put("finance:typeCode", cat);
      if (notBlank(prop(vol, "finance:volumeRetention"))) props.put("finance:boxRetention", prop(vol, "finance:volumeRetention"));
      props.put("finance:boxYear", year);
      props.put("finance:boxStatus", "active");
      props.put("finance:volumeCount", 0);
      props.put("finance:boxTotalItems", 0);
      box = createWithRenameRetry(ticket, boxesDir, boxNo, "finance:archiveBox", props);
      log.info("自动建盒: {} → {}", boxNo, box.get("id"));
    }
    String boxId = str(box.get("id"));

    try {
      nodes.moveNode(ticket, volumeId, boxId);
    } catch (HttpClientErrorException e) {
      throw RepoLayout.translate("移交归盒失败", e);
    }
    updateProps(ticket, volumeId, Map.of("finance:volumeStatus", "transferred"));
    int boxVolCount = intProp(box, "finance:volumeCount") != null ? intProp(box, "finance:volumeCount") : 0;
    int boxItemCount = intProp(box, "finance:boxTotalItems") != null ? intProp(box, "finance:boxTotalItems") : 0;
    updateProps(ticket, boxId, Map.of(
        "finance:volumeCount", boxVolCount + 1,
        "finance:boxTotalItems", boxItemCount + totalItems));
    log.info("移交归盒: {} → 盒 {}（操作人 {}）", volumeId, prop(box, "finance:boxNo"), userId);
    events.publishEvent(RecordsChangedEvent.refreshVolume(volumeId)); // V10 读模型同步（盒归属变化）
    return toView(nodes.getNode(ticket, volumeId), fondsCode, boxId, prop(box, "finance:boxNo"));
  }

  /** 退回组卷工作台：案卷移出盒回案卷库，恢复 draft；盒计数回退 */
  public Map<String, Object> returnToWorkbench(String ticket, String volumeId) {
    Map<String, Object> vol = requireVolume(ticket, volumeId);
    requireStatus(vol, "transferred", "案卷状态不是已移交: " + prop(vol, "finance:volumeStatus"));

    Map<String, Object> fonds = layout.findFondsOf(ticket, volumeId);
    String fondsCode = prop(fonds, "finance:code");
    Map<String, Object> box = layout.nearestAncestorOfType(ticket, volumeId, "finance:archiveBox");
    String cat = prop(vol, "finance:volumeTypeCode");
    int year = intProp(vol, "finance:volumeYear") != null ? intProp(vol, "finance:volumeYear") : LocalDate.now().getYear();
    int totalItems = intProp(vol, "finance:volumeTotalItems") != null ? intProp(vol, "finance:volumeTotalItems") : 0;

    String dirId = layout.ensurePath(ticket, str(fonds.get("id")), RepoLayout.VOLUMES_ROOT, cat, String.valueOf(year));
    try {
      nodes.moveNode(ticket, volumeId, dirId);
    } catch (HttpClientErrorException e) {
      throw RepoLayout.translate("退回案卷失败", e);
    }
    updateProps(ticket, volumeId, Map.of("finance:volumeStatus", "draft"));

    // 卷内件回退草稿态（与撤销确认语义一致）
    for (Map<String, Object> r : childRecords(ticket, volumeId)) {
      updateProps(ticket, str(r.get("id")), Map.of("finance:recordStatus", "待审核"));
    }

    if (box != null) {
      int boxVolCount = intProp(box, "finance:volumeCount") != null ? intProp(box, "finance:volumeCount") : 0;
      int boxItemCount = intProp(box, "finance:boxTotalItems") != null ? intProp(box, "finance:boxTotalItems") : 0;
      updateProps(ticket, str(box.get("id")), Map.of(
          "finance:volumeCount", Math.max(0, boxVolCount - 1),
          "finance:boxTotalItems", Math.max(0, boxItemCount - totalItems)));
    }
    log.info("案卷退回工作台: {}", volumeId);
    events.publishEvent(RecordsChangedEvent.refreshVolume(volumeId)); // V10 读模型同步（回卷库+状态回退）
    return toView(nodes.getNode(ticket, volumeId), fondsCode, "", "");
  }

  // ═══════════════════ 档号构建（镜像前端 defaultPaperCodeRule） ═══════════════════

  /** 赋号时机（ams_config key=archive-code-config，zustand persist 包装 {state:{config:{...}}}） */
  private boolean assignOnConfirm() {
    try {
      var entry = config.get("archive-code-config");
      if (entry.isEmpty()) return true;
      JsonNode root = json.readTree(entry.get().valueJson());
      JsonNode timing = root.path("state").path("config").path("assignCodeTiming");
      return !"never".equals(timing.asText());
    } catch (Exception e) {
      log.warn("读取赋号时机配置失败，按 on-confirm 处理: {}", e.getMessage());
      return true;
    }
  }

  /**
   * 卷级档号（P1-⑥ 增强：段结构可配）。
   * 默认：{全宗4}-KU·{类别2}·{年度4}-{期限3}-B{盒流水3}-{卷流水4}（DA/T 13）。
   * 配置 ams_config('archive-code-config') 中 state.config 可覆盖：
   *   serialDigitsVol(卷流水位数,默认4) / serialDigitsBox(盒流水位数,默认3) /
   *   separator(段分隔符,默认-) / categoryPrefix(类别前缀,默认KU)
   */
  private String buildVolumeCode(String fondsCode, String typeNum, int year, String retCode,
                                 int boxSerial, int volSerial) {
    int volDigits = 4, boxDigits = 3;
    String sep = "-", catPrefix = "KU";
    try {
      var entry = config.get("archive-code-config");
      if (entry.isPresent()) {
        JsonNode c = json.readTree(entry.get().valueJson()).path("state").path("config");
        volDigits = c.path("serialDigitsVol").asInt(4);
        boxDigits = c.path("serialDigitsBox").asInt(3);
        sep = c.path("separator").asText("-");
        catPrefix = c.path("categoryPrefix").asText("KU");
      }
    } catch (Exception e) {
      log.warn("读取档号配置失败，用默认值: {}", e.getMessage());
    }
    StringBuilder sb = new StringBuilder();
    sb.append(padLeft(fondsCode, 4)).append(sep);
    sb.append(catPrefix).append('·');
    sb.append(padLeft(typeNum, 2)).append('·');
    sb.append(year).append(sep);
    sb.append(padLeft(retCode, 3));
    sb.append(sep).append("B").append(String.format("%0" + boxDigits + "d", boxSerial));
    sb.append(sep).append(String.format("%0" + volDigits + "d", volSerial));
    return sb.toString();
  }

  private static String padLeft(String v, int len) {
    String s = v == null ? "" : v;
    while (s.length() < len) s = "0" + s;
    return s;
  }

  private static String pendingVolumeCode(String fondsCode) {
    return fondsCode.toUpperCase() + VPENDING_SUFFIX + UUID.randomUUID().toString().substring(0, 8);
  }

  // ═══════════════════ 内部工具 ═══════════════════

  private record BoxRef(String id, String no) {}

  private BoxRef boxOf(String ticket, String volumeId) {
    Map<String, Object> box = layout.nearestAncestorOfType(ticket, volumeId, "finance:archiveBox");
    return box == null ? new BoxRef("", "") : new BoxRef(str(box.get("id")), prop(box, "finance:boxNo"));
  }

  private String fondsCodeOf(String ticket, Map<String, Object> anyNode) {
    Map<String, Object> fonds = layout.findFondsOf(ticket, str(anyNode.get("id")));
    return prop(fonds, "finance:code");
  }

  private Map<String, Object> requireVolume(String ticket, String volumeId) {
    Map<String, Object> vol;
    try {
      vol = nodes.getNode(ticket, volumeId);
    } catch (HttpClientErrorException e) {
      throw RepoLayout.translate("案卷查询失败", e);
    }
    if (!"finance:volume".equals(vol.get("nodeType"))) {
      throw BizException.badRequest("NOT_A_VOLUME", "节点不是案卷: " + volumeId);
    }
    return vol;
  }

  private void requireStatus(Map<String, Object> vol, String expected, String message) {
    if (!expected.equals(prop(vol, "finance:volumeStatus"))) {
      throw new BizException(HttpStatus.CONFLICT, "VOLUME_STATE", message);
    }
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
        throw RepoLayout.translate("卷内件查询失败", e);
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
  private List<Map<String, Object>> childFolders(String ticket, String parentId) {
    List<Map<String, Object>> out = new ArrayList<>();
    int skip = 0;
    while (true) {
      Map<String, Object> list;
      try {
        list = nodes.listChildren(ticket, parentId, skip, 500);
      } catch (HttpClientErrorException e) {
        // 目录不存在（尚未建过卷/盒）时按空处理
        if (e instanceof HttpClientErrorException.NotFound) return out;
        throw RepoLayout.translate("目录扫描失败", e);
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

  @SuppressWarnings("unchecked")
  private List<Map<String, Object>> childrenOfType(String ticket, String parentId, String nodeType) {
    List<Map<String, Object>> out = new ArrayList<>();
    int skip = 0;
    while (true) {
      Map<String, Object> list;
      try {
        list = nodes.listChildren(ticket, parentId, skip, 500);
      } catch (HttpClientErrorException e) {
        throw RepoLayout.translate("子节点扫描失败", e);
      }
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

  private void updateProps(String ticket, String nodeId, Map<String, Object> props) {
    try {
      nodes.updateNode(ticket, nodeId, props);
    } catch (HttpClientErrorException e) {
      throw RepoLayout.translate("属性更新失败", e);
    }
  }

  private Map<String, Object> createWithRenameRetry(String ticket, String parentId, String name,
                                                    String nodeType, Map<String, Object> props) {
    String candidate = name;
    for (int i = 2; ; i++) {
      try {
        return nodes.createNode(ticket, parentId, candidate, nodeType, props);
      } catch (HttpClientErrorException.Conflict e) {
        candidate = name + " (" + i + ")";
        if (i > 20) throw BizException.badRequest("NAME_CONFLICT", "同名节点过多: " + name);
      } catch (HttpClientErrorException e) {
        throw RepoLayout.translate("创建节点失败", e);
      }
    }
  }

  /** cm:name 合法化（与 RecordService 同规约） */
  private static String sanitizeName(String name) {
    String cleaned = name.replaceAll("[*?\"<>\\\\/:|]", "_").trim();
    while (cleaned.endsWith(".")) cleaned = cleaned.substring(0, cleaned.length() - 1);
    return cleaned.isBlank() ? "未命名案卷" : cleaned;
  }

  // ═══════════════════ 视图映射 ═══════════════════

  /** 案卷 entry → 前端 VolumeView；VPEND 占位档号对外映射为空串（语义：未赋号） */
  Map<String, Object> toView(Map<String, Object> entry, String fondsCode, String boxId, String boxNo) {
    Map<String, Object> view = new LinkedHashMap<>();
    view.put("nodeId", entry.get("id"));
    view.put("name", entry.get("name"));
    String volumeCode = prop(entry, "finance:volumeCode");
    view.put("volumeCode", volumeCode.contains(VPENDING_SUFFIX) ? "" : volumeCode);
    view.put("title", prop(entry, "finance:title"));
    view.put("fondsCode", fondsCode);
    String cat = prop(entry, "finance:volumeTypeCode");
    view.put("typeCode", cat);
    view.put("archiveTypeCode", CategoryCodes.toNumericCode(cat));
    view.put("archiveType", prop(entry, "finance:volumeArchiveType"));
    view.put("year", intProp(entry, "finance:volumeYear"));
    view.put("retention", prop(entry, "finance:volumeRetention"));
    view.put("retentionCode", prop(entry, "finance:retentionCode"));
    view.put("status", prop(entry, "finance:volumeStatus"));
    view.put("totalItems", intProp(entry, "finance:volumeTotalItems"));
    view.put("totalPages", intProp(entry, "finance:totalPages"));
    view.put("pageStart", intProp(entry, "finance:pageStart"));
    view.put("pageEnd", intProp(entry, "finance:pageEnd"));
    view.put("carrierType", prop(entry, "finance:volumeCarrierType"));
    view.put("securityLevel", prop(entry, "finance:volumeSecurityLevel"));
    view.put("cabinetNo", prop(entry, "finance:cabinetNo"));
    view.put("shelfNo", prop(entry, "finance:shelfNo"));
    view.put("dateFrom", prop(entry, "finance:dateFrom"));
    view.put("dateTo", prop(entry, "finance:dateTo"));
    view.put("createdDate", prop(entry, "finance:createdDate"));
    view.put("createdBy", prop(entry, "finance:createdBy"));
    view.put("scanned", boolProp(entry, "finance:scanned"));
    view.put("digitalHash", prop(entry, "finance:digitalHash"));
    view.put("boxId", boxId);
    view.put("boxNo", boxNo);
    view.put("createdAt", entry.get("createdAt"));
    view.put("modifiedAt", entry.get("modifiedAt"));
    return view;
  }

  /** 卷内件 entry → 前端 VolumeItemView（含件摘要，工作台渲染用） */
  private Map<String, Object> toItemView(Map<String, Object> entry, String volumeId) {
    Map<String, Object> view = new LinkedHashMap<>();
    view.put("nodeId", entry.get("id"));
    view.put("volumeId", volumeId);
    view.put("name", entry.get("name"));
    String code = prop(entry, "finance:archiveCode");
    view.put("archiveCode", code.contains(PENDING_SUFFIX) ? "" : code);
    view.put("pendingArchiveCode", code);
    view.put("voucherNo", prop(entry, "finance:voucherNo"));
    view.put("archiveType", prop(entry, "finance:archiveType"));
    view.put("year", intProp(entry, "finance:year"));
    view.put("month", intProp(entry, "finance:month"));
    view.put("amount", entry.get("properties") instanceof Map<?, ?> p ? p.get("finance:amount") : null);
    view.put("retention", prop(entry, "finance:retention"));
    view.put("recordStatus", prop(entry, "finance:recordStatus"));
    view.put("itemNo", intProp(entry, "finance:volumeItemNo"));
    view.put("numbered", boolProp(entry, "finance:numbered"));
    Object content = entry.get("content");
    if (content instanceof Map<?, ?> c) {
      view.put("mimeType", c.get("mimeType"));
      view.put("sizeInBytes", c.get("sizeInBytes") instanceof Number n ? n.longValue() : 0L);
    }
    return view;
  }

  @SuppressWarnings("unchecked")
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

  @SuppressWarnings("unchecked")
  private static boolean boolProp(Map<String, Object> entry, String name) {
    Object props = entry.get("properties");
    if (!(props instanceof Map)) return false;
    Object v = ((Map<String, Object>) props).get(name);
    return Boolean.TRUE.equals(v);
  }

  private static String str(Object o) {
    return o == null ? "" : String.valueOf(o);
  }

  private static boolean notBlank(String s) {
    return s != null && !s.isBlank();
  }
}

