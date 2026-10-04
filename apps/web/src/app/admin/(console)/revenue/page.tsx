import { serviceClient } from '../../../../server/admin';
import { conversion } from '../../../../server/metrics';

export default async function Revenue() {
  const sb = serviceClient();
  const [{ count: users }, { count: premium }] = await Promise.all([
    sb.from('profiles').select('*', { count: 'exact', head: true }),
    sb.from('user_entitlements').select('*', { count: 'exact', head: true }).eq('premium_active', true),
  ]);
  const pending = (l: string, src: string) => <div className="card" key={l}><div className="muted">{l}</div><div className="kpi">Not connected</div><div className="muted">Source: {src}</div></div>;
  return (
    <>
      <h1>Revenue</h1>
      <div className="grid">
        <div className="card"><div className="muted">Premium subscribers</div><div className="kpi">{premium ?? 0}</div></div>
        <div className="card"><div className="muted">Premium conversion</div><div className="kpi">{(conversion(premium ?? 0, users ?? 0) * 100).toFixed(1)}%</div></div>
        {pending('MRR', 'RevenueCat Charts / Overview API (prices live in the stores, never in this app)')}
        {pending('Ad revenue', 'AdMob reporting API')}
        {pending('Affiliate clicks / revenue', 'Partner reporting (purchase_out_click events are counted client-side in analytics)')}
      </div>
      <p className="muted">Subscriber counts come from our entitlement table. Revenue figures are intentionally not estimated here: connect RevenueCat / AdMob reporting before relying on them.</p>
    </>
  );
}
