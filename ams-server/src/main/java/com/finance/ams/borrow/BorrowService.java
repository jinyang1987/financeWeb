package com.finance.ams.borrow;

import java.time.LocalDate;
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
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.finance.ams.api.BizException;
import com.finance.ams.code.CodeSerialService;
import com.finance.ams.oplog.OperationLogService;

/**
 * 借阅域服务（P2-1）：申请/审批/拆单/履约/巡检/黑名单
 *
 * 算法镜像前端 borrowEngine.ts（20 个测试用例守护），迁移到 Java 后端。
 * 四表：ams_borrow_order / ams_borrow_item / ams_approval_step / ams_fulfillment。
 */
@Service
public class BorrowService {

  private static final Logger log = LoggerFactory.getLogger(BorrowService.class);
  private static final int MAX_BORROW_DAYS = 30;
  private static final int EXPIRY_WARN_DAYS = 3;

  private final JdbcClient jdbc;
  private final CodeSerialService serials;
  private final OperationLogService oplog;

  public BorrowService(DataSource dataSource, CodeSerialService serials, OperationLogService oplog) {
    this.jdbc = JdbcClient.create(dataSource);
    this.serials = serials;
    this.oplog = oplog;
  }

  // ═══════════════════ 提交申请 ═══════════════════

  @Transactional
  @SuppressWarnings("unchecked")
  public Map<String, Object> submitOrder(String userId, String userName, String empNo, String dept,
                                         Map<String, Object> body) {
    String reasonType = str(body.get("reasonType"));
    String reasonDetail = str(body.get("reasonDetail"));
    String startDate = str(body.get("startDate"));
    String endDate = str(body.get("endDate"));
    List<Map<String, Object>> items = (List<Map<String, Object>>) body.get("items");
    if (items == null || items.isEmpty()) throw BizException.badRequest("VALIDATION_FAILED", "借阅明细不能为空");
    if (reasonType.isBlank()) throw BizException.badRequest("VALIDATION_FAILED", "借阅事由不能为空");

    // 安全：申请人身份以后端会话为准，忽略前端任意填写的 applicantName/EmpNo/Dept（防冒名）
    if (userName == null || userName.isBlank()) {
      throw BizException.badRequest("VALIDATION_FAILED", "无法确认申请人身份，请重新登录");
    }

    // 校验借阅天数
    long days = java.time.temporal.ChronoUnit.DAYS.between(LocalDate.parse(startDate), LocalDate.parse(endDate));
    if (days > MAX_BORROW_DAYS) throw BizException.badRequest("VALIDATION_FAILED", "借阅天数不能超过 " + MAX_BORROW_DAYS + " 天");

    // 黑名单校验
    if (isBlacklisted(userId)) throw BizException.badRequest("BLACKLISTED", "名下有逾期未还档案，请先归还后再申请");

    // 取号 JY-YYYY-NNNN
    int year = LocalDate.now().getYear();
    int seq = serials.next(new CodeSerialService.SerialScope("BORROW", "ALL", "JY", year, null));
    String orderNo = "JY-" + year + "-" + String.format("%04d", seq);
    String orderId = UUID.randomUUID().toString();
    String now = LocalDateTime.now().format(DateTimeFormatter.ISO_LOCAL_DATE_TIME);

    // 计算审批链
    boolean needsCfo = items.stream().anyMatch(it -> {
      List<String> perms = (List<String>) it.get("electronicPerms");
      String pm = str(it.get("physicalMode"));
      return (perms != null && (perms.contains("download") || perms.contains("print"))) || !"none".equals(pm);
    });
    boolean hasSensitive = items.stream().anyMatch(it -> {
      String sl = str(it.get("securityLevel"));
      return "秘密".equals(sl) || "机密".equals(sl);
    });

    List<String> roles = new ArrayList<>();
    roles.add("dept_manager");
    if (needsCfo) roles.add("cfo");
    if (hasSensitive) roles.add("hrvp");
    roles.add("archivist");

    // 写入主单
    jdbc.sql("""
        INSERT INTO ams_borrow_order (id, order_no, applicant_id, applicant_name, applicant_emp_no, applicant_dept,
          reason_type, reason_detail, start_date, end_date, status, current_step, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'approving', 0, ?, ?)
        """)
        .param(orderId).param(orderNo).param(userId).param(userName).param(empNo).param(dept)
        .param(reasonType).param(reasonDetail).param(startDate).param(endDate).param(now).param(now)
        .update();

    // 写入明细行
    for (Map<String, Object> it : items) {
      String itemId = UUID.randomUUID().toString();
      List<String> perms = (List<String>) it.get("electronicPerms");
      jdbc.sql("""
          INSERT INTO ams_borrow_item (id, order_id, record_node_id, volume_node_id, title,
            type_code, media_type, security_level, stock_status, perms, physical_mode, voucher_no, archive_type)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          """)
          .param(itemId).param(orderId).param(str(it.get("recordId"))).param(str(it.get("volumeId")))
          .param(str(it.get("title"))).param(str(it.get("archiveTypeCode")))
          .param(str(it.get("mediaType"))).param(str(it.get("securityLevel")))
          .param(str(it.get("stockStatus")))
          .param(perms != null ? String.join(",", perms) : "view")
          .param(str(it.get("physicalMode")))
          .param(str(it.get("voucherNo"))).param(str(it.get("archiveType")))
          .update();
    }

    // 写入审批步骤
    for (int i = 0; i < roles.size(); i++) {
      jdbc.sql("""
          INSERT INTO ams_approval_step (id, order_id, seq, role, status)
          VALUES (?, ?, ?, ?, 'pending')
          """)
          .param(UUID.randomUUID().toString()).param(orderId).param(i + 1).param(roles.get(i))
          .update();
    }

    oplog.append(userId, userName, "发起借阅申请", orderNo, orderId, "借阅事由：" + reasonType + "，共 " + items.size() + " 件，借阅期 " + startDate + " 至 " + endDate);
    log.info("借阅申请提交: {} → {}（{} 件，审批链 {}）", orderNo, orderId, items.size(), roles);
    return getOrder(orderId);
  }

  // ═══════════════════ 查询 ═══════════════════

  public List<Map<String, Object>> listOrders(String mine, String pendingForRole, String status) {
    var sql = new StringBuilder("""
        SELECT o.*, 
          (SELECT COUNT(*) FROM ams_borrow_item i WHERE i.order_id = o.id) AS item_count
        FROM ams_borrow_order o WHERE 1=1
        """);
    List<Object> params = new ArrayList<>();
    if (mine != null && !mine.isBlank()) { sql.append(" AND o.applicant_id = ?"); params.add(mine); }
    if (status != null && !status.isBlank()) { sql.append(" AND o.status = ?"); params.add(status); }
    sql.append(" ORDER BY o.created_at DESC");

    List<Map<String, Object>> orders = jdbc.sql(sql.toString()).params(params.toArray()).query().listOfRows();

    if (pendingForRole != null && !pendingForRole.isBlank()) {
      orders = orders.stream().filter(o -> {
        String orderId = str(o.get("id"));
        int currentStep = o.get("current_step") instanceof Number n ? n.intValue() : 0;
        var steps = jdbc.sql("SELECT role, status FROM ams_approval_step WHERE order_id = ? ORDER BY seq")
            .param(orderId).query().listOfRows();
        if (currentStep < steps.size()) {
          Map<String, Object> step = steps.get(currentStep);
          return "pending".equals(str(step.get("status"))) && pendingForRole.equals(str(step.get("role")));
        }
        return false;
      }).toList();
    }

    return orders.stream().map(o -> enrichOrder(str(o.get("id")), o)).toList();
  }

  public Map<String, Object> getOrder(String orderId) {
    Map<String, Object> order = jdbc.sql("SELECT * FROM ams_borrow_order WHERE id = ?")
        .param(orderId).query().listOfRows().stream().findFirst()
        .orElseThrow(() -> BizException.badRequest("ORDER_NOT_FOUND", "借阅单不存在: " + orderId));
    return enrichOrder(orderId, order);
  }

  private Map<String, Object> enrichOrder(String orderId, Map<String, Object> order) {
    Map<String, Object> view = new LinkedHashMap<>(order);
    view.put("items", jdbc.sql("SELECT * FROM ams_borrow_item WHERE order_id = ?").param(orderId).query().listOfRows());
    view.put("approvalRoute", jdbc.sql("SELECT * FROM ams_approval_step WHERE order_id = ? ORDER BY seq").param(orderId).query().listOfRows());
    view.put("fulfillments", jdbc.sql("SELECT * FROM ams_fulfillment WHERE order_id = ?").param(orderId).query().listOfRows());
    return view;
  }

  // ═══════════════════ 审批 ═══════════════════

  @Transactional
  public Map<String, Object> approve(String orderId, String actedBy, String comment) {
    Map<String, Object> order = requireOrder(orderId);
    requireStatus(order, "approving", "仅审批中的单据可审批");
    int step = intVal(order.get("current_step"));

    jdbc.sql("UPDATE ams_approval_step SET status='approved', acted_by=?, acted_at=NOW(), comment=? WHERE order_id=? AND seq=?")
        .param(actedBy).param(comment).param(orderId).param(step + 1).update();

    int totalSteps = jdbc.sql("SELECT COUNT(*) FROM ams_approval_step WHERE order_id=?").param(orderId).query(Integer.class).single();
    if (step + 1 >= totalSteps) {
      // 末级审批通过 → 拆单
      jdbc.sql("UPDATE ams_borrow_order SET current_step=?, status='fulfilling', updated_at=NOW() WHERE id=?")
          .param(step + 1).param(orderId).update();
      splitFulfillments(orderId, order);
      oplog.append(actedBy, actedBy, "审批通过（终审）", orderId, orderId, comment != null ? comment : "终审通过，系统自动拆单履约");
      log.info("借阅单 {} 终审通过，已拆单", orderId);
    } else {
      jdbc.sql("UPDATE ams_borrow_order SET current_step=?, updated_at=NOW() WHERE id=?")
          .param(step + 1).param(orderId).update();
    }
    return getOrder(orderId);
  }

  @Transactional
  public Map<String, Object> reject(String orderId, String actedBy, String comment) {
    Map<String, Object> order = requireOrder(orderId);
    requireStatus(order, "approving", "仅审批中的单据可驳回");
    int step = intVal(order.get("current_step"));
    jdbc.sql("UPDATE ams_approval_step SET status='rejected', acted_by=?, acted_at=NOW(), comment=? WHERE order_id=? AND seq=?")
        .param(actedBy).param(comment).param(orderId).param(step + 1).update();
    jdbc.sql("UPDATE ams_borrow_order SET status='rejected', updated_at=NOW() WHERE id=?").param(orderId).update();
    oplog.append(actedBy, actedBy, "审批驳回", orderId, orderId, comment != null ? comment : "审批驳回");
    log.info("借阅单 {} 已驳回", orderId);
    return getOrder(orderId);
  }

  // ═══════════════════ 拆单 ═══════════════════

  private void splitFulfillments(String orderId, Map<String, Object> order) {
    List<Map<String, Object>> items = jdbc.sql("SELECT * FROM ams_borrow_item WHERE order_id=?").param(orderId).query().listOfRows();
    String startDate = str(order.get("start_date"));
    String endDate = str(order.get("end_date"));
    int seq = 1;

    // 电子授权：件级
    for (Map<String, Object> it : items) {
      String perms = str(it.get("perms"));
      if (perms.isBlank()) continue;
      jdbc.sql("""
          INSERT INTO ams_fulfillment (id, order_id, type, status, volume_node_id, record_node_ids,
            physical_mode, start_date, end_date, granted_at, volume_title)
          VALUES (?, ?, 'electronic', 'granted', ?, ?, 'none', ?, ?, NOW(), ?)
          """)
          .param(UUID.randomUUID().toString()).param(orderId)
          .param(str(it.get("volume_node_id")))
          .param(str(it.get("record_node_id")))
          .param(startDate).param(endDate)
          .param(str(it.get("title")))
          .update();
    }

    // 实体出库：卷级聚合
    Map<String, List<Map<String, Object>>> byVolume = new LinkedHashMap<>();
    for (Map<String, Object> it : items) {
      String pm = str(it.get("physical_mode"));
      if ("none".equals(pm) || pm.isBlank()) continue;
      byVolume.computeIfAbsent(str(it.get("volume_node_id")), k -> new ArrayList<>()).add(it);
    }
    for (var entry : byVolume.entrySet()) {
      String volumeId = entry.getKey();
      boolean lentOut = isVolumeLentOut(volumeId);
      String recordIds = String.join(",", entry.getValue().stream().map(i -> str(i.get("record_node_id"))).toList());
      String mode = "copy".equals(str(entry.getValue().get(0).get("physical_mode"))) ? "copy" : "original";
      jdbc.sql("""
          INSERT INTO ams_fulfillment (id, order_id, type, status, volume_node_id, record_node_ids,
            physical_mode, start_date, end_date, volume_title)
          VALUES (?, ?, 'physical', ?, ?, ?, ?, ?, ?, ?)
          """)
          .param(UUID.randomUUID().toString()).param(orderId)
          .param(lentOut ? "queued" : "pending")
          .param(volumeId).param(recordIds).param(mode)
          .param(startDate).param(endDate)
          .param(str(entry.getValue().get(0).get("title")))
          .update();
    }
  }

  // ═══════════════════ 履约操作 ═══════════════════

  @Transactional
  public Map<String, Object> checkout(String fulfillmentId, String operatorId) {
    jdbc.sql("UPDATE ams_fulfillment SET status='lent', lent_at=NOW(), operator_id=? WHERE id=? AND status='pending'")
        .param(operatorId).param(fulfillmentId).update();
    oplog.append(operatorId, operatorId, "实体档案出库", fulfillmentId, "", "履约单 " + fulfillmentId + " 实体出库交接");
    log.info("实体出库: {}", fulfillmentId);
    return getFulfillment(fulfillmentId);
  }

  @Transactional
  public Map<String, Object> returnFulfillment(String fulfillmentId, String operatorId) {
    Map<String, Object> f = getFulfillment(fulfillmentId);
    String orderId = str(f.get("order_id"));
    jdbc.sql("UPDATE ams_fulfillment SET status='returned', returned_at=NOW(), operator_id=? WHERE id=?")
        .param(operatorId).param(fulfillmentId).update();
    oplog.append(operatorId, operatorId, "实体档案归还核销", fulfillmentId, orderId, "履约单 " + fulfillmentId + " 归还入库核验");

    // 预约锁定：归还后检查是否有排队单
    String volumeId = str(f.get("volume_node_id"));
    var queued = jdbc.sql("""
        SELECT id FROM ams_fulfillment WHERE volume_node_id=? AND status='queued' ORDER BY start_date LIMIT 1
        """).param(volumeId).query().listOfRows().stream().findFirst();
    if (queued.isPresent()) {
      jdbc.sql("UPDATE ams_fulfillment SET status='pending' WHERE id=?").param(str(queued.get().get("id"))).update();
      log.info("预约锁定: {} → {}", volumeId, queued.get().get("id"));
    }

    // 推导主单状态
    deriveAndUpdateOrderStatus(orderId);
    return getFulfillment(fulfillmentId);
  }

  @Transactional
  public Map<String, Object> terminateOrder(String orderId, String operatorId) {
    jdbc.sql("UPDATE ams_fulfillment SET status='terminated' WHERE order_id=? AND status IN ('pending','granted','lent','queued','overdue')")
        .param(orderId).update();
    jdbc.sql("UPDATE ams_borrow_order SET status='terminated', updated_at=NOW() WHERE id=?").param(orderId).update();
    oplog.append(operatorId, operatorId, "中止借阅单", orderId, orderId, "管理员中止借阅，权限即时收回");
    log.info("借阅单中止: {}", orderId);
    return getOrder(orderId);
  }

  // ═══════════════════ 每日巡检 ═══════════════════

  @Transactional
  public Map<String, Object> dailyCheck() {
    String today = LocalDate.now().toString();
    int autoRevoked = 0, overdue = 0, expiringSoon = 0;

    // 电子到期自动收回
    autoRevoked = jdbc.sql("""
        UPDATE ams_fulfillment SET status='auto_revoked', returned_at=NOW()
        WHERE type='electronic' AND status='granted' AND end_date < ?
        """).param(today).update();

    // 实体逾期标记
    overdue = jdbc.sql("""
        UPDATE ams_fulfillment SET status='overdue'
        WHERE type='physical' AND status='lent' AND end_date < ?
        """).param(today).update();

    // 到期预警计数
    String warnDate = LocalDate.now().plusDays(EXPIRY_WARN_DAYS).toString();
    expiringSoon = jdbc.sql("""
        SELECT COUNT(*) FROM ams_fulfillment
        WHERE type='physical' AND status='lent' AND end_date >= ? AND end_date <= ?
        """).param(today).param(warnDate).query(Integer.class).single();

    // 更新受影响主单状态
    var affectedOrders = jdbc.sql("""
        SELECT DISTINCT order_id FROM ams_fulfillment
        WHERE status IN ('auto_revoked','overdue','returned')
        """).query().listOfRows().stream().map(r -> str(r.get("order_id"))).distinct().toList();
    for (String oid : affectedOrders) deriveAndUpdateOrderStatus(oid);

    log.info("每日巡检: 电子收回 {} / 实体逾期 {} / 即将到期 {}", autoRevoked, overdue, expiringSoon);
    return Map.of("autoRevoked", autoRevoked, "overdue", overdue, "expiringSoon", expiringSoon, "date", today);
  }

  // ═══════════════════ 黑名单 / 库存 ═══════════════════

  public boolean isBlacklisted(String userId) {
    String today = LocalDate.now().toString();
    Integer count = jdbc.sql("""
        SELECT COUNT(*) FROM ams_fulfillment f
        JOIN ams_borrow_order o ON o.id = f.order_id
        WHERE o.applicant_id = ? AND f.type = 'physical'
          AND f.status IN ('lent', 'overdue') AND f.end_date < ?
          AND o.status NOT IN ('terminated', 'rejected')
        """).param(userId).param(today).query(Integer.class).single();
    return count != null && count > 0;
  }

  public Map<String, Object> availability(String volumeNodeId) {
    boolean lentOut = isVolumeLentOut(volumeNodeId);
    int queuedCount = jdbc.sql("SELECT COUNT(*) FROM ams_fulfillment WHERE volume_node_id=? AND status='queued'")
        .param(volumeNodeId).query(Integer.class).single();
    return Map.of("volumeNodeId", volumeNodeId, "available", !lentOut, "queuedCount", queuedCount);
  }

  // ═══════════════════ 内部 ═══════════════════

  private boolean isVolumeLentOut(String volumeId) {
    Integer count = jdbc.sql("""
        SELECT COUNT(*) FROM ams_fulfillment f
        JOIN ams_borrow_order o ON o.id = f.order_id
        WHERE f.volume_node_id = ? AND f.type = 'physical'
          AND f.status IN ('lent', 'overdue')
          AND o.status NOT IN ('terminated', 'rejected')
        """).param(volumeId).query(Integer.class).single();
    return count != null && count > 0;
  }

  private void deriveAndUpdateOrderStatus(String orderId) {
    var fs = jdbc.sql("SELECT status FROM ams_fulfillment WHERE order_id=?").param(orderId).query().listOfRows();
    if (fs.isEmpty()) return;
    long done = fs.stream().filter(f -> List.of("returned", "auto_revoked", "terminated").contains(str(f.get("status")))).count();
    String newStatus;
    if (done == fs.size()) newStatus = "completed";
    else if (done > 0) newStatus = "returning";
    else if (fs.stream().anyMatch(f -> List.of("granted", "lent", "overdue").contains(str(f.get("status"))))) newStatus = "active";
    else newStatus = "fulfilling";
    jdbc.sql("UPDATE ams_borrow_order SET status=?, updated_at=NOW() WHERE id=? AND status NOT IN ('terminated','rejected')")
        .param(newStatus).param(orderId).update();
  }

  private Map<String, Object> requireOrder(String orderId) {
    return jdbc.sql("SELECT * FROM ams_borrow_order WHERE id=?").param(orderId).query().listOfRows().stream().findFirst()
        .orElseThrow(() -> BizException.badRequest("ORDER_NOT_FOUND", "借阅单不存在"));
  }

  private void requireStatus(Map<String, Object> order, String expected, String msg) {
    if (!expected.equals(str(order.get("status"))))
      throw new org.springframework.web.server.ResponseStatusException(
          org.springframework.http.HttpStatus.CONFLICT, msg);
  }

  private Map<String, Object> getFulfillment(String id) {
    return jdbc.sql("SELECT * FROM ams_fulfillment WHERE id=?").param(id).query().listOfRows().stream().findFirst()
        .orElseThrow(() -> BizException.badRequest("NOT_FOUND", "履约单不存在"));
  }

  private static String str(Object o) { return o == null ? "" : String.valueOf(o); }
  private static int intVal(Object o) { return o instanceof Number n ? n.intValue() : 0; }
}






