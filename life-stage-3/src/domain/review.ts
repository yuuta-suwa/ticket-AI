import { DomainError } from './errors.ts';
import { asObject, cleanText } from './text.ts';

export interface WeeklyReview {
  id: string; ownerId: string; weekKey: string; wentWell: string; blockers: string; improvements: string;
  nextActions: string; submittedAt: string | null; updatedAt: string;
}
export interface ReviewInput { wentWell: string; blockers: string; improvements: string; nextActions: string; submit: boolean }
export function parseReviewInput(raw: unknown): ReviewInput {
  const o = asObject(raw);
  const r = {
    wentWell: cleanText(o.wentWell, 2000, 'wentWell'), blockers: cleanText(o.blockers, 2000, 'blockers'),
    improvements: cleanText(o.improvements, 2000, 'improvements'), nextActions: cleanText(o.nextActions, 2000, 'nextActions'),
    submit: o.submit === true,
  };
  if (r.submit && (!r.wentWell || !r.nextActions)) throw new DomainError('invalid_input', 'wentWell and nextActions are required to submit');
  return r;
}
