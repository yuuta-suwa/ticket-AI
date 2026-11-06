import { DomainError } from './errors.ts';

export type MemberStatus = 'pending' | 'approved' | 'rejected';
export type MemberRole = 'member' | 'admin';

export interface Member {
  id: string;
  email: string;
  displayName: string;
  status: MemberStatus;
  role: MemberRole;
  createdAt: string;
  approvedAt: string | null;
  approvedBy: string | null;
}

/** 認証済み本人情報（プラットフォーム非依存）。 */
export interface Identity {
  email: string;
  fullName: string | null;
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** 初回ログイン時の会員レコード。管理者メールに一致すれば即承認の管理者。 */
export function newMember(
  id: string,
  identity: Identity,
  adminEmails: ReadonlySet<string>,
  now: string,
): Member {
  const email = normalizeEmail(identity.email);
  const isAdmin = adminEmails.has(email);
  return {
    id,
    email,
    displayName: (identity.fullName ?? '').trim().slice(0, 80),
    status: isAdmin ? 'approved' : 'pending',
    role: isAdmin ? 'admin' : 'member',
    createdAt: now,
    approvedAt: isAdmin ? now : null,
    approvedBy: isAdmin ? 'bootstrap' : null,
  };
}

export function assertApproved(m: Member): void {
  if (m.status !== 'approved') throw new DomainError('not_approved');
}

export function assertAdmin(m: Member): void {
  assertApproved(m);
  if (m.role !== 'admin') throw new DomainError('forbidden');
}

export function decide(
  target: Member,
  decision: 'approved' | 'rejected',
  by: Member,
  now: string,
): Member {
  assertAdmin(by);
  if (target.id === by.id) throw new DomainError('forbidden', 'cannot change own status');
  return {
    ...target,
    status: decision,
    approvedAt: decision === 'approved' ? now : null,
    approvedBy: by.id,
  };
}

/** 管理画面に出す最小情報（非公開情報は含めない）。 */
export function toAdminView(m: Member) {
  return { id: m.id, email: m.email, displayName: m.displayName, status: m.status, createdAt: m.createdAt };
}

export function toSelfView(m: Member) {
  return { email: m.email, displayName: m.displayName, status: m.status, role: m.role };
}
