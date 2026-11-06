import type { EligibilityStatus, Member, Role } from '../domain/member.ts';
import type { Goal } from '../domain/goal.ts';
import type { StoredFile } from '../domain/file.ts';

export interface AuditEntry {
  actorUserId: string;
  action: string;
  targetType: string;
  targetId: string;
  before: unknown;
  after: unknown;
  reason: string | null;
}

export interface MemberRepository {
  findByEmail(email: string): Promise<Member | null>;
  findById(id: string): Promise<Member | null>;
  /** users + member_eligibility を作成。同時初回サインインで重複した場合は既存を返す */
  createOrGet(m: Member): Promise<Member>;
  hasActiveAdmin(): Promise<boolean>;
  /** 初代管理者：active化 + admin付与 + 監査を一括で */
  bootstrapAdmin(m: Member, grantId: string, auditId: string, now: string): Promise<Member>;
  /** 状態変更 + 監査記録を一括で（片方だけ残らない） */
  updateStatus(next: Member, audit: AuditEntry, auditId: string, now: string): Promise<void>;
  listByStatus(status: EligibilityStatus): Promise<Member[]>;
}

/** すべてのメソッドが ownerId を必須にし、他人のデータを取得する経路を作らない。 */
export interface GoalRepository {
  getForOwner(ownerId: string): Promise<Goal | null>;
  upsertForOwner(goal: Goal): Promise<Goal>;
}

export interface FileRepository {
  insert(f: StoredFile): Promise<void>;
  getForOwner(ownerId: string, id: string): Promise<StoredFile | null>;
  listForOwner(ownerId: string): Promise<StoredFile[]>;
  delete(ownerId: string, id: string): Promise<void>;
}

export interface ObjectStore {
  put(key: string, body: Uint8Array, contentType: string): Promise<void>;
  get(key: string): Promise<{ body: Uint8Array; contentType: string } | null>;
  delete(key: string): Promise<void>;
}

export interface BackupRows {
  users: { id: string; email: string; displayName: string; createdAt: string }[];
  eligibility: { userId: string; status: EligibilityStatus; changedAt: string; changedBy: string | null }[];
  roleGrants: { id: string; userId: string; role: Role; grantedAt: string; grantedBy: string; revokedAt: string | null }[];
  goals: (Goal & { archivedAt: string | null })[];
  files: StoredFile[];
  auditLogs: (AuditEntry & { id: string; createdAt: string })[];
}

/**
 * バックアップ専用。全会員のデータを扱うため通常のリポジトリとは分け、
 * 管理者のユースケース(backup.ts)からだけ使う。
 */
export interface BackupStore {
  dumpAll(): Promise<BackupRows>;
  countData(): Promise<{ users: number; goals: number; files: number }>;
  /** 空のDBへ一括投入（途中失敗時は何も残さない） */
  restoreAll(rows: BackupRows): Promise<void>;
}

export interface Clock { now(): string }
export interface IdGen { next(): string }

export interface Deps {
  members: MemberRepository;
  goals: GoalRepository;
  files: FileRepository;
  objects: ObjectStore;
  backup: BackupStore;
  clock: Clock;
  ids: IdGen;
  adminEmails: ReadonlySet<string>;
}
