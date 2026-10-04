// deno-lint-ignore-file no-explicit-any
import { admin, json, timingSafeEqual } from '../_shared/http.ts';
// @ts-ignore generated
import { applyRevenueCatEvent, PURCHASE_CONFIG } from '../_shared/core.mjs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** RevenueCat → Supabase user_entitlements (the single product authorization layer). Server-to-server only. */
Deno.serve(async (req) => {
  if (req.method !== 'POST') return json(req, { error: 'Method not allowed' }, 405);
  const secret = Deno.env.get('REVENUECAT_WEBHOOK_AUTH') ?? '';
  const got = req.headers.get('authorization') ?? '';
  if (!secret || !timingSafeEqual(got, secret)) return json(req, { error: 'Unauthorized' }, 401);
  const ev = (await req.json().catch(() => null))?.event;
  if (!ev?.app_user_id || !UUID.test(ev.app_user_id)) return json(req, { ok: true, ignored: 'non-user event' }); // anonymous ids are ignored
  const sb = admin();
  const { data: prev } = await sb.from('user_entitlements').select('*').eq('user_id', ev.app_user_id).maybeSingle();
  const prevRow = prev ? { premiumActive: prev.premium_active, expiresAt: prev.expires_at, willRenew: prev.will_renew, lastEventAt: Number(prev.last_event_at) } : null;
  const next = applyRevenueCatEvent(prevRow, ev, PURCHASE_CONFIG.premiumEntitlementId);
  if (next && next !== prevRow) {
    const { error } = await sb.from('user_entitlements').upsert({ user_id: ev.app_user_id, premium_active: next.premiumActive, expires_at: next.expiresAt, will_renew: next.willRenew, last_event_at: next.lastEventAt, updated_at: new Date().toISOString() });
    if (error) { console.error('[rc-webhook] upsert failed'); return json(req, { error: 'retry' }, 500); } // RevenueCat retries on 5xx
    await sb.from('subscriptions').insert({ user_id: ev.app_user_id, store: ev.store, product_id: ev.product_id, status: next.premiumActive ? 'ACTIVE' : 'INACTIVE', period_end: next.expiresAt, raw_event_type: ev.type });
  }
  return json(req, { ok: true });
});
