import type { Decision, OutcomeLabel } from '@dealhunter/types';
import { OUTCOME_CONFIG } from '@dealhunter/config';

export interface RecommendationRecord { price: number; decision: Decision }

/** Compare the price N hours after a recommendation to label the decision (future ML labels). */
export function evaluateOutcome(rec: RecommendationRecord, laterPrice: number | null, cfg = OUTCOME_CONFIG): OutcomeLabel {
  if (laterPrice === null) return rec.decision === 'BUY' ? 'GOOD_DECISION' : rec.decision === 'WAIT' ? 'BAD_DECISION' : 'NEUTRAL';
  const move = rec.price > 0 ? (laterPrice - rec.price) / rec.price : 0;
  if (rec.decision === 'BUY') return move >= cfg.goodMovePct ? 'GOOD_DECISION' : move <= -cfg.goodMovePct ? 'BAD_DECISION' : 'NEUTRAL';
  if (rec.decision === 'WAIT') return move <= -cfg.goodMovePct ? 'GOOD_DECISION' : move >= cfg.goodMovePct ? 'BAD_DECISION' : 'NEUTRAL';
  return 'NEUTRAL';
}
