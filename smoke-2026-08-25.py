# -*- coding: utf-8 -*-
"""端到端冒烟：原始凭证 srcDoc* 元数据 / 件级元数据录入 / 快速检测 / 操作日志（2026-08-25）"""
import json
import urllib.request
import urllib.error
import urllib.parse
import uuid

BASE = "http://localhost:8081/api"
H = {}          # x-user-id / ticket 在登录后填充
PASS = 0
FAIL = 0


def check(name, cond, detail=""):
    global PASS, FAIL
    if cond:
        PASS += 1
        print(f"  PASS  {name}")
    else:
        FAIL += 1
        print(f"  FAIL  {name}   <-- {str(detail)[:200]}")


def req(method, path, body=None, raw=None, ctype="application/json", headers=None):
    """返回 (status, parsed)；headers 传 None 时用主会话 H，显式传入则覆盖（如审计员会话）"""
    data = None
    if raw is not None:
        data = raw
    elif body is not None:
        data = json.dumps(body, ensure_ascii=False).encode("utf-8")
    h = dict(H if headers is None else headers)
    if ctype and data is not None:
        h["Content-Type"] = ctype
    r = urllib.request.Request(BASE + path, data=data, headers=h, method=method)
    try:
        with urllib.request.urlopen(r, timeout=40) as resp:
            txt = resp.read().decode("utf-8", "replace")
            return resp.status, (json.loads(txt) if txt.strip() else {})
    except urllib.error.HTTPError as e:
        txt = e.read().decode("utf-8", "replace")
        try:
            return e.code, json.loads(txt)
        except Exception:
            return e.code, {"raw": txt}


def multipart(fields, filename, content: bytes):
    boundary = uuid.uuid4().hex
    out = []
    for k, v in fields.items():
        out.append(f'--{boundary}\r\nContent-Disposition: form-data; name="{k}"\r\n\r\n{v}\r\n')
    pre = "".join(out).encode("utf-8")
    pre += (f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="{filename}"\r\n'
            f'Content-Type: text/plain\r\n\r\n').encode("utf-8")
    body = pre + content + f"\r\n--{boundary}--\r\n".encode("utf-8")
    return body, f"multipart/form-data; boundary={boundary}"


print("=" * 64)
print("冒烟开始")

# ── 1. 登录 ──
print("1. 登录 admin")
s, d = req("POST", "/auth/login", body={"account": "admin", "password": "admin"})
ticket = (d or {}).get("ticket", "")
check("登录 200 + ticket", s == 200 and bool(ticket), (s, d))
H = {"X-User-Id": "admin", "X-Alfresco-Ticket": ticket}

# 审计员会话（2026-09-05 #24 修复后 /audit/logs 仅审计员可查，操作日志断言改走审计员）
print("1b. 登录 shenji（security_auditor）")
s, d = req("POST", "/auth/login", body={"account": "shenji", "password": "123456"})
AUD_H = {"X-User-Id": "shenji", "X-Alfresco-Ticket": (d or {}).get("ticket", "")}
check("审计员登录 200", s == 200 and bool(AUD_H.get("X-Alfresco-Ticket")), (s, d))

# ── 2. 上传原始凭证件（数电票类 + 类型扩展字段） ──
print("2. 上传原始凭证件（vat-e-special-invoice 增值税电子专用发票）")
fields = {
    "fondsCode": "Z001", "voucherNo": "SMOKE-EP-0825-001", "archiveType": "凭证",
    "department": "财务部", "amount": "1250.50", "year": "2026", "month": "8",
    "retention": "10年", "source": "digital-native", "carrierType": "electronic",
    "preparer": "测试管理员", "voucherCategory": "原始凭证",
    "docTypeCode": "vat-e-special-invoice", "docTypeName": "增值税电子专用发票",
    "documentNo": "EP20260825001", "counterpartyName": "华北设备供应商有限公司",
    "counterpartyTaxId": "91110101MA01ABCD01", "summary": "采购生产设备一批",
    "amountUpper": "壹仟贰佰伍拾元伍角整", "businessCategory": "采购",
    "extFields": json.dumps({"invoiceCode": "031002000111", "invoiceAmount": "1250.50",
                             "requisitionNo": "WX-20260818"}, ensure_ascii=False),
}
raw, ctype = multipart(fields, "smoke-srcdoc.txt", b"smoke test 2026-08-25\n")
s, d = req("POST", "/records", raw=raw, ctype=ctype)
node_id = (d or {}).get("nodeId", "")
check("上传 200 + nodeId", s == 200 and bool(node_id), (s, d))
if s == 200:
    for k in ("voucherNo", "voucherCategory", "docTypeCode", "docTypeName",
              "documentNo", "srcDocCounterpartyTaxId", "srcDocAmountUpper",
              "srcDocBusinessCategory", "srcDocExtFields"):
        print(f"    {k} = {str(d.get(k))[:80]}")
    check("上传响应含 docTypeCode=vat-e-special-invoice", d.get("docTypeCode") == "vat-e-special-invoice", d)
    check("上传响应含 srcDocExtFields JSON", bool(d.get("srcDocExtFields")), d)

# ── 3. 读取回验 GET /records?scope=all&keyword= ──
print("3. 读取回验 scope=all")
q = urllib.parse.urlencode({"fondsCode": "Z001", "scope": "all",
                            "keyword": "SMOKE-EP-0825-001", "skipCount": 0, "maxItems": 5})
s, d = req("GET", f"/records?{q}")
items = (d or {}).get("items", [])
found = next((it for it in items if it.get("nodeId") == node_id), None)
check("列表检索命中测试件", found is not None, (s, d))
if found:
    print(f"    docTypeCode={found.get('docTypeCode')} docTypeName={found.get('docTypeName')}")
    check("回验 srcDoc* 字段完整", found.get("docTypeCode") == "vat-e-special-invoice"
          and bool(found.get("srcDocExtFields")) and bool(found.get("docTypeName")), found)

# ── 4. 件级元数据录入（组卷工作台 MetadataEntryModal 后端路径） ──
print(f"4. PUT /records/{node_id}/metadata 元数据补录")
s, d = req("PUT", f"/records/{node_id}/metadata",
           body={"remarks": "smoke-元数据录入-通过", "amount": 1250.5})
check("元数据录入 200 + remarks 生效", s == 200 and d.get("remarks") == "smoke-元数据录入-通过", (s, d))

# ── 5. 快速检测：报告列表 ──
print("5. GET /inspection/reports?limit=5")
s, d = req("GET", "/inspection/reports?limit=5")
rows = d if isinstance(d, list) else (d or {}).get("items", [])
check("检测报告列表 200", s == 200 and isinstance(rows, list), (s, d))
print(f"    reports rows={len(rows)}")
if rows:
    print(f"    sample keys={sorted(rows[0].keys())[:8]}")

# ── 6. 操作日志查询（上传应已留痕；#24 修复后仅审计员可查） ──
print("6. GET /audit/logs?action=上传建件（审计员会话）")
s, d = req("GET", "/audit/logs?" + urllib.parse.urlencode({"action": "上传建件", "limit": 5, "skip": 0}),
           headers=AUD_H)
logs = (d or {}).get("items", [])
hit = next((it for it in logs if "SMOKE-EP-0825-001" in str(it.get("target_label", ""))), None)
check("操作日志含上传留痕（审计员）", s == 200 and hit is not None, (s, d))
if hit:
    print(f"    {hit.get('ts')} {hit.get('actor_id')} {hit.get('action')} → {hit.get('target_label')} {hit.get('target')}")
    check("上传留痕 target=voucherNo（设计口径）", hit.get("target") == "SMOKE-EP-0825-001", hit)
# #24 三员分立回归：admin 查审计日志 → 403（2026-08-25 曾放宽为 admin 可查，2026-09-05 收紧）
s, d = req("GET", "/audit/logs?limit=5")
check("#24 admin 查审计日志 → 403（三员分立）", s == 403, (s, d))

# ── 7. 手动卷级检测（跑 Z001 第一卷；2026-09-05 改为挑非空草稿卷，避开历史空卷残留） ──
print("7. POST /inspection/run-volume（Z001 首个非空草稿卷）")
s, d = req("GET", "/volumes?fondsCode=Z001&status=draft")
vols = [v for v in (d if isinstance(d, list) else []) if (v.get("totalItems") or 0) > 0]
if not vols:
    print("    Z001 无非空草稿卷（跳过，非关键）")
else:
    vol_id = vols[0].get("nodeId") or vols[0].get("id")
    s2, d2 = req("POST", "/inspection/run-volume", body={"volumeId": vol_id})
    print(f"    volume={vol_id} status={s2} resp={json.dumps(d2, ensure_ascii=False)[:160]}")
    check("手动卷级检测 200 + 出报告", s2 == 200 and any(
        k in d2 for k in ("reportId", "report_id", "passed", "report")), (s2, d2))

# ── 8. 清理：逻辑删除测试件（回收站）+ 校验留痕 ──
print(f"8. 清理 DELETE /records/{node_id} → 回收站")
s, d = req("DELETE", f"/records/{node_id}")
check("逻辑删除 204", s == 204, (s, d))

print("=" * 64)
print(f"冒烟结束 PASS={PASS} FAIL={FAIL}")
raise SystemExit(0 if FAIL == 0 else 1)
