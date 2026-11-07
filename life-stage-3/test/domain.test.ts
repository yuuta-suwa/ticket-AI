import test from 'node:test';
import assert from 'node:assert/strict';
import { newMember, changeStatus, shouldBootstrapAdmin, type Member } from '../src/domain/member.ts';
import { parseGoalInput } from '../src/domain/goal.ts';
import { sniffMatches, validateImage } from '../src/domain/file.ts';
import { DomainError } from '../src/domain/errors.ts';

const admins = new Set(['admin@example.com']);
const now = '2026-11-06T00:00:00.000Z';

test('新規会員は必ず pending・ロールなし', () => {
  const m = newMember('1', { email: ' A@X.com ', fullName: null }, now);
  assert.deepEqual([m.status, m.roles, m.email], ['pending', [], 'a@x.com']);
});

test('初代管理者は ADMIN_EMAILS に載っていて管理者0人の時だけ', () => {
  assert.equal(shouldBootstrapAdmin('Admin@Example.com', admins, false), true);
  assert.equal(shouldBootstrapAdmin('admin@example.com', admins, true), false);
  assert.equal(shouldBootstrapAdmin('x@example.com', admins, false), false);
});

test('状態遷移は管理者のみ・自分自身は不可・許可された遷移だけ', () => {
  const a: Member = { ...newMember('a', { email: 'admin@example.com', fullName: null }, now), status: 'active', roles: ['admin'] };
  const m = newMember('m', { email: 'm@x.com', fullName: null }, now);
  assert.equal(changeStatus(m, 'active', a, now).status, 'active');
  assert.throws(() => changeStatus(a, 'suspended', m, now), (e: DomainError) => e.code === 'not_approved');
  assert.throws(() => changeStatus(a, 'suspended', a, now), (e: DomainError) => e.code === 'forbidden');
  assert.throws(() => changeStatus(m, 'suspended', a, now), (e: DomainError) => e.code === 'invalid_input'); // pending→suspendedは不可
  const c = changeStatus(m, 'cancelled', a, now);
  assert.throws(() => changeStatus(c, 'active', a, now), (e: DomainError) => e.code === 'invalid_input'); // cancelledは終端
});

test('目標入力の検証', () => {
  assert.deepEqual(parseGoalInput({ title: ' 起業 ', detail: '' }), { title: '起業', detail: '' });
  for (const bad of [null, {}, { title: '' }, { title: 'x'.repeat(121) }, { title: 'a', detail: 'x'.repeat(2001) }])
    assert.throws(() => parseGoalInput(bad), DomainError);
});

test('画像の形式・サイズ・署名', () => {
  assert.throws(() => validateImage('image/svg+xml', 10), DomainError);
  assert.throws(() => validateImage('image/png', 5 * 1024 * 1024 + 1), DomainError);
  assert.equal(sniffMatches('image/png', new Uint8Array([0x89, 0x50, 0x4e, 0x47])), true);
  assert.equal(sniffMatches('image/png', new TextEncoder().encode('<svg>')), false);
});

import { decodeHeaderText } from '../src/adapters/sites/identity.ts';
test('氏名ヘッダーの復号（百分率/UTF-8バイト/ASCII/不正）', () => {
  assert.equal(decodeHeaderText('%E5%B1%B1%E7%94%B0'), '山田');
  assert.equal(decodeHeaderText(String.fromCharCode(...new TextEncoder().encode('山田'))), '山田');
  assert.equal(decodeHeaderText('Taro Yamada'), 'Taro Yamada');
  assert.equal(decodeHeaderText('ÿþ'), null);
  assert.equal(decodeHeaderText(null), null);
});

import { isoWeekKey, jstDate, isDate, weekStart } from '../src/domain/time.ts';
import { score, urgency, todaysMissions, type Mission } from '../src/domain/mission.ts';
import { levelFor, parseXpRules, DEFAULT_XP_RULES } from '../src/domain/xp.ts';
import { redact } from '../src/domain/coach.ts';
import { STEPS, missingForComplete } from '../src/domain/steps.ts';

test('日付：JSTの日付・ISO週・月曜始まり・存在しない日付', () => {
  assert.equal(jstDate('2026-11-08T15:30:00.000Z'), '2026-11-09'); // UTC15:30 = JST翌0:30
  assert.equal(isoWeekKey('2026-11-09'), '2026-W46');
  assert.equal(isoWeekKey('2027-01-01'), '2026-W53');
  assert.equal(weekStart('2026-11-15'), '2026-11-09');
  assert.equal(isDate('2026-02-29'), false);
  assert.equal(isDate('2028-02-29'), true);
});

test('ミッションの優先度（spec/04 の式）と期限の近さ', () => {
  assert.deepEqual([urgency(null, '2026-11-09'), urgency('2026-11-08', '2026-11-09'), urgency('2026-11-11', '2026-11-09'), urgency('2026-12-31', '2026-11-09')], [0, 5, 4, 0]);
  const base = { ownerId: 'o', detail: '', stageId: null, kpiGap: 0, verifyMode: 'self', status: 'not_started', todayOn: null, evidenceNote: '', returnReason: '',
    verifiedBy: null, verifiedAt: null, updatedAt: '', archivedAt: null } as const;
  const m = (id: string, c: number, e: number, due: string | null, createdAt: string): Mission => ({ ...base, id, title: id, contribution: c, effort: e, dueOn: due, createdAt });
  assert.equal(score(m('x', 5, 1, '2026-11-09', ''), '2026-11-09'), 4 * 5 + 3 * 5 - 1);
  // 同点：期限が近い → 負担が小さい → 登録が古い
  const list = [m('late', 3, 2, '2026-11-30', '2'), m('soon', 3, 2, '2026-11-29', '3'), m('old', 3, 2, '2026-11-30', '1')];
  assert.deepEqual(todaysMissions(list, '2026-11-09').map((x) => x.mission.id), ['soon', 'old', 'late']);
});

test('XPルールの検証とレベル計算', () => {
  assert.deepEqual(levelFor(0, [0, 100, 250]), { level: 1, current: 0, levelBase: 0, nextAt: 100, toNext: 100 });
  assert.deepEqual(levelFor(300, [0, 100, 250]), { level: 3, current: 300, levelBase: 250, nextAt: null, toNext: 0 });
  assert.deepEqual(parseXpRules(DEFAULT_XP_RULES), DEFAULT_XP_RULES);
  assert.throws(() => parseXpRules({ ...DEFAULT_XP_RULES, levelThresholds: [5, 10] }), DomainError);
});

test('相談文の伏せ字（メール・URL・電話・金額）', () => {
  const s = redact('連絡 a.b@ex.co.jp / https://x.y/z / 03-1234-5678 / 月収100万円 / ¥30,000');
  assert.doesNotMatch(s, /ex\.co\.jp|https|1234|100万円|30,000/);
});

test('10ステップの定義は名称・順序が固定', () => {
  assert.deepEqual(STEPS.map((s) => `${s.no}${s.name}`), ['1目的', '2目標', '3期限', '4逆算', '5KPI', '6役割', '7行動', '8計測', '9改善', '10達成']);
  assert.deepEqual(missingForComplete(5, { kpis: [{ name: 'a', kind: 'leading', target: '', unit: '' }] }), ['KPIの目標値']);
});
