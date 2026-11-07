// Worker入口からHTTP経由で Gate-0 の受け入れ条件を検証（D1=実SQL、R2=メモリ）
import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/adapters/sites/worker.ts';
import { fakeEnv, PNG } from './fakes.ts';
import type { Env } from '../src/adapters/sites/bindings.ts';

const BASE = 'https://life-stage.example';
function client(env: Env) {
  return async (path: string, email: string | null, init: RequestInit = {}) => {
    const h = new Headers(init.headers);
    if (email) h.set('oai-authenticated-user-email', email);
    const res = await worker.fetch(new Request(BASE + path, { ...init, headers: h }), env);
    const ct = res.headers.get('content-type') ?? '';
    return { status: res.status, body: ct.includes('json') ? await res.json() as any : await res.arrayBuffer(), res };
  };
}
const J = (method: string, data: unknown): RequestInit => ({ method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) });

async function setup() {
  const { env, bucket } = fakeEnv();
  const call = client(env);
  // 管理者と会員2名
  await call('/api/me', 'admin@example.com');
  await call('/api/me', 'a@x.com');
  await call('/api/me', 'b@x.com');
  const { body } = await call('/api/admin/pending', 'admin@example.com');
  for (const m of body.members) await call(`/api/admin/members/${m.id}/status`, 'admin@example.com', J('POST', { status: 'active' }));
  return { env, bucket, call };
}

test('HOME画面はスマホ用viewportとサインイン導線を持つ', async () => {
  const { env } = fakeEnv();
  const res = await worker.fetch(new Request(BASE + '/'), env);
  const html = await res.text();
  assert.equal(res.status, 200);
  assert.match(html, /name="viewport"/);
  assert.match(html, /"signInPath":"\/signin-with-chatgpt"/);
  assert.match(res.headers.get('content-security-policy') ?? '', /frame-ancestors 'none'/);
});

test('未サインイン: /api/me は signedIn:false、他APIは401', async () => {
  const { env } = fakeEnv();
  const call = client(env);
  assert.deepEqual((await call('/api/me', null)).body, { signedIn: false });
  assert.equal((await call('/api/goal', null)).status, 401);
});

test('会員承認: 初回は承認待ち、承認前は目標を保存できない、承認後は可能', async () => {
  const { env } = fakeEnv();
  const call = client(env);
  // 日本語氏名はヘッダーに直接入らないため UTF-8 バイト列(latin1文字列)で送る
const latin1 = String.fromCharCode(...new TextEncoder().encode('新人'));
  const me = await call('/api/me', 'new@x.com', { headers: { 'oai-authenticated-user-full-name': latin1 } });
  assert.equal(me.body.member.status, 'pending');
  assert.equal(me.body.member.displayName, '新人');
  assert.equal((await call('/api/goal', 'new@x.com', J('PUT', { title: 't' }))).status, 403);
  // 一般会員は承認操作できない
  assert.equal((await call('/api/admin/pending', 'new@x.com')).status, 403);
  const pend = await call('/api/admin/pending', 'admin@example.com');
  assert.equal(pend.body.members.length, 1);
  assert.deepEqual(Object.keys(pend.body.members[0]).sort(), ['createdAt', 'displayName', 'email', 'id', 'status']);
  await call(`/api/admin/members/${pend.body.members[0].id}/status`, 'admin@example.com', J('POST', { status: 'active' }));
  assert.equal((await call('/api/goal', 'new@x.com', J('PUT', { title: 't' }))).status, 200);
});

test('否認された会員は利用不可', async () => {
  const { env } = fakeEnv();
  const call = client(env);
  await call('/api/me', 'no@x.com');
  const { body } = await call('/api/admin/pending', 'admin@example.com');
  await call(`/api/admin/members/${body.members[0].id}/status`, 'admin@example.com', J('POST', { status: 'cancelled' }));
  assert.equal((await call('/api/me', 'no@x.com')).body.member.status, 'cancelled');
  assert.equal((await call('/api/goal', 'no@x.com')).status, 403);
});

test('目標をD1へ保存し、再ログイン（新しいリクエスト）で復元・上書き更新', async () => {
  const { call } = await setup();
  const s = await call('/api/goal', 'a@x.com', J('PUT', { title: '3年で独立', detail: '<script>x</script>' }));
  assert.equal(s.status, 200);
  const again = await call('/api/goal', 'A@X.com'); // 大文字でも同一会員
  assert.equal(again.body.goal.title, '3年で独立');
  assert.equal(again.body.goal.detail, '<script>x</script>'); // 保存はそのまま、画面はtextContentで描画
  await call('/api/goal', 'a@x.com', J('PUT', { title: '2年で独立' }));
  assert.equal((await call('/api/goal', 'a@x.com')).body.goal.title, '2年で独立');
});

test('他会員の目標は見えない・書き換えられない（ownerIdを送っても無視）', async () => {
  const { call } = await setup();
  await call('/api/goal', 'a@x.com', J('PUT', { title: 'Aの秘密の目標' }));
  assert.equal((await call('/api/goal', 'b@x.com')).body.goal, null);
  await call('/api/goal', 'b@x.com', J('PUT', { title: 'B', ownerId: 'whatever', id: 'x' }));
  assert.equal((await call('/api/goal', 'a@x.com')).body.goal.title, 'Aの秘密の目標');
  // 一般会員は管理APIで他人の情報を取得できない
  assert.equal((await call('/api/admin/pending', 'b@x.com')).status, 403);
});

test('R2テスト画像: 保存・本人のみ取得・他会員は404・削除', async () => {
  const { call, bucket } = await setup();
  const up = await call('/api/images', 'a@x.com', { method: 'POST', headers: { 'content-type': 'image/png' }, body: PNG });
  assert.equal(up.status, 201);
  const id = up.body.image.id;
  assert.equal(bucket.keys().length, 1);
  assert.match(bucket.keys()[0]!, /^members\/[^/]+\/test-images\//);
  const got = await call(`/api/images/${id}`, 'a@x.com');
  assert.equal(got.status, 200);
  assert.deepEqual(new Uint8Array(got.body), PNG);
  assert.equal(got.res.headers.get('x-content-type-options'), 'nosniff');
  assert.equal((await call(`/api/images/${id}`, 'b@x.com')).status, 404);
  assert.equal((await call(`/api/images/${id}`, 'b@x.com', { method: 'DELETE' })).status, 404);
  assert.equal((await call('/api/images', 'b@x.com')).body.images.length, 0);
  assert.equal((await call(`/api/images/${id}`, 'a@x.com', { method: 'DELETE' })).status, 200);
  assert.equal(bucket.keys().length, 0);
});

test('画像の偽装・形式違い・サイズ超過は拒否', async () => {
  const { call, bucket } = await setup();
  const svg = new TextEncoder().encode('<svg onload=alert(1)>');
  assert.equal((await call('/api/images', 'a@x.com', { method: 'POST', headers: { 'content-type': 'image/png' }, body: svg })).status, 400);
  assert.equal((await call('/api/images', 'a@x.com', { method: 'POST', headers: { 'content-type': 'image/svg+xml' }, body: svg })).status, 400);
  const big = new Uint8Array(5 * 1024 * 1024 + 1); big.set(PNG);
  assert.equal((await call('/api/images', 'a@x.com', { method: 'POST', headers: { 'content-type': 'image/png' }, body: big })).status, 400);
  assert.equal(bucket.keys().length, 0);
});

test('CSRF: 別オリジンからの状態変更は拒否、JSON以外の送信も拒否', async () => {
  const { call } = await setup();
  const evil = await call('/api/goal', 'a@x.com', { method: 'PUT', headers: { 'content-type': 'application/json', origin: 'https://evil.example' }, body: '{"title":"x"}' });
  assert.equal(evil.status, 403);
  const cross = await call('/api/goal', 'a@x.com', { method: 'PUT', headers: { 'content-type': 'application/json', 'sec-fetch-site': 'cross-site' }, body: '{"title":"x"}' });
  assert.equal(cross.status, 403);
  const form = await call('/api/goal', 'a@x.com', { method: 'PUT', headers: { 'content-type': 'text/plain' }, body: '{"title":"x"}' });
  assert.equal(form.status, 400);
});

test('本番構成では開発用サインインCookieを受け付けない', async () => {
  const { env } = fakeEnv(); // DEV_AUTH 未設定
  const res = await worker.fetch(new Request(BASE + '/api/me', { headers: { cookie: 'ls_dev_email=admin%40example.com' } }), env);
  assert.deepEqual(await res.json(), { signedIn: false });
  // DEV_AUTH=1 でも localhost 以外では無効
  const { env: env2 } = fakeEnv({ DEV_AUTH: '1' });
  const r2 = await worker.fetch(new Request(BASE + '/api/me', { headers: { cookie: 'ls_dev_email=admin%40example.com' } }), env2);
  assert.deepEqual(await r2.json(), { signedIn: false });
});

test('内部エラー時に詳細を返さない', async () => {
  const { env } = fakeEnv();
  const broken = { ...env, DB: { prepare() { throw new Error('secret sql detail'); } } } as unknown as Env;
  const orig = console.error; console.error = () => {};
  const res = await worker.fetch(new Request(BASE + '/api/goal', { headers: { 'oai-authenticated-user-email': 'a@x.com' } }), broken);
  console.error = orig;
  assert.equal(res.status, 500);
  assert.deepEqual(await res.json(), { error: 'internal' });
});

test('初代管理者の後は、ADMIN_EMAILS に載っていても自動で管理者にならない', async () => {
  const { env } = fakeEnv({ ADMIN_EMAILS: 'admin@example.com,second@example.com' });
  const call = client(env);
  assert.equal((await call('/api/me', 'admin@example.com')).body.member.isAdmin, true);
  const second = await call('/api/me', 'second@example.com');
  assert.deepEqual([second.body.member.status, second.body.member.isAdmin], ['pending', false]);
});

test('GET /health は認証不要で、会員情報を含まない', async () => {
  const { env } = fakeEnv();
  const r = await client(env)('/health', null);
  assert.equal(r.status, 200);
  assert.deepEqual(r.body, { ok: true, db: 'ok' });
});

test('停止(suspended)・退会(cancelled)の会員は会員機能に入れない', async () => {
  const { call } = await setup();
  await call('/api/goal', 'a@x.com', J('PUT', { title: 'A' }));
  assert.equal((await call('/api/me', 'a@x.com')).body.member.status, 'active');
  const all = await call('/api/admin/backup', 'admin@example.com');
  const aId = all.body.users.find((u: any) => u.email === 'a@x.com').id;
  assert.equal((await call(`/api/admin/members/${aId}/status`, 'admin@example.com', J('POST', { status: 'suspended' }))).status, 200);
  assert.equal((await call('/api/goal', 'a@x.com')).status, 403);
  assert.equal((await call(`/api/admin/members/${aId}/status`, 'admin@example.com', J('POST', { status: 'cancelled' }))).status, 200);
  assert.equal((await call('/api/goal', 'a@x.com')).status, 403);
  // 監査記録が残る
  const audits = (await call('/api/admin/backup', 'admin@example.com')).body.auditLogs.filter((x: any) => x.targetId === aId);
  assert.deepEqual(audits.map((x: any) => x.after.status), ['active', 'suspended', 'cancelled']);
});

test('B が A の会員IDや推測IDを指定しても、操作も閲覧もできない', async () => {
  const { call } = await setup();
  await call('/api/goal', 'a@x.com', J('PUT', { title: 'Aの秘密' }));
  const aId = (await call('/api/admin/backup', 'admin@example.com')).body.users.find((u: any) => u.email === 'a@x.com').id;
  assert.equal((await call(`/api/admin/members/${aId}/status`, 'b@x.com', J('POST', { status: 'suspended' }))).status, 403);
  for (const path of [`/api/goal/${aId}`, `/api/goals/${aId}`, `/api/images/${aId}`, `/api/users/${aId}`])
    assert.ok([403, 404].includes((await call(path, 'b@x.com')).status), path);
  assert.equal((await call('/api/goal', 'b@x.com')).body.goal, null);
});
