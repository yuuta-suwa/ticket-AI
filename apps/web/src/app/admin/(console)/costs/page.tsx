import { serviceClient } from '../../../../server/admin';
import { summarizeCosts, type CostRow } from '../../../../server/metrics';

export default async function Costs() {
  const sb = serviceClient(); const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const [{ data }, { data: prem }] = await Promise.all([
    sb.schema('private').from('cost_events').select('provider, operation, estimated_cost, request_count, user_id, deal_id, tokens').gte('created_at', since).limit(50000),
    sb.from('user_entitlements').select('user_id').eq('premium_active', true),
  ]);
  const s = summarizeCosts((data ?? []) as CostRow[], new Set((prem ?? []).map((p) => p.user_id)));
  const usd = (v: number) => `$${v.toFixed(4)}`;
  return (
    <>
      <h1>Costs (30 days)</h1>
      <div className="grid">
        {[['Total', usd(s.total)], ['Per user', usd(s.costPerUser)], ['Per Premium user', usd(s.costPerPremiumUser)], ['Per search', usd(s.costPerSearch)], ['Per deal', usd(s.costPerDeal)]].map(([l, v]) => <div className="card" key={l}><div className="muted">{l}</div><div className="kpi">{v}</div></div>)}
      </div>
      <h2>By provider (API, AI, notifications)</h2>
      <table><thead><tr><th>Provider</th><th>Requests</th><th>Estimated cost</th></tr></thead><tbody>{s.byProvider.map((p) => <tr key={p.provider}><td>{p.provider}</td><td>{p.requests}</td><td>{usd(p.cost)}</td></tr>)}</tbody></table>
      <p className="muted">Costs are estimates recorded per call in private.cost_events. Aggregation is capped at 50,000 events; move to a SQL view for larger volumes.</p>
    </>
  );
}
