// 2026-08-16 贯通修复专项冒烟：scope=all / 移交批次 / 鉴定销毁 / 盒写端点 / 审计验链 / 批量四性
// 前置：ams-server(:8081) + Alfresco(:8080) + PG 运行中
import fs from 'node:fs';

const BASE = 'http://localhost:8081/api';
const FILE = 'D:/workspace/alfresco/seed/test-voucher.pdf';
const RUN = new Date().toISOString().replace(/\D/g, '').slice(6, 14); // 运行唯一后缀 MMDDHHmmss

const login = await fetch(`${BASE}/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ account: 'admin', password: 'admin' }),
}).then(r => r.json());
const headers = { 'X-User-Id': 'admin', 'X-Alfresco-Ticket': login.ticket };
const J = { ...headers, 'Content-Type': 'application/json' };

let pass = 0, fail = 0;
const ok = (label, cond, extra = '') => {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label} ${extra}`); }
};
const get = (p) => fetch(`${BASE}${p}`, { headers }).then(r => r.json());
const post = (p, body) => fetch(`${BASE}${p}`, { method: 'POST', headers: J, body: body ? JSON.stringify(body) : undefined }).then(async r => ({ status: r.status, body: r.status === 204 ? null : await r.json().catch(() => null) }));

console.log('① 登录 OK:', login.user.name);

// ── A. scope=all：建件→组卷→确认→归盒，全程验证读侧口径 ──
console.log('\n[A] scope=all 全量件口径');
const mk = async (voucherNo) => {
  const fd = new FormData();
  fd.append('file', new Blob([fs.readFileSync(FILE)], { type: 'application/pdf' }), `${voucherNo}.pdf`);
  fd.append('fondsCode', 'Z001');
  fd.append('voucherNo', voucherNo);
  fd.append('archiveType', '记账凭证');
  fd.append('department', '财务部');
  fd.append('amount', '777.01');
  fd.append('year', '2020');          // 老年度 → 30年期限下 2051 期满（不干扰鉴定到期测算）
  fd.append('retention', '30年');
  fd.append('source', 'digital-native');
  fd.append('carrierType', 'electronic');
  const r = await fetch(`${BASE}/records`, { method: 'POST', headers, body: fd });
  return r.json();
};
const recA = await mk('审记-181647-A');
const recB = await mk('审记-181647-B');
ok('建件 2 件', recA.nodeId && recB.nodeId);
ok('建件即带归属字段（空串）', recA.volumeId === '' && recA.boxId === '');

const allPool = await get('/records?fondsCode=Z001&scope=all&maxItems=5000');
ok('scope=all 含池件', allPool.items.some(i => i.nodeId === recA.nodeId));

// 建卷→加件→确认（赋号）→移交归盒
const vol = await post('/volumes', { fondsCode: 'Z001', title: `贯通审计测试卷-${RUN}`, archiveType: '记账凭证', archiveTypeCode: 'KP', year: 2020, retention: '30年' }).then(r => r.body);
ok('建卷', !!vol.nodeId);
await post(`/volumes/${vol.nodeId}/items`, { recordIds: [recA.nodeId, recB.nodeId] });
const conf = await post(`/volumes/${vol.nodeId}/confirm`).then(r => r.body);
ok('确认组卷赋号', !!conf.volumeCode, JSON.stringify(conf).slice(0, 120));

const all2 = await get('/records?fondsCode=Z001&scope=all&maxItems=5000');
const inVolA = all2.items.find(i => i.nodeId === recA.nodeId);
ok('组卷后 scope=all 仍可见（已组卷）', inVolA && inVolA.recordStatus === '已组卷');
ok('归属信息齐全（volumeId/volumeCode）', inVolA && inVolA.volumeId === vol.nodeId && inVolA.volumeCode === conf.volumeCode);

const poolNow = await get('/records?fondsCode=Z001&maxItems=1000');
ok('池口径不含已组卷件', !poolNow.items.some(i => i.nodeId === recA.nodeId));

const tr = await post(`/volumes/${vol.nodeId}/transfer`).then(r => r.body);
ok('移交归盒', tr.status === 'transferred' && !!tr.boxId, JSON.stringify(tr).slice(0, 120));
const all3 = await get('/records?fondsCode=Z001&scope=all&maxItems=5000');
const inBoxA = all3.items.find(i => i.nodeId === recA.nodeId);
ok('归盒后归属含盒信息（boxId/boxNo）', inBoxA && inBoxA.boxId === tr.boxId && !!inBoxA.boxNo);

// ── B. 对外移交批次（ams_transfer_batch） ──
console.log('\n[B] 对外移交批次');
const batch = await post('/transfers', { fromDept: '财务部', toDept: '档案部', fromPerson: '管理员', toPerson: '', volumeNodes: [vol.nodeId] }).then(r => r.body);
ok('创建批次 TJ-*', !!batch.transferNo, JSON.stringify(batch));
const batchList = await get('/transfers?resolveVolumes=true');
const myBatch = batchList.find(b => b.transferNo === batch.transferNo);
ok('批次列表可见+卷明细解析', myBatch && myBatch.volumes?.[0]?.title === `贯通审计测试卷-${RUN}`);
const badCreate = await post('/transfers', { toDept: '档案部', volumeNodes: [recA.nodeId] });
ok('非卷节点被拒（400）', badCreate.status === 400 || badCreate.status === 409);
await post(`/transfers/${myBatch.id}/prepare`);
const afterPrepare = (await get('/transfers')).find(b => b.id === myBatch.id);
ok('生成清册 → prepared', afterPrepare.status === 'prepared');
await post(`/transfers/${myBatch.id}/receive`);
const afterReceive = (await get('/transfers')).find(b => b.id === myBatch.id);
ok('签收 → received + received_at', afterReceive.status === 'received' && !!afterReceive.receivedAt);
const badReceive = await post(`/transfers/${myBatch.id}/receive`);
ok('重复签收被拒（状态机 409）', badReceive.status === 409);

// ── C. 鉴定销毁 ──
console.log('\n[C] 鉴定销毁');
// 建一个 2010 年 10年期限的到期卷（2010+10+1=2021 期满）
const recOld = await mk(`审记-${RUN}-C`);
// 改为 2010 年（上传默认 2020，直接再建一个 2010 的）
const fdOld = new FormData();
fdOld.append('file', new Blob([fs.readFileSync(FILE)], { type: 'application/pdf' }), `审记-${RUN}-D.pdf`);
fdOld.append('fondsCode', 'Z001');
fdOld.append('voucherNo', `审记-${RUN}-D`);
fdOld.append('archiveType', '记账凭证');
fdOld.append('year', '2010');
fdOld.append('retention', '10年');
fdOld.append('source', 'digital-native');
fdOld.append('carrierType', 'electronic');
const recOld2 = await fetch(`${BASE}/records`, { method: 'POST', headers, body: fdOld }).then(r => r.json());
const volOld = await post('/volumes', { fondsCode: 'Z001', title: `到期卷-鉴定测试-${RUN}`, archiveType: '记账凭证', archiveTypeCode: 'KP', year: 2010, retention: '10年' }).then(r => r.body);
await post(`/volumes/${volOld.nodeId}/items`, { recordIds: [recOld2.nodeId] });
await post(`/volumes/${volOld.nodeId}/confirm`);
await post(`/volumes/${volOld.nodeId}/transfer`);

const dues = await get('/appraisals/due-volumes?fondsCode=Z001');
const dueHit = dues.find(d => d.volumeNode === volOld.nodeId);
ok('到期测算命中 2010+10年 卷', !!dueHit, `due=${dueHit?.dueDate}`);
ok('2020+30年 卷不误判到期', !dues.some(d => d.volumeNode === vol.nodeId));
const scan = await post('/appraisals/scan?fondsCode=Z001').then(r => r.body);
ok('鉴定登记（幂等）', scan.registered >= 1, JSON.stringify(scan));
const scan2 = await post('/appraisals/scan?fondsCode=Z001').then(r => r.body);
ok('二次扫描不重复登记', scan2.registered === 0);
const pendingAps = await get('/appraisals?status=pending');
const myAp = pendingAps.find(a => a.volumeNode === volOld.nodeId);
await post(`/appraisals/${myAp.id}/review`, { decision: 'destroy', meetingNote: '贯通审计冒烟：同意销毁' });
const reviewed = (await get('/appraisals')).find(a => a.id === myAp.id);
ok('评审 → approved-destroy', reviewed.status === 'approved-destroy');
const destroy = await post(`/appraisals/${myAp.id}/execute-destroy`).then(r => r.body);
ok('销毁执行 → destroyed', destroy.status === 'destroyed');
const all4 = await get('/records?fondsCode=Z001&scope=all&maxItems=5000');
ok('销毁后卷内件不可见（节点级联删除）', !all4.items.some(i => i.nodeId === recOld2.nodeId));
const volGone = await post(`/volumes/${volOld.nodeId}/items`, { recordIds: [] });
ok('销毁后卷节点 404/不可操作', volGone.status >= 400);

// ── D. 盒写端点 ──
console.log('\n[D] 盒写端点');
const seal = await post(`/boxes/${tr.boxId}/seal`).then(r => r.body);
ok('封盒 → sealed', seal.status === 'sealed', JSON.stringify(seal).slice(0, 100));
const shelve = await post(`/boxes/${tr.boxId}/shelve`, { location: '1号库房-柜A-架1-层2' }).then(r => r.body);
ok('上架登记位置', shelve.location === '1号库房-柜A-架1-层2');
const unseal = await post(`/boxes/${tr.boxId}/unseal`).then(r => r.body);
ok('开封 → active', unseal.status === 'active');
const delNonEmpty = await fetch(`${BASE}/boxes/${tr.boxId}`, { method: 'DELETE', headers });
ok('非空盒删除被拒（409）', delNonEmpty.status === 409);

// ── E. 审计链验真 ──
console.log('\n[E] 审计链验真');
const verify = await get('/audit/verify');
ok('验链接口返回结构', typeof verify.total === 'number' && typeof verify.verified === 'number');
ok('今日操作全链验真（无断链）', verify.chainIntact === true && verify.broken === 0, JSON.stringify(verify));
ok('新写入行可重算（verified>0）', verify.verified > 0);

// ── F. 四性检测配置驱动 + 批量检测 ──
console.log('\n[F] 四性检测（配置驱动）');
await fetch(`${BASE}/config/inspection.plan`, {
  method: 'PUT', headers: J,
  body: JSON.stringify({ value: { security: { sensitiveCheck: true, sensitiveKeywords: ['机密测试词'] } } }),
});
const singleCheck = await post('/inspection/run', { nodeId: recA.nodeId, phase: 'smoke' }).then(r => r.body);
ok('单件检测返回四性结果', typeof singleCheck.real === 'boolean' && typeof singleCheck.allPass === 'boolean');
const batchCheck = await post('/inspection/run-batch', { fondsCode: 'Z001', phase: 'smoke-batch' }).then(r => r.body);
ok('批量检测跑完（checked>0）', batchCheck.checked > 0, JSON.stringify(batchCheck).slice(0, 120));
const reports = await get(`/inspection/reports?target=${recA.nodeId}`);
ok('报告可查（含 smoke 批次）', reports.length > 0);

// ── G. 清理测试数据（收集池残留件） ──
console.log('\n[G] 清理');
// 销毁已到位的卷不动（移交批次留作演示数据）；清理池内历史测试残留
const poolLeft = await get('/records?fondsCode=Z001&maxItems=1000');
let cleaned = 0;
for (const item of poolLeft.items) {
  if (/^(记-90[12]|审记-|测试凭证|陈静上传)/.test(item.voucherNo || item.name || '')) {
    const r = await fetch(`${BASE}/records/${item.nodeId}`, { method: 'DELETE', headers });
    if (r.status === 204) cleaned++;
  }
}
console.log(`  清理池内测试残留 ${cleaned} 件`);

console.log(`\n═══ 结果: ${pass} 通过, ${fail} 失败 ═══`);
process.exit(fail > 0 ? 1 : 0);
