// `npm run dev`（wrangler/workerd + ローカルD1/R2）起動中に実行するスモークテスト。
// DEV_AUTH=1（.dev.vars）でのみ動作。本番には使わない。
const BASE = process.env.SMOKE_BASE ?? 'http://localhost:8787';
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d, 9, 9, 9]);
const tag = Date.now();
const users = { admin: 'admin@example.com', a: `a${tag}@x.com`, b: `b${tag}@x.com` };
const call = async (who, path, init = {}) => {
  const headers = { cookie: `ls_dev_email=${encodeURIComponent(users[who])}`, ...(init.headers ?? {}) };
  const r = await fetch(BASE + path, { ...init, headers });
  const ct = r.headers.get('content-type') ?? '';
  return { status: r.status, body: ct.includes('json') ? await r.json() : new Uint8Array(await r.arrayBuffer()) };
};
const J = (method, data) => ({ method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) });
const check = (name, ok) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`); if (!ok) process.exitCode = 1; };

const home = await fetch(BASE + '/');
check('HOME 200', home.status === 200 && (await home.text()).includes('viewport'));
check('A 初回は pending', (await call('a', '/api/me')).body.member.status === 'pending');
await call('b', '/api/me');
check('承認前は保存不可', (await call('a', '/api/goal', J('PUT', { title: 'x' }))).status === 403);
const pend = (await call('admin', '/api/admin/pending')).body.members.filter((m) => m.email.endsWith(`${tag}@x.com`));
for (const m of pend) await call('admin', `/api/admin/members/${m.id}/decision`, J('POST', { decision: 'approved' }));
check('管理者が承認', (await call('a', '/api/me')).body.member.status === 'approved');
check('目標をD1保存', (await call('a', '/api/goal', J('PUT', { title: `目標${tag}` }))).status === 200);
check('再ログインで復元', (await call('a', '/api/goal')).body.goal?.title === `目標${tag}`);
check('他会員から見えない', (await call('b', '/api/goal')).body.goal === null);
const up = await call('a', '/api/images', { method: 'POST', headers: { 'content-type': 'image/png' }, body: PNG });
check('R2へ画像保存', up.status === 201);
const img = await call('a', `/api/images/${up.body.image.id}`);
check('本人は画像取得', img.status === 200 && img.body.length === PNG.length);
check('他会員は画像404', (await call('b', `/api/images/${up.body.image.id}`)).status === 404);
check('画像削除', (await call('a', `/api/images/${up.body.image.id}`, { method: 'DELETE' })).status === 200);
