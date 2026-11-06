import { DomainError } from '../domain/errors.ts';
import {
  assertAdmin, assertApproved, decide, newMember, normalizeEmail,
  type Identity, type Member,
} from '../domain/member.ts';
import { parseGoalInput, type Goal } from '../domain/goal.ts';
import { objectKeyFor, sniffMatches, validateImage, type StoredFile } from '../domain/file.ts';
import type { Deps } from './ports.ts';

/** 認証済み本人を会員として解決（初回は pending で登録）。 */
export async function resolveMember(d: Deps, identity: Identity | null): Promise<Member> {
  if (!identity || !identity.email.includes('@')) throw new DomainError('unauthenticated');
  const email = normalizeEmail(identity.email);
  const existing = await d.members.findByEmail(email);
  if (existing) return existing;
  return d.members.insertOrGet(newMember(d.ids.next(), identity, d.adminEmails, d.clock.now()));
}

export async function getMyGoal(d: Deps, me: Member): Promise<Goal | null> {
  assertApproved(me);
  return d.goals.getForOwner(me.id);
}

export async function saveMyGoal(d: Deps, me: Member, raw: unknown): Promise<Goal> {
  assertApproved(me);
  const input = parseGoalInput(raw);
  const current = await d.goals.getForOwner(me.id);
  return d.goals.upsertForOwner({
    id: current?.id ?? d.ids.next(),
    ownerId: me.id, // 所有者は常にサーバー側の本人。入力値からは決めない
    title: input.title,
    detail: input.detail,
    updatedAt: d.clock.now(),
  });
}

export async function listPending(d: Deps, me: Member): Promise<Member[]> {
  assertAdmin(me);
  return d.members.listByStatus('pending');
}

export async function decideMember(
  d: Deps, me: Member, targetId: string, decision: unknown,
): Promise<Member> {
  if (decision !== 'approved' && decision !== 'rejected') throw new DomainError('invalid_input');
  assertAdmin(me);
  const target = await d.members.findById(targetId);
  if (!target) throw new DomainError('not_found');
  const next = decide(target, decision, me, d.clock.now());
  await d.members.updateStatus(next);
  return next;
}

/** R2 → D1 の順で書き、D1失敗時はR2を掃除する。 */
export async function uploadTestImage(
  d: Deps, me: Member, body: Uint8Array, contentType: string,
): Promise<StoredFile> {
  assertApproved(me);
  validateImage(contentType, body.byteLength);
  if (!sniffMatches(contentType, body.subarray(0, 12))) throw new DomainError('invalid_input', 'content mismatch');
  const id = d.ids.next();
  const file: StoredFile = {
    id, ownerId: me.id, objectKey: objectKeyFor(me.id, id),
    contentType, size: body.byteLength, createdAt: d.clock.now(),
  };
  await d.objects.put(file.objectKey, body, contentType);
  try {
    await d.files.insert(file);
  } catch (e) {
    await d.objects.delete(file.objectKey).catch(() => {});
    throw e;
  }
  return file;
}

export async function readMyImage(d: Deps, me: Member, id: string) {
  assertApproved(me);
  const f = await d.files.getForOwner(me.id, id);
  if (!f) throw new DomainError('not_found'); // 他人のファイルも「存在しない」と同じ応答
  const obj = await d.objects.get(f.objectKey);
  if (!obj) throw new DomainError('not_found');
  return { file: f, body: obj.body };
}

export async function listMyImages(d: Deps, me: Member) {
  assertApproved(me);
  return d.files.listForOwner(me.id);
}

/** R2 → D1 の順で削除（R2が無くても成功）。 */
export async function deleteMyImage(d: Deps, me: Member, id: string): Promise<void> {
  assertApproved(me);
  const f = await d.files.getForOwner(me.id, id);
  if (!f) throw new DomainError('not_found');
  await d.objects.delete(f.objectKey);
  await d.files.delete(me.id, f.id);
}
