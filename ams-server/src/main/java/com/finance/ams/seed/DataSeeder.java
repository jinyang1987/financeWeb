package com.finance.ams.seed;

import java.util.List;
import java.util.Map;

import javax.sql.DataSource;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;

import com.finance.ams.alfresco.AlfrescoAdminClient;

/**
 * 用户与角色 seed（P0-6）
 *
 * 幂等：逐项检查存在性，已存在则跳过。
 * 内容：
 *   1. Alfresco 8 个演示账号（people，统一密码 123456）
 *   2. ROLE_* 7 个角色组（根组）+ 成员绑定
 *   3. 部门组（comp_HQ 下 dept_finance/dept_archive/dept_hr）+ 成员绑定
 *   4. ams_user_ext 扩展字段（工号/岗位/部门/直属主管/头像色）
 */
@Component
public class DataSeeder implements ApplicationRunner {

  private static final Logger log = LoggerFactory.getLogger(DataSeeder.class);

  private final AlfrescoAdminClient admin;
  private final JdbcClient jdbc;
  private final boolean enabled;

  public DataSeeder(AlfrescoAdminClient admin, DataSource dataSource,
                    @Value("${ams.seed.enabled:true}") boolean enabled) {
    this.admin = admin;
    this.jdbc = JdbcClient.create(dataSource);
    this.enabled = enabled;
  }

  // ── 演示账号（与前端 MOCK_USERS 对齐） ──
  private record SeedUser(String account, String name, String dept, String deptGroup,
                          String position, List<String> roles, String empNo,
                          String supervisor, String avatarColor) {}

  private static final List<SeedUser> USERS = List.of(
      new SeedUser("zhangwei", "张伟", "财务部", "dept_finance", "会计", List.of("EMPLOYEE"), "004521", "wangqiang", "bg-blue-600"),
      new SeedUser("lina", "李娜", "财务部", "dept_finance", "出纳", List.of("EMPLOYEE"), "004522", "wangqiang", "bg-sky-600"),
      new SeedUser("wangqiang", "王强", "财务部", "dept_finance", "财务部经理", List.of("DEPT_MANAGER"), "003108", "zhaogang", "bg-indigo-600"),
      new SeedUser("chenjing", "陈静", "档案部", "dept_archive", "档案管理员", List.of("ARCHIVIST"), "002017", "liumin", "bg-emerald-600"),
      new SeedUser("liumin", "刘敏", "档案部", "dept_archive", "档案主管", List.of("ARCHIVE_DIRECTOR", "ARCHIVIST"), "001566", null, "bg-teal-600"),
      new SeedUser("zhaogang", "赵刚", "财务部", "dept_finance", "财务总监", List.of("CFO"), "000902", null, "bg-violet-600"),
      new SeedUser("sunli", "孙丽", "人力资源部", "dept_hr", "HR副总裁", List.of("HRVP"), "000715", null, "bg-rose-600")
  );

  private static final String DEMO_PASSWORD = "123456";

  @Override
  public void run(ApplicationArguments args) {
    if (!enabled) {
      log.info("DataSeeder 已禁用（ams.seed.enabled=false）");
      return;
    }
    // seed 为尽力而为，任何失败都不阻断应用启动
    try {
      log.info("── DataSeeder 开始（幂等）──");
      seedDeptGroups();
      seedRoleGroups();
      seedUsers();
      seedAdminExt();
      seedArchiveBase();
      log.info("── DataSeeder 完成 ──");
    } catch (Exception e) {
      log.error("DataSeeder 执行异常（不阻断启动）: {}", e.getMessage());
    }
  }

  /**
   * 档案库基础数据 seed（P1-①）：
   *   1. 确保「会计档案管理」根目录存在（Company Home 下，统一用 -root- 解析）
   *   2. 根目录授权 GROUP_EVERYONE=Collaborator（否则普通账号无法在收集池建件）
   *   3. 确保 Z001/Z002/Z003 三个演示全宗存在（2026-07-21 实测曾整批丢失，自愈兜底）
   */
  private void seedArchiveBase() {
    String rootId = null;
    try {
      String companyHomeId = admin.getNodeId("-root-");
      rootId = admin.findChildId(companyHomeId, "会计档案管理");
      if (rootId == null) {
        rootId = admin.createNode(companyHomeId, "会计档案管理", "cm:folder", null);
        log.info("创建根目录: 会计档案管理 → {}", rootId);
      }
    } catch (Exception e) {
      log.warn("根目录确保失败（跳过 ACL/全宗 seed）: {}", e.getMessage());
      return;
    }
    try {
      admin.setEveryoneCollaborator(rootId);
      log.info("根目录 ACL 就绪: 会计档案管理 → GROUP_EVERYONE=Collaborator");
    } catch (Exception e) {
      log.warn("根目录 ACL 设置失败（不阻断）: {}", e.getMessage());
    }
    try {
      record SeedFonds(String code, String name, String status, String address, String custodianCode) {}
      List<SeedFonds> fonds = List.of(
          new SeedFonds("Z001", "第一全宗（华北集团总部）", "active", "北京市朝阳区国贸大厦A座5层", null),
          new SeedFonds("Z002", "第二全宗（南方智造分公司）", "active", "深圳市南山区创智航天大厦12层", null),
          new SeedFonds("Z003", "第三全宗（海外业务事业群）", "custodial", "新加坡滨海路Marina Centre", "Z001"));
      List<Map<String, Object>> children = admin.listChildren(rootId);
      for (SeedFonds f : fonds) {
        boolean exists = children.stream().anyMatch(c -> {
          Object props = c.get("properties");
          return props instanceof Map<?, ?> p && f.code().equals(p.get("finance:code"));
        });
        if (exists) continue;
        var props = new java.util.LinkedHashMap<String, Object>();
        props.put("finance:code", f.code());
        props.put("finance:fondsName", f.name());
        props.put("finance:status", f.status());
        props.put("finance:address", f.address());
        if (f.custodianCode() != null) props.put("finance:custodianCode", f.custodianCode());
        String id = admin.createNode(rootId, "全宗 " + f.code(), "finance:fonds", props);
        log.info("创建全宗: {} {} → {}", f.code(), f.name(), id);
      }
    } catch (Exception e) {
      log.warn("全宗 seed 失败（不阻断）: {}", e.getMessage());
    }
  }

  /** 部门组（挂在 comp_HQ 下，与组织管理页一致） */
  private void seedDeptGroups() {
    ensureOrg("comp_HQ", "总部集团", null);
    ensureOrg("dept_finance", "财务部", "comp_HQ");
    ensureOrg("dept_archive", "档案部", "comp_HQ");
    ensureOrg("dept_hr", "人力资源部", "comp_HQ");
  }

  private void ensureOrg(String shortName, String displayName, String parent) {
    String fullName = "GROUP_" + shortName;
    if (admin.groupExists(fullName)) return;
    if (parent == null) {
      if (!admin.groupExists(fullName)) {
        try {
          admin.createChildGroup("org_root", shortName, displayName);
          log.info("创建组织节点: {}（org_root 下）", displayName);
        } catch (Exception e) {
          log.warn("创建组织节点 {} 失败（可能已存在）: {}", displayName, e.getMessage());
        }
      }
    } else {
      try {
        admin.createChildGroup(parent, shortName, displayName);
        log.info("创建组织节点: {}（{} 下）", displayName, parent);
      } catch (Exception e) {
        log.warn("创建组织节点 {} 失败（可能已存在）: {}", displayName, e.getMessage());
      }
    }
  }

  /** 角色组（根组，id 自动补 GROUP_ 前缀 → GROUP_ROLE_XXX） */
  private void seedRoleGroups() {
    List.of("EMPLOYEE", "DEPT_MANAGER", "ARCHIVIST", "ARCHIVE_DIRECTOR", "CFO", "HRVP")
        .forEach(role -> {
          String fullName = "GROUP_ROLE_" + role;
          if (!admin.groupExists(fullName)) {
            try {
              admin.createRootGroup("ROLE_" + role, role + " 角色组");
              log.info("创建角色组: {}", fullName);
            } catch (Exception e) {
              log.warn("创建角色组 {} 失败: {}", fullName, e.getMessage());
            }
          }
        });
  }

  private void seedUsers() {
    for (SeedUser u : USERS) {
      // 1. people
      if (!admin.personExists(u.account())) {
        try {
          admin.createPerson(u.account(), u.name(), "", u.account() + "@finance.local", DEMO_PASSWORD);
          log.info("创建用户: {}（{}）", u.name(), u.account());
        } catch (Exception e) {
          log.warn("创建用户 {} 失败: {}", u.account(), e.getMessage());
          continue;
        }
      }
      // 2. 角色组绑定
      for (String role : u.roles()) {
        String group = "GROUP_ROLE_" + role;
        ensureMember(group, u);
      }
      // 3. 部门组绑定
      ensureMember("GROUP_" + u.deptGroup(), u);
      // 4. ams_user_ext
      upsertUserExt(u);
    }
  }

  private void ensureMember(String groupFullName, SeedUser u) {
    // 直接 addMember（成员列表走 Solr，重启后可能 Read timed out 500，不可靠）；
    // 已是成员时 Alfresco 返回 4xx，按幂等成功处理。
    try {
      admin.addMember(groupFullName, u.account());
      log.info("加入组: {} → {}", u.account(), groupFullName);
    } catch (Exception e) {
      String msg = String.valueOf(e.getMessage());
      if (msg.contains("already") || msg.contains("409") || msg.contains("400")) {
        log.debug("已在组中（幂等跳过）: {} → {}", u.account(), groupFullName);
      } else {
        log.warn("加入组 {} → {} 失败（不阻断）: {}", u.account(), groupFullName, msg);
      }
    }
  }

  private void upsertUserExt(SeedUser u) {
    jdbc.sql("""
        INSERT INTO ams_user_ext (user_id, emp_no, position, dept_path, supervisor_id, avatar_color)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT (user_id) DO UPDATE SET
          emp_no = EXCLUDED.emp_no,
          position = EXCLUDED.position,
          dept_path = EXCLUDED.dept_path,
          supervisor_id = EXCLUDED.supervisor_id,
          avatar_color = EXCLUDED.avatar_color,
          updated_at = now()
        """)
        .params(u.account(), u.empNo(), u.position(), u.dept(), u.supervisor(), u.avatarColor())
        .update();
  }

  /** 内置 admin 账号的扩展字段 */
  private void seedAdminExt() {
    jdbc.sql("""
        INSERT INTO ams_user_ext (user_id, emp_no, position, dept_path, supervisor_id, avatar_color)
        VALUES ('admin', '000001', '系统管理员', '信息中心', NULL, 'bg-slate-700')
        ON CONFLICT (user_id) DO NOTHING
        """).update();
  }
}
