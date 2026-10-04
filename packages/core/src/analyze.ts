import type { DealAnalysis, FlightOffer, PricePoint } from '@dealhunter/types';
import { computeAnomaly } from './anomaly';
import { decide } from './decision';
import { StatisticalForecastModel, type ForecastModel } from './forecast';

export interface AnalysisContext {
  history: PricePoint[];
  comparablePrices?: number[];
  otherProviderPrices?: number[];
  seasonalFactor?: number;
  now?: Date;
  model?: ForecastModel;
}

const defaultModel = new StatisticalForecastModel();

/** Pure pipeline: offer + history → anomaly → forecast → decision. */
export function analyzeOffer(offer: FlightOffer, ctx: AnalysisContext): DealAnalysis {
  const now = ctx.now ?? new Date();
  const price = offer.price.amount;
  const days = Math.max(0, (new Date(offer.departureAt).getTime() - now.getTime()) / 86_400_000);
  const anomaly = computeAnomaly({
    price, history: ctx.history, comparablePrices: ctx.comparablePrices,
    otherProviderPrices: ctx.otherProviderPrices, seasonalFactor: ctx.seasonalFactor,
  });
  const forecast = (ctx.model ?? defaultModel).predict({
    price, history: ctx.history, daysToDeparture: days,
    availability: offer.availability, seatsLeft: offer.seatsLeft,
  });
  const decision = decide({ price, history: ctx.history, anomaly, forecast });
  return { offerId: offer.id, analyzedAt: now.toISOString(), anomaly, forecast, decision };
}

/** Month-based seasonal multipliers (northern-hemisphere leisure travel); neutral default. */
export function seasonalFactorFor(departure: Date): number {
  const m = departure.getUTCMonth();
  return [0.95, 0.9, 1.0, 1.0, 1.0, 1.05, 1.15, 1.15, 1.0, 1.0, 0.95, 1.1][m] ?? 1;
}
