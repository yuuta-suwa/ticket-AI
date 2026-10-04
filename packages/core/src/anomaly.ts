import type { AnomalyComponents, AnomalyResult, DealLevel, PricePoint } from '@dealhunter/types';
import { ANOMALY_CONFIG, type AnomalyConfig } from '@dealhunter/config';
import { clamp, median, percentileRank } from './stats';

export interface AnomalyInput {
  price: number;
  /** price history of the same flight identity, oldest → newest */
  history: PricePoint[];
  /** prices of comparable offers (same route / cabin / similar date) */
  comparablePrices?: number[];
  /** prices for the same offer from OTHER providers */
  otherProviderPrices?: number[];
  /** multiplicative seasonal expectation vs. annual mean (1.0 = neutral) */
  seasonalFactor?: number;
}

const discountScore = (ref: number, price: number, full: number): number =>
  ref > 0 ? clamp(((ref - price) / ref / full) * 100, 0, 100) : 0;

export function levelFor(score: number, cfg: AnomalyConfig = ANOMALY_CONFIG): DealLevel {
  const t = cfg.thresholds;
  if (score >= t.EXTREME_DEAL) return 'EXTREME_DEAL';
  if (score >= t.GREAT_DEAL) return 'GREAT_DEAL';
  if (score >= t.GOOD_DEAL) return 'GOOD_DEAL';
  return 'NORMAL';
}

/**
 * Anomaly score 0–100. Components that cannot be computed are null and the weights
 * of the remaining components are renormalised. We never claim an "error fare".
 */
export function computeAnomaly(input: AnomalyInput, cfg: AnomalyConfig = ANOMALY_CONFIG): AnomalyResult {
  const { price } = input;
  const prices = input.history.map((h) => h.price);
  const enough = prices.length >= cfg.minHistoryPoints;
  const med = prices.length ? median(prices) : NaN;
  const comparable = input.comparablePrices ?? [];
  const marketMed = comparable.length >= 3 ? median(comparable) : NaN;
  const others = input.otherProviderPrices ?? [];

  const c: AnomalyComponents = {
    historicalPosition: null, medianDeviation: null, suddenDrop: null,
    comparableMarketGap: null, crossProviderValidation: null, seasonality: null,
  };

  if (enough) {
    c.historicalPosition = Math.round((1 - percentileRank(prices, price) + 1 / prices.length) * 100 * 1) / 1;
    c.historicalPosition = clamp(c.historicalPosition, 0, 100);
    c.medianDeviation = discountScore(med, price, cfg.fullScoreDiscount);
    const recent = prices.slice(-3);
    const prev = recent.length ? median(recent) : NaN;
    c.suddenDrop = Number.isFinite(prev) ? discountScore(prev, price, cfg.fullScoreDrop) : 0;
    const factor = input.seasonalFactor ?? 1;
    c.seasonality = discountScore(med * factor, price, cfg.fullScoreDiscount);
  }
  if (Number.isFinite(marketMed)) c.comparableMarketGap = discountScore(marketMed, price, cfg.fullScoreDiscount);
  if (others.length > 0) {
    // Validation: another provider independently shows a similar (low) price → the price is real.
    const nearest = Math.min(...others.map((o) => Math.abs(o - price) / Math.max(o, 1)));
    const agreement = clamp(1 - nearest / 0.25, 0, 1);
    const belowRef = Number.isFinite(med) ? price < med : Number.isFinite(marketMed) ? price < marketMed : false;
    c.crossProviderValidation = belowRef ? agreement * 100 : 0;
  }

  let wSum = 0, acc = 0;
  for (const k of Object.keys(c) as (keyof AnomalyComponents)[]) {
    const v = c[k];
    if (v === null) continue;
    const w = cfg.weights[k];
    wSum += w; acc += w * v;
  }
  let score = wSum > 0 ? acc / wSum : 0;
  if (!enough) score = Math.min(score, cfg.insufficientHistoryMaxScore);
  score = clamp(Math.round(score * 10) / 10, 0, 100);

  const refPrice = Number.isFinite(med) ? med : Number.isFinite(marketMed) ? marketMed : price;
  return {
    score,
    level: levelFor(score, cfg),
    components: c,
    referencePrice: Math.round(refPrice * 100) / 100,
    discountPct: refPrice > 0 ? clamp((refPrice - price) / refPrice, -1, 1) : 0,
    insufficientHistory: !enough,
  };
}
