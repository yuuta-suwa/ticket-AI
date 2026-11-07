import type { StepVersion } from '../domain/steps.ts';
import type { Stage } from '../domain/stage.ts';
import type { Mission } from '../domain/mission.ts';
import type { XpEntry, XpRules } from '../domain/xp.ts';
import type { WeeklyReview } from '../domain/review.ts';
import type { CoachNote } from '../domain/coach.ts';
import type { AuditEntry } from './ports.ts';

/** 本人データは必ず ownerId で絞り込む。他人のIDを渡す経路を作らない */
export interface StepRepository {
  latestAll(ownerId: string, cycle: number): Promise<StepVersion[]>;
  history(ownerId: string, cycle: number, stepNo: number): Promise<StepVersion[]>;
  insert(v: StepVersion): Promise<void>;
  /** 10ステップを完了した回数（＝現在のサイクル番号 - 1） */
  currentCycle(ownerId: string): Promise<number>;
}

export interface StageRepository {
  list(ownerId: string): Promise<Stage[]>;
  get(ownerId: string, id: string): Promise<Stage | null>;
  insert(s: Stage): Promise<void>;
  update(s: Stage): Promise<void>;
  /** 状態変更と履歴を一括で */
  transition(s: Stage, from: string, note: string, eventId: string, now: string): Promise<void>;
  events(ownerId: string, limit: number): Promise<{ stageId: string; title: string; fromStatus: string; toStatus: string; note: string; createdAt: string }[]>;
}

export interface MissionLog { id: string; missionId: string; ownerId: string; action: string; note: string; actorUserId: string; createdAt: string }
export interface MissionRepository {
  list(ownerId: string, includeClosed: boolean): Promise<Mission[]>;
  get(ownerId: string, id: string): Promise<Mission | null>;
  countOpen(ownerId: string): Promise<number>;
  insert(m: Mission): Promise<void>;
  /** 本人の更新（内容・状態）＋操作ログを一括で */
  save(m: Mission, log: MissionLog | null): Promise<void>;
  logs(ownerId: string, missionId: string): Promise<MissionLog[]>;
  recentLogs(ownerId: string, sinceIso: string): Promise<(MissionLog & { title: string })[]>;
  /** 確認者キュー（管理者用。個人目標の本文は含めない） */
  listSubmitted(): Promise<(Mission & { ownerEmail: string; ownerName: string })[]>;
  getAny(id: string): Promise<Mission | null>;
}

export interface XpRepository {
  /** source_event_id が既にあれば false（二重付与しない） */
  award(e: XpEntry): Promise<boolean>;
  ledger(ownerId: string, limit: number): Promise<XpEntry[]>;
  total(ownerId: string): Promise<number>;
  countOn(ownerId: string, ruleKey: string, awardedOn: string): Promise<number>;
  getEntry(id: string): Promise<XpEntry | null>;
  hasSource(sourceEventId: string): Promise<boolean>;
}

export interface ConfigRepository {
  latestXpRules(): Promise<{ version: number; rules: XpRules } | null>;
  insertXpRules(version: number, rules: XpRules, reason: string, actor: string, now: string, audit: AuditEntry, auditId: string): Promise<void>;
  xpRuleHistory(limit: number): Promise<{ version: number; reason: string; createdBy: string; createdAt: string }[]>;
}

export interface ReviewRepository {
  get(ownerId: string, weekKey: string): Promise<WeeklyReview | null>;
  upsert(r: WeeklyReview): Promise<void>;
  list(ownerId: string, limit: number): Promise<WeeklyReview[]>;
}

export interface CoachRepository {
  list(ownerId: string, limit: number): Promise<CoachNote[]>;
  get(ownerId: string, id: string): Promise<CoachNote | null>;
  insert(n: CoachNote): Promise<void>;
  update(n: CoachNote): Promise<void>;
}

export interface AuditRepository {
  write(a: AuditEntry, id: string, now: string): Promise<void>;
  recent(limit: number): Promise<(AuditEntry & { id: string; createdAt: string })[]>;
}

export interface CoreDeps {
  steps: StepRepository; stages: StageRepository; missions: MissionRepository; xp: XpRepository;
  config: ConfigRepository; reviews: ReviewRepository; coach: CoachRepository; audit: AuditRepository;
}
