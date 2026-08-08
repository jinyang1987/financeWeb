// P1-① 普通账号权限验证：chenjing（档案管理员，非 admin）走全流程
import fs from 'node:fs';

const BASE = 'http://localhost:8081/api';
const FILE = 'D:/workspace/alfresco/seed/test-voucher.pdf';

const login = await fetch(`${BASE}/auth/login`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ account: 'chenjing', password: '123456' }),
}).then(r => r.json());
if (!login.ticket) { console.error('登录失败:', login); process.exit(1); }
const headers = { 'X-User-Id': 'chenjing', 'X-Alfresco-Ticket': login.ticket };
console.log('① chenjing 登录 OK, roles =', login.user.roles);

const fd = new FormData();
fd.append('file', new Blob([fs.readFileSync(FILE)], { type: 'application/pdf' }), '陈静上传-902.pdf');
fd.append('fondsCode', 'Z001');
fd.append('voucherNo', '记-902');
fd.append('archiveType', '记账凭证');
fd.append('department', '档案部');
fd.append('amount', '888.00');
fd.append('year', '2026');
fd.append('month', '7');
fd.append('retention', '10年');
fd.append('source', 'digitized');
fd.append('carrierType', 'paper');
fd.append('preparer', '陈静');
fd.append('remarks', '普通账号权限验证件');

const up = await fetch(`${BASE}/records`, { method: 'POST', headers, body: fd });
const upBody = await up.json();
if (!up.ok) { console.error('② 上传失败:', upBody); process.exit(1); }
console.log('② 上传 OK:', upBody.nodeId, upBody.archiveCode, 'createdBy =', upBody.createdBy);

const list = await fetch(`${BASE}/records?fondsCode=Z001`, { headers }).then(r => r.json());
console.log('③ 列表 totalItems =', list.totalItems, '(应含 admin 与 chenjing 两件)');
list.items.forEach(i => console.log('   -', i.voucherNo, i.name, 'by', i.createdBy));

const dl = await fetch(`${BASE}/records/${upBody.nodeId}/content?filename=x.pdf`, { headers });
console.log('④ 下载', dl.status, '字节数 =', (await dl.arrayBuffer()).byteLength);
