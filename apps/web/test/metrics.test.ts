import { describe, expect, it } from 'vitest';
import { conversion, summarizeCosts, summarizeOutcomes, summarizeProviders } from '../src/server/metrics';

describe('admin metrics', () => {
  it('cost per user / premium user / search / deal', () => {
    const s = summarizeCosts([
      { provider: 'duffel', operation: 'search', estimated_cost: 0.02, request_count: 1, user_id: 'a', deal_id: null },
      { provider: 'duffel', operation: 'search', estimated_cost: 0.02, request_count: 1, user_id: 'b', deal_id: null },
      { provider: 'openai', operation: 'explain', estimated_cost: 0.01, request_count: 1, user_id: 'b', deal_id: 'd1' },
    ], new Set(['b']));
    expect(s.total).toBeCloseTo(0.05); expect(s.costPerUser).toBeCloseTo(0.025); expect(s.costPerPremiumUser).toBeCloseTo(0.03);
    expect(s.costPerSearch).toBeCloseTo(0.025); expect(s.costPerDeal).toBeCloseTo(0.05); expect(s.byProvider[0]?.provider).toBe('duffel');
  });
  it('handles empty input', () => { expect(summarizeCosts([], new Set())).toMatchObject({ total: 0, costPerUser: 0, costPerSearch: 0 }); });
  it('provider health', () => {
    const r = summarizeProviders([{ provider: 'm', operation: 'search', ok: true, latency_ms: 100 }, { provider: 'm', operation: 'search', ok: false, latency_ms: 300 }]);
    expect(r[0]).toMatchObject({ calls: 2, failures: 1, failureRate: 0.5, avgLatencyMs: 200 });
  });
  it('forecast accuracy ignores neutral', () => {
    const r = summarizeOutcomes([{ horizon_hours: 24, label: 'GOOD_DECISION' }, { horizon_hours: 24, label: 'BAD_DECISION' }, { horizon_hours: 24, label: 'GOOD_DECISION' }, { horizon_hours: 24, label: 'NEUTRAL' }]);
    expect(r[0]?.accuracy).toBeCloseTo(2 / 3); expect(r[0]?.total).toBe(4);
  });
  it('conversion', () => { expect(conversion(5, 100)).toBe(0.05); expect(conversion(1, 0)).toBe(0); });
});
