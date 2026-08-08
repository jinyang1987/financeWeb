// 经 vite 代理的全链路验证（浏览器同路径）：:5000/api/ams → ams-server:8081
import fs from 'node:fs';

const BASE = 'http://localhost:5000/api/ams';
const FILE = 'D:/workspace/alfresco/seed/test-voucher.pdf';

const login = await fetch(`${BASE}/auth/login`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ account: 'zhangwei', password: '123456' }),
}).then(r => r.json());
if (!login.ticket) { console.error('登录失败:', login); process.exit(1); }
const headers = { 'X-User-Id': 'zhangwei', 'X-Alfresco-Ticket': login.ticket };
console.log('① zhangwei 经代理登录 OK, roles =', login.user.roles);

const fd = new FormData();
fd.append('file', new Blob([fs.readFileSync(FILE)], { type: 'application/pdf' }), '张伟上传-903.pdf');
fd.append('fondsCode', 'Z001');
fd.append('voucherNo', '记-903');
fd.append('archiveType', '记账凭证');
fd.append('department', '财务部');
fd.append('amount', '666.00');
fd.append('year', '2026');
fd.append('month', '7');
fd.append('retention', '30年');
fd.append('source', 'digital-native');
fd.append('carrierType', 'electronic');
fd.append('preparer', '张伟');
fd.append('remarks', '经 vite 代理全链路验证件');

const up = await fetch(`${BASE}/records`, { method: 'POST', headers, body: fd });
const upBody = await up.json();
if (!up.ok) { console.error('② 上传失败:', upBody); process.exit(1); }
console.log('② 上传 OK:', upBody.archiveCode, '| createdBy =', upBody.createdBy);

const list = await fetch(`${BASE}/records?fondsCode=Z001&year=2026`, { headers }).then(r => r.json());
console.log('③ 列表 totalItems =', list.totalItems);
list.items.forEach(i => console.log('   -', i.voucherNo, i.archiveCode, 'by', i.createdBy));

const dl = await fetch(`${BASE}/records/${upBody.nodeId}/content?filename=x.pdf`, { headers });
const buf = Buffer.from(await dl.arrayBuffer());
console.log('④ 下载', dl.status, '字节一致:', buf.equals(fs.readFileSync(FILE)));
