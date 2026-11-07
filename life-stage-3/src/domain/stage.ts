import { DomainError } from './errors.ts';
import { isDate } from './time.ts';
import { asObject, cleanText } from './text.ts';

export type StageStatus = 'locked' | 'active' | 'achieved' | 'hold';
export interface Stage {
  id: string; ownerId: string; position: number; title: string; conditionText: string; dueOn: string | null;
  status: StageStatus; evidenceNote: string; nextChallenge: string;
  createdAt: string; updatedAt: string; achievedAt: string | null; archivedAt: string | null;
}
export const MAX_STAGES = 30;

export interface StageInput { title: string; conditionText: string; dueOn: string | null; nextChallenge: string }
export function parseStageInput(raw: unknown): StageInput {
  const o = asObject(raw);
  const title = cleanText(o.title, 80, 'title');
  if (!title) throw new DomainError('invalid_input', 'title is required');
  const due = cleanText(o.dueOn, 10, 'dueOn');
  if (due && !isDate(due)) throw new DomainError('invalid_input', 'dueOn invalid');
  return { title, conditionText: cleanText(o.conditionText, 1000, 'conditionText'), dueOn: due || null, nextChallenge: cleanText(o.nextChallenge, 1000, 'nextChallenge') };
}

const NEXT: Record<StageStatus, StageStatus[]> = {
  locked: ['active'], active: ['achieved', 'hold', 'locked'], hold: ['active'], achieved: [],
};

export function isStageStatus(v: unknown): v is StageStatus {
  return v === 'locked' || v === 'active' || v === 'achieved' || v === 'hold';
}

/** 状態遷移。達成には条件と証拠（記録）が必要。達成後は上書きしない */
export function transitionStage(s: Stage, to: StageStatus, evidenceNote: string, now: string): Stage {
  if (!NEXT[s.status].includes(to)) throw new DomainError('invalid_input', 'transition not allowed');
  if (to === 'achieved') {
    if (!s.conditionText) throw new DomainError('invalid_input', 'condition is required before achieving');
    if (!evidenceNote) throw new DomainError('invalid_input', 'evidence is required');
  }
  return { ...s, status: to, evidenceNote: to === 'achieved' ? evidenceNote : s.evidenceNote, updatedAt: now, achievedAt: to === 'achieved' ? now : s.achievedAt };
}

export function assertEditable(s: Stage): void {
  if (s.status === 'achieved' || s.archivedAt) throw new DomainError('invalid_input', 'achieved stage cannot be edited');
}
