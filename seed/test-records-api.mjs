// P1-① 后端自测脚本：登录 → 上传 → 列表 → 下载比对（Node 版，行为与浏览器一致）
import fs from 'node:fs';

const BASE = 'http://localhost:8081/api';
const FILE = 'D:/workspace/alfresco/seed/test-voucher.pdf';

const login = await fetch(`${BASE}/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ account: 'admin', password: 'admin' }),
}).then(r => r.json());
const headers = { 'X-User-Id': 'admin', 'X-Alfresco-Ticket': login.ticket };
console.log('① 登录 OK:', login.user.name);

const fd = new FormData();
fd.append('file', new Blob([fs.readFileSync(FILE)], { type: 'application/pdf' }), '测试凭证-901.pdf');
fd.append('fondsCode', 'Z001');
fd.append('voucherNo', '记-901');
fd.append('archiveType', '记账凭证');
fd.append('department', '财务部');
fd.append('amount', '12345.67');
fd.append('year', '2026');
fd.append('month', '7');
fd.append('retention', '30年');
fd.append('source', 'digital-native');
fd.append('carrierType', 'electronic');
fd.append('preparer', '张伟');
fd.append('remarks', 'P1-① 后端自测凭证');

const up = await fetch(`${BASE}/records`, { method: 'POST', headers, body: fd });
const upBody = await up.json();
if (!up.ok) { console.error('② 上传失败:', upBody); process.exit(1); }
console.log('② 上传 OK:', JSON.stringify(upBody, null, 2));

const list = await fetch(`${BASE}/records?fondsCode=Z001&year=2026`, { headers }).then(r => r.json());
console.log('③ 列表 totalItems =', list.totalItems, '首条:', list.items?.[0]?.voucherNo, list.items?.[0]?.name);

const kw = await fetch(`${BASE}/records?fondsCode=Z001&keyword=${encodeURIComponent('记-901')}`, { headers }).then(r => r.json());
console.log('④ 关键词检索 totalItems =', kw.totalItems);

const dl = await fetch(`${BASE}/records/${upBody.nodeId}/content?download=true&filename=${encodeURIComponent(upBody.name)}`, { headers });
const buf = Buffer.from(await dl.arrayBuffer());
const orig = fs.readFileSync(FILE);
console.log('⑤ 下载', dl.status, dl.headers.get('content-type'), dl.headers.get('content-disposition'));
console.log('⑥ 字节一致:', buf.equals(orig), `(${buf.length} vs ${orig.length})`);
