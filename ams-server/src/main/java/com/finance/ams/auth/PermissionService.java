package com.finance.ams.auth;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Predicate;

import javax.sql.DataSource;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.finance.ams.api.BizException;
import com.finance.ams.configcenter.ConfigService;

/**
 * 权限内核（2026-08-18，三维授权 + 行级过滤 RBAC 扩展）
 *
 * 依据《角色与权限业务逻辑梳理》本土化映射：
 *   S_XTGN 功能码        → 菜单功能码（menuConfig key）+ 门户功能码（portal-*）
 *   S_ROLERIGHT 三维     → ams_config['role-auth-v1']：roleMenus（功能）× roleDataScope（数据）× roleOperations（操作）
 *   6 位 QX 操作码       → Op：catalog查看目录 / view在线查看 / download下载 / print打印 / borrow借阅 / copy复制
 *   S_MROPER/GZOPER 行级 → recordRowFilter：密级上限 + 部门范围（归档前创建人规则由 deptMode=self 承载）
 *   S_USER.MJ 人员密级   → ams_user_ext.security_clearance（0普通/1内部/2秘密/3机密）
 *   三员分立（硬）       → sys-log 仅 security_auditor 可见/可调，admin 不豁免
 *
 * 生效机制：配置 30s 缓存近实时生效（优于参考模型"重新登录生效"）。
 * 权限语义：多角色取并集（数据范围并集 = 最宽松口径），人员密级与角色密级上限取 min。
 */
@Service
public class PermissionService {

  private static final Logger log = LoggerFactory.getLogger(PermissionService.class);

  /** 权限配置 key（前端 roleStore persist 名 = ams_config key，单一数据源） */
  public static final String CONFIG_KEY = "role-auth-v1";
  /** 旧版菜单矩阵 key（向后兼容：仅菜单部分可读合并） */
  public static final String LEGACY_MENUS_KEY = "role-menus-v3";

  public static final String ROLE_ADMIN = "admin";
  public static final String ROLE_AUDITOR = "security_auditor";
  public static final String ROLE_SEC_OFFICER = "security_officer";

  /** 硬分立功能码：安全审计日志（仅审计员，admin 不豁免） */
  public static final String F_SYS_LOG = "sys-log";

  /** 6 位 QX 操作码 */
  public enum Op { catalog, view, download, print, borrow, copy }

  /** 数据范围（单角色声明；多角色合并见 mergeScopes） */
  public record DataScope(Set<String> fonds, Set<String> types, String deptMode, int maxClearance) {
    boolean allFonds() { return fonds.contains("*"); }
  }

  /** 授权配置快照（三棵树） */
  public record AuthzConfig(Map<String, Set<String>> roleMenus,
                            Map<String, DataScope> roleScopes,
                            Map<String, Set<String>> roleOps) {}

  private final AuthService auth;
  private final ConfigService config;
  private final JdbcClient jdbc;
  private final ObjectMapper om = new ObjectMapper();

  private static final long CACHE_MS = 30_000;
  private volatile long cacheLoadedAt = 0;
  private volatile AuthzConfig cached;
  private volatile long clearanceLoadedAt = 0;
  private volatile Map<String, Integer> clearanceCache = Map.of();

  public PermissionService(AuthService auth, ConfigService config, DataSource dataSource) {
    this.auth = auth;
    this.config = config;
    this.jdbc = JdbcClient.create(dataSource);
  }

  /** 会话用户（内存会话命中时为纯 map 查询，无 Alfresco 往返） */
  public AuthUser me(String userId, String ticket) {
    return auth.me(userId, ticket);
  }

  // ═══════════════════ 功能权限（功能码 → 菜单矩阵） ═══════════════════

  public boolean hasFunction(AuthUser u, String key) {
    // 硬分立：审计日志仅安全审计员（admin 不豁免，矩阵显式授予其他角色也不生效）
    if (F_SYS_LOG.equals(key)) return u.roles().contains(ROLE_AUDITOR);
    if (u.roles().contains(ROLE_ADMIN)) return true;
    AuthzConfig cfg = cfg();
    for (String r : u.roles()) {
      Set<String> menus = cfg.roleMenus().get(r);
      if (menus != null && (menus.contains("*") || menus.contains(key))) return true;
    }
    return false;
  }

  /** 任一功能码命中即放行 */
  public void requireFunction(AuthUser u, String... anyOfKeys) {
    for (String k : anyOfKeys) {
      if (hasFunction(u, k)) return;
    }
    throw new BizException(HttpStatus.FORBIDDEN, "FORBIDDEN",
        "无功能权限（需要: " + String.join("/", anyOfKeys) + "）");
  }

  // ═══════════════════ 操作权限（6 位 QX 码） ═══════════════════

  public boolean hasOperation(AuthUser u, Op op) {
    if (u.roles().contains(ROLE_ADMIN)) return true;
    AuthzConfig cfg = cfg();
    for (String r : u.roles()) {
      Set<String> ops = cfg.roleOps().get(r);
      if (ops != null && ops.contains(op.name())) return true;
    }
    return false;
  }

  public void requireOperation(AuthUser u, Op op) {
    if (!hasOperation(u, op)) {
      throw new BizException(HttpStatus.FORBIDDEN, "FORBIDDEN",
          "无操作权限（" + opLabel(op) + "），如需请走借阅审批申请");
    }
  }

  private static String opLabel(Op op) {
    return switch (op) {
      case catalog -> "查看目录";
      case view -> "在线查看";
      case download -> "下载文件";
      case print -> "打印文件";
      case borrow -> "发起借阅";
      case copy -> "复制";
    };
  }

  // ═══════════════════ 数据权限（行级过滤） ═══════════════════

  /** 合并后的数据范围（多角色取并集 = 各维最宽松） */
  public DataScope dataScope(AuthUser u) {
    if (u.roles().contains(ROLE_ADMIN)) return DataScopeDefaults.SCOPE_ALL;
    AuthzConfig cfg = cfg();
    Set<String> fonds = new HashSet<>();
    Set<String> types = new HashSet<>();
    String deptMode = "self";
    int maxClearance = 0;
    boolean any = false;
    for (String r : u.roles()) {
      DataScope s = cfg.roleScopes().get(r);
      if (s == null) continue;
      any = true;
      fonds.addAll(s.fonds());
      types.addAll(s.types());
      deptMode = mostPermissive(deptMode, s.deptMode());
      maxClearance = Math.max(maxClearance, s.maxClearance());
    }
    if (!any) return new DataScope(Set.of(), Set.of(), "self", 0);
    return new DataScope(fonds, types, deptMode, maxClearance);
  }

  private static String mostPermissive(String a, String b) {
    List<String> order = List.of("self", "own-dept", "all");
    return order.indexOf(b) > order.indexOf(a) ? b : a;
  }

  /** 人员密级（ams_user_ext，30s 缓存；未建档账号按 1内部） */
  public int userClearance(String userId) {
    long now = System.currentTimeMillis();
    if (now - clearanceLoadedAt > CACHE_MS) {
      Map<String, Integer> m = new HashMap<>();
      jdbc.sql("SELECT user_id, security_clearance FROM ams_user_ext")
          .query((rs, i) -> Map.entry(rs.getString(1), rs.getInt(2)))
          .list().forEach(e -> m.put(e.getKey(), e.getValue()));
      clearanceCache = m;
      clearanceLoadedAt = now;
    }
    return clearanceCache.getOrDefault(userId, 1);
  }

  /** 有效密级 = min(人员密级, 角色密级上限)；admin 取人员密级（演示账号 admin=3） */
  public int effectiveClearance(AuthUser u) {
    int roleCeiling = u.roles().contains(ROLE_ADMIN) ? 3 : dataScope(u).maxClearance();
    return Math.min(userClearance(u.account()), roleCeiling);
  }

  /** 密级档序：普通0 / 内部1 / 秘密2 / 机密3（与 finance:securityList 一致；未知按 0 普通） */
  public static int levelOf(String securityLevel) {
    if (securityLevel == null || securityLevel.isBlank()) return 0;
    return switch (securityLevel.trim()) {
      case "内部" -> 1;
      case "秘密" -> 2;
      case "机密" -> 3;
      default -> 0;
    };
  }

  /** 全宗准入（档案库维度的行级闸口）：请求的 fondsCode 不在授权范围 → 403 */
  public void checkFonds(AuthUser u, String fondsCode) {
    DataScope s = dataScope(u);
    if (s.allFonds() || fondsCode == null) return;
    if (!s.fonds().contains(fondsCode.trim().toUpperCase())) {
      throw new BizException(HttpStatus.FORBIDDEN, "FORBIDDEN", "无全宗 " + fondsCode + " 的数据权限");
    }
  }

  // ═══════════════════ 临时赋权旁路（S_TMPRIGHT 对应物：生效借阅授权） ═══════════════════

  /**
   * 生效中的电子借阅授权判定：
   * 借阅审批通过拆单后，ams_fulfillment 在 [start_date, end_date] 内按明细 perms 授权。
   * 该授权是操作权限/密级闸口的合法旁路——审批链（含 CFO/HRVP 升级审批）即是授权依据，
   * 不再另建临时赋权表（规避参考模型"两套临时授权并存"风险）。
   *
   * @param op view：任何生效电子授权均可在线查看；download/print：需明细 perms 明确授予
   */
  public boolean hasActiveGrant(String account, String recordNodeId, Op op) {
    List<Map<String, Object>> rows = jdbc.sql("""
        SELECT i.record_node_id AS rid, i.perms::text AS perms, f.start_date AS sd, f.end_date AS ed
          FROM ams_fulfillment f
          JOIN ams_borrow_order o ON o.id = f.order_id
          JOIN ams_borrow_item  i ON i.order_id = o.id
         WHERE o.applicant_id = ? AND f.type = 'electronic' AND f.status IN ('granted','lent')
        """).param(account).query().listOfRows();
    java.time.LocalDate today = java.time.LocalDate.now();
    for (Map<String, Object> r : rows) {
      if (!recordNodeId.equals(str(r.get("rid")))) continue;
      java.time.LocalDate sd = java.time.LocalDate.parse(str(r.get("sd")));
      java.time.LocalDate ed = java.time.LocalDate.parse(str(r.get("ed")));
      if (today.isBefore(sd) || today.isAfter(ed)) continue;
      if (op == Op.view) return true;
      if (str(r.get("perms")).contains(op.name())) return true;
    }
    return false;
  }

  /**
   * 操作权 OR 生效借阅授权（内容读取统一闸口）：
   * 直接访问靠角色操作权；无操作权时凭生效借阅授权放行（在线调阅/授权下载）。
   */
  public void requireOperationOrGrant(AuthUser u, Op op, String recordNodeId) {
    if (hasOperation(u, op)) return;
    if (hasActiveGrant(u.account(), recordNodeId, op)) return;
    throw new BizException(HttpStatus.FORBIDDEN, "FORBIDDEN",
        "无「" + opLabel(op) + "」权限，且无可用的生效借阅授权，请先发起借阅申请");
  }

  /**
   * 件/卷级行级过滤谓词（作用于视图 Map：securityLevel / department / createdBy 键）。
   * 规则（参考模型 getQXSql 本土化）：
   *   ① 密级：行密级档序 ≤ 有效密级；
   *   ② 部门范围：all 放行；own-dept = 部门为空（全宗公共）或等于本人部门；self = 创建人=本人
   *      （归档前"仅创建人可改"由 self 承载；own-dept 已含部门内创建人口径）。
   */
  public Predicate<Map<String, Object>> recordRowFilter(AuthUser u) {
    int clearance = effectiveClearance(u);
    DataScope s = dataScope(u);
    String userDept = u.dept() == null ? "" : u.dept().trim();
    String account = u.account();
    return row -> {
      if (levelOf(str(row.get("securityLevel"))) > clearance) return false;
      return switch (s.deptMode()) {
        case "all" -> true;
        case "own-dept" -> {
          String dept = str(row.get("department")).trim();
          yield dept.isEmpty() || dept.equalsIgnoreCase(userDept);
        }
        default -> account.equals(str(row.get("createdBy")));
      };
    };
    }

  /**
   * 行级权限 SQL 下推（V10 读模型搜索用，2026-08-18）：与 {@link #recordRowFilter} 同语义，
   * 作用于 ams_record_index 列（security_level_int/department/created_by），
   * 保证服务端分页计数精确；内存侧 recordRowFilter 仍作双重保险。
   */
  public record RowSql(String cond, List<Object> params) {}

  public RowSql rowFilterSql(AuthUser u) {
    List<Object> p = new ArrayList<>();
    StringBuilder c = new StringBuilder("security_level_int <= ?");
    p.add(effectiveClearance(u));
    switch (dataScope(u).deptMode()) {
      case "all" -> {}
      case "own-dept" -> {
        c.append(" AND (department = '' OR LOWER(department) = LOWER(?))");
        p.add(u.dept() == null ? "" : u.dept().trim());
      }
      default -> {
        c.append(" AND created_by = ?");
        p.add(u.account());
      }
    }
    return new RowSql(c.toString(), p);
  }

  /** 过滤视图列表（原地语义的安全拷贝） */
  public List<Map<String, Object>> filterRows(AuthUser u, List<Map<String, Object>> rows) {
    Predicate<Map<String, Object>> p = recordRowFilter(u);
    List<Map<String, Object>> out = new ArrayList<>(rows.size());
    for (Map<String, Object> r : rows) {
      if (p.test(r)) out.add(r);
    }
    return out;
  }

  private static String str(Object o) { return o == null ? "" : String.valueOf(o); }

  // ═══════════════════ 配置装载（30s 缓存，近实时生效） ═══════════════════

  public AuthzConfig cfg() {
    long now = System.currentTimeMillis();
    AuthzConfig c = cached;
    if (c != null && now - cacheLoadedAt < CACHE_MS) return c;
    AuthzConfig loaded = load();
    cached = loaded;
    cacheLoadedAt = now;
    return loaded;
  }

  /** 立即失效缓存（配置页保存后调用，等价参考模型的 reloadUserRoleRight） */
  public void invalidate() {
    cacheLoadedAt = 0;
  }

  private AuthzConfig load() {
    try {
      var entry = config.get(CONFIG_KEY);
      if (entry.isEmpty()) {
        log.info("权限配置 {} 不存在，使用内置默认矩阵", CONFIG_KEY);
        return DataScopeDefaults.defaultConfig();
      }
      return parse(entry.get().valueJson());
    } catch (Exception e) {
      log.warn("权限配置解析失败，回退默认矩阵: {}", e.getMessage());
      return DataScopeDefaults.defaultConfig();
    }
  }

  /**
   * 解析前端持久化文档：{state:{roleMenus, roleDataScope, roleOperations}, version}
   * （zustand persist envelope；缺省字段回落默认矩阵对应切片）
   */
  private AuthzConfig parse(String json) throws Exception {
    JsonNode root = om.readTree(json);
    JsonNode state = root.has("state") ? root.get("state") : root;
    AuthzConfig dft = DataScopeDefaults.defaultConfig();

    Map<String, Set<String>> menusParsed = new HashMap<>();
    if (state.has("roleMenus")) {
      state.get("roleMenus").fields().forEachRemaining(e -> {
        Set<String> keys = new HashSet<>();
        e.getValue().forEach(k -> keys.add(k.asText()));
        menusParsed.put(e.getKey(), keys);
      });
    }
    Map<String, Set<String>> menus = menusParsed.isEmpty() ? dft.roleMenus() : menusParsed;

    Map<String, DataScope> scopesParsed = new HashMap<>();
    if (state.has("roleDataScope")) {
      state.get("roleDataScope").fields().forEachRemaining(e -> {
        JsonNode n = e.getValue();
        Set<String> fonds = readStringSet(n.get("fonds"), "*");
        Set<String> types = readStringSet(n.get("types"), "*");
        String deptMode = n.hasNonNull("deptMode") ? n.get("deptMode").asText("all") : "all";
        int maxClear = n.hasNonNull("maxClearance") ? n.get("maxClearance").asInt(3) : 3;
        scopesParsed.put(e.getKey(), new DataScope(fonds, types, deptMode, maxClear));
      });
    }
    Map<String, DataScope> scopes = scopesParsed.isEmpty() ? dft.roleScopes() : scopesParsed;

    Map<String, Set<String>> opsParsed = new HashMap<>();
    if (state.has("roleOperations")) {
      state.get("roleOperations").fields().forEachRemaining(e -> {
        Set<String> granted = new HashSet<>();
        e.getValue().fields().forEachRemaining(op -> {
          if (op.getValue().asBoolean(false)) granted.add(op.getKey());
        });
        opsParsed.put(e.getKey(), granted);
      });
    }
    Map<String, Set<String>> ops = opsParsed.isEmpty() ? dft.roleOps() : opsParsed;

    return new AuthzConfig(menus, scopes, ops);
  }

  private static Set<String> readStringSet(JsonNode n, String defaultAll) {
    Set<String> out = new HashSet<>();
    if (n == null || n.isNull()) { out.add(defaultAll); return out; }
    if (n.isTextual()) { out.add(n.asText()); return out; }
    if (n.isArray()) n.forEach(x -> out.add(x.asText()));
    if (out.isEmpty()) out.add(defaultAll);
    return out;
  }

  // ═══════════════════ 内置默认矩阵（与前端 types/user.ts + roleStore 严格同构） ═══════════════════

  /** 默认值集中定义（前后端常量人工对齐，改动需双端同步） */
  public static final class DataScopeDefaults {
    public static final DataScope SCOPE_ALL = new DataScope(Set.of("*"), Set.of("*"), "all", 3);

    static AuthzConfig defaultConfig() {
      Map<String, Set<String>> menus = new HashMap<>();
      Set<String> portal = Set.of("portal-search", "portal-view", "portal-borrow", "portal-myborrow");
      menus.put("employee", portal);
      menus.put("dept_manager", union(portal,
          "voucher-search", "matter-search", "source-doc-search", "volume-item-search", "audit-trail",
          "approval-center", "borrow-ledger"));
      menus.put("cfo", union(portal,
          "voucher-search", "matter-search", "source-doc-search", "volume-item-search", "audit-trail",
          "approval-center", "borrow-ledger", "borrow-stats"));
      menus.put("hrvp", union(portal,
          "voucher-search", "matter-search", "volume-item-search", "approval-center"));
      menus.put("archivist", union(portal,
          "voucher-search", "matter-search", "source-doc-search", "volume-item-search", "audit-trail",
          "archive-rcv", "archive-api-receive",
          "voucher-manager", "volume-workspace", "quick-check",
          "view-finance", "digital-warehouse",
          "approval-center", "borrow-manage", "borrow-ledger", "borrow-stats", "transfer-manage",
          "stats-cockpit", "stats-inventory", "stats-lifecycle", "stats-compliance",
          "archive-package", "archive-transfer", "appraisal-manage",
          "config-fanzong", "directory-config", "accounting-metadata", "archive-code-config",
          "retention-config", "volume-grouping-config", "inspection-config", "report-config", "watermark-config",
          "config-workflow", "sys-storage", "sys-cockpit-config", "sys-connection"));
      menus.put("archive_director", union(portal,
          "voucher-search", "matter-search", "source-doc-search", "volume-item-search", "audit-trail",
          "voucher-manager", "volume-workspace", "quick-check",
          "view-finance", "digital-warehouse",
          "approval-center", "borrow-manage", "borrow-ledger", "borrow-stats", "transfer-manage",
          "stats-cockpit", "stats-inventory", "stats-lifecycle", "stats-compliance",
          "archive-package", "archive-transfer", "appraisal-manage",
          "sys-connection", "sys-storage"));
      menus.put(ROLE_SEC_OFFICER, union(portal,
          "voucher-search", "volume-item-search", "sys-personnel"));
      menus.put(ROLE_AUDITOR, Set.of("sys-log"));
      menus.put(ROLE_ADMIN, Set.of("*"));

      Map<String, DataScope> scopes = new HashMap<>();
      scopes.put("employee", new DataScope(Set.of("*"), Set.of("*"), "own-dept", 1));
      scopes.put("dept_manager", new DataScope(Set.of("*"), Set.of("*"), "own-dept", 2));
      scopes.put("cfo", SCOPE_ALL);
      scopes.put("hrvp", SCOPE_ALL);
      scopes.put("archivist", SCOPE_ALL);
      scopes.put("archive_director", SCOPE_ALL);
      scopes.put(ROLE_SEC_OFFICER, SCOPE_ALL);
      scopes.put(ROLE_AUDITOR, SCOPE_ALL); // 操作权限全关，数据范围不生效
      scopes.put(ROLE_ADMIN, SCOPE_ALL);

      Map<String, Set<String>> ops = new HashMap<>();
      ops.put("employee", Set.of("catalog", "view", "borrow"));
      ops.put("dept_manager", Set.of("catalog", "view", "borrow"));
      ops.put("cfo", Set.of("catalog", "view", "download", "print", "borrow", "copy"));
      ops.put("hrvp", Set.of("catalog", "view", "download", "borrow"));
      ops.put("archivist", allOps());
      ops.put("archive_director", allOps());
      ops.put(ROLE_SEC_OFFICER, Set.of("catalog", "view"));
      ops.put(ROLE_AUDITOR, Set.of());
      ops.put(ROLE_ADMIN, allOps());

      return new AuthzConfig(menus, scopes, ops);
    }

    private static Set<String> allOps() {
      return Set.of("catalog", "view", "download", "print", "borrow", "copy");
    }

    private static Set<String> union(Set<String> base, String... keys) {
      Set<String> out = new HashSet<>(base);
      out.addAll(List.of(keys));
      return out;
    }
  }
}
