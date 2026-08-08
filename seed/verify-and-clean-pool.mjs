// 新档号格式验证 + 清空收集池测试件（用户走真实流程前保持池干净）
import fs from 'node:fs';

const BASE = 'http://localhost:8081/api';
const ACS = 'http://localhost:8080/alfresco/api/-default-/public/alfresco/versions/1';
const FILE = 'D:/workspace/alfresco/seed/test-voucher.pdf';

// ① admin 登录（ams 与 Alfresco 各取 ticket）
const amsLogin = await fetch(`${BASE}/auth/login`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ account: 'admin', password: 'admin' }),
}).then(r => r.json());
const headers = { 'X-User-Id': 'admin', 'X-Alfresco-Ticket': amsLogin.ticket };
const acsTicket = amsLogin.ticket; // 同一 ticket 即可直连 Alfresco

// ② 新档号格式验证（Z001-PEND-xxxxxxxx）
const fd = new FormData();
fd.append('file', new Blob([fs.readFileSync(FILE)], { type: 'application/pdf' }), '格式验证-904.pdf');
fd.append('fondsCode', 'Z001');
fd.append('voucherNo', '记-904');
fd.append('archiveType', '记账凭证');
fd.append('year', '2026');
fd.append('month', '7');
fd.append('retention', '30年');
fd.append('source', 'digital-native');
fd.append('carrierType', 'electronic');
const up = await fetch(`${BASE}/records`, { method: 'POST', headers, body: fd }).then(r => r.json());
console.log('② 新档号:', up.archiveCode, up.archiveCode?.startsWith('Z001-PEND-') ? '✓ 格式正确' : '✗ 格式错误');

// ③ 列出收集池全部件并永久删除（含本次验证件）
const list = await fetch(`${BASE}/records?fondsCode=Z001&maxItems=1000`, { headers }).then(r => r.json());
console.log(`③ 收集池现有 ${list.totalItems} 件，全部清除:`);
for (const item of list.items) {
  const res = await fetch(`${ACS}/nodes/${item.nodeId}?permanent=true&alf_ticket=${acsTicket}`, { method: 'DELETE' });
  console.log(`   - ${item.voucherNo} ${item.name} → ${res.status === 204 ? '已删' : res.status}`);
}

// ④ 确认池空
const after = await fetch(`${BASE}/records?fondsCode=Z001`, { headers }).then(r => r.json());
console.log('④ 清空后 totalItems =', after.totalItems);
