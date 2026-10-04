import { serviceClient } from '../../../../server/admin';
import { summarizeOutcomes, type OutcomeRow } from '../../../../server/metrics';

export default async function Accuracy() {
  const priv = serviceClient().schema('private');
  const { data } = await priv.from('model_outcomes').select('horizon_hours, label').limit(50000);
  const rows = summarizeOutcomes((data ?? []) as OutcomeRow[]);
  return (
    <>
      <h1>Recommendation accuracy</h1>
      <p className="muted">Each recommendation is compared with the price 1h / 6h / 24h / 72h / 7d later. Accuracy = good ÷ (good + bad); neutral outcomes are excluded.</p>
      <table><thead><tr><th>Horizon</th><th>Good</th><th>Bad</th><th>Neutral</th><th>Evaluated</th><th>Accuracy</th></tr></thead>
        <tbody>{rows.map((r) => <tr key={r.horizon}><td>{r.horizon >= 24 ? `${r.horizon / 24}d` : `${r.horizon}h`}</td><td>{r.good}</td><td>{r.bad}</td><td>{r.neutral}</td><td>{r.total}</td><td>{r.accuracy === null ? '—' : `${(r.accuracy * 100).toFixed(1)}%`}</td></tr>)}</tbody></table>
    </>
  );
}
