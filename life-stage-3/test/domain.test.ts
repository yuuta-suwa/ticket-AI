import test from 'node:test';
import assert from 'node:assert/strict';
import { newMember, decide } from '../src/domain/member.ts';
import { parseGoalInput } from '../src/domain/goal.ts';
import { sniffMatches, validateImage } from '../src/domain/file.ts';
import { DomainError } from '../src/domain/errors.ts';

const admins = new Set(['admin@example.com']);
const now = '2026-11-06T00:00:00.000Z';

test('新規会員は pending/member、管理者メールは approved/admin', () => {
  assert.equal(newMember('1', { email: 'A@x.com', fullName: null }, admins, now).status, 'pending');
  const a = newMember('2', { email: ' Admin@Example.com ', fullName: 'Ad' }, admins, now);
  assert.deepEqual([a.status, a.role, a.email], ['approved', 'admin', 'admin@example.com']);
});

test('承認は管理者のみ・自分自身は不可', () => {
  const a = newMember('a', { email: 'admin@example.com', fullName: null }, admins, now);
  const m = newMember('m', { email: 'm@x.com', fullName: null }, admins, now);
  assert.equal(decide(m, 'approved', a, now).status, 'approved');
  assert.throws(() => decide(a, 'approved', m, now), (e: DomainError) => e.code === 'not_approved');
  assert.throws(() => decide(a, 'rejected', a, now), (e: DomainError) => e.code === 'forbidden');
});

test('目標入力の検証', () => {
  assert.deepEqual(parseGoalInput({ title: ' 起業 ', detail: '' }), { title: '起業', detail: '' });
  for (const bad of [null, {}, { title: '' }, { title: 'x'.repeat(121) }, { title: 'a', detail: 'x'.repeat(2001) }])
    assert.throws(() => parseGoalInput(bad), DomainError);
});

test('画像の形式・サイズ・署名', () => {
  assert.throws(() => validateImage('image/svg+xml', 10), DomainError);
  assert.throws(() => validateImage('image/png', 1024 * 1024 + 1), DomainError);
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
