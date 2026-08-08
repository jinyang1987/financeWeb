/**
 * P1-② 卷域全链路冒烟测试（Node 版，规避 curl GBK 编码坑）
 *
 * 流程：登录 → 上传2件 → 建卷 → 加件 → 确认(真取号) → 移交(自动建盒) → 退回 → 拆卷 → 验证归位
 * 用法：node seed/test-volumes-smoke.mjs
 */
const AMS = 'http://localhost:8081/api';
const ALF = 'http://localhost:8080/alfresco/api/-default-/public';

const user = process.argv[2] || 'admin';
const pass = process.argv[3] || 'admin';

let passed = 0, failed = 0;
function assert(cond, label, extra = '') {
  if (cond) { passed++; console.log(`  ✓ ${label}`); }
  else { failed++; console.log(`  ✗ ${label} ${extra}`); }
}

const ticketRes = await fetch(`${ALF}/authentication/versions/1/tickets`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ userId: user, password: pass }),
});
const ticket = (await ticketRes.json()).entry.id;
const H = { 'X-User-Id': user, 'X-Alfresco-Ticket': ticket, 'Content-Type': 'application/json' };
const Hm = { 'X-User-Id': user, 'X-Alfresco-Ticket': ticket };

async function api(method, path, body) {
  const res = await fetch(`${AMS}${path}`, {
    method, headers: H, body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data };
}

// ── 1. 上传 2 件 ──
console.log('\n[1] 上传 2 件到收集池');
const recordIds = [];
for (const voucherNo of ['记-901', '记-902']) {
  const fd = new FormData();
  fd.append('file', new Blob([await (await fetch('http://localhost:8081/api/health')).arrayBuffer()]), `${voucherNo}-测试.pdf`);
  fd.append('fondsCode', 'Z001');
  fd.append('voucherNo', voucherNo);
  fd.append('archiveType', '记账凭证');
  fd.append('year', '2026');
  fd.append('month', '7');
  fd.append('retention', '30年');
  fd.append('source', 'digital-native');
  fd.append('carrierType', 'electronic');
  const res = await fetch(`${AMS}/records`, { method: 'POST', headers: Hm, body: fd });
  const dto = await res.json();
  if (res.status !== 200) { console.log('  ✗ 上传失败', dto); failed++; continue; }
  recordIds.push(dto.nodeId);
  passed++;
  console.log(`  ✓ 上传 ${voucherNo} → ${dto.nodeId.slice(0, 8)}…（档号 ${dto.archiveCode}）`);
}

// ── 2. 建卷 ──
console.log('\n[2] 建卷（草稿）');
const create = await api('POST', '/volumes', {
  fondsCode: 'Z001', title: '2026年7月记账凭证 第901卷', archiveType: '记账凭证',
  archiveTypeCode: '01', year: 2026, retention: '30年',
});
assert(create.status === 200, `建卷 (${create.status})`, JSON.stringify(create.data));
const volId = create.data.nodeId;
console.log(`    卷 ${volId?.slice(0, 8)}…，占位档号对外映射: "${create.data.volumeCode}"（应为空串）, typeCode=${create.data.typeCode}, status=${create.data.status}`);
assert(create.data.volumeCode === '', '草稿卷档号为空');
assert(create.data.status === 'draft', '草稿状态');
assert(create.data.typeCode === 'KP', '大类归一 KP');

// ── 3. 加件入卷 ──
console.log('\n[3] 加件入卷');
const add = await api('POST', `/volumes/${volId}/items`, { recordIds });
assert(add.status === 200, `加件 (${add.status})`, JSON.stringify(add.data));
assert(Array.isArray(add.data) && add.data.length === 2, '卷内 2 件');
assert(add.data[0].itemNo === 1 && add.data[1].itemNo === 2, `件号顺排 (${add.data[0]?.itemNo},${add.data[1]?.itemNo})`);

// 收集池应为空
const poolAfter = await api('GET', '/records?fondsCode=Z001');
assert(poolAfter.data.totalItems === 0, `收集池已空 (${poolAfter.data.totalItems})`);

// ── 4. 确认组卷（真取号） ──
console.log('\n[4] 确认组卷（on-confirm 取号）');
const confirm = await api('POST', `/volumes/${volId}/confirm`);
assert(confirm.status === 200, `确认 (${confirm.status})`, JSON.stringify(confirm.data));
const vcode = confirm.data.volumeCode;
console.log(`    卷级档号: ${vcode}`);
assert(/^Z001-KU·01·2026-D30-B\d{3}-\d{4}$/.test(vcode || ''), '档号结构 Z001-KU·01·2026-D30-Bxxx-xxxx');
assert(confirm.data.status === 'confirmed', '已确认状态');

const itemsAfter = await api('GET', `/volumes/${volId}/items`);
const itemCode = itemsAfter.data[0]?.archiveCode;
console.log(`    件级档号: ${itemCode}`);
assert(itemCode === `${vcode}-0001`, '件号 = 卷号-0001');
assert(itemsAfter.data[0].recordStatus === '已组卷', '件状态已组卷');

// 重复确认应 409
const reconfirm = await api('POST', `/volumes/${volId}/confirm`);
assert(reconfirm.status === 409, `重复确认拒绝 (${reconfirm.status})`);

// ── 5. 移交归盒（自动建盒） ──
console.log('\n[5] 移交归盒');
const transfer = await api('POST', `/volumes/${volId}/transfer`);
assert(transfer.status === 200, `移交 (${transfer.status})`, JSON.stringify(transfer.data));
assert(transfer.data.status === 'transferred', '已移交状态');
assert(!!transfer.data.boxId, `归入盒 ${transfer.data.boxNo}`);

const boxes = await api('GET', '/boxes?fondsCode=Z001');
assert(boxes.data.length >= 1, `盒列表 ${boxes.data.length} 盒`);
const theBox = boxes.data.find(b => b.nodeId === transfer.data.boxId);
assert(theBox && theBox.volumeCount === 1 && theBox.volumeCountActual === 1, `盒卷数=1 (${theBox?.volumeCount}/${theBox?.volumeCountActual})`);
assert(theBox && theBox.totalItems === 2, `盒件数=2 (${theBox?.totalItems})`);

// ── 6. 退回工作台 ──
console.log('\n[6] 退回组卷工作台');
const ret = await api('POST', `/volumes/${volId}/return`);
assert(ret.status === 200, `退回 (${ret.status})`, JSON.stringify(ret.data));
assert(ret.data.status === 'draft', '退回后为草稿');
assert(ret.data.boxId === '', '盒归属已清');
const boxAfter = await api('GET', '/boxes?fondsCode=Z001');
assert(boxAfter.data.find(b => b.nodeId === transfer.data.boxId)?.volumeCount === 0, '盒卷数回退为 0');

// ── 7. 撤销确认语义检查（此时已是 draft，无需再撤） → 拆卷 ──
console.log('\n[7] 拆卷');
const dec = await api('POST', `/volumes/${volId}/decompose`);
assert(dec.status === 200 && dec.data.itemCount === 2, `拆卷回池 2 件 (${dec.data.itemCount})`, JSON.stringify(dec.data));

const poolFinal = await api('GET', '/records?fondsCode=Z001');
assert(poolFinal.data.totalItems === 2, `收集池回到 2 件 (${poolFinal.data.totalItems})`);
assert(poolFinal.data.items.every(i => i.recordStatus === '仅件数据'), '件状态回退仅件数据');

// ── 8. 卷列表应为空 ──
const vols = await api('GET', '/volumes?fondsCode=Z001');
assert(Array.isArray(vols.data) && vols.data.length === 0, `卷列表已空 (${vols.data.length})`);

// ── 清理：删除 2 件测试记录 ──
console.log('\n[8] 清理测试件');
for (const rid of recordIds) {
  const res = await fetch(`http://localhost:8080/alfresco/api/-default-/public/alfresco/versions/1/nodes/${rid}?permanent=true&alf_ticket=${ticket}`, { method: 'DELETE' });
  console.log(`  删除 ${rid.slice(0, 8)}… → ${res.status}`);
}

console.log(`\n═══ 结果: ${passed} 通过, ${failed} 失败 ═══`);
process.exit(failed > 0 ? 1 : 0);
