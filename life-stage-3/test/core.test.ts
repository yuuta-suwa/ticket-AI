// BUILD-B（人生攻略のコア）の受入テスト：HTTP経由・D1は実SQL・時計は固定
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDeps } from '../src/adapters/sites/worker.ts';
import { handle } from '../src/adapters/http/handler.ts';
import { sitesIdentity } from '../src/adapters/sites/identity.ts';
import { fakeEnv } from './fakes.ts';

const BASE = 'https://life-stage.example';
const ADMIN = 'admin@example.com';

function setup(startIso = '2026-11-09T01:00:00.000Z') { // 2026-11-09(月) 10:00 JST
  const { env } = fakeEnv();
  let now = Date.parse(startIso);
  let seq = 0;
  const deps = { ...buildDeps(env), clock: { now: () => new Date(now + (seq++)).toISOString() } };
  const call = async (email: string | null, method: string, path: string, body?: unknown) => {
    const headers = new Headers();
    if (email) headers.set('oai-authenticated-user-email', email);
    if (body !== undefined) headers.set('content-type', 'application/json');
    const res = await handle(new Request(BASE + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }), deps,
      { identity: sitesIdentity, signInPath: '/signin-with-chatgpt', signOutPath: '/signout-with-chatgpt' });
    return { status: res.status, body: await res.json().catch(() => null) as any };
  };
  const advance = (days: number) => { now += days * 86_400_000; };
  return { call, advance };
}

async function withMembers(startIso?: string) {
  const t = setup(startIso);
  await t.call(ADMIN, 'GET', '/api/me');
  for (const e of ['a@x.com', 'b@x.com']) await t.call(e, 'GET', '/api/me');
  const { body } = await t.call(ADMIN, 'GET', '/api/admin/pending');
  for (const m of body.members) await t.call(ADMIN, 'POST', `/api/admin/members/${m.id}/status`, { status: 'active' });
  return t;
}

const PLAN: Record<number, unknown> = {
  1: { purpose: '挑戦する人を支える', values: '誠実', reason: '恩返し' },
  2: { goal: '3年で独立', kind: 'qualitative', criteria: '自分の事業で生活できる' },
  3: { final_due: '2029-11-01', milestones: [{ title: '副業開始', due: '2027-04-01' }] },
  4: { monthly_plan: '毎月1件の提案', weekly_plan: '週3回の学習' },
  5: { kpis: [{ name: '提案数', kind: 'leading', target: '4', unit: '件' }] },
  6: { self_role: '計画と実行', responsible: '本人' },
};

test('10ステップ：途中保存→版が増える→同じ内容は版を増やさない→再ログインで復元', async () => {
  const { call } = await withMembers();
  let r = await call('a@x.com', 'PUT', '/api/steps/1', { content: { purpose: '途中' } });
  assert.deepEqual([r.status, r.body.version, r.body.saved], [200, 1, true]);
  r = await call('a@x.com', 'PUT', '/api/steps/1', { content: { purpose: '途中' } });
  assert.deepEqual([r.body.saved, r.body.version], [false, 1]);
  r = await call('a@x.com', 'PUT', '/api/steps/1', { content: { purpose: '更新', unknown_field: 'x' } });
  assert.equal(r.body.version, 2);
  const steps = (await call('A@X.COM', 'GET', '/api/steps')).body.steps;
  assert.deepEqual([steps[0].status, steps[0].content.purpose, steps[0].content.unknown_field], ['draft', '更新', undefined]);
  assert.equal(steps.length, 10);
  assert.deepEqual(steps.map((s: any) => s.name), ['目的', '目標', '期限', '逆算', 'KPI', '役割', '行動', '計測', '改善', '達成']);
  const hist = (await call('a@x.com', 'GET', '/api/steps/1/history')).body;
  assert.deepEqual(hist.map((h: any) => h.version), [2, 1]);
});

test('10ステップ：完了の条件（必須項目・日付の整合・順序）', async () => {
  const { call } = await withMembers();
  let r = await call('a@x.com', 'PUT', '/api/steps/1', { content: { purpose: 'x' }, complete: true });
  assert.equal(r.status, 400);
  assert.ok(r.body.details.includes('大切にしている価値観'));
  r = await call('a@x.com', 'PUT', '/api/steps/3', { content: { final_due: '2027-01-01', milestones: [{ title: 'm', due: '2028-01-01' }] }, complete: true });
  assert.ok(r.body.details.some((x: string) => x.includes('中間期限')));
  r = await call('a@x.com', 'PUT', '/api/steps/3', { content: { final_due: '2027-02-30' } });
  assert.equal(r.status, 400); // 存在しない日付
  r = await call('a@x.com', 'PUT', '/api/steps/2', { content: { goal: 'g', kind: 'quantitative', criteria: 'c' }, complete: true });
  assert.ok(r.body.details.includes('数値目標の指標と目標値'));
  r = await call('a@x.com', 'PUT', '/api/steps/7', { content: { action_policy: '毎日' }, complete: true });
  assert.ok(r.body.details.includes('ステップ1〜6を先に完了してください'));
});

test('計画完成（1〜6）でXP50が1回だけ付く。10達成後に次のサイクルへ進める', async () => {
  const { call } = await withMembers();
  let xp = 0;
  for (const n of [1, 2, 3, 4, 5, 6]) xp += (await call('a@x.com', 'PUT', `/api/steps/${n}`, { content: PLAN[n], complete: true })).body.xp;
  assert.equal(xp, 50);
  const again = await call('a@x.com', 'PUT', '/api/steps/6', { content: { ...(PLAN[6] as object), collaborators: '家族' }, complete: true });
  assert.equal(again.body.xp, 0); // 二重付与なし
  assert.equal((await call('a@x.com', 'POST', '/api/steps/next-cycle', {})).status, 400);
  for (const [n, c] of [[7, { action_policy: '毎朝30分' }], [8, { measurement: '週末に集計', records: [{ kpi: '提案数', actual: '4', date: '2026-11-08' }] }],
    [9, { issues: 'i', hypothesis: 'h', actions: 'a' }], [10, { verification: 'v', reflection: 'r', next_goal: '5年で法人化' }]] as const)
    assert.equal((await call('a@x.com', 'PUT', `/api/steps/${n}`, { content: c, complete: true })).status, 200);
  const nc = await call('a@x.com', 'POST', '/api/steps/next-cycle', {});
  assert.equal(nc.body.cycle, 2);
  const s = (await call('a@x.com', 'GET', '/api/steps')).body;
  assert.equal(s.cycle, 2);
  assert.deepEqual([s.steps[0].content.purpose, s.steps[1].content.goal, s.steps[2].status], ['挑戦する人を支える', '5年で法人化', 'empty']);
  const total = (await call('a@x.com', 'GET', '/api/xp')).body.level.current;
  assert.equal(total, 50);
});

test('他会員の10ステップ・ステージ・ミッション・レビュー・相談メモは見えず、操作もできない', async () => {
  const { call } = await withMembers();
  await call('a@x.com', 'PUT', '/api/steps/1', { content: { purpose: 'Aの秘密の目的' } });
  const st = (await call('a@x.com', 'POST', '/api/stages', { title: 'Aのステージ', conditionText: 'c' })).body;
  const ms = (await call('a@x.com', 'POST', '/api/missions', { title: 'Aのミッション' })).body;
  await call('a@x.com', 'PUT', '/api/reviews/2026-W46', { wentWell: 'Aの振り返り' });
  const note = (await call('a@x.com', 'POST', '/api/coach/notes', { theme: 'weekly', body: 'Aへの回答' })).body;
  const b = 'b@x.com';
  assert.equal((await call(b, 'GET', '/api/steps')).body.steps[0].content.purpose, undefined);
  assert.equal((await call(b, 'GET', '/api/stages')).body.length, 0);
  assert.equal((await call(b, 'GET', '/api/missions?all=1')).body.length, 0);
  assert.equal((await call(b, 'GET', '/api/reviews/current')).body.wentWell, '');
  assert.equal((await call(b, 'GET', '/api/coach/notes')).body.length, 0);
  for (const [m, p, body] of [
    ['PUT', `/api/stages/${st.id}`, { title: 'x' }], ['POST', `/api/stages/${st.id}/status`, { status: 'hold' }], ['DELETE', `/api/stages/${st.id}`, undefined],
    ['PUT', `/api/missions/${ms.id}`, { title: 'x' }], ['POST', `/api/missions/${ms.id}/action`, { action: 'start' }], ['GET', `/api/missions/${ms.id}/logs`, undefined],
    ['POST', `/api/missions/${ms.id}/today`, { on: true }], ['DELETE', `/api/missions/${ms.id}`, undefined], ['POST', `/api/coach/notes/${note.id}/status`, { status: 'adopted' }],
  ] as const) assert.equal((await call(b, m, p, body)).status, 404, `${m} ${p}`);
  // Bが自分のミッションにAのステージを紐づけることもできない
  assert.equal((await call(b, 'POST', '/api/missions', { title: 'x', stageId: st.id })).status, 400);
  // Aのデータは変わっていない
  assert.equal((await call('a@x.com', 'GET', '/api/stages')).body[0].status, 'active');
  assert.equal((await call('a@x.com', 'GET', '/api/missions')).body[0].status, 'not_started');
});

test('LIFE MAP：最初のステージは挑戦中、達成には条件と証拠が必要、達成後は編集不可、履歴が残る', async () => {
  const { call } = await withMembers();
  const s1 = (await call('a@x.com', 'POST', '/api/stages', { title: '基礎づくり' })).body;
  const s2 = (await call('a@x.com', 'POST', '/api/stages', { title: '副業開始', dueOn: '2027-04-01' })).body;
  assert.deepEqual([s1.status, s2.status], ['active', 'locked']);
  assert.equal((await call('a@x.com', 'POST', `/api/stages/${s1.id}/status`, { status: 'achieved', note: '証拠' })).status, 400); // 条件なし
  await call('a@x.com', 'PUT', `/api/stages/${s1.id}`, { title: '基礎づくり', conditionText: '毎日の学習を30日続ける' });
  assert.equal((await call('a@x.com', 'POST', `/api/stages/${s1.id}/status`, { status: 'achieved', note: '' })).status, 400); // 証拠なし
  assert.equal((await call('a@x.com', 'POST', `/api/stages/${s1.id}/status`, { status: 'achieved', note: '30日の記録' })).status, 200);
  assert.equal((await call('a@x.com', 'PUT', `/api/stages/${s1.id}`, { title: '書き換え' })).status, 400);
  assert.equal((await call('a@x.com', 'POST', `/api/stages/${s1.id}/status`, { status: 'active' })).status, 400);
  assert.equal((await call('a@x.com', 'POST', `/api/stages/${s2.id}/status`, { status: 'active' })).status, 200);
  await call('a@x.com', 'POST', `/api/stages/${s2.id}/move`, { dir: 'up' });
  const list = (await call('a@x.com', 'GET', '/api/stages')).body;
  assert.deepEqual(list.map((s: any) => s.title), ['副業開始', '基礎づくり']);
  const hist = (await call('a@x.com', 'GET', '/api/mypage')).body.stageHistory;
  assert.deepEqual(hist.map((e: any) => e.toStatus), ['active', 'achieved']);
  assert.equal(hist[1].note, '30日の記録');
});

test('ミッション：記録でXP（同じミッションは1日1回・1日の上限）、自己確認と確認者確認の区別', async () => {
  const { call, advance } = await withMembers();
  const ids: string[] = [];
  for (let i = 0; i < 4; i++) ids.push((await call('a@x.com', 'POST', '/api/missions', { title: `m${i}` })).body.id);
  for (const id of ids) await call('a@x.com', 'POST', `/api/missions/${id}/action`, { action: 'start' });
  assert.equal((await call('a@x.com', 'POST', `/api/missions/${ids[0]}/action`, { action: 'log', note: '' })).status, 400); // 記録は必須
  const xps = [];
  for (const id of [ids[0], ids[0], ids[1], ids[2], ids[3]]) xps.push((await call('a@x.com', 'POST', `/api/missions/${id}/action`, { action: 'log', note: 'やった' })).body.xp);
  assert.deepEqual(xps, [10, 0, 10, 10, 0]); // 同日重複0・上限3件
  advance(1);
  assert.equal((await call('a@x.com', 'POST', `/api/missions/${ids[0]}/action`, { action: 'log', note: '翌日' })).body.xp, 10);
  // 自己確認：本人が完了にできる
  assert.equal((await call('a@x.com', 'POST', `/api/missions/${ids[1]}/action`, { action: 'complete_self' })).body.mission.status, 'verified');
  // 確認者が必要：本人だけでは完了にできない・証拠が必要
  const rm = (await call('a@x.com', 'POST', '/api/missions', { title: '契約書の提出', verifyMode: 'reviewer' })).body;
  await call('a@x.com', 'POST', `/api/missions/${rm.id}/action`, { action: 'start' });
  assert.equal((await call('a@x.com', 'POST', `/api/missions/${rm.id}/action`, { action: 'complete_self' })).status, 400);
  assert.equal((await call('a@x.com', 'POST', `/api/missions/${rm.id}/action`, { action: 'submit', note: '' })).status, 400);
  assert.equal((await call('a@x.com', 'POST', `/api/missions/${rm.id}/action`, { action: 'submit', note: '提出しました' })).body.mission.status, 'submitted');
  assert.equal((await call('a@x.com', 'PUT', `/api/missions/${rm.id}`, { title: '改ざん' })).status, 400); // 確認待ちは編集不可
  // 一般会員は確認できない
  assert.equal((await call('b@x.com', 'GET', '/api/admin/missions')).status, 403);
  assert.equal((await call('a@x.com', 'POST', `/api/admin/missions/${rm.id}/review`, { decision: 'verified' })).status, 403);
  const q = (await call(ADMIN, 'GET', '/api/admin/missions')).body;
  assert.equal(q.length, 1);
  assert.deepEqual(Object.keys(q[0]).sort(), ['detail', 'dueOn', 'evidenceNote', 'id', 'owner', 'title', 'updatedAt']);
  assert.equal((await call(ADMIN, 'POST', `/api/admin/missions/${rm.id}/review`, { decision: 'returned', reason: '' })).status, 400);
  assert.equal((await call(ADMIN, 'POST', `/api/admin/missions/${rm.id}/review`, { decision: 'returned', reason: '署名がありません' })).body.status, 'returned');
  const back = (await call('a@x.com', 'GET', '/api/missions')).body.find((m: any) => m.id === rm.id);
  assert.deepEqual([back.status, back.returnReason], ['returned', '署名がありません']);
  await call('a@x.com', 'POST', `/api/missions/${rm.id}/action`, { action: 'restart' });
  await call('a@x.com', 'POST', `/api/missions/${rm.id}/action`, { action: 'submit', note: '署名済み' });
  assert.equal((await call(ADMIN, 'POST', `/api/admin/missions/${rm.id}/review`, { decision: 'verified' })).body.status, 'verified');
  assert.equal((await call(ADMIN, 'POST', `/api/admin/missions/${rm.id}/review`, { decision: 'verified' })).status, 400); // 二重確認なし
  const logs = (await call('a@x.com', 'GET', `/api/missions/${rm.id}/logs`)).body.map((l: any) => l.action);
  assert.deepEqual(logs, ['verified', 'submit', 'restart', 'returned', 'submit', 'start']);
});

test('確認者でも自分のミッションは確認できない', async () => {
  const { call } = await withMembers();
  const m = (await call(ADMIN, 'POST', '/api/missions', { title: '自分の', verifyMode: 'reviewer' })).body;
  await call(ADMIN, 'POST', `/api/missions/${m.id}/action`, { action: 'start' });
  await call(ADMIN, 'POST', `/api/missions/${m.id}/action`, { action: 'submit', note: '証拠' });
  assert.equal((await call(ADMIN, 'POST', `/api/admin/missions/${m.id}/review`, { decision: 'verified' })).status, 403);
});

test('今日のミッション：本人が選んだもの優先・最大3件・スコア順（寄与・期限・KPI不足・負担）', async () => {
  const { call } = await withMembers();
  const mk = async (title: string, extra: object = {}) => (await call('a@x.com', 'POST', '/api/missions', { title, ...extra })).body.id;
  await mk('低い', { contribution: 1, effort: 5 });
  const due = await mk('期限が今日', { contribution: 2, dueOn: '2026-11-09' });
  const high = await mk('寄与が高い', { contribution: 5 });
  const pick = await mk('自分で選んだ', { contribution: 0 });
  await mk('確認済み', { contribution: 5 }).then((id) => call('a@x.com', 'POST', `/api/missions/${id}/action`, { action: 'complete_self' }));
  await call('a@x.com', 'POST', `/api/missions/${pick}/today`, { on: true });
  const home = (await call('a@x.com', 'GET', '/api/home')).body;
  assert.deepEqual(home.missionsToday.map((m: any) => m.id), [pick, due, high]); // 期限が今日: 4×2+3×5−2=21 ＞ 寄与5: 4×5−2=18
  assert.equal(home.missionsToday[0].picked, true);
  const ids = [];
  for (let i = 0; i < 3; i++) ids.push(await mk(`p${i}`));
  await call('a@x.com', 'POST', `/api/missions/${ids[0]}/today`, { on: true });
  await call('a@x.com', 'POST', `/api/missions/${ids[1]}/today`, { on: true });
  assert.equal((await call('a@x.com', 'POST', `/api/missions/${ids[2]}/today`, { on: true })).status, 400); // 4件目は不可
});

test('週次レビュー：提出でXP30（週に1回）、提出には必須項目、今週と先週だけ編集できる', async () => {
  const { call, advance } = await withMembers();
  const cur = (await call('a@x.com', 'GET', '/api/reviews/current')).body;
  assert.equal(cur.weekKey, '2026-W46');
  assert.equal((await call('a@x.com', 'PUT', '/api/reviews/2026-W46', { wentWell: '', submit: true })).status, 400);
  let r = await call('a@x.com', 'PUT', '/api/reviews/2026-W46', { wentWell: '毎日続けた', blockers: '時間', nextActions: '朝に移す', submit: true });
  assert.deepEqual([r.status, r.body.xp], [200, 30]);
  r = await call('a@x.com', 'PUT', '/api/reviews/2026-W46', { wentWell: '追記', nextActions: '朝', submit: true });
  assert.equal(r.body.xp, 0);
  assert.ok(r.body.review.submittedAt);
  advance(14);
  assert.equal((await call('a@x.com', 'PUT', '/api/reviews/2026-W46', { wentWell: '改ざん' })).status, 400);
  assert.equal((await call('a@x.com', 'GET', '/api/reviews/current?week=2026-W46')).body.editable, false);
  assert.equal((await call('a@x.com', 'GET', '/api/reviews')).body[0].wentWell, '追記');
});

test('XPルール：管理者だけが版として変更、理由必須、過去の台帳は再計算しない、取消は追記', async () => {
  const { call } = await withMembers();
  const m = (await call('a@x.com', 'POST', '/api/missions', { title: 'm' })).body;
  await call('a@x.com', 'POST', `/api/missions/${m.id}/action`, { action: 'start' });
  await call('a@x.com', 'POST', `/api/missions/${m.id}/action`, { action: 'log', note: 'n' });
  assert.equal((await call('a@x.com', 'GET', '/api/admin/xp-rules')).status, 403);
  const cur = (await call(ADMIN, 'GET', '/api/admin/xp-rules')).body;
  assert.equal(cur.version, 0);
  const rules = { ...cur.rules, points: { ...cur.rules.points, activity: 25 } };
  assert.equal((await call(ADMIN, 'PUT', '/api/admin/xp-rules', { rules, reason: '' })).status, 400);
  assert.equal((await call(ADMIN, 'PUT', '/api/admin/xp-rules', { rules: { ...rules, levelThresholds: [0, 100, 50] }, reason: 'x' })).status, 400);
  assert.equal((await call(ADMIN, 'PUT', '/api/admin/xp-rules', { rules: { ...rules, points: { ...rules.points, activity: -1 } }, reason: 'x' })).status, 400);
  assert.equal((await call('a@x.com', 'PUT', '/api/admin/xp-rules', { rules, reason: 'x' })).status, 403);
  assert.equal((await call(ADMIN, 'PUT', '/api/admin/xp-rules', { rules, reason: '活動を重視' })).body.version, 1);
  let xp = (await call('a@x.com', 'GET', '/api/xp')).body;
  assert.deepEqual([xp.level.current, xp.ledger[0].points, xp.ledger[0].ruleVersion], [10, 10, 0]); // 過去分は10のまま
  const m2 = (await call('a@x.com', 'POST', '/api/missions', { title: 'm2' })).body;
  await call('a@x.com', 'POST', `/api/missions/${m2.id}/action`, { action: 'start' });
  assert.equal((await call('a@x.com', 'POST', `/api/missions/${m2.id}/action`, { action: 'log', note: 'n' })).body.xp, 25);
  // 取消
  xp = (await call('a@x.com', 'GET', '/api/xp')).body;
  const entry = xp.ledger.find((e: any) => e.points === 25);
  assert.equal((await call(ADMIN, 'POST', `/api/admin/xp/${entry.id}/revoke`, { reason: '' })).status, 400);
  assert.equal((await call('a@x.com', 'POST', `/api/admin/xp/${entry.id}/revoke`, { reason: 'x' })).status, 403);
  assert.equal((await call(ADMIN, 'POST', `/api/admin/xp/${entry.id}/revoke`, { reason: '誤付与' })).status, 200);
  assert.equal((await call(ADMIN, 'POST', `/api/admin/xp/${entry.id}/revoke`, { reason: '誤付与' })).status, 409);
  xp = (await call('a@x.com', 'GET', '/api/xp')).body;
  assert.equal(xp.level.current, 10);
  assert.equal(xp.ledger.length, 3); // 元の行は消さず、負の行を追加
  const audit = (await call(ADMIN, 'GET', '/api/admin/audit')).body.map((a: any) => a.action);
  assert.ok(audit.includes('config.xp_rules') && audit.includes('xp.revoke'));
});

test('AI LIFE COACH：APIを呼ばず相談文を作る。個人情報・金額は伏せる。回答は提案として保存', async () => {
  const { call } = await withMembers();
  await call('a@x.com', 'PUT', '/api/steps/1', { content: { purpose: '年収1000万円を目指し、連絡は me@example.com か 090-1234-5678 へ' } });
  await call('a@x.com', 'PUT', '/api/steps/5', { content: { kpis: [{ name: '提案数', kind: 'leading', target: '4', unit: '件' }] } });
  const r = (await call('a@x.com', 'GET', '/api/coach/prompt?theme=weekly&time=' + encodeURIComponent('平日1時間'))).body;
  assert.match(r.prompt, /自己実現・行動改善のコーチ/);
  assert.match(r.prompt, /提案数（目標 4件）/);
  assert.match(r.prompt, /平日1時間/);
  assert.doesNotMatch(r.prompt, /me@example\.com|090-1234-5678|1000万円/);
  assert.equal(r.chatUrl, 'https://chatgpt.com/');
  assert.equal((await call('a@x.com', 'GET', '/api/coach/prompt?theme=hack')).status, 400);
  const note = (await call('a@x.com', 'POST', '/api/coach/notes', { theme: 'weekly', body: '<script>alert(1)</script>\u0007次は朝に' })).body;
  assert.equal(note.body, '<script>alert(1)</script>次は朝に'); // 制御文字を除去。画面ではテキストとして表示
  assert.equal((await call('a@x.com', 'POST', `/api/coach/notes/${note.id}/status`, { status: 'adopted' })).body.status, 'adopted');
});

test('HOME：現在地・今日のミッション・前進（今日/昨日、今週/先週）・XP・提案が返る', async () => {
  const { call, advance } = await withMembers();
  let h = (await call('a@x.com', 'GET', '/api/home')).body;
  assert.equal(h.steps.next.no, 1);
  assert.ok(h.tips.length >= 1);
  for (const n of [1, 2, 3]) await call('a@x.com', 'PUT', `/api/steps/${n}`, { content: PLAN[n], complete: true });
  const m = (await call('a@x.com', 'POST', '/api/missions', { title: 'm' })).body;
  await call('a@x.com', 'POST', `/api/missions/${m.id}/action`, { action: 'start' });
  await call('a@x.com', 'POST', `/api/missions/${m.id}/action`, { action: 'log', note: 'n' });
  advance(1);
  h = (await call('a@x.com', 'GET', '/api/home')).body;
  assert.deepEqual([h.goal, h.finalDue, h.steps.completed, h.steps.next.no], ['3年で独立', '2029-11-01', 3, 4]);
  assert.deepEqual([h.progress.today, h.progress.yesterday, h.progress.thisWeek], [0, 1, 1]);
  assert.equal(h.xp.current, 10);
  assert.equal(h.missionsToday.length, 1);
});

test('未承認・停止中の会員はコア機能のAPIを使えない', async () => {
  const { call } = await withMembers();
  await call('p@x.com', 'GET', '/api/me');
  for (const [m, p] of [['GET', '/api/home'], ['GET', '/api/steps'], ['GET', '/api/stages'], ['GET', '/api/missions'], ['GET', '/api/reviews/current'], ['GET', '/api/coach/notes'], ['GET', '/api/mypage']] as const)
    assert.equal((await call('p@x.com', m, p)).status, 403, p);
  assert.equal((await call(null, 'GET', '/api/home')).status, 401);
  assert.equal((await call(null, 'GET', '/api/does-not-exist')).status, 401); // 未サインインに経路の有無を教えない
});
