package com.finance.ams.record;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.CompletableFuture;

import javax.sql.DataSource;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.web.client.HttpClientErrorException;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.finance.ams.alfresco.AlfrescoAdminClient;
import com.finance.ams.alfresco.AlfrescoNodeClient;
import com.finance.ams.alfresco.RepoLayout;
import com.finance.ams.auth.AuthUser;
import com.finance.ams.auth.PermissionService;

/**
 * 件级全文检索读模型（V10，2026-08-18）：ams_record_index 投影服务。
 *
 * 设计要点（详见《全文检索方案-2026-08-18.md》二轮补充）：
 *  - 增量投影：监听 {@link RecordsChangedEvent}（单一写入口发布），refresh/remove/refreshVolume；
 *  - 对账兜底：{@link #rebuild()} 全量重建（启动异步自建 + POST /records/index/rebuild 手动/定期）；
 *  - 降级兜底：索引为空时旧 /records gather 路径继续可用，检索门户之外读侧不受影响；
 *  - 读模型一律 admin ticket 读 ACS（索引是数据不是授权），行级权限在搜索端 SQL 下推
 *    （{@link PermissionService#rowFilterSql}）+ 内存 recordRowFilter 双重保险。
 *
 * 全文检索：pg_trgm GIN（search_text 含元数据全字段 + finance:ocrText 正文），
 * 任意子串命中、中文免分词；服务端真分页，前端不再全量驻留。
 */
@Service
public class RecordIndexService {

  private static final Logger log = LoggerFactory.getLogger(RecordIndexService.class);

  /** ocrText 进索引截断上限（控 GIN 索引体积；检索召回正文前 2 万字足够） */
  static final int OCR_TEXT_INDEX_CAP = 20000;

  private final JdbcClient jdbc;
  private final AlfrescoNodeClient nodes;
  private final RepoLayout layout;
  private final RecordService records;
  private final AlfrescoAdminClient admin;
  private final PermissionService perm;
  private final ObjectMapper json = new ObjectMapper();

  public RecordIndexService(DataSource dataSource, AlfrescoNodeClient nodes, RepoLayout layout,
                            RecordService records, AlfrescoAdminClient admin, PermissionService perm) {
    this.jdbc = JdbcClient.create(dataSource);
    this.nodes = nodes;
    this.layout = layout;
    this.records = records;
    this.admin = admin;
    this.perm = perm;
  }

  // ═══════════════════ 增量投影（事件驱动） ═══════════════════

  @EventListener
  public void onRecordsChanged(RecordsChangedEvent e) {
    try {
      String t = admin.getAdminTicket();
      for (String id : e.removedNodeIds()) remove(id);
      for (String id : e.refreshNodeIds()) refresh(t, id);
      for (String vid : e.refreshVolumeIds()) refreshVolume(t, vid);
    } catch (Exception ex) {
      // 索引同步绝不反噬主写路径；rebuild 对账兜底
      log.warn("读模型增量同步失败（rebuild 对账兜底）: {}", ex.toString());
    }
  }

  /** 启动异步自建/对账（不阻塞启动；ACS 未就绪时记日志，后续可手动 rebuild） */
  @EventListener(ApplicationReadyEvent.class)
  public void onStartup() {
    CompletableFuture.runAsync(() -> {
      try {
        Map<String, Object> r = rebuild();
        log.info("读模型启动对账完成: {}", r);
      } catch (Exception e) {
        log.warn("读模型启动对账失败（可手动 POST /records/index/rebuild）: {}", e.toString());
      }
    });
  }

  /** 单件投影：节点不存在/非 record → 删行；否则重建视图 upsert */
  public void refresh(String t, String nodeId) {
    Map<String, Object> entry;
    try {
      entry = nodes.getNodeWithPath(t, nodeId);
    } catch (HttpClientErrorException.NotFound e) {
      remove(nodeId);
      return;
    }
    if (!"finance:record".equals(entry.get("nodeType"))) {
      remove(nodeId);
      return;
    }
    upsert(project(t, entry, nodeId));
  }

  /** 删行（件删除/节点消失） */
  public void remove(String nodeId) {
    jdbc.sql("DELETE FROM ams.ams_record_index WHERE node_id = ?").param(nodeId).update();
  }

  /** 整卷件刷新：卷内 record 子节点逐件 refresh（卷删除时 children 空 → 自然 no-op） */
  public void refreshVolume(String t, String volumeId) {
    for (String id : childRecordIds(t, volumeId)) refresh(t, id);
  }

  // ═══════════════════ 全量对账 ═══════════════════

  /** 全量重建：逐全宗 gather → upsert；并清理带外删除造成的 stale 行。返回统计。 */
  public Map<String, Object> rebuild() {
    String t = admin.getAdminTicket();
    List<String> codes = records.allFondsCodes(t);
    int upserted = 0, removed = 0;
    for (String code : codes) {
      List<Map<String, Object>> views;
      try {
        views = records.gatherViews(t, code);
      } catch (Exception e) {
        log.warn("rebuild 跳过全宗 {}（gather 失败）: {}", code, e.toString());
        continue;
      }
      Set<String> ids = new HashSet<>();
      for (Map<String, Object> view : views) {
        upsert(new Projected(view, code));
        ids.add(str(view.get("nodeId")));
        upserted++;
      }
      for (String stale : jdbc.sql("SELECT node_id FROM ams.ams_record_index WHERE fonds_code = ?")
          .param(code).query(String.class).list()) {
        if (!ids.contains(stale)) {
          remove(stale);
          removed++;
        }
      }
    }
    return Map.of("fonds", codes.size(), "upserted", upserted, "removed", removed);
  }

  public long count() {
    return jdbc.sql("SELECT count(*) FROM ams.ams_record_index").query(Long.class).list().get(0);
  }

  // ═══════════════════ 搜索 / 分面 / 统计（服务端分页 + 权限下推） ═══════════════════

  public record SearchQuery(
      String fondsCode, String q, String archiveType, String category, Integer year, Integer month,
      String subject, String dept, String preparer, String counterparty, String documentNo,
      String voucherNo, Double amountFrom, Double amountTo, String recordStatus,
      int skipCount, int maxItems) {}

  /**
   * 全文搜索：trgm 子串 + 结构化筛选 + 行级权限 SQL 下推，created_at 倒序真分页。
   * 返回形状与 PoolResult 对齐（items/totalItems/skipCount/maxItems），前端 dto 复用。
   */
  public Map<String, Object> search(AuthUser me, SearchQuery q) {
    List<Object> params = new ArrayList<>();
    String where = buildWhere(me, q, params);

    long total = jdbc.sql("SELECT count(*) FROM ams.ams_record_index " + where)
        .params(params.toArray()).query(Long.class).list().get(0);

    List<Object> pageParams = new ArrayList<>(params);
    pageParams.add(q.maxItems());
    pageParams.add(q.skipCount());
    List<Map<String, Object>> rows = jdbc.sql(
            "SELECT view_json FROM ams.ams_record_index " + where
                + " ORDER BY created_at DESC NULLS LAST, node_id LIMIT ? OFFSET ?")
        .params(pageParams.toArray()).query().listOfRows();

    // 内存双重保险（与 SQL 下推同语义，正常情况 no-op）
    var rowFilter = perm.recordRowFilter(me);
    List<Map<String, Object>> items = new ArrayList<>();
    for (Map<String, Object> row : rows) {
      Map<String, Object> view = readView(row.get("view_json"));
      if (view != null && rowFilter.test(view)) items.add(view);
    }
    Map<String, Object> out = new LinkedHashMap<>();
    out.put("items", items);
    out.put("totalItems", total);
    out.put("skipCount", q.skipCount());
    out.put("maxItems", q.maxItems());
    return out;
  }

  /** 分面（下拉选项）：年度/类别/科目/部门/制单人，带权限下推 */
  public Map<String, Object> facets(AuthUser me, String fondsCode, String archiveType, Integer year) {
    List<Object> params = new ArrayList<>();
    StringBuilder where = new StringBuilder(" WHERE fonds_code = ?");
    params.add(fondsCode);
    PermissionService.RowSql rs = perm.rowFilterSql(me);
    where.append(" AND ").append(rs.cond());
    params.addAll(rs.params());
    if (archiveType != null && !archiveType.isBlank()) {
      where.append(" AND archive_type = ?");
      params.add(archiveType);
    }
    if (year != null) {
      where.append(" AND year = ?");
      params.add(year);
    }
    String w = where.toString();
    Map<String, Object> out = new LinkedHashMap<>();
    out.put("years", jdbc.sql("SELECT DISTINCT year FROM ams.ams_record_index" + w
        + " AND year IS NOT NULL ORDER BY year DESC LIMIT 100")
        .params(params.toArray()).query(Integer.class).list());
    out.put("types", jdbc.sql("SELECT DISTINCT archive_type FROM ams.ams_record_index" + w
        + " AND archive_type <> '' ORDER BY archive_type LIMIT 100")
        .params(params.toArray()).query(String.class).list());
    out.put("subjects", jdbc.sql("SELECT DISTINCT view_json->>'accountSubject' v FROM ams.ams_record_index" + w
        + " AND coalesce(view_json->>'accountSubject','') <> '' ORDER BY v LIMIT 200")
        .params(params.toArray()).query(String.class).list());
    out.put("departments", jdbc.sql("SELECT DISTINCT department FROM ams.ams_record_index" + w
        + " AND department <> '' ORDER BY department LIMIT 200")
        .params(params.toArray()).query(String.class).list());
    out.put("preparers", jdbc.sql("SELECT DISTINCT view_json->>'preparer' v FROM ams.ams_record_index" + w
        + " AND coalesce(view_json->>'preparer','') <> '' ORDER BY v LIMIT 200")
        .params(params.toArray()).query(String.class).list());
    return out;
  }

  /** 门户首页统计：总量 + 已组卷凭证数（带权限下推） */
  public Map<String, Object> stats(AuthUser me, String fondsCode) {
    List<Object> params = new ArrayList<>();
    StringBuilder where = new StringBuilder(" WHERE fonds_code = ?");
    params.add(fondsCode);
    PermissionService.RowSql rs = perm.rowFilterSql(me);
    where.append(" AND ").append(rs.cond());
    params.addAll(rs.params());
    Map<String, Object> row = jdbc.sql("SELECT count(*) AS total,"
        + " count(*) FILTER (WHERE record_status = '已组卷' AND archive_type LIKE '%凭证%') AS archived_vouchers"
        + " FROM ams.ams_record_index" + where)
        .params(params.toArray()).query().singleRow();
    Map<String, Object> out = new LinkedHashMap<>();
    out.put("total", ((Number) row.get("total")).longValue());
    out.put("archivedVouchers", ((Number) row.get("archived_vouchers")).longValue());
    return out;
  }

  /** 结构化筛选 + 权限下推 WHERE 拼装（search/facets 共用基座） */
  private String buildWhere(AuthUser me, SearchQuery q, List<Object> params) {
    StringBuilder where = new StringBuilder(" WHERE fonds_code = ?");
    params.add(q.fondsCode());
    PermissionService.RowSql rs = perm.rowFilterSql(me);
    where.append(" AND ").append(rs.cond());
    params.addAll(rs.params());

    if (q.archiveType() != null && !q.archiveType().isBlank()) {
      where.append(" AND archive_type = ?");
      params.add(q.archiveType());
    }
    // 门户快捷分类（KP/KB/FB/QT，与前端 portalType 口径一致）
    if (q.category() != null && !q.category().isBlank()) {
      switch (q.category()) {
        case "KP" -> where.append(" AND archive_type LIKE '%凭证%'");
        case "KB" -> where.append(" AND archive_type LIKE '%账簿%'");
        case "FB" -> where.append(" AND (archive_type LIKE '%报表%' OR archive_type LIKE '%报告%')");
        case "QT" -> where.append(" AND archive_type NOT IN ('记账凭证','原始凭证','会计账簿','财务报表','财务报告')");
        default -> {}
      }
    }
    if (q.voucherNo() != null && !q.voucherNo().isBlank()) {
      where.append(" AND view_json->>'voucherNo' LIKE ?");
      params.add("%" + escapeLike(q.voucherNo().trim().toLowerCase(Locale.ROOT)) + "%");
    }
    if (q.year() != null) {
      where.append(" AND year = ?");
      params.add(q.year());
    }
    if (q.month() != null) {
      where.append(" AND month = ?");
      params.add(q.month());
    }
    if (q.recordStatus() != null && !q.recordStatus().isBlank()) {
      where.append(" AND record_status = ?");
      params.add(q.recordStatus());
    }
    if (q.subject() != null && !q.subject().isBlank()) {
      where.append(" AND view_json->>'accountSubject' = ?");
      params.add(q.subject());
    }
    if (q.dept() != null && !q.dept().isBlank()) {
      where.append(" AND department = ?");
      params.add(q.dept());
    }
    if (q.preparer() != null && !q.preparer().isBlank()) {
      where.append(" AND view_json->>'preparer' = ?");
      params.add(q.preparer());
    }
    if (q.counterparty() != null && !q.counterparty().isBlank()) {
      where.append(" AND view_json->>'counterpartyName' LIKE ?");
      params.add("%" + escapeLike(q.counterparty().trim().toLowerCase(Locale.ROOT)) + "%");
    }
    if (q.documentNo() != null && !q.documentNo().isBlank()) {
      where.append(" AND view_json->>'documentNo' LIKE ?");
      params.add("%" + escapeLike(q.documentNo().trim().toLowerCase(Locale.ROOT)) + "%");
    }
    if (q.amountFrom() != null) {
      where.append(" AND amount >= ?");
      params.add(q.amountFrom());
    }
    if (q.amountTo() != null) {
      where.append(" AND amount <= ?");
      params.add(q.amountTo());
    }
    if (q.q() != null && !q.q().isBlank()) {
      where.append(" AND search_text LIKE ?");
      params.add("%" + escapeLike(q.q().trim().toLowerCase(Locale.ROOT)) + "%");
    }
    return where.toString();
  }

  // ═══════════════════ 投影构建 ═══════════════════

  /** 投影结果：RecordView + 全宗号（索引列） */
  private record Projected(Map<String, Object> view, String fondsCode) {}

  /** entry → 带归属视图 + 全宗号（路径链反查，复用 RepoLayout 现成助手） */
  private Projected project(String t, Map<String, Object> entry, String nodeId) {
    Map<String, Object> view = RecordService.toView(entry, null, -1);
    String fondsCode = "";
    try {
      Map<String, Object> fonds = layout.findFondsOf(t, nodeId);
      fondsCode = propOf(fonds, "finance:code");
    } catch (Exception e) {
      log.warn("投影反查全宗失败: {} ({})", nodeId, e.toString());
    }
    Map<String, Object> vol = layout.nearestAncestorOfType(t, nodeId, "finance:volume");
    Map<String, Object> box = layout.nearestAncestorOfType(t, nodeId, "finance:archiveBox");
    view.put("volumeId", vol == null ? "" : str(vol.get("id")));
    view.put("volumeCode", vol == null ? "" : propOf(vol, "finance:volumeCode"));
    view.put("boxId", box == null ? "" : str(box.get("id")));
    view.put("boxNo", box == null ? "" : propOf(box, "finance:boxNo"));
    return new Projected(view, fondsCode);
  }

  /** upsert 索引行（列 + search_text + view_json） */
  private void upsert(Projected p) {
    Map<String, Object> v = p.view();
    String ocr = str(v.get("ocrText"));
    if (ocr.length() > OCR_TEXT_INDEX_CAP) ocr = ocr.substring(0, OCR_TEXT_INDEX_CAP);
    String searchText = searchText(v, ocr);

    Object amount = v.get("amount") instanceof Number n ? n : null;
    Object createdAt = blankToNull(v.get("createdAt"));

    jdbc.sql("""
        INSERT INTO ams.ams_record_index
          (node_id, fonds_code, archive_type, year, month, record_status,
           security_level, security_level_int, department, created_by, created_at,
           amount, search_text, view_json, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?::timestamptz, ?, ?, ?::jsonb, now())
        ON CONFLICT (node_id) DO UPDATE SET
          fonds_code = EXCLUDED.fonds_code,
          archive_type = EXCLUDED.archive_type,
          year = EXCLUDED.year,
          month = EXCLUDED.month,
          record_status = EXCLUDED.record_status,
          security_level = EXCLUDED.security_level,
          security_level_int = EXCLUDED.security_level_int,
          department = EXCLUDED.department,
          created_by = EXCLUDED.created_by,
          created_at = EXCLUDED.created_at,
          amount = EXCLUDED.amount,
          search_text = EXCLUDED.search_text,
          view_json = EXCLUDED.view_json,
          updated_at = now()
        """)
        .param(str(v.get("nodeId"))).param(p.fondsCode())
        .param(str(v.get("archiveType")))
        .param(v.get("year") instanceof Number yn ? yn.intValue() : null)
        .param(v.get("month") instanceof Number mn ? mn.intValue() : null)
        .param(str(v.get("recordStatus")))
        .param(str(v.get("securityLevel")))
        .param(PermissionService.levelOf(str(v.get("securityLevel"))))
        .param(str(v.get("department")))
        .param(str(v.get("createdBy")))
        .param(createdAt == null ? null : String.valueOf(createdAt))
        .param(amount)
        .param(searchText)
        .param(writeJson(v))
        .update();
  }

  /** 全文拼接（小写归一；含正文）——trgm 任意子串命中 */
  private static String searchText(Map<String, Object> v, String ocrCapped) {
    StringBuilder sb = new StringBuilder();
    for (String key : new String[] {
        "name", "archiveCode", "voucherNo", "archiveType", "remarks", "description",
        "accountSubject", "counterpartyName", "documentNo", "preparer", "department",
        "voucherWord", "voucherCategory", "sourceSystem", "externalId",
        "volumeCode", "boxNo", "retention" }) {
      String s = str(v.get(key));
      if (!s.isEmpty()) sb.append(s.toLowerCase(Locale.ROOT)).append(" | ");
    }
    if (!ocrCapped.isEmpty()) sb.append(ocrCapped.toLowerCase(Locale.ROOT));
    return sb.toString();
  }

  /** 卷内 record 子节点 id 列表（refreshVolume 用） */
  @SuppressWarnings("unchecked")
  private List<String> childRecordIds(String t, String parentId) {
    List<String> out = new ArrayList<>();
    int skip = 0;
    while (true) {
      Map<String, Object> list;
      try {
        list = nodes.listChildren(t, parentId, skip, 500);
      } catch (HttpClientErrorException.NotFound e) {
        return out;
      }
      for (Map<String, Object> e : (List<Map<String, Object>>) list.get("entries")) {
        Map<String, Object> entry = (Map<String, Object>) e.get("entry");
        if ("finance:record".equals(entry.get("nodeType"))) out.add(str(entry.get("id")));
      }
      Map<String, Object> paging = (Map<String, Object>) list.get("pagination");
      if (!Boolean.TRUE.equals(paging.get("hasMoreItems"))) break;
      skip += 500;
    }
    return out;
  }

  @SuppressWarnings("unchecked")
  private Map<String, Object> readView(Object viewJson) {
    if (viewJson == null) return null;
    try {
      if (viewJson instanceof Map<?, ?> m) return (Map<String, Object>) m;
      // PG jsonb 经 JDBC 返回 PGobject，其 toString 即 JSON 文本（driver 为 runtime 依赖，不 import）
      return json.readValue(String.valueOf(viewJson), new TypeReference<LinkedHashMap<String, Object>>() {});
    } catch (Exception e) {
      log.warn("view_json 反序列化失败: {}", e.toString());
      return null;
    }
  }

  private String writeJson(Map<String, Object> view) {
    try {
      return json.writeValueAsString(view);
    } catch (Exception e) {
      throw new IllegalStateException("view_json 序列化失败", e);
    }
  }

  private static String propOf(Map<String, Object> entry, String name) {
    Object props = entry.get("properties");
    if (!(props instanceof Map<?, ?> m)) return "";
    Object v = m.get(name);
    return v == null ? "" : String.valueOf(v);
  }

  private static String str(Object o) {
    return o == null ? "" : String.valueOf(o);
  }

  private static Object blankToNull(Object o) {
    return o == null || String.valueOf(o).isBlank() ? null : o;
  }

  /** LIKE 通配符转义（用户输入不充当模式） */
  private static String escapeLike(String s) {
    return s.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_");
  }
}
