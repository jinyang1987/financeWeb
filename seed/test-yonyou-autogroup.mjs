/* 自动组卷验证（2024-07）：清理历史残留草稿卷 → 同步 → 校验卷/档号/幂等 */
const AMS = 'http://localhost:8081/api';
let failures = 0;
const ok = (cond, name, extra = '') => {
  console.log((cond ? '  ✓ ' : '  ✗ ') + name + (extra ? ' | ' + extra : ''));
  if (!cond) failures++;
};

async function api(method, path, body, ticket) {
  const res = await fetch(AMS + path, {
    method,
    headers: { 'Content-Type': 'application/json', 'X-User-Id': 'admin', 'X-Alfresco-Ticket': ticket },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  try { return { status: res.status, data: JSON.parse(text) }; } catch { return { status: res.status, data: { raw: text } }; }
}

const login = await fetch('http://localhost:8080/alfresco/api/-default-/public/authentication/versions/1/tickets', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ userId: 'admin', password: 'admin' }),
}).then(r => r.json());
const ticket = login.entry.id;

// 1. 清理全部残留草稿卷（记账凭证卷系列）
let list = await api('GET', '/volumes?fondsCode=Z001', null, ticket);
const drafts = (list.data || []).filter(x => (x.title || '').includes('记账凭证卷') && x.status === 'draft');
for (const v of drafts) {
  const items = await api('GET', `/volumes/${v.nodeId}/items`, null, ticket);
  if (Array.isArray(items.data) && items.data.length > 0) {
    await api('POST', `/volumes/${v.nodeId}/decompose`, null, ticket);
  } else {
    await api('DELETE', `/volumes/${v.nodeId}`, null, ticket);
  }
  console.log('  清理残留草稿卷:', v.title);
}

// 2. 同步 2024-07 autoGroup=true
console.log('\n同步 2024-07（autoGroup=true）');
let r = await api('POST', '/yonyou/sync', { period: '2024-07', autoGroup: true }, ticket);
ok(r.status === 200, 'POST /sync', `status=${r.data.status} success=${r.data.success_count}/${r.data.total_count}`);
ok(r.data.success_count > 0 && r.data.success_count === r.data.total_count, '全部凭证成功');
ok(!!r.data.volume_node_id, '生成案卷节点', r.data.volume_node_id || '无');

if (r.data.volume_node_id) {
  const items = await api('GET', `/volumes/${r.data.volume_node_id}/items`, null, ticket);
  ok(Array.isArray(items.data) && items.data.length === r.data.success_count, `卷内 ${r.data.success_count} 件`, `实际 ${items.data?.length}`);
  list = await api('GET', '/volumes?fondsCode=Z001', null, ticket);
  const vol = (list.data || []).find(x => x.nodeId === r.data.volume_node_id);
  ok(!!vol, '卷在列表中', vol ? `${vol.title} | ${vol.status} | ${vol.volumeCode}` : '未找到');
  ok(vol && vol.status === 'confirmed', '卷已确认（归档终态）', vol?.status);
  ok(vol && vol.volumeCode && !vol.volumeCode.includes('VPEND'), '卷已真取号', vol?.volumeCode);
  // 件级赋号抽查
  const first = (items.data || [])[0];
  if (first) {
    const rec = await api('GET', `/records/by-volume/${r.data.volume_node_id}`, null, ticket);
    const numbered = (rec.data || []).filter(x => x.numbered);
    console.log('  件级赋号:', numbered.length, '/', (rec.data || []).length, numbered[0]?.archiveCode || '');
  }
}

// 3. 幂等重跑（应全 skipped，不再组卷）
console.log('\n幂等重跑 2024-07');
r = await api('POST', '/yonyou/sync', { period: '2024-07', autoGroup: true }, ticket);
ok(r.data.skip_count === r.data.total_count && r.data.success_count === 0, '重跑全 skipped', `skip=${r.data.skip_count}/${r.data.total_count}`);
ok(!r.data.volume_node_id, '重跑不重复组卷', r.data.volume_node_id || '未组卷 ✓');

console.log('\n' + (failures === 0 ? '═══ 全部通过 ═══' : `═══ ${failures} 项失败 ═══`));
process.exit(failures === 0 ? 0 : 1);
