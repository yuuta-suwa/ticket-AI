import { DomainError } from './errors.ts';

export interface Goal {
  id: string;
  ownerId: string;
  title: string;
  detail: string;
  updatedAt: string;
}

export const GOAL_TITLE_MAX = 120;
export const GOAL_DETAIL_MAX = 2000;

export interface GoalInput {
  title: string;
  detail: string;
}

export function parseGoalInput(raw: unknown): GoalInput {
  if (typeof raw !== 'object' || raw === null) throw new DomainError('invalid_input');
  const r = raw as Record<string, unknown>;
  const title = typeof r.title === 'string' ? r.title.trim() : '';
  const detail = typeof r.detail === 'string' ? r.detail.trim() : '';
  if (!title) throw new DomainError('invalid_input', 'title is required');
  if (title.length > GOAL_TITLE_MAX) throw new DomainError('invalid_input', 'title too long');
  if (detail.length > GOAL_DETAIL_MAX) throw new DomainError('invalid_input', 'detail too long');
  return { title, detail };
}

export function toGoalView(g: Goal) {
  return { title: g.title, detail: g.detail, updatedAt: g.updatedAt };
}
