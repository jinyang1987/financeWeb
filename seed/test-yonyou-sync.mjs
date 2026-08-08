/* 用友BIP集成冒烟：配置→测连→同步2024-02→批次明细→收集池验证→幂等重跑 */
const AMS = 'http://localhost:8081/api';
let failures = 0;
const ok = (cond, name, extra = '') => {
  console.log((cond ? '  ✓ ' : '  ✗ ') + name + (extra ? ' | ' + extra : ''));
  if (!cond) failures++;
};

async function api(method, path, body, ticket, userId = 'admin') {
  const res = await fetch(AMS + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'X-User-Id': userId,
      'X-Alfresco-Ticket': ticket,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }
  return { status: res.status, data };
}

const login = await fetch('http://localhost:8080/alfresco/api/-default-/public/authentication/versions/1/tickets', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ userId: 'admin', password: 'admin' }),
}).then(r => r.json());
const ticket = login.entry.id;
console.log('1. 登录 Alfresco ✓');

// 2. 写入连接配置
console.log('\n2. 写入连接配置');
let r = await api('PUT', '/yonyou/config', {
  gateway: 'https://dbox.yonyoucloud.com/iuap-api-gateway',
  appKey: '5c1afa507d974ada89ad99a2ffef3dd4',
  appSecret: '33e3a9a156cbf60db6008a9f31ce756dd9066924',
  tenantId: 'cjxa6h4n',
  accbookCode: '0001',
  fondsCode: 'Z001',
}, ticket);
ok(r.status === 200 && r.data.configured === true, 'PUT /yonyou/config', JSON.stringify(r.data).slice(0, 120));
ok(r.data.appSecret === '********', 'secret 脱敏回显', r.data.appSecret);

// 3. 测试连接
console.log('\n3. 测试连接');
r = await api('POST', '/yonyou/test-connection', null, ticket);
ok(r.status === 200 && r.data.ok === true, 'POST /test-connection', JSON.stringify(r.data));

// 4. 期间与预览
console.log('\n4. 期间列表与预览');
r = await api('GET', '/yonyou/periods', null, ticket);
ok(r.status === 200 && Array.isArray(r.data.periods) && r.data.periods.length > 100, 'GET /periods', `共 ${r.data.periods?.length} 个期间，建议 ${r.data.suggested}`);
r = await api('POST', '/yonyou/preview', { period: '2024-02' }, ticket);
ok(r.status === 200 && r.data.voucherCount === 7, 'POST /preview 2024-02 = 7 张', JSON.stringify(r.data));

// 5. 手动同步 2024-02（不自动组卷，先观察）
console.log('\n5. 手动同步 2024-02（autoGroup=false）');
r = await api('POST', '/yonyou/sync', { period: '2024-02', autoGroup: false }, ticket);
ok(r.status === 200, 'POST /sync', `status=${r.data.status} total=${r.data.total_count} success=${r.data.success_count} fail=${r.data.fail_count} msg=${(r.data.message || '').slice(0, 100)}`);
ok(r.data.status === 'success' && r.data.success_count === 7 && r.data.fail_count === 0, '7 张凭证全部成功');
const batchId = r.data.id;

// 6. 批次明细
console.log('\n6. 批次明细');
r = await api('GET', `/yonyou/batches/${batchId}`, null, ticket);
const items = r.data.items || [];
ok(items.length === 7, '明细 7 行');
const one = items.find(i => i.status === 'success');
ok(!!one && !!one.record_node_id, '明细含落档节点', one ? `${one.voucher_no} → ${one.archive_code}` : '');

// 7. 收集池验证：件存在 + PDF 内容可读
console.log('\n7. 收集池验证');
r = await api('GET', '/records?fondsCode=Z001&keyword=' + encodeURIComponent('转-'), null, ticket);
const poolItems = r.data.items || [];
ok(poolItems.length >= 7, '收集池含同步凭证', `命中 ${poolItems.length} 件`);
const rec = poolItems.find(i => i.externalId);
ok(!!rec, '件含 externalId');
if (rec) {
  ok(rec.sourceSystem === '用友BIP', 'sourceSystem=用友BIP', rec.sourceSystem);
  ok(rec.voucherWord && rec.period && rec.entries, 'v2.2 元数据齐', `word=${rec.voucherWord} period=${rec.period} entries=${(rec.entries || '').length}c`);
  ok(rec.mimeType === 'application/pdf' && rec.sizeInBytes > 5000, '版式PDF已写入', `${rec.sizeInBytes} 字节`);
  const content = await fetch(AMS + `/records/${rec.nodeId}/content`, {
    headers: { 'X-User-Id': 'admin', 'X-Alfresco-Ticket': ticket },
  });
  const buf = await content.arrayBuffer();
  const magic = Buffer.from(buf.slice(0, 5)).toString();
  ok(magic === '%PDF-', 'PDF 内容可下载且魔数正确', `${buf.byteLength} 字节`);
}

// 8. 幂等重跑
console.log('\n8. 幂等重跑 2024-02');
r = await api('POST', '/yonyou/sync', { period: '2024-02', autoGroup: false }, ticket);
ok(r.data.status === 'success' && r.data.skip_count === 7 && r.data.success_count === 0, '重跑 7 张全部 skipped', `skip=${r.data.skip_count} success=${r.data.success_count}`);

// 9. 调度配置
console.log('\n9. 调度配置');
r = await api('PUT', '/yonyou/schedule', { enabled: false, cron: '0 30 2 1 * *', autoGroup: true }, ticket);
ok(r.status === 200 && r.data.cron === '0 30 2 1 * *', 'PUT /schedule', JSON.stringify(r.data));
r = await api('PUT', '/yonyou/schedule', { enabled: true, cron: 'bad-cron' }, ticket);
ok(r.status === 400, '非法 cron 被拒', `status=${r.status}`);

console.log('\n' + (failures === 0 ? '═══ 全部通过 ═══' : `═══ ${failures} 项失败 ═══`));
process.exit(failures === 0 ? 0 : 1);
