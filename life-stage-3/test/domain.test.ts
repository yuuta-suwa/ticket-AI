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
