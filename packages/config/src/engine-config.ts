import type { Plan } from '@dealhunter/types';

/** Anomaly weights (must sum to 1) and thresholds — config-managed, not hard-coded in logic. */
export const ANOMALY_CONFIG = {
  weights: {
    historicalPosition: 0.25,
    medianDeviation: 0.25,
    suddenDrop: 0.15,
    comparableMarketGap: 0.15,
    crossProviderValidation: 0.1,
    seasonality: 0.1,
  },
  thresholds: { EXTREME_DEAL: 90, GREAT_DEAL: 80, GOOD_DEAL: 65 },
  /** discount fraction that maps to a 100 component score */
  fullScoreDiscount: 0.5,
  fullScoreDrop: 0.3,
  minHistoryPoints: 8,
  /** Without enough history the level is capped so we never over-claim. */
  insufficientHistoryMaxScore: 79,
} as const;
export type AnomalyConfig = typeof ANOMALY_CONFIG;

export const FORECAST_CONFIG = {
  horizonDays: 7,
  flatBand: 0.02,
  meanReversionKappa: 0.3,
  defaultVolatility: 0.08,
  minHistoryForConfidence: 20,
  departureRiseRules: [
    { maxDays: 7, rise: 0.08 },
    { maxDays: 21, rise: 0.04 },
    { maxDays: 45, rise: 0.015 },
  ],
} as const;
export type ForecastConfig = typeof FORECAST_CONFIG;

export const DECISION_CONFIG = {
  minConfidence: 0.35,
  /** opportunity cost of an offer disappearing, as fraction of price */
  disappearanceCostRate: 0.1,
  /** decision margin (as fraction of price) needed to commit to BUY/WAIT */
  marginThresholdPct: 0.01,
  nearHistoricLowTolerance: 0.03,
  extremeMedianDeviation: 0.35,
  rapidDropScore: 60,
  highRiseRisk: 0.5,
  lowDownsidePct: 0.02,
  inventoryRisk: 0.3,
} as const;
export type DecisionConfig = typeof DECISION_CONFIG;

export const REVALIDATION_CONFIG = {
  /** cached offers older than this must be revalidated before a purchase hand-off */
  maxOfferAgeMs: 10 * 60 * 1000,
  /** price move beyond this fraction is flagged to the user */
  materialChangePct: 0.01,
} as const;

export const OUTCOME_CONFIG = { goodMovePct: 0.03 } as const;

export const PLAN_LIMITS: Record<Plan, { watchlistLimit: number; adsEnabled: boolean; premiumFeatures: boolean; subscriptionRequired: boolean }> = {
  FREE: { watchlistLimit: 3, adsEnabled: true, premiumFeatures: false, subscriptionRequired: true },
  PREMIUM: { watchlistLimit: 50, adsEnabled: false, premiumFeatures: true, subscriptionRequired: true },
  MANAGED: { watchlistLimit: 200, adsEnabled: false, premiumFeatures: true, subscriptionRequired: false },
  ADMIN: { watchlistLimit: 200, adsEnabled: false, premiumFeatures: true, subscriptionRequired: false },
  SUPER_ADMIN: { watchlistLimit: 200, adsEnabled: false, premiumFeatures: true, subscriptionRequired: false },
};

/** RevenueCat entitlement identifier & store product identifiers (prices are NEVER here). */
export const PURCHASE_CONFIG = {
  premiumEntitlementId: 'premium',
  offeringId: 'default',
} as const;

export const MONITORING_INTERVAL_MINUTES = { P0: 15, P1: 60, P2: 180, P3: 720, P4: 0 } as const;

export const RATE_LIMITS = {
  search: { limit: 30, windowSeconds: 60 },
  revalidate: { limit: 20, windowSeconds: 60 },
  aiExplanation: { limit: 10, windowSeconds: 60 },
  auth: { limit: 5, windowSeconds: 300 },
} as const;
export type RateLimitKey = keyof typeof RATE_LIMITS;

export const CACHE_CONFIG = { dealsTtlMs: 6 * 60 * 60 * 1000, staleBannerAfterMs: 30 * 60 * 1000 } as const;
