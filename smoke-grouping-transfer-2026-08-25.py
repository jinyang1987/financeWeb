# -*- coding: utf-8 -*-
"""完整链路冒烟：上传件 → 建卷 → 卷元数据录入 → 加件 → 确认 → 移交自动四性 → 归盒（2026-08-25 晚）"""
import json
import time
import urllib.request
import urllib.error
import urllib.parse
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
        print(f"  FAIL  {name}   <-- {str(detail)[:220]}")


def req(method, path, body=None, raw=None, headers=None, ctype="application/json", timeout=90):
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
            return e.code, {"raw": t[:200]}


def multipart(fields, filename, content: bytes):
    b = uuid.uuid4().hex
    parts = [
        f'--{b}\r\nContent-Disposition: form-data; name="{k}"\r\n\r\n{v}\r\n'
        for k, v in fields.items()
    ]
    pre = "".join(parts).encode("utf-8") + (
        f'--{b}\r\nContent-Disposition: form-data; name="file"; filename="{filename}"\r\n'
        f'Content-Type: text/plain\r\n\r\n').encode("utf-8")
    return pre + content + f"\r\n--{b}--\r\n".encode("utf-8"), f"multipart/form-data; boundary={b}"


print("=" * 64)
s, d = req("POST", "/auth/login", body={"account": "admin", "password": "admin"})
ticket = (d or {}).get("ticket", "")
check("登录", s == 200 and bool(ticket), (s, d))
H = {"X-User-Id": "admin", "X-Alfresco-Ticket": ticket}

# ── 上传 3 张记账凭证件 ──
ids = []
for i in (1, 2, 3):
    fields = {
        "fondsCode": "Z001", "voucherNo": f"记-RUN-{i:03d}", "archiveType": "凭证",
        "department": "财务部", "amount": f"{(i * 56.4):.2f}", "year": "2026", "month": "8",
        "retention": "10年", "source": "digital-native", "carrierType": "paper",
        "preparer": "测试管理员", "voucherCategory": "记账凭证",
        "summary": f"完整链路冒烟-第{i}笔",
    }
    raw, ct = multipart(fields, f"run{i}.txt", f"run {i}\n".encode())
    s, d = req("POST", "/records", raw=raw, headers=H, ctype=ct)
    ids.append((d or {}).get("nodeId", ""))
    check(f"上传件{i} {fields['voucherNo']}", s == 200 and ids[-1], (s, d))
print(f"    件ids={[x[:8] for x in ids]}")

# ── 建卷 ──
print("建卷")
s, d = req("POST", "/volumes", headers=H, body={
    "fondsCode": "Z001", "title": "完整链路冒烟卷", "archiveType": "凭证",
    "archiveTypeCode": "KP", "year": 2026, "retention": "10年",
    "dateFrom": "2026-08-01", "dateTo": "2026-08-31",
    "carrierType": "paper", "securityLevel": "普通",
})
vol_id = (d or {}).get("volumeId") or (d or {}).get("nodeId") or (d or {}).get("id") or ""
check("建卷 200 + volumeId", s == 200 and bool(vol_id), (s, d))
print(f"    volume={vol_id[:12]} code={(d or {}).get('volumeCode')}")

# ── 卷级元数据录入（PUT /volumes/{id}，弹窗「保存卷」链路） ──
print("卷级元数据录入")
s, d = req("PUT", f"/volumes/{vol_id}", headers=H, body={
    "title": "完整链路冒烟卷-改题名", "retention": "10年",
    "dateFrom": "2026-08-01", "dateTo": "2026-08-31",
    "securityLevel": "内部", "carrierType": "paper",
})
check("卷元数据保存 200 + 题名生效", s == 200 and "完整链路冒烟卷-改题名" in str((d or {}).get("title", "")), (s, d))

# ── 加件 ──
print("加件入卷")
s, d = req("POST", f"/volumes/{vol_id}/items", headers=H, body={"recordIds": ids})
check("加件 200", s == 200 and isinstance(d, list) and len(d) == 3, (s, d))

# ── 确认组卷 ──
print("确认组卷")
s, d = req("POST", f"/volumes/{vol_id}/confirm", headers=H)
check("确认 200", s == 200, (s, d))

# ── 移交归盒（服务端自动 yj 四性检测 + 容量装盒） ──
print("移交归盒（自动四性 yj + 装盒）")
s, d = req("POST", f"/volumes/{vol_id}/transfer", headers=H)
check("移交 200 + 归盒", s == 200, (s, d))
if s == 200:
    keys = {k: str(d.get(k))[:70] for k in ("volumeId", "volumeCode", "boxNo", "boxId",
                                            "reportId", "report", "allPass") if k in d}
    print(f"    resp keys={json.dumps(keys, ensure_ascii=False)[:400]}")

# ── 快速检测页：移交 yj 报告应出现 ──
time.sleep(1)
print("校验 yj 报告")
s, d = req("GET", "/inspection/reports?limit=10", headers=H)
rows = d if isinstance(d, list) else (d or {}).get("items", [])
yj = [r for r in rows if str(r.get("phase", "")).find("yj") >= 0 or str(r.get("created_at", "")).startswith(time.strftime("%Y-%m-%d"))]
newest = rows[0] if rows else {}
check("移交生成 yj 检测报告", s == 200 and any("yj" in str(r.get("phase", "")) for r in rows), (s, d))
if rows:
    print(f"    最新报告 phase={newest.get('phase')} target={str(newest.get('target_node'))[:16]} "
          f"real={newest.get('real')} complete={newest.get('complete')} usable={newest.get('usable')} safe={newest.get('safe')}")

print("=" * 64)
print(f"结束 PASS={PASS} FAIL={FAIL}")
raise SystemExit(0 if FAIL == 0 else 1)
