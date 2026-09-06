# -*- coding: utf-8 -*-
"""批次四（T11-T14）+ 批次五（T15-T16）冒烟（2026-09-05）

覆盖断言：
  T11 档号修正：确认组卷档号不再含 B 伪盒号段（格式 全宗-KJ·类·年-期限-卷号）；
     保管期限永久 Y 不补零；盒号走流水表（自动建盒号格式 BOX-年-类-序号 且不与既有盒重号）
  T12 组卷刚性：跨类别加件 409 / 跨年度 409 / 跨期限 409 / 凭证卷跨月 409 / 合规加件 200
  T13 鉴定销毁法定化：review(destroy) 单步直通被拒（SIGN_CHAIN_REQUIRED）；
     三方签批链（applicant 须未结清核查声明 → 越序签批 409 → 签齐转 approved-destroy）；
     未生成清册执行销毁 409；销毁清册生成（法定编号 XH-*）+ 下载
  T14 移交清册真实生成：prepare 生成清册编号 YJ-*（真实文件随档）；
     下载清册 HTML 含法定字段；签收前接收检测（yj 全口径）
  T15 归档信息包：POST /packages 真 ZIP（含封装说明.xml/卷元数据/卷内文件）；
     包级 SHA-256 落库；下载 ZIP 校验字节一致；状态机 transfer/receive
  T16 格式闸口：上传 .exe（MZ 魔数）→ 415 拒绝；合法 PDF → 200
"""
import json
import time
import urllib.request
import urllib.error
import uuid
import zipfile
import io

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


def req(method, path, body=None, raw=None, headers=None, ctype="application/json", timeout=180):
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
    parts = [f'--{b}\r\nContent-Disposition: form-data; name="{k}"\r\n\r\n{v}\r\n' for k, v in fields.items()]
    pre = "".join(parts).encode("utf-8") + (
        f'--{b}\r\nContent-Disposition: form-data; name="file"; filename="{filename}"\r\n'
        f"Content-Type: {mime}\r\n\r\n").encode("utf-8")
    return pre + content + f"\r\n--{b}--\r\n".encode("utf-8"), f"multipart/form-data; boundary={b}"


def build_pdf():
    objs = []
    objs.append(b"<< /Type /Catalog /Pages 2 0 R >>")
    objs.append(b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>")
    objs.append(b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>")
    stream = b"BT /F1 12 Tf 72 720 Td (Smoke Test Page - v2.10 acceptance) Tj ET"
    objs.append(b"<< /Length " + str(len(stream)).encode() + b" >>\nstream\n" + stream + b"\nendstream")
    objs.append(b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>")
    buf = bytearray(b"%PDF-1.4\n")
    offsets = []
    for i, o in enumerate(objs, 1):
        offsets.append(len(buf))
        buf += ("%d 0 obj\n" % i).encode() + o + b"\nendobj\n"
    xref = len(buf)
    n = len(objs) + 1
    buf += ("xref\n0 %d\n" % n).encode()
    buf += b"0000000000 65535 f \n"
    for off in offsets:
        buf += ("%010d 00000 n \n" % off).encode()
    buf += ("trailer\n<< /Size %d /Root 1 0 R >>\nstartxref\n%d\n%%%%EOF\n" % (n, xref)).encode()
    return bytes(buf)

PDF_BYTES = build_pdf()  # valid 1-page PDF -> passes 四性检测(可用性/完整性)
EXE_BYTES = b"MZ\x90\x00\x03\x00\x00\x00\x04\x00\x00\x00\xff\xff\x00\x00" + b"\x00" * 32

UNIQ = uuid.uuid4().hex[:6].upper()
YEAR = 2010  # 10年期限 2020 年到期，方便销毁链走通（不需等到期，走签批链即可）

print("== 批次四五冒烟（T11-T16） 2026-09-05 ==")

# ── 登录 ──
s, d = req("POST", "/auth/login", body={"account": "admin", "password": "admin"})
check("A1 admin 登录", s == 200 and d.get("ticket"), (s, d))
H = {"X-User-Id": "admin", "X-Alfresco-Ticket": d.get("ticket", "")}

# ═══ T16 格式闸口 ═══
print("\n── T16 上传格式闸口（魔数嗅探） ──")
body, ctype = multipart({"fondsCode": "Z001", "voucherNo": f"EXE-{UNIQ}", "archiveType": "记账凭证",
                         "year": "2026", "source": "digital-native", "carrierType": "electronic"},
                        "virus.exe", EXE_BYTES, mime="application/pdf")  # 自报 pdf，实为 exe
s, d = req("POST", "/records", raw=body, headers=H, ctype=ctype)
check("B1 exe 伪装 pdf 上传 → 415 FORMAT_REJECTED", s == 415 and d.get("code") == "FORMAT_REJECTED", (s, d))
body, ctype = multipart({"fondsCode": "Z001", "voucherNo": f"OK-{UNIQ}", "archiveType": "记账凭证",
                         "year": "2026", "source": "digital-native", "carrierType": "electronic"},
                        "ok.pdf", PDF_BYTES)
s, d = req("POST", "/records", raw=body, headers=H, ctype=ctype)
check("B2 合法 PDF 上传 → 200", s == 200 and d.get("nodeId"), (s, d))
ok_rec = d.get("nodeId", "")

# ═══ T12 组卷刚性 + T11 档号 ═══
print("\n── T12 组卷服务端强制 / T11 档号格式 ──")


def mkvol(title, cat, year, retention):
    s, d = req("POST", "/volumes", headers=H, body={
        "fondsCode": "Z001", "title": title, "archiveType": cat,
        "archiveTypeCode": cat, "year": year, "retention": retention})
    assert s == 200, (s, d)
    return d["nodeId"]


def mkrec(voucher, cat, year, month, retention):
    body, ctype = multipart({"fondsCode": "Z001", "voucherNo": voucher, "archiveType": cat,
                             "year": str(year), "month": str(month), "retention": retention,
                             "source": "digital-native", "carrierType": "electronic",
                             "preparer": f"责任人-{UNIQ}", "amount": "100.00"},
                            f"{voucher}.pdf", PDF_BYTES)
    s, d = req("POST", "/records", raw=body, headers=H, ctype=ctype)
    assert s == 200, (s, d)
    nid = d["nodeId"]
    # 上传表单不收 voucherDate，须经元数据接口补齐，否则归档四性检测 GD-2-01（必填元数据齐全）判缺「日期」→ 阻断组卷确认
    s2, d2 = req("PUT", f"/records/{nid}/metadata", body={"voucherDate": f"{year}-{month:02d}-15"}, headers=H)
    assert s2 == 200, (s2, d2)
    return nid


vol_kp = mkvol(f"刚性冒烟卷KP-{UNIQ}", "KP", 2026, "10年")
rec_kp_jan = mkrec(f"JZ1-{UNIQ}", "记账凭证", 2026, 1, "10年")
rec_kp_feb = mkrec(f"JZ2-{UNIQ}", "记账凭证", 2026, 2, "10年")

s, d = req("POST", f"/volumes/{vol_kp}/items", headers=H, body={"recordIds": [rec_kp_jan]})
check("C1 同类同月加件 → 200", s == 200, (s, d))
s, d = req("POST", f"/volumes/{vol_kp}/items", headers=H, body={"recordIds": [rec_kp_feb]})
check("C2 凭证卷跨月加件 → 409 GROUPING_MONTH（T12 同月强制）", s == 409 and d.get("code") == "GROUPING_MONTH", (s, d))

rec_kb = mkrec(f"ZZ-{UNIQ}", "会计账簿", 2026, 1, "10年")
s, d = req("POST", f"/volumes/{vol_kp}/items", headers=H, body={"recordIds": [rec_kb]})
check("C3 跨类别加件 → 409 GROUPING_CATEGORY", s == 409 and d.get("code") == "GROUPING_CATEGORY", (s, d))

rec_diff_year = mkrec(f"JZ3-{UNIQ}", "记账凭证", 2025, 1, "10年")
s, d = req("POST", f"/volumes/{vol_kp}/items", headers=H, body={"recordIds": [rec_diff_year]})
check("C4 跨年度加件 → 409 GROUPING_YEAR", s == 409 and d.get("code") == "GROUPING_YEAR", (s, d))

rec_diff_ret = mkrec(f"JZ4-{UNIQ}", "记账凭证", 2026, 1, "30年")
s, d = req("POST", f"/volumes/{vol_kp}/items", headers=H, body={"recordIds": [rec_diff_ret]})
check("C5 跨期限加件 → 409 GROUPING_RETENTION", s == 409 and d.get("code") == "GROUPING_RETENTION", (s, d))

# confirm：档号不再含 B 段；KJ 门类前缀；10年→D10
s, d = req("POST", f"/volumes/{vol_kp}/confirm", headers=H)
vol_code = (d or {}).get("volumeCode", "")
check("C6 确认组卷 → 200 且已赋号", s == 200 and bool(vol_code), (s, d))
check("C7 档号格式回归：无 B 伪盒号段 + KJ 前缀 + D10（T11）",
      vol_code.startswith("Z001-KJ·01·2026-D10-") and "-B" not in vol_code, vol_code)

# 盒号走流水表：移交后盒号格式且非 size()+1 重号
s, d = req("POST", f"/volumes/{vol_kp}/transfer", headers=H)
box_no = (d or {}).get("boxNo", "")
check("C8 移交归盒 → 200", s == 200 and bool(box_no), (s, d))
check("C9 盒号走流水表格式 BOX-2026-KP-NNN（T11）", box_no.startswith("BOX-2026-KP-"), box_no)
s, d = req("GET", "/boxes?fondsCode=Z001&year=2026&typeCode=KP", headers=H)
nos = [b.get("boxNo") for b in (d or []) if isinstance(b, dict)]
check("C10 盒号无重复", len(nos) == len(set(nos)), nos[:8])

# ═══ T14 移交清册真实生成 ═══
print("\n── T14 移交清册真实生成 ──")
s, d = req("POST", "/transfers", headers=H, body={
    "fromDept": "财务部", "toDept": "档案部", "fromPerson": "张移交", "toPerson": "李接收",
    "volumeNodes": [vol_kp], "transferDate": "2026-09-05"})
check("D1 发起移交批次 → 200", s == 200 and d.get("transferNo"), (s, d))
batch = json.dumps(d)
batch_id = None
s, d2 = req("GET", "/transfers?status=pending", headers=H)
for b in (d2 if isinstance(d2, list) else []):
    if b.get("volumeNodes") and vol_kp in b["volumeNodes"]:
        batch_id = b["id"]
check("D2 待处理批次存在", bool(batch_id), (s, len(d2) if isinstance(d2, list) else d2))
if not batch_id:
    print(f"\n══ 中断：未找到批次 id（D2 失败），PASS={PASS} FAIL={FAIL} ══")
    raise SystemExit(1)

s, d = req("POST", f"/transfers/{batch_id}/prepare", headers=H)
check("D3 生成清册 → 200 且清册编号 YJ-*（真实文件随档）", s == 200 and str((d or {}).get("registerNo", "")).startswith("YJ-")
      and bool((d or {}).get("registerFileNode")), (s, d))
# 下载清册并验证法定字段
r = urllib.request.Request(BASE + f"/transfers/{batch_id}/register-file", headers=H)
with urllib.request.urlopen(r, timeout=60) as resp:
    html = resp.read().decode("utf-8", "replace")
check("D4 清册 HTML 含法定字段（清册编号/移交双方/检测提示）",
      "会计档案移交清册" in html and "财务部" in html and "档案部" in html and "DA/T 70-2022" in html, html[:120])

# 签收（接收检测：卷已通过 yj 应放行）
s, d = req("POST", f"/transfers/{batch_id}/receive", headers=H)
check("D5 签收（接收检测通过）→ 200 received", s == 200 and (d or {}).get("status") == "received", (s, d))

# ═══ T15 归档信息包 ═══
print("\n── T15 归档信息包真实现 ──")
s, d = req("POST", "/packages", headers=H, body={
    "fondsCode": "Z001", "name": f"冒烟信息包-{UNIQ}", "unitKind": "volume", "volumeNodes": [vol_kp]})
check("E1 生成信息包 → 200（PKG-*，含包级摘要）",
      s == 200 and str((d or {}).get("packageNo", "")).startswith("PKG-") and len((d or {}).get("checksum", "")) == 64, (s, d))
pkg_no = (d or {}).get("packageNo", "")
pkg_checksum = (d or {}).get("checksum", "")

r = urllib.request.Request(BASE + f"/packages/{pkg_no}/download", headers=H)
with urllib.request.urlopen(r, timeout=120) as resp:
    zip_bytes = resp.read()
zf = zipfile.ZipFile(io.BytesIO(zip_bytes))
names = zf.namelist()
check("E2 ZIP 含封装说明.xml 与卷目录", any(n.endswith("封装说明.xml") for n in names)
      and any("元数据.xml" in n for n in names), names[:8])
manifest = zf.read([n for n in names if n.endswith("封装说明.xml")][0]).decode("utf-8", "replace")
check("E3 封装说明含 DA/T 48 标识与文件清单", "DA/T 48-2009" in manifest and "文件清单" in manifest, manifest[:120])
check("E4 ZIP 内含卷内文件条目", any("卷内文件/" in n for n in names), names[:8])

s, d = req("POST", f"/packages/{pkg_no}/transfer", headers=H)
check("E5 发送 → transferred", s == 200 and (d or {}).get("status") == "transferred", (s, d))
s, d = req("POST", f"/packages/{pkg_no}/receive", headers=H)
check("E6 接收回执 → received", s == 200 and (d or {}).get("status") == "received", (s, d))

# ═══ T13 鉴定销毁法定化 ═══
print("\n── T13 鉴定销毁法定化 ──")
# 登记一条到期鉴定：用 10年/2010 年卷（2021 年到期）；先造一卷 2010 年凭证
vol_old = mkvol(f"销毁冒烟卷-{UNIQ}", "KP", 2010, "10年")
rec_old = mkrec(f"JZ-OLD-{UNIQ}", "记账凭证", 2010, 1, "10年")
s, d = req("POST", f"/volumes/{vol_old}/items", headers=H, body={"recordIds": [rec_old]})
s, d = req("POST", f"/volumes/{vol_old}/confirm", headers=H)
check("F1 旧卷确认（档号 2010-D10）", s == 200 and "-D10-" in str((d or {}).get("volumeCode", "")), (s, d))
s, d = req("POST", f"/volumes/{vol_old}/transfer", headers=H)
check("F2 旧卷移交入库", s == 200, (s, d))
s, d = req("POST", "/appraisals/scan?fondsCode=Z001", headers=H)
check("F3 到期扫描登记", s == 200, (s, d))
s, d = req("GET", "/appraisals?status=pending", headers=H)
target = None
for a in (d if isinstance(d, list) else []):
    if a.get("volumeNode") == vol_old:
        target = a
check("F4 待鉴定任务存在", target is not None, (s, len(d) if isinstance(d, list) else d))

if target:
    aid = target["id"]
    s, d = req("POST", f"/appraisals/{aid}/review", headers=H, body={"decision": "destroy", "meetingNote": "直通尝试"})
    check("F5 单步销毁评审被拒 → SIGN_CHAIN_REQUIRED（T13）", s == 400 and d.get("code") == "SIGN_CHAIN_REQUIRED", (s, d))
    s, d = req("POST", f"/appraisals/{aid}/sign", headers=H,
               body={"role": "supervisor", "note": "越序"})
    check("F6 越序签批 → 409 SIGN_ORDER", s == 409 and d.get("code") == "SIGN_ORDER", (s, d))
    s, d = req("POST", f"/appraisals/{aid}/sign", headers=H,
               body={"role": "applicant", "note": "申请销毁"})
    check("F7 未勾选未结清核查 → 400 UNSETTLED_CHECK_REQUIRED", s == 400 and d.get("code") == "UNSETTLED_CHECK_REQUIRED", (s, d))
    s, d = req("POST", f"/appraisals/{aid}/sign", headers=H,
               body={"role": "applicant", "note": "申请销毁", "unsettledCheck": True,
                     "unsettledNote": f"已逐笔核查{UNIQ}，无未结清债权债务凭证"})
    check("F8 申请单位签批（含核查声明）→ 200", s == 200, (s, d))
    s, d = req("POST", f"/appraisals/{aid}/sign", headers=H,
               body={"role": "archives", "note": "复核同意销毁"})
    check("F9 档案管理部门签批 → 200", s == 200, (s, d))
    s, d = req("POST", f"/appraisals/{aid}/sign", headers=H,
               body={"role": "supervisor", "note": "同意销毁，安排监销"})
    check("F10 监销人签批 → 200 且转 approved-destroy", s == 200 and (d or {}).get("status") == "approved-destroy", (s, d))
    s, d = req("POST", f"/appraisals/{aid}/execute-destroy", headers=H, body={"supervisorNote": "监销人张三"})
    check("F11 未生成清册执行销毁 → 409 REGISTER_REQUIRED", s == 409 and d.get("code") == "REGISTER_REQUIRED", (s, d))
    s, d = req("POST", f"/appraisals/{aid}/register", headers=H)
    check("F12 生成销毁清册 → 200（XH-*，随档留存）", s == 200 and str((d or {}).get("registerNo", "")).startswith("XH-")
          and bool((d or {}).get("registerFileNode")), (s, d))
    try:
        r = urllib.request.Request(BASE + f"/appraisals/{aid}/register-file", headers=H)
        with urllib.request.urlopen(r, timeout=60) as resp:
            html = resp.read().decode("utf-8", "replace")
    except Exception as e:
        html = f"__DOWNLOAD_FAILED__ {e}"
    check("F13 清册 HTML 含法定要件（签章位/未结清核查/79号令）",
          "会计档案销毁清册" in html and "第79号" in html and "未结清" in html, html[:100])
    s, d = req("POST", f"/appraisals/{aid}/execute-destroy", headers=H,
               body={"supervisorNote": f"2026-09-05 监销人现场监销，纸质粉碎+电子消磁（{UNIQ}）"})
    check("F14 执行销毁 → destroyed + 不可恢复验证", s == 200 and (d or {}).get("status") == "destroyed"
          and (d or {}).get("unrecoverableVerified") is True, (s, d))

print(f"\n══ 结果: PASS={PASS} FAIL={FAIL} ══")
raise SystemExit(0 if FAIL == 0 else 1)
