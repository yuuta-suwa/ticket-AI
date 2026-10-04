import type { AnomalyResult, DecisionResult, ForecastResult, ReasonCode, PricePoint } from '@dealhunter/types';
import { DECISION_CONFIG, type DecisionConfig } from '@dealhunter/config';
import { clamp } from './stats';

export interface DecisionInput {
  price: number;
  history: PricePoint[];
  anomaly: AnomalyResult;
  forecast: ForecastResult;
}

/**
 * waitLoss = up * expectedUp + disappearance * opportunityCost
 * buyLoss  = down * expectedDown
 * margin   = waitLoss - buyLoss  →  BUY (>+t) / WAIT (<-t) / WATCH otherwise or when confidence is low.
 */
export function decide(input: DecisionInput, cfg: DecisionConfig = DECISION_CONFIG): DecisionResult {
  const { price, anomaly, forecast: f } = input;
  const opportunityCost = price * cfg.disappearanceCostRate;
  const waitLoss = f.upProbability * f.expectedUpAmount + f.disappearanceRisk * opportunityCost;
  const buyLoss = f.downProbability * f.expectedDownAmount;
  const margin = waitLoss - buyLoss;
  const threshold = price * cfg.marginThresholdPct;

  const prices = input.history.map((h) => h.price);
  const reasons: ReasonCode[] = [];
  if (prices.length && price <= Math.min(...prices) * (1 + cfg.nearHistoricLowTolerance)) reasons.push('PRICE_NEAR_HISTORIC_LOW');
  if (anomaly.discountPct >= cfg.extremeMedianDeviation && !anomaly.insufficientHistory) reasons.push('EXTREME_MEDIAN_DEVIATION');
  if ((anomaly.components.suddenDrop ?? 0) >= cfg.rapidDropScore) reasons.push('RAPID_PRICE_DROP');
  if (f.upProbability >= cfg.highRiseRisk || (f.upProbability * f.expectedUpAmount) / price >= 0.03) reasons.push('HIGH_PRICE_RISE_RISK');
  if (f.expectedDownAmount / price < cfg.lowDownsidePct || f.downProbability < 0.15) reasons.push('LOW_ADDITIONAL_DOWNSIDE');
  if (f.disappearanceRisk >= cfg.inventoryRisk) reasons.push('INVENTORY_RISK');
  if (f.confidence < cfg.minConfidence) reasons.push('LOW_DATA_CONFIDENCE');
  if (anomaly.insufficientHistory) reasons.push('INSUFFICIENT_HISTORY');

  let decision: DecisionResult['decision'] = 'WATCH';
  if (f.confidence >= cfg.minConfidence && !anomaly.insufficientHistory) {
    if (margin > threshold) decision = 'BUY';
    else if (margin < -threshold) decision = 'WAIT';
  } else if (anomaly.insufficientHistory && f.confidence >= cfg.minConfidence && margin > threshold * 3) {
    // very strong signal even with thin history is still only a WATCH; never over-claim.
    decision = 'WATCH';
  }

  const norm = price > 0 ? margin / (price * 0.05) : 0;
  const buyScore = clamp(Math.round(50 + 50 * Math.tanh(norm)), 0, 100);
  return {
    decision,
    buyScore,
    confidence: f.confidence,
    waitLoss: round2(waitLoss),
    buyLoss: round2(buyLoss),
    decisionMargin: round2(margin),
    reasons,
  };
}
const round2 = (v: number): number => Math.round(v * 100) / 100;
