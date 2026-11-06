import type { Member } from '../domain/member.ts';
import type { Goal } from '../domain/goal.ts';
import type { StoredFile } from '../domain/file.ts';

export interface MemberRepository {
  findByEmail(email: string): Promise<Member | null>;
  findById(id: string): Promise<Member | null>;
  insert(m: Member): Promise<void>;
  /** 同時初回ログインで重複した場合は既存を返す */
  insertOrGet(m: Member): Promise<Member>;
  updateStatus(m: Member): Promise<void>;
  listByStatus(status: Member['status']): Promise<Member[]>;
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

export interface Clock { now(): string }
export interface IdGen { next(): string }

export interface Deps {
  members: MemberRepository;
  goals: GoalRepository;
  files: FileRepository;
  objects: ObjectStore;
  clock: Clock;
  ids: IdGen;
  adminEmails: ReadonlySet<string>;
}
