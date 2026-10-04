import { handler, json, limit, requireUser, HttpError } from '../_shared/http.ts';
import { getProvider, loadHistory } from '../_shared/domain.ts';
// @ts-ignore generated
import { RATE_LIMITS } from '../_shared/core.mjs';

// price_snapshots is private IP: only a down-sampled series for one identity is ever returned.
Deno.serve(handler(async (req, sb) => {
  const user = await requireUser(req, sb);
  await limit(sb, 'search', user.id, RATE_LIMITS.search);
  const { flightIdentity } = await req.json().catch(() => ({}));
  if (typeof flightIdentity !== 'string' || flightIdentity.length > 200) throw new HttpError(400, 'Invalid id');
  const h = await loadHistory(sb, getProvider(), flightIdentity);
  const step = Math.max(1, Math.ceil(h.length / 120));
  return json(req, h.filter((_: unknown, i: number) => i % step === 0));
}));
