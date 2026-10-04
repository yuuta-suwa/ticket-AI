import { serviceClient } from '../../../server/admin';
import { conversion } from '../../../server/metrics';

export default async function Overview() {
  const sb = serviceClient(); const priv = sb.schema('private'); const since = new Date(Date.now() - 86_400_000).toISOString();
  const count = async (q: PromiseLike<{ count: number | null }>) => (await q).count ?? 0;
  const [users, premium, managed, jobs, extreme, sent, failed] = await Promise.all([
    count(sb.from('profiles').select('*', { count: 'exact', head: true })),
    count(sb.from('user_entitlements').select('*', { count: 'exact', head: true }).eq('premium_active', true)),
    count(sb.from('user_access').select('*', { count: 'exact', head: true }).eq('plan', 'MANAGED')),
    count(priv.from('analysis_jobs').select('*', { count: 'exact', head: true })),
    count(priv.from('anomaly_results').select('*', { count: 'exact', head: true }).eq('level', 'EXTREME_DEAL').gte('computed_at', since)),
    count(priv.from('notification_jobs').select('*', { count: 'exact', head: true }).eq('status', 'SENT').gte('created_at', since)),
    count(priv.from('notification_jobs').select('*', { count: 'exact', head: true }).eq('status', 'FAILED').gte('created_at', since)),
  ]);
  const kpi = (l: string, v: string | number) => <div className="card" key={l}><div className="muted">{l}</div><div className="kpi">{v}</div></div>;
  return (
    <>
      <h1>Overview</h1>
      <div className="grid">
        {kpi('Users', users)}{kpi('Premium (active)', premium)}{kpi('Managed', managed)}{kpi('Premium conversion', `${(conversion(premium, users) * 100).toFixed(1)}%`)}
        {kpi('Monitored flights', jobs)}{kpi('EXTREME deals (24h)', extreme)}{kpi('Notifications sent (24h)', sent)}{kpi('Notification failures (24h)', failed)}
      </div>
    </>
  );
}
