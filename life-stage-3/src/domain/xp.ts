import { DomainError } from './errors.ts';
import { asObject, intIn } from './text.ts';

/** 管理画面で編集できるXPルール（初期値は原仕様書の例） */
export const RULE_KEYS = ['plan_complete', 'activity', 'weekly_review', 'kpi_achieved', 'support', 'team_achievement'] as const;
export type RuleKey = (typeof RULE_KEYS)[number];
export const RULE_LABELS: Record<RuleKey, string> = {
  plan_complete: '目標と計画の完成', activity: '活動記録', weekly_review: '週次レビュー',
  kpi_achieved: 'KPI達成（確認済み）', support: '仲間の支援（相手確認）', team_achievement: 'チーム達成（責任者確認）',
};
export interface XpRules {
  points: Record<RuleKey, number>;
  activityDailyCap: number;
  levelThresholds: number[];
}
export const DEFAULT_XP_RULES: XpRules = {
  points: { plan_complete: 50, activity: 10, weekly_review: 30, kpi_achieved: 100, support: 40, team_achievement: 200 },
  activityDailyCap: 3,
  levelThresholds: [0, 100, 250, 500, 800, 1200, 1700, 2300, 3000, 4000],
};

export function parseXpRules(raw: unknown): XpRules {
  const o = asObject(raw);
  const p = asObject(o.points);
  const points = {} as Record<RuleKey, number>;
  for (const k of RULE_KEYS) points[k] = intIn(p[k], 0, 1000, k);
  const th = o.levelThresholds;
  if (!Array.isArray(th) || th.length < 2 || th.length > 50) throw new DomainError('invalid_input', 'levelThresholds');
  const levelThresholds = th.map((x, i) => intIn(x, 0, 10_000_000, `levelThresholds[${i}]`));
  if (levelThresholds[0] !== 0) throw new DomainError('invalid_input', 'first threshold must be 0');
  for (let i = 1; i < levelThresholds.length; i++)
    if (levelThresholds[i]! <= levelThresholds[i - 1]!) throw new DomainError('invalid_input', 'thresholds must increase');
  return { points, activityDailyCap: intIn(o.activityDailyCap, 0, 50, 'activityDailyCap'), levelThresholds };
}

export function levelFor(total: number, thresholds: number[]) {
  let level = 1;
  for (let i = 0; i < thresholds.length; i++) if (total >= thresholds[i]!) level = i + 1;
  const next = thresholds[level] ?? null;
  const base = thresholds[level - 1]!;
  return { level, current: total, levelBase: base, nextAt: next, toNext: next === null ? 0 : next - total };
}

export interface XpEntry {
  id: string; ownerId: string; sourceEventId: string; ruleKey: string; ruleVersion: number;
  points: number; reason: string; awardedOn: string; actorUserId: string; createdAt: string;
}
