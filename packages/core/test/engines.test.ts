import { describe, expect, it } from 'vitest';
import { ANOMALY_CONFIG } from '@dealhunter/config';
import type { PricePoint } from '@dealhunter/types';
import { analyzeOffer, computeAnomaly, decide, levelFor, MockFlightProvider, StatisticalForecastModel } from '../src';

const hist = (prices: number[]): PricePoint[] => prices.map((price, i) => ({ capturedAt: new Date(Date.UTC(2026, 0, 1) + i * 6 * 3600_000).toISOString(), price }));
const stable = hist(Array.from({ length: 60 }, (_, i) => 500 + ((i * 37) % 40) - 20));

describe('config', () => {
  it('anomaly weights sum to 1', () => {
    expect(Object.values(ANOMALY_CONFIG.weights).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 6);
  });
  it('thresholds map to levels', () => {
    expect(levelFor(90)).toBe('EXTREME_DEAL'); expect(levelFor(89.9)).toBe('GREAT_DEAL');
    expect(levelFor(80)).toBe('GREAT_DEAL'); expect(levelFor(65)).toBe('GOOD_DEAL'); expect(levelFor(64)).toBe('NORMAL');
  });
});

describe('anomaly engine', () => {
  it('scores a normal price low', () => {
    const r = computeAnomaly({ price: 500, history: stable });
    expect(r.score).toBeLessThan(65); expect(r.level).toBe('NORMAL');
  });
  it('flags a deep, validated drop as EXTREME_DEAL', () => {
    const r = computeAnomaly({ price: 200, history: stable, comparablePrices: [480, 500, 520, 510], otherProviderPrices: [210] });
    expect(r.level).toBe('EXTREME_DEAL'); expect(r.discountPct).toBeGreaterThan(0.5);
  });
  it('caps the score when history is insufficient', () => {
    const r = computeAnomaly({ price: 100, history: hist([500, 510]), comparablePrices: [500, 510, 520] });
    expect(r.insufficientHistory).toBe(true); expect(r.score).toBeLessThanOrEqual(79);
  });
  it('score stays within 0..100', () => {
    for (const p of [1, 100, 500, 5000]) { const s = computeAnomaly({ price: p, history: stable }).score; expect(s).toBeGreaterThanOrEqual(0); expect(s).toBeLessThanOrEqual(100); }
  });
});

describe('forecast engine', () => {
  const m = new StatisticalForecastModel();
  it('returns a coherent distribution', () => {
    const f = m.predict({ price: 500, history: stable, daysToDeparture: 30 });
    expect(f.downProbability + f.flatProbability + f.upProbability).toBeCloseTo(1, 2);
    expect(f.forecastLow).toBeLessThanOrEqual(f.forecastMedian); expect(f.forecastMedian).toBeLessThanOrEqual(f.forecastHigh);
    expect(f.modelVersion).toBe('stat-v1');
  });
  it('underpriced offers are more likely to rise (mean reversion)', () => {
    const cheap = m.predict({ price: 250, history: stable, daysToDeparture: 60 });
    expect(cheap.upProbability).toBeGreaterThan(cheap.downProbability);
  });
  it('limited seats raise disappearance risk; unavailable = 1', () => {
    const a = m.predict({ price: 500, history: stable, daysToDeparture: 30, availability: 'AVAILABLE' });
    const b = m.predict({ price: 500, history: stable, daysToDeparture: 30, availability: 'LIMITED', seatsLeft: 2 });
    expect(b.disappearanceRisk).toBeGreaterThan(a.disappearanceRisk);
    expect(m.predict({ price: 500, history: stable, daysToDeparture: 30, availability: 'UNAVAILABLE' }).disappearanceRisk).toBe(1);
  });
  it('low history → low confidence', () => {
    expect(m.predict({ price: 500, history: hist([500, 505]), daysToDeparture: 30 }).confidence).toBeLessThan(0.35);
  });
});

describe('decision engine', () => {
  const m = new StatisticalForecastModel();
  const run = (price: number, history = stable, days = 30) => {
    const anomaly = computeAnomaly({ price, history });
    const forecast = m.predict({ price, history, daysToDeparture: days });
    return decide({ price, history, anomaly, forecast });
  };
  it('BUY for a deeply discounted price', () => { const d = run(260); expect(d.decision).toBe('BUY'); expect(d.reasons).toContain('EXTREME_MEDIAN_DEVIATION'); expect(d.decisionMargin).toBeGreaterThan(0); });
  it('WAIT for an expensive price far from departure', () => { const d = run(700, stable, 120); expect(d.decision).toBe('WAIT'); });
  it('WATCH + reason codes when history is thin', () => {
    const d = run(300, hist([500, 505, 510]));
    expect(d.decision).toBe('WATCH'); expect(d.reasons).toEqual(expect.arrayContaining(['INSUFFICIENT_HISTORY', 'LOW_DATA_CONFIDENCE']));
  });
  it('buyScore bounded, reasons stored', () => { const d = run(500); expect(d.buyScore).toBeGreaterThanOrEqual(0); expect(d.buyScore).toBeLessThanOrEqual(100); expect(Array.isArray(d.reasons)).toBe(true); });
});

describe('analysis over mock provider', () => {
  it('produces a full DealAnalysis for every mock offer', async () => {
    const now = new Date('2026-06-01T00:00:00Z');
    const p = new MockFlightProvider(() => now);
    const offers = await p.searchFlights({ origin: 'NRT', destination: 'HNL', departureDate: '2026-08-15', tripType: 'ONE_WAY', passengers: 1, cabin: 'ECONOMY', currency: 'USD', flexibleDates: false });
    expect(offers.length).toBeGreaterThan(0);
    for (const o of offers) {
      const a = analyzeOffer(o, { history: await p.getHistory(o.flightIdentity, now), now });
      expect(['BUY', 'WAIT', 'WATCH']).toContain(a.decision.decision);
      expect(a.anomaly.score).toBeGreaterThanOrEqual(0);
    }
  });
});
