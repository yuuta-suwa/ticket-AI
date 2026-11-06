import { DomainError } from './errors.ts';

/** spec/03 §3: member_eligibility.status */
export type EligibilityStatus = 'pending' | 'active' | 'suspended' | 'cancelled';
export type Role = 'admin';

export interface Member {
  id: string;
  email: string;
  displayName: string;
  status: EligibilityStatus;
  roles: Role[];
  createdAt: string;
  statusChangedAt: string;
  statusChangedBy: string | null;
}

/** 認証済み本人情報（プラットフォーム非依存）。 */
export interface Identity {
  email: string;
  fullName: string | null;
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** 初回サインイン時は必ず pending。ロールは付けない。 */
export function newMember(id: string, identity: Identity, now: string): Member {
  return {
    id,
    email: normalizeEmail(identity.email),
    displayName: (identity.fullName ?? '').trim().slice(0, 80),
    status: 'pending',
    roles: [],
    createdAt: now,
    statusChangedAt: now,
    statusChangedBy: null,
  };
}

/**
 * 初代管理者の決定。ADMIN_EMAILS に載っていて、かつ有効な管理者がまだ1人もいない場合だけ。
 * （spec: メール一致だけで自動で全権限を付与しない → 2人目以降は管理者の付与操作が必要）
 */
export function shouldBootstrapAdmin(email: string, adminEmails: ReadonlySet<string>, hasActiveAdmin: boolean): boolean {
  return !hasActiveAdmin && adminEmails.has(normalizeEmail(email));
}

export const isAdmin = (m: Member) => m.status === 'active' && m.roles.includes('admin');

export function assertActive(m: Member): void {
  if (m.status !== 'active') throw new DomainError('not_approved');
}

export function assertAdmin(m: Member): void {
  assertActive(m);
  if (!m.roles.includes('admin')) throw new DomainError('forbidden');
}

const TRANSITIONS: Record<EligibilityStatus, EligibilityStatus[]> = {
  pending: ['active', 'cancelled'],
  active: ['suspended', 'cancelled'],
  suspended: ['active', 'cancelled'],
  cancelled: [],
};

export function isStatus(v: unknown): v is EligibilityStatus {
  return v === 'pending' || v === 'active' || v === 'suspended' || v === 'cancelled';
}

export function changeStatus(target: Member, next: EligibilityStatus, by: Member, now: string): Member {
  assertAdmin(by);
  if (target.id === by.id) throw new DomainError('forbidden', 'cannot change own status');
  if (!TRANSITIONS[target.status].includes(next)) throw new DomainError('invalid_input', 'transition not allowed');
  return { ...target, status: next, statusChangedAt: now, statusChangedBy: by.id };
}

/** 管理画面に出す最小情報（個人目標などの非公開情報は含めない）。 */
export function toAdminView(m: Member) {
  return { id: m.id, email: m.email, displayName: m.displayName, status: m.status, createdAt: m.createdAt };
}

export function toSelfView(m: Member) {
  return { email: m.email, displayName: m.displayName, status: m.status, isAdmin: isAdmin(m) };
}
