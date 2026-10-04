import { serviceClient } from '../../../../server/admin';
import { summarizeProviders, type ProviderLogRow } from '../../../../server/metrics';

export default async function Providers() {
  const priv = serviceClient().schema('private'); const since = new Date(Date.now() - 86_400_000).toISOString();
  const { data } = await priv.from('provider_logs').select('provider, operation, ok, latency_ms').gte('created_at', since).limit(20000);
  const rows = summarizeProviders((data ?? []) as ProviderLogRow[]);
  const { data: errs } = await priv.from('provider_logs').select('provider, operation, error, created_at').eq('ok', false).order('created_at', { ascending: false }).limit(15);
  const { data: failedJobs } = await priv.from('notification_jobs').select('id, type, error, created_at').eq('status', 'FAILED').order('created_at', { ascending: false }).limit(10);
  return (
    <>
      <h1>Provider health (24h)</h1>
      <table><thead><tr><th>Provider</th><th>Operation</th><th>Calls</th><th>Failures</th><th>Failure rate</th><th>Avg latency</th></tr></thead>
        <tbody>{rows.map((r) => <tr key={`${r.provider}${r.operation}`}><td>{r.provider}</td><td>{r.operation}</td><td>{r.calls}</td><td>{r.failures}</td><td>{(r.failureRate * 100).toFixed(1)}%</td><td>{r.avgLatencyMs} ms</td></tr>)}</tbody></table>
      <h2>Recent provider errors</h2>
      <table><tbody>{(errs ?? []).map((e, i) => <tr key={i}><td>{new Date(e.created_at).toLocaleString()}</td><td>{e.provider}/{e.operation}</td><td>{e.error}</td></tr>)}</tbody></table>
      <h2>Failed notification jobs (queue failures)</h2>
      <table><tbody>{(failedJobs ?? []).map((j) => <tr key={j.id}><td>{new Date(j.created_at).toLocaleString()}</td><td>{j.type}</td><td>{j.error}</td></tr>)}</tbody></table>
    </>
  );
}
