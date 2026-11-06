import { DomainError } from '../domain/errors.ts';
import {
  assertActive, assertAdmin, changeStatus, isStatus, newMember, normalizeEmail, shouldBootstrapAdmin,
  type Identity, type Member,
} from '../domain/member.ts';
import { parseGoalInput, type Goal } from '../domain/goal.ts';
import { objectKeyFor, sha256Hex, sniffMatches, validateImage, type StoredFile } from '../domain/file.ts';
import type { Deps } from './ports.ts';

/** 認証済み本人を会員として解決（初回は pending で登録）。 */
export async function resolveMember(d: Deps, identity: Identity | null): Promise<Member> {
  if (!identity || !identity.email.includes('@')) throw new DomainError('unauthenticated');
  const email = normalizeEmail(identity.email);
  let me = await d.members.findByEmail(email);
  if (!me) me = await d.members.createOrGet(newMember(d.ids.next(), identity, d.clock.now()));
  if (me.status === 'pending' && shouldBootstrapAdmin(me.email, d.adminEmails, await d.members.hasActiveAdmin())) {
    me = await d.members.bootstrapAdmin(me, d.ids.next(), d.ids.next(), d.clock.now());
  }
  return me;
}

export async function getMyGoal(d: Deps, me: Member): Promise<Goal | null> {
  assertActive(me);
  return d.goals.getForOwner(me.id);
}

export async function saveMyGoal(d: Deps, me: Member, raw: unknown): Promise<Goal> {
  assertActive(me);
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

export async function setMemberStatus(d: Deps, me: Member, targetId: string, next: unknown): Promise<Member> {
  if (!isStatus(next)) throw new DomainError('invalid_input');
  assertAdmin(me);
  const target = await d.members.findById(targetId);
  if (!target) throw new DomainError('not_found');
  const now = d.clock.now();
  const updated = changeStatus(target, next, me, now);
  await d.members.updateStatus(updated, {
    actorUserId: me.id, action: 'member.status_change', targetType: 'user', targetId: target.id,
    before: { status: target.status }, after: { status: updated.status }, reason: null,
  }, d.ids.next(), now);
  return updated;
}

/** R2 → D1 の順で書き、D1失敗時はR2を掃除する。 */
export async function uploadTestImage(d: Deps, me: Member, body: Uint8Array, contentType: string): Promise<StoredFile> {
  assertActive(me);
  validateImage(contentType, body.byteLength);
  if (!sniffMatches(contentType, body.subarray(0, 12))) throw new DomainError('invalid_input', 'content mismatch');
  const id = d.ids.next();
  const file: StoredFile = {
    id, ownerId: me.id, objectKey: objectKeyFor(me.id, id), contentType,
    size: body.byteLength, sha256: await sha256Hex(body), createdAt: d.clock.now(),
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
  assertActive(me);
  const f = await d.files.getForOwner(me.id, id);
  if (!f) throw new DomainError('not_found'); // 他人のファイルも「存在しない」と同じ応答
  const obj = await d.objects.get(f.objectKey);
  if (!obj) throw new DomainError('not_found');
  return { file: f, body: obj.body };
}

export async function listMyImages(d: Deps, me: Member) {
  assertActive(me);
  return d.files.listForOwner(me.id);
}

/** R2 → D1 の順で削除（R2が無くても成功）。 */
export async function deleteMyImage(d: Deps, me: Member, id: string): Promise<void> {
  assertActive(me);
  const f = await d.files.getForOwner(me.id, id);
  if (!f) throw new DomainError('not_found');
  await d.objects.delete(f.objectKey);
  await d.files.delete(me.id, f.id);
}
