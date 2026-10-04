import { serviceClient } from '../../../../server/admin';

export default async function Deals() {
  const priv = serviceClient().schema('private');
  const { data: an } = await priv.from('anomaly_results').select('offer_id, score, level, computed_at').in('level', ['EXTREME_DEAL', 'GREAT_DEAL']).order('computed_at', { ascending: false }).limit(50);
  const ids = [...new Set((an ?? []).map((a) => a.offer_id))];
  const { data: offers } = ids.length ? await priv.from('flight_offers').select('id, origin, destination, last_price, currency, carrier, departure_at').in('id', ids) : { data: [] as { id: string; origin: string; destination: string; last_price: number; currency: string; carrier: string; departure_at: string }[] };
  const o = new Map((offers ?? []).map((x) => [x.id, x]));
  return (
    <>
      <h1>Extreme &amp; great deals</h1>
      <table><thead><tr><th>When</th><th>Route</th><th>Carrier</th><th>Price</th><th>Score</th><th>Level</th></tr></thead>
        <tbody>{(an ?? []).map((a, i) => { const f = o.get(a.offer_id); return <tr key={i}><td>{new Date(a.computed_at).toLocaleString()}</td><td>{f ? `${f.origin} → ${f.destination}` : a.offer_id}</td><td>{f?.carrier ?? '—'}</td><td>{f ? `${f.currency} ${Math.round(Number(f.last_price))}` : '—'}</td><td>{Number(a.score).toFixed(1)}</td><td>{a.level}</td></tr>; })}</tbody></table>
    </>
  );
}
