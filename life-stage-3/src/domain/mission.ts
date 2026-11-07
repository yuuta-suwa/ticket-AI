import { DomainError } from './errors.ts';
import { daysBetween, isDate } from './time.ts';
import { asObject, cleanText, intIn } from './text.ts';

export type MissionStatus = 'not_started' | 'in_progress' | 'submitted' | 'verified' | 'returned';
export type VerifyMode = 'self' | 'reviewer';
export interface Mission {
  id: string; ownerId: string; title: string; detail: string; stageId: string | null; dueOn: string | null;
  contribution: number; effort: number; kpiGap: number; verifyMode: VerifyMode; status: MissionStatus;
  todayOn: string | null; evidenceNote: string; returnReason: string; verifiedBy: string | null; verifiedAt: string | null;
  createdAt: string; updatedAt: string; archivedAt: string | null;
}
export const MAX_OPEN_MISSIONS = 100;

export interface MissionInput {
  title: string; detail: string; stageId: string | null; dueOn: string | null;
  contribution: number; effort: number; kpiGap: number; verifyMode: VerifyMode;
}
export function parseMissionInput(raw: unknown): MissionInput {
  const o = asObject(raw);
  const title = cleanText(o.title, 120, 'title');
  if (!title) throw new DomainError('invalid_input', 'title is required');
  const due = cleanText(o.dueOn, 10, 'dueOn');
  if (due && !isDate(due)) throw new DomainError('invalid_input', 'dueOn invalid');
  const vm = o.verifyMode ?? 'self';
  if (vm !== 'self' && vm !== 'reviewer') throw new DomainError('invalid_input', 'verifyMode invalid');
  const stageId = cleanText(o.stageId, 64, 'stageId');
  return {
    title, detail: cleanText(o.detail, 2000, 'detail'), stageId: stageId || null, dueOn: due || null,
    contribution: intIn(o.contribution, 0, 5, 'contribution', 3), effort: intIn(o.effort, 0, 5, 'effort', 2),
    kpiGap: intIn(o.kpiGap, 0, 5, 'kpiGap', 0), verifyMode: vm,
  };
}

export type MemberAction = 'start' | 'log' | 'submit' | 'complete_self' | 'restart';
export function isMemberAction(v: unknown): v is MemberAction {
  return v === 'start' || v === 'log' || v === 'submit' || v === 'complete_self' || v === 'restart';
}

/** 本人の操作による状態遷移。確認が必要なミッションは本人だけで「確認済み」にできない */
export function applyMemberAction(m: Mission, action: MemberAction, note: string, now: string): Mission {
  if (m.archivedAt) throw new DomainError('invalid_input', 'archived');
  const ok = (cond: boolean) => { if (!cond) throw new DomainError('invalid_input', 'transition not allowed'); };
  switch (action) {
    case 'start': ok(m.status === 'not_started'); return { ...m, status: 'in_progress', updatedAt: now };
    case 'restart': ok(m.status === 'returned'); return { ...m, status: 'in_progress', updatedAt: now };
    case 'log': ok(m.status === 'in_progress'); if (!note) throw new DomainError('invalid_input', 'note is required'); return { ...m, updatedAt: now };
    case 'submit':
      ok(m.verifyMode === 'reviewer' && m.status === 'in_progress');
      if (!note) throw new DomainError('invalid_input', 'evidence is required');
      return { ...m, status: 'submitted', evidenceNote: note, updatedAt: now };
    case 'complete_self':
      ok(m.verifyMode === 'self' && (m.status === 'in_progress' || m.status === 'not_started'));
      return { ...m, status: 'verified', evidenceNote: note || m.evidenceNote, verifiedBy: m.ownerId, verifiedAt: now, updatedAt: now };
  }
}

/** 確認者（管理者）の判定。本人は自分のミッションを確認できない */
export function review(m: Mission, decision: 'verified' | 'returned', reviewerId: string, reason: string, now: string): Mission {
  if (m.status !== 'submitted') throw new DomainError('invalid_input', 'not submitted');
  if (reviewerId === m.ownerId) throw new DomainError('forbidden', 'cannot review own mission');
  if (decision === 'returned' && !reason) throw new DomainError('invalid_input', 'reason is required');
  return decision === 'verified'
    ? { ...m, status: 'verified', verifiedBy: reviewerId, verifiedAt: now, returnReason: '', updatedAt: now }
    : { ...m, status: 'returned', returnReason: reason, updatedAt: now };
}

/** 期限の近さ（0..5） */
export function urgency(dueOn: string | null, today: string): number {
  if (!dueOn) return 0;
  const d = daysBetween(today, dueOn);
  if (d <= 0) return 5;
  if (d <= 2) return 4;
  if (d <= 7) return 3;
  if (d <= 14) return 2;
  if (d <= 30) return 1;
  return 0;
}

export interface RecommendWeights { contribution: number; urgency: number; kpiGap: number; effort: number }
export const DEFAULT_WEIGHTS: RecommendWeights = { contribution: 4, urgency: 3, kpiGap: 2, effort: 1 };

/** spec/04：score = 4×寄与 + 3×期限の近さ + 2×KPI不足度 − 所要時間負担 */
export function score(m: Mission, today: string, w: RecommendWeights = DEFAULT_WEIGHTS): number {
  return w.contribution * m.contribution + w.urgency * urgency(m.dueOn, today) + w.kpiGap * m.kpiGap - w.effort * m.effort;
}

const OPEN: MissionStatus[] = ['not_started', 'in_progress', 'returned'];
export const isOpen = (m: Mission) => !m.archivedAt && OPEN.includes(m.status);

/** 今日のミッション（最大3件）。本人が「今日やる」にしたものを優先し、残りをスコア順で補う */
export function todaysMissions(all: Mission[], today: string, w: RecommendWeights = DEFAULT_WEIGHTS, limit = 3) {
  const open = all.filter(isOpen);
  const picked = open.filter((m) => m.todayOn === today);
  const rest = open.filter((m) => m.todayOn !== today).map((m) => ({ m, s: score(m, today, w) }))
    .sort((a, b) => b.s - a.s
      || (a.m.dueOn ?? '9999-12-31').localeCompare(b.m.dueOn ?? '9999-12-31')
      || a.m.effort - b.m.effort
      || a.m.createdAt.localeCompare(b.m.createdAt));
  const out = [...picked.map((m) => ({ mission: m, score: score(m, today, w), picked: true })),
    ...rest.map(({ m, s }) => ({ mission: m, score: s, picked: false }))];
  return out.slice(0, limit);
}
