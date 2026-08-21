# -*- coding: utf-8 -*-
"""回收站恢复链路诊断（只读 + 一次性写件验证，验证完彻底删除测试件）"""
import json, urllib.request, urllib.error, uuid

BASE = "http://localhost:8081/api"
ALF = "http://localhost:8080/alfresco/api/-default-/public/alfresco/versions/1"

def call(method, url, headers=None, body=None, base=BASE, raw=None, ctype=None):
    req = urllib.request.Request(base + url, method=method)
    for k, v in (headers or {}).items():
        req.add_header(k, v)
    data = raw
    if body is not None:
        data = json.dumps(body).encode("utf-8")
        req.add_header("Content-Type", "application/json;charset=UTF-8")
    if ctype:
        req.add_header("Content-Type", ctype)
    try:
        with urllib.request.urlopen(req, data, timeout=30) as r:
            text = r.read().decode("utf-8", "replace")
            try: return r.status, json.loads(text) if text else {}
            except Exception: return r.status, text
    except urllib.error.HTTPError as e:
        text = e.read().decode("utf-8", "replace")
        try: return e.code, json.loads(text) if text else {}
        except Exception: return e.code, text

def alf_get(path, ticket):
    return call("GET", f"{path}{'&' if '?' in path else '?'}alf_ticket={ticket}", base=ALF)

s, b = call("POST", "/auth/login", body={"account": "admin", "password": "admin"})
assert s == 200, (s, b)
ticket = b["ticket"]
H = {"X-User-Id": "admin", "X-Alfresco-Ticket": ticket}
print("== 登录 OK ==")

# ── 1. 回收站现状 ──
s, b = call("GET", "/records/recycle?fondsCode=Z001", H)
print(f"\n== 回收站（{s}）==")
recycle = b if isinstance(b, list) else []
for it in recycle:
    print(f"  {it['nodeId']}  {it.get('name')}  deletedAt={it.get('deletedAt')!r}  deletedBy={it.get('deletedBy')!r}")
if not recycle:
    print("  （空）")

# ── 2. 收集池现状 ──
s, b = call("GET", "/records?fondsCode=Z001&maxItems=200", H)
pool = b.get("items", []) if isinstance(b, dict) else []
print(f"\n== 收集池（{s}, total={b.get('totalItems') if isinstance(b, dict) else '?'}）==")
for it in pool[:10]:
    print(f"  {it['nodeId'][:12]}…  {it.get('name')}  deleted={it.get('deletedAt')!r}")

# ── 3. 回收站首件的 Alfresco 原始属性（确认 finance:deleted 存的是什么）──
if recycle:
    nid = recycle[0]["nodeId"]
    s, nb = alf_get(f"/nodes/{nid}?include=properties,path", ticket)
    e = nb.get("entry", {}) if isinstance(nb, dict) else {}
    props = e.get("properties", {})
    print(f"\n== 回收站首件 {nid} Alfresco 原始值 ==")
    print(f"  path: {e.get('path', {}).get('name')}")
    print(f"  finance:deleted   = {props.get('finance:deleted')!r}")
    print(f"  finance:deletedBy = {props.get('finance:deletedBy')!r}")
    print(f"  finance:recordStatus = {props.get('finance:recordStatus')!r}")

# ── 4. 端到端：建一个测试件 → 删除 → 恢复 → 看池里有没有 ──
print("\n== 端到端复现（测试件，验完清除）==")
boundary = uuid.uuid4().hex
fname = "zz-recycle-repro.txt"
fcontent = b"recycle repro test content"
fields = {"fondsCode": "Z001", "voucherNo": "记-REPRO-001", "archiveType": "记账凭证",
          "year": "2026", "month": "8", "retention": "30年",
          "source": "digital-native", "carrierType": "electronic"}
parts = []
for k, v in fields.items():
    parts.append(f"--{boundary}\r\nContent-Disposition: form-data; name=\"{k}\"\r\n\r\n{v}\r\n".encode())
parts.append(f"--{boundary}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"{fname}\"\r\nContent-Type: text/plain\r\n\r\n".encode() + fcontent + b"\r\n")
parts.append(f"--{boundary}--\r\n".encode())
raw = b"".join(parts)
s, b = call("POST", "/records", H, raw=raw, ctype=f"multipart/form-data; boundary={boundary}")
if s != 200:
    print(f"  建测试件失败: {s} {b}")
    raise SystemExit(1)
nid = b["nodeId"]
print(f"  ① 建件 OK: {nid}")

s, b = call("DELETE", f"/records/{nid}", H)
print(f"  ② 删除入回收站: {s}")

s, b = alf_get(f"/nodes/{nid}?include=properties,path", ticket)
e = b.get("entry", {}); props = e.get("properties", {})
print(f"     删除后: path={e.get('path', {}).get('name')}  deleted={props.get('finance:deleted')!r}")

s, b = call("POST", f"/records/recycle/{nid}/restore", H, body={})
print(f"  ③ 恢复: {s} {b if s != 200 else 'OK'}")

s, b = alf_get(f"/nodes/{nid}?include=properties,path", ticket)
if s == 200:
    e = b.get("entry", {}); props = e.get("properties", {})
    print(f"     恢复后: path={e.get('path', {}).get('name')}")
    print(f"            finance:deleted   = {props.get('finance:deleted')!r}  ← 关键")
    print(f"            finance:deletedBy = {props.get('finance:deletedBy')!r}")
    print(f"            finance:recordStatus = {props.get('finance:recordStatus')!r}")

s, b = call("GET", "/records?fondsCode=Z001&maxItems=200", H)
pool2 = b.get("items", []) if isinstance(b, dict) else []
in_pool = any(it["nodeId"] == nid for it in pool2)
print(f"  ④ 恢复后池列表含此件: {in_pool}（total={b.get('totalItems') if isinstance(b, dict) else '?'}）")

# ── 5. purge 端点应已移除（v2.6.1）──
s, b = call("DELETE", f"/records/recycle/{nid}", H)
print(f"  ⑤ purge 端点已移除: {s}（期望 404/405）")

# ── 6. 清理测试件（Alfresco 底层永久删除，绕过业务层——仅测试清理用）──
s, b = call("DELETE", f"/nodes/{nid}?permanent=true&alf_ticket={ticket}", base=ALF)
print(f"  ⑥ 测试件清理: {s}")
