// deno-lint-ignore-file no-explicit-any
import { handler, json, limit, requireUser, HttpError } from '../_shared/http.ts';
import { cost, getProvider, loadHistory, providerLog, recordOffer } from '../_shared/domain.ts';
// @ts-ignore generated
import { dealFor, RATE_LIMITS } from '../_shared/core.mjs';

const IATA = /^[A-Z]{3}$/, DATE = /^\d{4}-\d{2}-\d{2}$/;
Deno.serve(handler(async (req, sb) => {
  const user = await requireUser(req, sb);
  await limit(sb, 'search', user.id, RATE_LIMITS.search);
  const p = await req.json().catch(() => null);
  if (!p || !IATA.test(p.origin) || !IATA.test(p.destination) || !DATE.test(p.departureDate) || !(p.passengers >= 1 && p.passengers <= 9)) throw new HttpError(400, 'Invalid search');
  const provider = getProvider();
  const t0 = Date.now();
  let offers: any[];
  try { offers = await provider.searchFlights(p); await providerLog(sb, provider.name, 'search', true, Date.now() - t0); }
  catch (e) { await providerLog(sb, provider.name, 'search', false, Date.now() - t0, String(e)); throw new HttpError(502, 'Flight provider unavailable'); }
  const now = new Date();
  const deals = await Promise.all(offers.slice(0, 40).map((o) => dealFor(o, (id: string) => loadHistory(sb, provider, id), now)));
  await Promise.all(deals.slice(0, 20).map((d: any) => recordOffer(sb, d)));
  await cost(sb, { provider: provider.name, operation: 'search', user_id: user.id });
  await sb.from('search_history').insert({ user_id: user.id, params: p });
  return json(req, deals);
}));
