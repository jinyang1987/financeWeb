# -*- coding: utf-8 -*-
"""第三批 T8-T10 + 缺陷#24 冒烟（2026-09-05）

覆盖断言：
  T8 元数据白名单扩 srcDoc*：原始凭证件 PUT /records/{id}/metadata 修改
     documentNo/counterpartyName/srcDocSummary/amountUpper/businessCategory/extFields
     → 视图回读一致（finance:srcDoc* 落库）
  T9 卷级缺项（V11/V12/V15/V16/V18/V20）：PUT /volumes/{id} 写
     totalPages/establishingUnit/checker/checkDate/scanned/remarks → 回读一致；
  T9 盒级人工字段：移交归盒后 PUT /boxes/{id} 写
     packer/arranger/auditor/auditDate/dualSetRef/remarks → 回读一致；
  T10 卷级归档后锁：confirmed 卷改 title → 409 VOLUME_LOCKED（cabinetNo 仍可改）；
  T10 审计留痕：元数据修改后 /audit/logs（审计员）可查到「元数据修改」且 detail 含旧值→新值；
  T10 纯元数据建档 + 补文件：POST /records/metadata-only 建无内容件 →
     补文件 POST /records/{id}/content → 内容可读、固化登记；
  #24 三员分立：admin GET /audit/logs → 403（回归 smoke_rbac C2）；
     审计员 shenji GET /audit/logs → 200。
"""
import json
import time
import urllib.request
import urllib.error
import uuid

BASE = "http://localhost:8081/api"
PASS = FAIL = 0


def check(name, cond, detail=""):
    global PASS, FAIL
    if cond:
        PASS += 1
        print(f"  PASS  {name}")
    else:
        FAIL += 1
        print(f"  FAIL  {name}   <-- {str(detail)[:260]}")


def req(method, path, body=None, raw=None, headers=None, ctype="application/json", timeout=120):
    h = dict(headers or {})
    data = None
    if raw is not None:
        data = raw
    elif body is not None:
        data = json.dumps(body, ensure_ascii=False).encode("utf-8")
    if data is not None and ctype:
        h["Content-Type"] = ctype
    r = urllib.request.Request(BASE + path, data=data, headers=h, method=method)
    try:
        with urllib.request.urlopen(r, timeout=timeout) as resp:
            t = resp.read().decode("utf-8", "replace")
            return resp.status, (json.loads(t) if t.strip() else {})
    except urllib.error.HTTPError as e:
        t = e.read().decode("utf-8", "replace")
        try:
            return e.code, json.loads(t)
        except Exception:
            return e.code, {"raw": t[:300]}


def multipart_file(filename, content: bytes, mime="application/pdf"):
    b = uuid.uuid4().hex
    pre = (
        f'--{b}\r\nContent-Disposition: form-data; name="file"; filename="{filename}"\r\n'
        f"Content-Type: {mime}\r\n\r\n"
    ).encode("utf-8")
    return pre + content + f"\r\n--{b}--\r\n".encode("utf-8"), f"multipart/form-data; boundary={b}"


PDF_BYTES = (b"%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\n"
             b"trailer<</Root 1 0 R>>\n%%EOF\n")

UNIQ = uuid.uuid4().hex[:6].upper()
print("== 批次三冒烟（T8-T10 + #24） 2026-09-05 ==")

# ── 登录 ──
s, d = req("POST", "/auth/login", body={"account": "admin", "password": "admin"})
check("A1 admin 登录", s == 200 and d.get("ticket"), (s, d))
TICKET = d.get("ticket", "")
H = {"X-User-Id": "admin", "X-Alfresco-Ticket": TICKET}

s, d = req("POST", "/auth/login", body={"account": "shenji", "password": "123456"})
AUD_H = {}
check("A2 审计员 shenji 登录", s == 200 and d.get("ticket"), (s, d))
if d.get("ticket"):
    AUD_H = {"X-User-Id": "shenji", "X-Alfresco-Ticket": d["ticket"]}

# ═══ #24 三员分立 ═══
print("\n── #24 三员分立（/audit/logs 仅审计员） ──")
s, d = req("GET", "/audit/logs?limit=5", headers=H)
check("B1 admin 查审计日志 → 403（#24 修复）", s == 403, (s, d))
s, d = req("GET", "/audit/logs?limit=5", headers=AUD_H)
check("B2 审计员查审计日志 → 200", s == 200 and "items" in d, (s, d))

# ═══ T8 原始凭证 srcDoc* 白名单 ═══
print("\n── T8 原始凭证元数据编辑（srcDoc* 白名单） ──")
fields = {
    "fondsCode": "Z001", "voucherNo": f"SD-{UNIQ}", "archiveType": "原始凭证",
    "year": "2026", "month": "8", "retention": "30年", "source": "digital-native",
    "carrierType": "electronic", "voucherCategory": "原始凭证",
    "docTypeCode": "vat-electronic-invoice", "docTypeName": "全面数字化电子发票（数电票）",
}
bb = uuid.uuid4().hex
parts = [f'--{bb}\r\nContent-Disposition: form-data; name="{k}"\r\n\r\n{v}\r\n' for k, v in fields.items()]
payload = "".join(parts).encode("utf-8") + (
    f'--{bb}\r\nContent-Disposition: form-data; name="file"; filename="srcdoc-{UNIQ}.pdf"\r\n'
    f"Content-Type: application/pdf\r\n\r\n").encode("utf-8") + PDF_BYTES + f"\r\n--{bb}--\r\n".encode("utf-8")
s, d = req("POST", "/records", raw=payload, headers=H, ctype=f"multipart/form-data; boundary={bb}")
check("C1 上传原始凭证件", s == 200 and d.get("nodeId"), (s, d))
src_id = d.get("nodeId", "")

ext_json = json.dumps({"invoiceNo": f"26312{UNIQ}", "taxRate": "13", "_xmlParsed": True}, ensure_ascii=False)
s, d = req("PUT", f"/records/{src_id}/metadata", headers=H, body={
    "documentNo": f"26312{UNIQ}",
    "counterpartyName": "长沙示例供应商有限公司",
    "counterpartyTaxId": "91430100MA4TEST002",
    "srcDocSummary": "购入办公用品一批（冒烟修改）",
    "amountUpper": "人民币壹仟壹佰叁拾元整",
    "businessCategory": "采购",
    "extFields": ext_json,
})
ok_view = d if s == 200 and d.get("nodeId") else {}
check("C2 PUT 元数据（srcDoc* 字段）→ 200", s == 200 and ok_view.get("nodeId") == src_id, (s, d))
check("C3 单据编号回读一致", ok_view.get("documentNo") == f"26312{UNIQ}", ok_view.get("documentNo"))
check("C4 对方单位回读一致", ok_view.get("counterpartyName") == "长沙示例供应商有限公司", ok_view.get("counterpartyName"))
check("C5 大写金额回读一致", ok_view.get("srcDocAmountUpper") == "人民币壹仟壹佰叁拾元整", ok_view.get("srcDocAmountUpper"))
check("C6 业务分类回读一致", ok_view.get("srcDocBusinessCategory") == "采购", ok_view.get("srcDocBusinessCategory"))
ext_back = json.loads(ok_view.get("srcDocExtFields") or "{}")
check("C7 扩展字段 extFields 落库", ext_back.get("invoiceNo") == f"26312{UNIQ}", ext_back)

# ═══ T10 纯元数据建档 + 补文件 ═══
print("\n── T10 纯元数据建档 + 补文件 ──")
s, d = req("POST", "/records/metadata-only", headers=H, body={
    "fondsCode": "Z001", "voucherNo": f"META-{UNIQ}", "archiveType": "原始凭证",
    "year": "2026", "month": "9", "retention": "30年", "carrierType": "paper",
    "voucherCategory": "原始凭证", "documentNo": f"DOC-{UNIQ}",
})
check("D1 纯元数据建档 → 200", s == 200 and d.get("nodeId"), (s, d))
meta_id = d.get("nodeId", "")
check("D2 建档无内容（sizeInBytes=0）", d.get("sizeInBytes") == 0, d.get("sizeInBytes"))
check("D3 状态=仅件数据", d.get("recordStatus") == "仅件数据", d.get("recordStatus"))

s, d = req("GET", f"/records?scope=all&fondsCode=Z001&keyword=META-{UNIQ}", headers=H)
check("D4 纯元数据件入收集池列表", s == 200 and any(r.get("nodeId") == meta_id for r in d.get("items", [])), (s, d))

body, ctype = multipart_file(f"补文件-{UNIQ}.pdf", PDF_BYTES)
s, d = req("POST", f"/records/{meta_id}/content", raw=body, headers=H, ctype=ctype)
check("D5 补文件 → 200", s == 200 and d.get("mimeType") == "application/pdf", (s, d))
# 二次补文件应 409（内容不可替换）
body, ctype = multipart_file("second.pdf", PDF_BYTES)
s, d = req("POST", f"/records/{meta_id}/content", raw=body, headers=H, ctype=ctype)
check("D6 二次补文件 → 409（内容不可变）", s == 409, (s, d))

# ═══ T9 卷级缺项 + T10 卷锁 ═══
print("\n── T9 卷级缺项 / T10 卷级归档后锁 ──")
s, d = req("POST", "/volumes", headers=H, body={
    "fondsCode": "Z001", "title": f"批次三冒烟卷-{UNIQ}", "archiveType": "凭证",
    "archiveTypeCode": "KP", "year": 2026, "retention": "10年",
})
check("E1 建卷 → 200", s == 200 and d.get("nodeId"), (s, d))
vol_id = d.get("nodeId", "")

s, d = req("PUT", f"/volumes/{vol_id}", headers=H, body={
    "totalPages": 66, "establishingUnit": "中车株洲电力机车有限公司",
    "checker": "王检查", "checkDate": "2026-09-05", "scanned": "true",
    "remarks": "凭证号连续，无断号（冒烟）",
})
vol_view = d if s == 200 and d.get("nodeId") else {}
check("E2 PUT 卷级缺项字段 → 200", s == 200 and vol_view.get("nodeId") == vol_id, (s, d))
check("E3 V11 卷内页数=66", vol_view.get("totalPages") == 66, vol_view.get("totalPages"))
check("E4 V12 立档单位回读", vol_view.get("establishingUnit") == "中车株洲电力机车有限公司", vol_view.get("establishingUnit"))
check("E5 V15/V16 检查人/检查日期", vol_view.get("checker") == "王检查" and vol_view.get("checkDate", "").startswith("2026-09-05"), (vol_view.get("checker"), vol_view.get("checkDate")))
check("E6 V18 数字化状态", vol_view.get("scanned") is True, vol_view.get("scanned"))
check("E7 V20 备注回读", vol_view.get("remarks") == "凭证号连续，无断号（冒烟）", vol_view.get("remarks"))

# 加件 → 确认（gd 检测通过后赋号）→ 锁生效
eb = uuid.uuid4().hex
efields = {
    "fondsCode": "Z001", "voucherNo": f"JZ-{UNIQ}", "archiveType": "记账凭证",
    "year": "2026", "month": "8", "retention": "10年", "source": "digital-native",
    "carrierType": "electronic", "voucherCategory": "记账凭证", "voucherWord": "记",
}
eparts = [f'--{eb}\r\nContent-Disposition: form-data; name="{k}"\r\n\r\n{v}\r\n' for k, v in efields.items()]
epayload = "".join(eparts).encode("utf-8") + (
    f'--{eb}\r\nContent-Disposition: form-data; name="file"; filename="jz-{UNIQ}.pdf"\r\n'
    f"Content-Type: application/pdf\r\n\r\n").encode("utf-8") + PDF_BYTES + f"\r\n--{eb}--\r\n".encode("utf-8")
s, d = req("POST", "/records", raw=epayload, headers=H, ctype=f"multipart/form-data; boundary={eb}")
rid = d.get("nodeId", "")
check("E8 建件（记账凭证）", s == 200 and rid, (s, d))
s, d = req("POST", f"/volumes/{vol_id}/items", headers=H, body={"recordIds": [rid]})
check("E9 加件入卷", s == 200, (s, d))
s, d = req("POST", f"/volumes/{vol_id}/confirm", headers=H)
check("E10 确认组卷（gd 检测）", s == 200 and d.get("status") == "confirmed", (s, d))

s, d = req("PUT", f"/volumes/{vol_id}", headers=H, body={"title": "锁定后偷改题名"})
check("E11 已确认卷改题名 → 409 VOLUME_LOCKED（T10 锁拉齐）", s == 409 and d.get("code") == "VOLUME_LOCKED", (s, d))
s, d = req("PUT", f"/volumes/{vol_id}", headers=H, body={"cabinetNo": "A-01"})
check("E12 已确认卷改实体位置（cabinetNo）→ 200", s == 200, (s, d))

# ═══ T9 盒级人工字段 ═══
print("\n── T9 盒级人工字段写路径 ──")
s, d = req("POST", f"/volumes/{vol_id}/transfer", headers=H)
check("F1 移交归盒", s == 200 and d.get("boxId"), (s, d))
box_id = d.get("boxId", "")
s, d = req("PUT", f"/boxes/{box_id}", headers=H, body={
    "packer": "李装盒", "packDate": "2026-09-05", "arranger": "赵整理",
    "auditor": "钱审核", "auditDate": "2026-09-05", "dualSetRef": f"PAPER-{UNIQ}",
    "remarks": "冒烟备考：无异常",
})
box_view = d if s == 200 and d.get("nodeId") else {}
check("F2 PUT 盒人工字段 → 200", s == 200 and box_view.get("nodeId") == box_id, (s, d))
check("F3 装盒人/整理人回读", box_view.get("packer") == "李装盒" and box_view.get("arranger") == "赵整理", (box_view.get("packer"), box_view.get("arranger")))
check("F4 审核人/双套制关联回读", box_view.get("auditor") == "钱审核" and box_view.get("dualSetRef") == f"PAPER-{UNIQ}", (box_view.get("auditor"), box_view.get("dualSetRef")))

# ═══ T10 审计留痕（旧值/新值） ═══
print("\n── T10 元数据修改审计留痕 ──")
s, d = req("PUT", f"/records/{src_id}/metadata", headers=H, body={
    "srcDocSummary": "二次修改后的摘要（审计留痕验证）",
})
check("G1 二次修改元数据 → 200", s == 200, (s, d))
time.sleep(1)
s, d = req("GET", "/audit/logs?limit=50", headers=AUD_H)
logs = d.get("items", []) if s == 200 else []
meta_logs = [l for l in logs if l.get("action") == "元数据修改" and src_id in str(l.get("target_label") or l.get("target") or "")]
check("G2 审计日志含「元数据修改」", bool(meta_logs), [l.get("action") for l in logs[:5]])
if meta_logs:
    detail = str(meta_logs[0].get("detail") or "")
    check("G3 detail 含旧值→新值", "→「" in detail and "购入办公用品" in detail, detail)
vol_logs = [l for l in logs if l.get("action") == "案卷元数据修改" and vol_id in str(l.get("target_label") or l.get("target") or "")]
check("G4 卷级元数据修改留痕", bool(vol_logs), None)
box_logs = [l for l in logs if l.get("action") == "盒元数据修改" and box_id in str(l.get("target_label") or l.get("target") or "")]
check("G5 盒级元数据修改留痕", bool(box_logs), None)

print(f"\n══ 结果: PASS={PASS} FAIL={FAIL} ══")
raise SystemExit(0 if FAIL == 0 else 1)
