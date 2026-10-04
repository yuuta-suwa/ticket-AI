// Pure aggregation helpers for the admin dashboard (unit-tested; no I/O).
export interface CostRow { provider: string; operation: string; estimated_cost: number | string; request_count: number; user_id: string | null; deal_id: string | null; tokens?: number | null }
export interface CostSummary {
  total: number; byProvider: { provider: string; cost: number; requests: number }[];
  costPerUser: number; costPerPremiumUser: number; costPerSearch: number; costPerDeal: number;
}
const n = (v: number | string | null | undefined) => Number(v ?? 0);

export function summarizeCosts(rows: CostRow[], premiumUserIds: ReadonlySet<string>): CostSummary {
  const by = new Map<string, { cost: number; requests: number }>();
  const users = new Set<string>(), deals = new Set<string>();
  let total = 0, searches = 0, premiumCost = 0;
  for (const r of rows) {
    const c = n(r.estimated_cost); total += c;
    const p = by.get(r.provider) ?? { cost: 0, requests: 0 }; p.cost += c; p.requests += n(r.request_count); by.set(r.provider, p);
    if (r.user_id) { users.add(r.user_id); if (premiumUserIds.has(r.user_id)) premiumCost += c; }
    if (r.deal_id) deals.add(r.deal_id);
    if (r.operation === 'search') searches += n(r.request_count);
  }
  const premiumUsers = [...users].filter((u) => premiumUserIds.has(u)).length;
  return {
    total, byProvider: [...by].map(([provider, v]) => ({ provider, ...v })).sort((a, b) => b.cost - a.cost),
    costPerUser: users.size ? total / users.size : 0, costPerPremiumUser: premiumUsers ? premiumCost / premiumUsers : 0,
    costPerSearch: searches ? total / searches : 0, costPerDeal: deals.size ? total / deals.size : 0,
  };
}

export interface ProviderLogRow { provider: string; operation: string; ok: boolean; latency_ms: number | null }
export function summarizeProviders(rows: ProviderLogRow[]) {
  const m = new Map<string, { provider: string; operation: string; calls: number; failures: number; latency: number }>();
  for (const r of rows) {
    const k = `${r.provider}/${r.operation}`; const e = m.get(k) ?? { provider: r.provider, operation: r.operation, calls: 0, failures: 0, latency: 0 };
    e.calls++; if (!r.ok) e.failures++; e.latency += r.latency_ms ?? 0; m.set(k, e);
  }
  return [...m.values()].map((e) => ({ ...e, failureRate: e.calls ? e.failures / e.calls : 0, avgLatencyMs: e.calls ? Math.round(e.latency / e.calls) : 0 }));
}

export interface OutcomeRow { horizon_hours: number; label: 'GOOD_DECISION' | 'BAD_DECISION' | 'NEUTRAL'; decision?: string }
export function summarizeOutcomes(rows: OutcomeRow[]) {
  const m = new Map<number, { horizon: number; good: number; bad: number; neutral: number }>();
  for (const r of rows) { const e = m.get(r.horizon_hours) ?? { horizon: r.horizon_hours, good: 0, bad: 0, neutral: 0 }; if (r.label === 'GOOD_DECISION') e.good++; else if (r.label === 'BAD_DECISION') e.bad++; else e.neutral++; m.set(r.horizon_hours, e); }
  return [...m.values()].sort((a, b) => a.horizon - b.horizon).map((e) => ({ ...e, total: e.good + e.bad + e.neutral, accuracy: e.good + e.bad ? e.good / (e.good + e.bad) : null }));
}
export const conversion = (premium: number, total: number): number => (total > 0 ? premium / total : 0);
