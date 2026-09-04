# -*- coding: utf-8 -*-
"""缺陷修复第一批+第二批 冒烟（2026-08-29）

覆盖断言：
  T1 哈希固化：上传即登记（fixity verify ok）、卷级聚合摘要（confirm 写 digitalHash）、
               卷级复核检测项（volume-hash-verify 于移交）、存量补登记（backfill）
  T2 XML 归档：数电票 XML 上传 → 后端解析票面要素回填 srcDoc*（类型/号码/对方/扩展字段标记）
  T4 检测小修：phase 白名单（未知→400）、operator 落库、报告分页结构
  T5 归档检测：confirm 自动 gd 检测（通过才赋号）
  T6 复检与随档：人工复检写新行且原行不改、报告文件节点（reportFileNode）存在
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


def multipart(fields, filename, content: bytes, mime="application/pdf"):
    b = uuid.uuid4().hex
    parts = [
        f'--{b}\r\nContent-Disposition: form-data; name="{k}"\r\n\r\n{v}\r\n'
        for k, v in fields.items()
    ]
    pre = "".join(parts).encode("utf-8") + (
        f'--{b}\r\nContent-Disposition: form-data; name="file"; filename="{filename}"\r\n'
        f'Content-Type: {mime}\r\n\r\n').encode("utf-8")
    return pre + content + f"\r\n--{b}--\r\n".encode("utf-8"), f"multipart/form-data; boundary={b}"


# ── 最小合法 PDF（%PDF-1.4 头 + 尾） ──
PDF_BYTES = (b"%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\n"
             b"trailer<</Root 1 0 R>>\n%%EOF\n")

# ── 数电票 XML 样例（含签名元素与票面要素） ──
INVOICE_XML = """<?xml version="1.0" encoding="UTF-8"?>
<电子发票>
  <发票号码>26312000099887766</发票号码>
  <开票日期>2026-08-29</开票日期>
  <购买方信息><购买方名称>株洲测试制造有限公司</购买方名称><统一社会信用代码>91430200MA4TEST001</统一社会信用代码></购买方信息>
  <销售方信息><销售方名称>长沙示例供应商有限公司</销售方名称><统一社会信用代码>91430100MA4TEST002</统一社会信用代码></销售方信息>
  <合计金额>1000.00</合计金额>
  <合计税额>130.00</合计税额>
  <价税合计>1130.00</价税合计>
  <开票人>张三</开票人>
  <电子签名><签名值>MEQCIFAKE…</签名值></电子签名>
</电子发票>
""".encode("utf-8")

def detail_str(row):
    """detail_json 可能为 str 或已解析的 dict（jsonb），统一成字符串便于断言"""
    v = (row or {}).get("detail_json")
    if isinstance(v, str):
        return v
    if isinstance(v, dict) and "value" in v:  # PGobject jsonb 包装
        return str(v["value"])
    return json.dumps(v or {}, ensure_ascii=False)


print("=" * 70)
print("缺陷修复批次一+二 冒烟（T1 固化 / T2 XML / T4 引擎 / T5 归档检测 / T6 复检）")
print("=" * 70)

s, d = req("POST", "/auth/login", body={"account": "admin", "password": "admin"})
ticket = (d or {}).get("ticket", "")
check("登录", s == 200 and bool(ticket), (s, d))
H = {"X-User-Id": "admin", "X-Alfresco-Ticket": ticket}

# ═══ T1+T2：上传 PDF（固化登记） + 上传数电票 XML（解析+固化） ═══
print("\n── T1 哈希固化登记 ──")
base_fields = {
    "fondsCode": "Z001", "archiveType": "凭证", "department": "财务部",
    "year": "2026", "month": "8", "retention": "10年",
    "source": "digital-native", "carrierType": "paper", "preparer": "冒烟员",
    "voucherCategory": "记账凭证",
}
ids = []
for i, tag in enumerate(("A", "B", "C")):
    f = dict(base_fields, voucherNo=f"记-FX-{tag}", amount=f"{(i + 1) * 100}.00",
             summary=f"固化冒烟凭证{tag}")
    raw, ct = multipart(f, f"fixity-{tag}.pdf", PDF_BYTES)
    s, d = req("POST", "/records", raw=raw, headers=H, ctype=ct)
    ids.append((d or {}).get("nodeId", ""))
    check(f"上传PDF件{tag}", s == 200 and ids[-1], (s, d))

s, d = req("POST", f"/inspection/fixity/verify/{ids[0]}", headers=H)
check("T1 上传即登记且重算一致（verify ok）", s == 200 and d.get("ok") is True, (s, d))
check("T1 登记摘要为 64 位 hex", isinstance(d.get("expected"), str) and len(d.get("expected", "")) == 64, d)

print("\n── T2 数电票 XML 解析归档 ──")
f = dict(base_fields, voucherNo="记-FX-XML", amount="1130.00", summary="数电票XML冒烟",
         voucherCategory="原始凭证")
raw, ct = multipart(f, "invoice-26312000099887766.xml", INVOICE_XML, "application/xml")
s, d = req("POST", "/records", raw=raw, headers=H, ctype=ct)
xml_id = (d or {}).get("nodeId", "")
check("XML 上传 200", s == 200 and bool(xml_id), (s, d))
check("T2 XML 解析回填类型=数电票", (d or {}).get("docTypeCode") == "vat-electronic-invoice", d)
ext = (d or {}).get("srcDocExtFields") or ""
check("T2 扩展字段含 XML 解析标记与发票号码", "_xmlParsed" in ext and "26312000099887766" in ext, ext[:200])
check("T2 签名元素存在性标记", "_signaturePresent" in ext, ext[:200])
s, d = req("POST", f"/inspection/fixity/verify/{xml_id}", headers=H)
check("T2 XML 固化登记+重算一致", s == 200 and d.get("ok") is True, (s, d))
ids.append(xml_id)

# ═══ T5+T1：组卷 → confirm 自动 gd 检测 → 卷级聚合摘要 ═══
print("\n── T5 归档环节检测（confirm 自动 gd）+ T1 卷级聚合摘要 ──")
s, d = req("POST", "/volumes", headers=H, body={
    "fondsCode": "Z001", "title": "固化与检测冒烟卷", "archiveType": "凭证",
    "archiveTypeCode": "KP", "year": 2026, "retention": "10年",
    "dateFrom": "2026-08-01", "dateTo": "2026-08-31",
    "carrierType": "paper", "securityLevel": "普通",
})
vol_id = (d or {}).get("volumeId") or (d or {}).get("nodeId") or ""
check("建卷", s == 200 and bool(vol_id), (s, d))

s, d = req("POST", f"/volumes/{vol_id}/items", headers=H, body={"recordIds": ids})
check("加件入卷 x4", s == 200 and isinstance(d, list) and len(d) == 4, (s, str(d)[:200]))

s, d = req("POST", f"/volumes/{vol_id}/confirm", headers=H)
check("T5 确认组卷（gd 检测通过才放行）", s == 200, (s, d))
vol_code = (d or {}).get("volumeCode", "")
check("T5 赋号成功（非占位）", bool(vol_code) and "VPEND" not in vol_code, d)
vol_hash = (d or {}).get("digitalHash", "")
check("T1 卷级聚合摘要已写入（64 hex）", isinstance(vol_hash, str) and len(vol_hash) == 64, str(vol_hash)[:80])

# ═══ T4：phase 白名单 / operator 落库 / 分页 ═══
print("\n── T4 引擎小修 ──")
s, d = req("POST", "/inspection/run-volume", headers=H, body={"volumeId": vol_id, "phase": "xx"})
check("T4 未知 phase 拒绝（400）", s == 400, (s, d))

s, d = req("POST", "/inspection/run-volume", headers=H, body={"volumeId": vol_id, "phase": "gd"})
check("T4 手动 gd 检测 200", s == 200 and "allPass" in d, (s, str(d)[:200]))

time.sleep(1)
s, d = req("GET", f"/inspection/reports?target={vol_id}", headers=H)
rows = d if isinstance(d, list) else []
gd_rows = [r for r in rows if r.get("phase") == "gd"]
check("T4 报告 operator 落库（非空）", any((r.get("operator") or "") == "admin" for r in gd_rows), rows[:1])
check("T6 报告随档归档（detail.reportFileNode 存在）",
      any("reportFileNode" in detail_str(r) for r in gd_rows),
      detail_str(gd_rows[0])[:200] if gd_rows else "无 gd 报告")

s, d = req("GET", "/inspection/reports?page=0&size=5", headers=H)
check("T4 分页结构 {items,total,page,size}",
      s == 200 and isinstance(d, dict) and "items" in d and "total" in d and d.get("size") == 5, (s, str(d)[:160]))

# ═══ T6：人工复检（新行不改历史） ═══
print("\n── T6 人工复检 ──")
target_report = gd_rows[0] if gd_rows else (rows[0] if rows else None)
check("存在可复检报告", bool(target_report), rows)
if target_report:
    orig_detail = detail_str(target_report)
    s, d = req("POST", "/inspection/review", headers=H, body={
        "reportId": target_report["id"], "dimension": "safe", "pass": True,
        "reason": "冒烟复检：敏感词命中为业务必需留存"})
    check("复检提交 200", s == 200, (s, d))
    check("复检写新行（新 id ≠ 原报告）", s == 200 and d.get("id") != target_report["id"], d)
    det = detail_str(d)
    check("复检行含 reviewOf/prior/reviewer", "reviewOf" in det and "prior" in det and "admin" in det, det[:200])
    s2, d2 = req("GET", f"/inspection/reports?target={vol_id}", headers=H)
    orig_after = [r for r in (d2 if isinstance(d2, list) else []) if r.get("id") == target_report["id"]]
    check("原报告行未被修改（detail_json 逐字一致）",
          bool(orig_after) and detail_str(orig_after[0]) == orig_detail,
          "原行 detail_json 发生变化！")

# ═══ T1 卷级复核 + 移交（yj 全口径） ═══
print("\n── 移交归盒（yj 全口径含 hash-verify / volume-hash-verify） ──")
s, d = req("POST", f"/volumes/{vol_id}/transfer", headers=H)
check("移交 200（yj 检测通过）", s == 200, (s, d))
time.sleep(1)
s, d = req("GET", f"/inspection/reports?target={vol_id}", headers=H)
rows = d if isinstance(d, list) else []
yj_rows = [r for r in rows if r.get("phase") == "yj"]
yj_detail = detail_str(yj_rows[0]) if yj_rows else ""
check("yj 报告含摘要重算比对项（YJ-1-02）", "YJ-1-02" in yj_detail, yj_detail[:200])
check("yj 报告含卷级聚合复核项（YJ-1-03）", "YJ-1-03" in yj_detail, yj_detail[:200])
check("yj 检测全部通过", bool(yj_rows) and all(
    r.get("real") and r.get("complete") and r.get("usable") and r.get("safe") for r in yj_rows[:1]),
    yj_detail[:300])

# ═══ T1：存量补登记 + 巡检 ═══
print("\n── T1 存量补登记 / 巡检 / 状态 ──")
s, d = req("POST", "/inspection/fixity/backfill", headers=H, body={"fondsCode": "Z001"})
check("补登记 200（遍历存量）", s == 200 and "visited" in d, (s, str(d)[:200]))
print(f"    backfill: visited={d.get('visited')} registered={d.get('registered')} skipped={d.get('skipped')}")
s, d = req("POST", "/inspection/fixity/patrol", headers=H)
check("手动巡检 200", s == 200 and "checked" in d, (s, str(d)[:200]))
print(f"    patrol: checked={d.get('checked')} consistent={d.get('consistent')} mismatched={d.get('mismatched')}")
s, d = req("GET", "/inspection/fixity/status", headers=H)
check("固化状态统计 200", s == 200 and isinstance(d.get("total"), int) and d.get("total") >= 4, (s, d))
print(f"    fixity: {json.dumps(d)}")

print("\n" + "=" * 70)
print(f"结束 PASS={PASS} FAIL={FAIL}")
print("=" * 70)
raise SystemExit(0 if FAIL == 0 else 1)
