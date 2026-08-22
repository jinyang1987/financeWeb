# -*- coding: utf-8 -*-
"""回收站单元化验证：建 1 凭证 + 2 原始凭证 → 挂接 → 全删入回收站 → 验证回收站列表带 parentRecordId/voucherCategory"""
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

s, b = call("POST", "/auth/login", body={"account": "admin", "password": "admin"})
ticket = b["ticket"]
H = {"X-User-Id": "admin", "X-Alfresco-Ticket": ticket}
print("登录 OK")

def create(fname, vno, vcat=None):
    boundary = uuid.uuid4().hex
    fields = {"fondsCode": "Z001", "voucherNo": vno, "archiveType": "记账凭证",
              "year": "2026", "month": "8", "retention": "30年",
              "source": "digital-native", "carrierType": "electronic"}
    if vcat: fields["voucherCategory"] = vcat
    parts = []
    for k, v in fields.items():
        parts.append(f"--{boundary}\r\nContent-Disposition: form-data; name=\"{k}\"\r\n\r\n{v}\r\n".encode())
    parts.append(f"--{boundary}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"{fname}\"\r\nContent-Type: text/plain\r\n\r\n".encode() + b"unit test" + b"\r\n")
    parts.append(f"--{boundary}--\r\n".encode())
    s, b = call("POST", "/records", H, raw=b"".join(parts), ctype=f"multipart/form-data; boundary={boundary}")
    assert s == 200, (s, b)
    return b["nodeId"]

vid = create("zz-unit-v.txt", "记-UNIT-900")
s1 = create("zz-unit-s1.txt", "原始-UNIT-901", "原始凭证")
s2 = create("zz-unit-s2.txt", "原始-UNIT-902", "原始凭证")
print(f"建件 OK: 凭证={vid[:8]} 附件1={s1[:8]} 附件2={s2[:8]}")

for sid in (s1, s2):
    s, b = call("PUT", f"/records/{sid}/parent", H, body={"parentRecordId": vid})
    assert s == 200, (s, b)
print("挂接 OK")

for nid in (s1, s2, vid):
    s, b = call("DELETE", f"/records/{nid}", H)
    assert s == 204, (s, b)
print("三件已入回收站")

s, b = call("GET", "/records/recycle?fondsCode=Z001", H)
print("\n== 回收站列表（单元字段核验）==")
ok = True
for it in b:
    print(f"  {it.get('voucherNo')!r:18} voucherCategory={it.get('voucherCategory')!r} parentRecordId={it.get('parentRecordId') or '-'}")
for it in b:
    if it.get("voucherNo") in ("原始-UNIT-901", "原始-UNIT-902"):
        if it.get("voucherCategory") != "原始凭证" or it.get("parentRecordId") != vid:
            ok = False
if ok:
    print("  ✔ 附件行 voucherCategory/parentRecordId 完整（前端单元分组可用）")
else:
    print("  ✘ 字段缺失！前端无法按件分组")

# 恢复整件 → 池内应三件齐备且挂接关系保留
for nid in (vid, s1, s2):
    s, b = call("POST", f"/records/recycle/{nid}/restore", H, body={})
    assert s == 200, (s, b)
s, b = call("GET", "/records?fondsCode=Z001&maxItems=200", H)
pool = {it["nodeId"]: it for it in b.get("items", [])}
back = all(n in pool for n in (vid, s1, s2))
link_kept = pool.get(s1, {}).get("parentRecordId") == vid and pool.get(s2, {}).get("parentRecordId") == vid
print(f"\n== 恢复后：三件在池={back}，挂接关系保留={link_kept} ==")

# 清理（底层永久删除，仅测试件）
for nid in (vid, s1, s2):
    s, b = call("DELETE", f"/nodes/{nid}?permanent=true&alf_ticket={ticket}", base=ALF)
print("清理:", "OK" if s == 204 else s)
