import type { Deal, DealAnalysis, Entitlements, ForecastResult } from '@dealhunter/types';

/** Server-side enforcement of the Advanced Forecast entitlement: withheld fields never reach FREE clients. */
export function redactAnalysis(a: DealAnalysis, e: Pick<Entitlements, 'advancedForecast'>): DealAnalysis {
  if (e.advancedForecast) return a;
  const f = a.forecast;
  const redacted: ForecastResult = {
    ...f, downProbability: 0, flatProbability: 0, upProbability: 0, expectedDownAmount: 0, expectedUpAmount: 0,
    forecastLow: 0, forecastMedian: 0, forecastHigh: 0, redacted: true,
  };
  return { ...a, forecast: redacted, decision: { ...a.decision, waitLoss: 0, buyLoss: 0, decisionMargin: 0 } };
}
export const redactDeal = (d: Deal, e: Pick<Entitlements, 'advancedForecast'>): Deal => ({ ...d, analysis: redactAnalysis(d.analysis, e) });
