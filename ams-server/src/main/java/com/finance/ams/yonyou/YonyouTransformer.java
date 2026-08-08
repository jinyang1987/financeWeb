package com.finance.ams.yonyou;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.springframework.stereotype.Component;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.finance.ams.record.RecordService.CreateCmd;
import com.finance.ams.record.RecordService.VoucherMeta;

/**
 * 转换层：用友 BIP 凭证 JSON → 会计档案件元数据 + 版式视图
 *
 * 映射依据《用友BIP集成设计-2026-08-08.md》§三。两个系统的业务语义差异在此消化：
 *  - 用友「凭证字+凭证号」（转-1）→ 档案 voucherNo + voucherWord + voucherCategory(转账凭证)
 *  - 用友 period(yyyy-MM) → 档案 period + year + month 三字段
 *  - 用友 body[] 分录 → 档案 entries JSON（结构化）+ accountSubject（去重汇总，检索维度）
 *  - 用友 header.description（业务摘要）→ cm:description
 *  - 用友 voucherstatus(01) 不映射（凭证流转状态非档案元数据）
 *  - 固定值：archiveType=记账凭证、retention=30年（法定）、source=digital-native、carrierType=electronic
 */
@Component
public class YonyouTransformer {

  private final ObjectMapper json = new ObjectMapper();

  /** 转换结果：建件命令 + 版式渲染视图 + 平铺摘要字段 */
  public record Transformed(
      CreateCmd cmd,
      VoucherPdfRenderer.VoucherView pdfView,
      String externalId, String voucherNo, String summary, BigDecimal debitTotal) {}

  /**
   * @param header   列表接口 recordList[].header（或详情接口 data）
   * @param bodies   分录数组（列表 body[] / 详情 bodies[]）
   * @param fondsCode 目标全宗
   */
  @SuppressWarnings("unchecked")
  public Transformed transform(Map<String, Object> header, List<Map<String, Object>> bodies, String fondsCode) {
    String externalId = str(header.get("id"));
    String voucherNo = str(header.get("displayname"));           // 转-1
    String period = str(header.get("period"));                    // 2024-02
    if (period.isBlank()) period = str(header.get("periodUnion"));
    String maketime = str(header.get("maketime"));                // 2024-02-08
    if (maketime.isBlank()) maketime = str(header.get("makeTime"));
    String description = str(header.get("description"));

    // 凭证类别：列表 vouchertype{name,voucherstr}；详情 voucherTypeObj{name}
    String voucherWord = "";
    String voucherCategory = "";
    Object vt = header.get("vouchertype");
    if (vt instanceof Map<?, ?> m) {
      voucherWord = str(m.get("voucherstr"));
      voucherCategory = str(m.get("name"));
    }
    if (voucherCategory.isBlank()) {
      Object vto = header.get("voucherTypeObj");
      if (vto instanceof Map<?, ?> m) voucherCategory = str(m.get("name"));
    }
    if (voucherWord.isBlank() && voucherNo.contains("-")) {
      voucherWord = voucherNo.substring(0, voucherNo.indexOf('-'));
    }
    if (voucherCategory.isBlank()) voucherCategory = "通用记账凭证";

    // 人：列表 maker{name}；详情 makerObj{name} / auditorObj / tallyManObj（可空）
    String preparer = personName(header.get("maker"));
    if (preparer.isBlank()) preparer = personName(header.get("makerObj"));
    String auditor = personName(header.get("auditorObj"));
    String tallyMan = personName(header.get("tallyManObj"));

    // 账簿名（核算单位）：列表 accbook{name}
    String accbookName = "";
    Object ab = header.get("accbook");
    if (ab instanceof Map<?, ?> m) accbookName = str(m.get("name"));
    Object abo = header.get("accBookObj");
    if (accbookName.isBlank() && abo instanceof Map<?, ?> m) accbookName = str(m.get("name"));

    // 金额：借方合计（=贷方合计，借贷平衡）
    BigDecimal debitTotal = num(header.get("totaldebit_org"));
    if (debitTotal == null) debitTotal = num(header.get("totalDebitOrg"));
    BigDecimal creditTotal = num(header.get("totalcredit_org"));
    if (creditTotal == null) creditTotal = num(header.get("totalCreditOrg"));

    Integer attachedBill = intNum(header.get("attachedbill"));
    if (attachedBill == null) attachedBill = intNum(header.get("attachedBill"));

    // 期间 → 年/月
    Integer year = null, month = null;
    if (period.matches("\\d{4}-\\d{2}")) {
      year = Integer.parseInt(period.substring(0, 4));
      month = Integer.parseInt(period.substring(5, 7));
    }

    // 分录：列表 body[] / 详情 bodies[]，字段两种命名兼容
    List<VoucherPdfRenderer.EntryRow> rows = new ArrayList<>();
    List<Map<String, Object>> entriesJson = new ArrayList<>();
    StringBuilder subjects = new StringBuilder();
    int line = 0;
    for (Map<String, Object> b : bodies) {
      line++;
      Integer recNo = intNum(b.get("recordnumber"));
      if (recNo == null) recNo = intNum(b.get("recordNumber"));
      String summary = str(b.get("description"));
      String subjectCode = "", subjectName = "";
      Object subj = b.get("accsubject");
      if (subj instanceof Map<?, ?> m) {
        subjectCode = str(m.get("code"));
        subjectName = str(m.get("name"));
      }
      Object subjObj = b.get("accSubjectObj");
      if (subjectCode.isBlank() && subjObj instanceof Map<?, ?> m) {
        subjectCode = str(m.get("code"));
        subjectName = str(m.get("name"));
      }
      BigDecimal debit = num(b.get("debit_original"));
      if (debit == null) debit = num(b.get("debitOriginal"));
      BigDecimal credit = num(b.get("credit_original"));
      if (credit == null) credit = num(b.get("creditOriginal"));

      rows.add(new VoucherPdfRenderer.EntryRow(
          recNo == null ? line : recNo, summary, subjectCode, subjectName,
          debit == null ? BigDecimal.ZERO : debit, credit == null ? BigDecimal.ZERO : credit));

      Map<String, Object> ej = new LinkedHashMap<>();
      ej.put("line", recNo == null ? line : recNo);
      ej.put("summary", summary);
      ej.put("subjectCode", subjectCode);
      ej.put("subjectName", subjectName);
      ej.put("debit", debit == null ? BigDecimal.ZERO : debit);
      ej.put("credit", credit == null ? BigDecimal.ZERO : credit);
      entriesJson.add(ej);

      String subjText = (subjectCode + " " + subjectName).trim();
      if (!subjText.isEmpty() && subjects.indexOf(subjText) < 0) {
        if (subjects.length() > 0) subjects.append("；");
        subjects.append(subjText);
      }
    }

    String entriesJsonStr;
    try {
      entriesJsonStr = json.writeValueAsString(entriesJson);
    } catch (Exception e) {
      entriesJsonStr = "[]";
    }

    VoucherMeta meta = new VoucherMeta(
        voucherWord, maketime, period, auditor, tallyMan, entriesJsonStr,
        attachedBill, "用友BIP", externalId, description);

    CreateCmd cmd = new CreateCmd(
        fondsCode, voucherNo, "记账凭证", null,
        debitTotal == null ? null : debitTotal.doubleValue(),
        year, month, "30年",
        "digital-native", "electronic", preparer, voucherCategory,
        null, meta);

    VoucherPdfRenderer.VoucherView view = new VoucherPdfRenderer.VoucherView(
        voucherNo, voucherWord, voucherCategory, period, maketime, accbookName,
        preparer, auditor, tallyMan, attachedBill, "用友BIP",
        debitTotal, creditTotal, description, rows);

    return new Transformed(cmd, view, externalId, voucherNo, description,
        debitTotal == null ? BigDecimal.ZERO : debitTotal);
  }

  // ── 工具 ──
  private static String str(Object o) { return o == null ? "" : String.valueOf(o); }

  private static String personName(Object person) {
    if (person instanceof Map<?, ?> m) return str(m.get("name"));
    return "";
  }

  private static BigDecimal num(Object o) {
    if (o instanceof Number n) return BigDecimal.valueOf(n.doubleValue());
    if (o instanceof String s && !s.isBlank()) {
      try { return new BigDecimal(s); } catch (NumberFormatException ignored) { }
    }
    return null;
  }

  private static Integer intNum(Object o) {
    if (o instanceof Number n) return n.intValue();
    if (o instanceof String s && !s.isBlank()) {
      try { return Integer.parseInt(s.trim()); } catch (NumberFormatException ignored) { }
    }
    return null;
  }
}
