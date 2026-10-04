import { handler, json, limit, requireUser, HttpError } from '../_shared/http.ts';
import { getProvider, loadHistory } from '../_shared/domain.ts';
// @ts-ignore generated
import { dealFor, RATE_LIMITS } from '../_shared/core.mjs';

Deno.serve(handler(async (req, sb) => {
  const user = await requireUser(req, sb);
  await limit(sb, 'search', user.id, RATE_LIMITS.search);
  const { offerId } = await req.json().catch(() => ({}));
  if (typeof offerId !== 'string' || offerId.length > 200) throw new HttpError(400, 'Invalid id');
  const provider = getProvider();
  const offer = await provider.getOffer(offerId.replace(/^[a-z]+:/, ''));
  return json(req, offer ? await dealFor(offer, (id: string) => loadHistory(sb, provider, id), new Date()) : null);
}));
