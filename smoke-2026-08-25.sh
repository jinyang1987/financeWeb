#!/bin/bash
# 端到端冒烟：原始凭证 srcDoc* 元数据 / 件级元数据录入 / 快速检测 / 操作日志（2026-08-25）
BASE="http://localhost:8081/api"
PY=py

say()  { echo; echo "== $* =="; }
jget() { $PY -c "import json,sys; d=json.load(sys.stdin); print(d.get('$1',''))" 2>/dev/null; }
jpath() { $PY -c "import json,sys; d=json.load(sys.stdin); v=d
for k in $1.split('.'):
    v = v[k] if isinstance(v,dict) else None
print(v if v is not None else '')" 2>/dev/null; }

echo "Smoke start $(date +%H:%M:%S)"

# ── 1. 登录 ──
say "1. 登录 admin"
LOGIN=$(curl -s -X POST "$BASE/auth/login" -H 'Content-Type: application/json' -d '{"account":"admin","password":"admin"}')
T=$(echo "$LOGIN" | jget ticket)
[ -z "$T" ] && { echo "FATAL: 登录失败: $LOGIN"; exit 1; }
echo "OK ticket=${T:0:16}…"

# ── 2. 上传原始凭证件（带 docType* + 类型扩展字段） ──
say "2. 上传原始凭证件（数电票类）"
echo "smoke test file 2026-08-25" > /tmp/smoke-srcdoc.txt
UPLOAD=$(curl -s -X POST "$BASE/records" \
  -H "X-User-Id: admin" -H "X-Alfresco-Ticket: $T" \
  -F "file=@/tmp/smoke-srcdoc.txt" \
  -F "fondsCode=Z001" -F "voucherNo=SMOKE-EP-0825-001" -F "archiveType=凭证" -F "department=财务部" \
  -F "amount=1250.50" -F "year=2026" -F "month=8" -F "retention=10年" \
  -F "source=digital-native" -F "carrierType=electronic" -F "preparer=测试管理员" \
  -F "voucherCategory=原始凭证" \
  -F "docTypeCode=vat-e-special-invoice" -F "docTypeName=增值税电子专用发票" \
  -F "documentNo=EP20260825001" -F "counterpartyName=华北设备供应商有限公司" \
  -F "counterpartyTaxId=91110101MA01ABCD01" -F "summary=采购生产设备一批" \
  -F "amountUpper=壹仟贰佰伍拾元伍角整" -F "businessCategory=采购支出" \
  -F 'extFields={"invoiceCode":"031002000111","invoiceAmount":"1250.50","requisitionNo":"WX-20260818"}')
NODE_ID=$(echo "$UPLOAD" | jget nodeId)
echo "$UPLOAD" | $PY -m json.tool 2>/dev/null | grep -E "nodeId|docType|srcDoc|voucherNo|voucherCategory|extFields" | head -14
[ -z "$NODE_ID" ] && { echo "FATAL: 上传失败: $UPLOAD"; exit 1; }
echo "NODE_ID=$NODE_ID"

# ── 3. 读取回验（scope=all 检索） ──
say "3. 读取回验 GET /records?scope=all&keyword=SMOKE-EP-0825-001"
LIST=$(curl -s -G "$BASE/records" --data-urlencode "fondsCode=Z001" \
  --data-urlencode "scope=all" --data-urlencode "keyword=SMOKE-EP-0825-001" \
  --data-urlencode "skipCount=0" --data-urlencode "maxItems=5" \
  -H "X-User-Id: admin" -H "X-Alfresco-Ticket: $T")
echo "$LIST" | $PY -c "
import json,sys
d=json.load(sys.stdin)
items = d.get('items') or d.get('rows') or d.get('list') or []
print('total=%s items=%d' % (d.get('total','?'), len(items)))
for it in items[:2]:
    keys = [k for k in ('nodeId','id','voucherNo','docTypeCode','docTypeName','srcDocExtFields','voucherCategory') if it.get(k)]
    print({k: (str(it[k])[:60]) for k in keys})
" 2>&1

# ── 4. 件级元数据录入（PUT /records/{id}/metadata，组卷工作台入口） ──
say "4. PUT /records/$NODE_ID/metadata 元数据补录"
META=$(curl -s -X PUT "$BASE/records/$NODE_ID/metadata" \
  -H "X-User-Id: admin" -H "X-Alfresco-Ticket: $T" -H 'Content-Type: application/json' \
  -d '{"remarks":"smoke-元数据录入-通过","amount":1250.5}')
echo "$META" | $PY -c "import json,sys; d=json.load(sys.stdin); print('ok', {k:d.get(k) for k in ('nodeId','remarks','amount') if k in d})" 2>&1

# ── 5. 快速检测：报告列表 + 手动卷级检测 ──
say "5. GET /inspection/reports?limit=5"
REP=$(curl -s -G "$BASE/inspection/reports" --data-urlencode "limit=5" \
  -H "X-User-Id: admin" -H "X-Alfresco-Ticket: $T")
echo "$REP" | $PY -c "
import json,sys
d=json.load(sys.stdin)
items = d.get('items') or d.get('rows') or d if isinstance(d,list) else d.get('items') or []
n = len(items) if isinstance(items,list) else 0
print('reports rows=%d' % n)
if n: print('sample:', {k:(str(items[0].get(k))[:40]) for k in ('target_node','target_kind','phase','real','complete','usable','safe')})
" 2>&1

# ── 6. 操作日志查询 ──
say "6. GET /audit/logs?action=上传建件"
LOG=$(curl -s -G "$BASE/audit/logs" --data-urlencode "action=上传建件" --data-urlencode "limit=5" \
  -H "X-User-Id: admin" -H "X-Alfresco-Ticket: $T")
echo "$LOG" | $PY -c "
import json,sys
d=json.load(sys.stdin)
items=d.get('items',[]); print('total=%d rows=%d' % (d.get('total',0), len(items)))
for it in items[:3]:
    print({k:str(it.get(k))[:50] for k in ('ts','actor_id','action','target_label','detail')})
" 2>&1

# ── 7. 手动卷级检测（跑一卷） ──
say "7. POST /inspection/run-volume（取 Z001 第一卷）"
VOL=$(curl -s -G "$BASE/volumes" --data-urlencode "fondsCode=Z001" --data-urlencode "status=draft" \
  -H "X-User-Id: admin" -H "X-Alfresco-Ticket: $T" | $PY -c "import json,sys; d=json.load(sys.stdin); v=d[0] if isinstance(d,list) and d else None; print(v.get('nodeId') or v.get('id','') if v else '')" 2>/dev/null)
if [ -z "$VOL" ]; then echo "Z001 无草稿卷，跳过（非关键）"; else
RV=$(curl -s -X POST "$BASE/inspection/run-volume" \
  -H "X-User-Id: admin" -H "X-Alfresco-Ticket: $T" -H 'Content-Type: application/json' \
  -d "{\"volumeId\":\"$VOL\"}")
echo "$RV" | $PY -c "import json,sys; d=json.load(sys.stdin); print('result:', {k:str(d.get(k))[:60] for k in ('reportId','report_id','passed','ok','message') if k in d})" 2>&1
fi

# ── 8. 清理：逻辑删除测试件（回收站） ──
say "8. 清理 DELETE /records/$NODE_ID → 回收站"
CODE=$(curl -s -o /dev/null -w "%{http_code}" -X DELETE "$BASE/records/$NODE_ID" \
  -H "X-User-Id: admin" -H "X-Alfresco-Ticket: $T")
echo "delete http_code=$CODE"

echo; echo "Smoke done $(date +%H:%M:%S)"
