import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/adapters/sites/worker.ts';
import { fakeEnv, PNG } from './fakes.ts';
import type { Env } from '../src/adapters/sites/bindings.ts';

const BASE = 'https://life-stage.example';
const call = async (env: Env, path: string, email: string, init: RequestInit = {}) => {
  const h = new Headers(init.headers); h.set('oai-authenticated-user-email', email);
  const r = await worker.fetch(new Request(BASE + path, { ...init, headers: h }), env);
  const ct = r.headers.get('content-type') ?? '';
  return { status: r.status, res: r, body: ct.includes('json') ? await r.json() as any : new Uint8Array(await r.arrayBuffer()) };
};
const J = (method: string, data: unknown): RequestInit => ({ method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) });
const ADMIN = 'admin@example.com';

async function populated() {
  const { env, bucket } = fakeEnv();
  await call(env, '/api/me', ADMIN);
  await call(env, '/api/me', 'a@x.com');
  await call(env, '/api/me', 'p@x.com'); // 承認待ちのまま
  const pend = await call(env, '/api/admin/pending', ADMIN);
  const a = pend.body.members.find((m: any) => m.email === 'a@x.com');
  await call(env, `/api/admin/members/${a.id}/status`, ADMIN, J('POST', { status: 'active' }));
  await call(env, '/api/goal', 'a@x.com', J('PUT', { title: 'Aの目標', detail: '詳細' }));
  const up = await call(env, '/api/images', 'a@x.com', { method: 'POST', headers: { 'content-type': 'image/png' }, body: PNG });
  return { env, bucket, imageId: up.body.image.id as string };
}

test('バックアップ→空のサイトへ復元で、目標・画像・承認状態が元通りになる', async () => {
  const src = await populated();
  const exp = await call(src.env, '/api/admin/backup', ADMIN);
  assert.equal(exp.status, 200);
  assert.match(exp.res.headers.get('content-disposition') ?? '', /attachment; filename="life-stage-.*\.lsbackup\.json"/);
  assert.equal(exp.body.users.length, 3);
  assert.ok(exp.body.auditLogs.length >= 2); // 初代管理者 + 承認の監査

  const dst = fakeEnv();
  await call(dst.env, '/api/me', ADMIN); // 新サイトで管理者が初回サインイン
  const r = await call(dst.env, '/api/admin/restore', ADMIN, J('POST', exp.body));
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.restored, { users: 3, goals: 1, files: 1 });

  assert.equal((await call(dst.env, '/api/goal', 'a@x.com')).body.goal.title, 'Aの目標');
  const img = await call(dst.env, `/api/images/${src.imageId}`, 'a@x.com');
  assert.deepEqual(img.body, PNG);
  assert.equal((await call(dst.env, '/api/me', 'p@x.com')).body.member.status, 'pending');
  assert.equal((await call(dst.env, `/api/images/${src.imageId}`, 'p@x.com')).status, 403);
  assert.equal((await call(dst.env, '/api/me', ADMIN)).body.member.isAdmin, true);
});

test('データが入っているサイトには復元できない（上書き事故防止）', async () => {
  const src = await populated();
  const exp = await call(src.env, '/api/admin/backup', ADMIN);
  assert.equal((await call(src.env, '/api/admin/restore', ADMIN, J('POST', exp.body))).status, 403);
});

test('一般会員・承認待ちはバックアップも復元もできない', async () => {
  const src = await populated();
  assert.equal((await call(src.env, '/api/admin/backup', 'a@x.com')).status, 403);
  assert.equal((await call(src.env, '/api/admin/backup', 'p@x.com')).status, 403);
  assert.equal((await call(src.env, '/api/admin/restore', 'a@x.com', J('POST', {}))).status, 403);
});

test('形式違い・改ざんされたバックアップは拒否', async () => {
  const src = await populated();
  const exp = (await call(src.env, '/api/admin/backup', ADMIN)).body;
  const dst = fakeEnv();
  await call(dst.env, '/api/me', ADMIN);
  assert.equal((await call(dst.env, '/api/admin/restore', ADMIN, J('POST', { ...exp, version: 99 }))).status, 400);
  const badKey = { ...exp, files: exp.files.map((f: any) => ({ ...f, objectKey: 'members/other/x' })) };
  assert.equal((await call(dst.env, '/api/admin/restore', ADMIN, J('POST', badKey))).status, 400);
  const orphan = { ...exp, goals: [{ ...exp.goals[0], ownerId: 'nobody' }] };
  assert.equal((await call(dst.env, '/api/admin/restore', ADMIN, J('POST', orphan))).status, 400);
  assert.equal(dst.bucket.keys().length, 0);
});

test('R2の実体が欠けていたらバックアップを失敗させる（欠損を見逃さない）', async () => {
  const src = await populated();
  for (const k of src.bucket.keys()) await src.bucket.delete(k);
  const orig = console.error; console.error = () => {};
  const r = await call(src.env, '/api/admin/backup', ADMIN);
  console.error = orig;
  assert.equal(r.status, 500);
});
