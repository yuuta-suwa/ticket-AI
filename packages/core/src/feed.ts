import type { Deal, FlightOffer, HomeFeed, PricePoint } from '@dealhunter/types';
import { analyzeOffer, seasonalFactorFor } from './analyze';
import type { FlightProvider } from './providers/types';

export const FEED_ROUTES: readonly (readonly [string, string])[] = [['NRT', 'HNL'], ['HND', 'SIN'], ['KIX', 'LAX'], ['NRT', 'CDG'], ['FUK', 'ICN'], ['SFO', 'NRT'], ['JFK', 'LHR'], ['HND', 'BKK']];
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86_400_000).toISOString().slice(0, 10);

export async function dealFor(offer: FlightOffer, loadHistory: (identity: string) => Promise<PricePoint[]>, now: Date): Promise<Deal> {
  const history = await loadHistory(offer.flightIdentity);
  return { offer, analysis: analyzeOffer(offer, { history, now, seasonalFactor: seasonalFactorFor(new Date(offer.departureAt)), comparablePrices: history.slice(-20).map((h) => h.price) }) };
}

/** Builds the Home screen sections from a provider + history source. Pure orchestration, provider-agnostic. */
export async function buildHomeFeed(provider: FlightProvider, loadHistory: (identity: string) => Promise<PricePoint[]>, now: Date, currency = 'USD'): Promise<HomeFeed> {
  const all: Deal[] = [];
  for (const [o, d] of FEED_ROUTES) {
    const offers = await provider.searchFlights({ origin: o, destination: d, departureDate: addDays(now, 45), tripType: 'ONE_WAY', passengers: 1, cabin: 'ECONOMY', currency, flexibleDates: false });
    for (const offer of offers.slice(0, 2)) all.push(await dealFor(offer, loadHistory, now));
  }
  const top = (f: (d: Deal) => boolean, n: number) => all.filter(f).sort((a, b) => b.analysis.anomaly.score - a.analysis.anomaly.score).slice(0, n);
  return {
    extremeDeals: top((d) => d.analysis.anomaly.level === 'EXTREME_DEAL', 5),
    buyNow: top((d) => d.analysis.decision.decision === 'BUY', 6),
    priceDrops: top((d) => (d.analysis.anomaly.components.suddenDrop ?? 0) >= 40, 6),
    recommendedRoutes: FEED_ROUTES.slice(0, 6).map(([o, d]) => ({ origin: o, destination: d, currency, fromPrice: Math.min(...all.filter((x) => x.offer.origin === o && x.offer.destination === d).map((x) => x.offer.price.amount)) })),
    latest: top(() => true, 12),
    generatedAt: now.toISOString(),
  };
}
