import type { AvailabilityState, ForecastResult, PricePoint } from '@dealhunter/types';
import { FORECAST_CONFIG, type ForecastConfig } from '@dealhunter/config';
import { clamp, clamp01, median, normCdf, normPdf, slope, stdev } from './stats';

export interface ForecastInput {
  price: number;
  history: PricePoint[];
  daysToDeparture: number;
  availability?: AvailabilityState;
  seatsLeft?: number;
}

/** Swap-in point for future ML models. LLMs are never used here. */
export interface ForecastModel {
  readonly version: string;
  predict(input: ForecastInput): ForecastResult;
}

const Z90 = 1.2815515655446004;

/** E[r | r > b] and E[-r | r < -b] for r ~ N(mu, sigma) */
function tailExpectations(mu: number, sigma: number, band: number) {
  const s = Math.max(sigma, 1e-6);
  const aUp = (band - mu) / s;
  const pUp = 1 - normCdf(aUp);
  const eUp = pUp > 1e-9 ? mu + (s * normPdf(aUp)) / pUp : 0;
  const aDn = (-band - mu) / s;
  const pDn = normCdf(aDn);
  const eDn = pDn > 1e-9 ? -(mu - (s * normPdf(aDn)) / pDn) : 0;
  return { pUp, pDn, eUp: Math.max(eUp, 0), eDn: Math.max(eDn, 0) };
}

export class StatisticalForecastModel implements ForecastModel {
  readonly version = 'stat-v1';
  constructor(private readonly cfg: ForecastConfig = FORECAST_CONFIG) {}

  predict(input: ForecastInput): ForecastResult {
    const { cfg } = this;
    const { price } = input;
    const prices = input.history.map((h) => h.price);
    const med = prices.length ? median(prices) : price;

    // Volatility from log returns of consecutive observations.
    const rets: number[] = [];
    for (let i = 1; i < prices.length; i++) {
      const a = prices[i - 1] as number, b = prices[i] as number;
      if (a > 0 && b > 0) rets.push(Math.log(b / a));
    }
    const dailyish = rets.length >= 5 ? stdev(rets) : cfg.defaultVolatility / Math.sqrt(cfg.horizonDays);
    const sigma = clamp(dailyish * Math.sqrt(cfg.horizonDays), 0.02, 0.4);

    // Drift = mean reversion to median + short trend + approaching-departure pressure.
    const pull = prices.length >= 5 ? clamp((med - price) / price, -0.5, 0.5) * cfg.meanReversionKappa : 0;
    const recent = prices.slice(-10);
    const trend = recent.length >= 4 && price > 0 ? clamp((slope(recent) / price) * cfg.horizonDays, -0.1, 0.1) * 0.5 : 0;
    const rule = cfg.departureRiseRules.find((r) => input.daysToDeparture <= r.maxDays);
    const rise = rule ? rule.rise : 0;
    const mu = pull + trend + rise;

    const { pUp, pDn, eUp, eDn } = tailExpectations(mu, sigma, cfg.flatBand);
    const total = pUp + pDn;
    const flat = clamp01(1 - total);

    // Disappearance risk: inventory + proximity to departure.
    let disappear = 0.03;
    if (input.availability === 'LIMITED') disappear += 0.15;
    if (input.availability === 'UNAVAILABLE') disappear = 1;
    if (input.seatsLeft !== undefined) disappear += clamp((5 - input.seatsLeft) * 0.06, 0, 0.3);
    if (input.daysToDeparture <= 14) disappear += 0.05;
    disappear = clamp01(disappear + (pull > 0.05 ? 0.05 : 0)); // deeply discounted offers sell out faster

    const n = prices.length;
    const dataConf = clamp01(n / cfg.minHistoryForConfidence);
    const volConf = clamp01(1 - sigma / 0.4);
    const confidence = clamp01(0.7 * dataConf + 0.3 * volConf);

    const q = (z: number) => Math.max(0, Math.round(price * (1 + mu + z * sigma) * 100) / 100);
    return {
      downProbability: round3(pDn),
      flatProbability: round3(flat),
      upProbability: round3(pUp),
      disappearanceRisk: round3(disappear),
      expectedDownAmount: Math.round(price * eDn * 100) / 100,
      expectedUpAmount: Math.round(price * eUp * 100) / 100,
      forecastLow: q(-Z90),
      forecastMedian: q(0),
      forecastHigh: q(Z90),
      confidence: round3(confidence),
      modelVersion: this.version,
    };
  }
}
const round3 = (v: number): number => Math.round(v * 1000) / 1000;
