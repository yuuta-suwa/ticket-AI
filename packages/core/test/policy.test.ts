import { describe, expect, it } from 'vitest';
import type { Deal, NotificationPreferences } from '@dealhunter/types';
import {
  analyzeOffer, applyRevenueCatEvent, canAddToWatchlist, canAssignRole, classifyDeal, entitlementsForPlan, evaluateOutcome, InMemoryRateLimiter,
  isDue, isQuietHour, MockFlightProvider, monitoringPriority, needsRevalidation, resolvePlan, revalidateOffer, shouldNotify, shouldShowAds, FakePurchaseProvider,
} from '../src';

describe('entitlements / plan access', () => {
  it('FREE has ads, limited watchlist, no premium features', () => {
    const e = entitlementsForPlan('FREE');
    expect(e).toMatchObject({ adsEnabled: true, advancedForecast: false, instantAlerts: false, isAdmin: false });
    expect(canAddToWatchlist(e, e.watchlistLimit - 1)).toBe(true); expect(canAddToWatchlist(e, e.watchlistLimit)).toBe(false);
  });
  it('PREMIUM unlocks features, no ads', () => { const e = entitlementsForPlan('PREMIUM'); expect(e).toMatchObject({ adsEnabled: false, advancedForecast: true, instantAlerts: true }); expect(shouldShowAds(e)).toBe(false); });
  it('MANAGED needs no subscription', () => {
    const e = entitlementsForPlan('MANAGED');
    expect(e).toMatchObject({ subscriptionRequired: false, adsEnabled: false, advancedForecast: true }); expect(e.watchlistLimit).toBeGreaterThan(entitlementsForPlan('PREMIUM').watchlistLimit);
  });
  it('resolves plan from server state; expired premium falls back to FREE', () => {
    const now = new Date('2026-01-10T00:00:00Z');
    expect(resolvePlan({ premiumActive: true, premiumExpiresAt: '2026-02-01T00:00:00Z' }, now)).toBe('PREMIUM');
    expect(resolvePlan({ premiumActive: true, premiumExpiresAt: '2026-01-01T00:00:00Z' }, now)).toBe('FREE');
    expect(resolvePlan({ premiumActive: false, accessPlan: 'MANAGED' }, now)).toBe('MANAGED');
  });
  it('role escalation is blocked', () => {
    expect(canAssignRole('FREE', 'SUPER_ADMIN')).toBe(false); expect(canAssignRole('PREMIUM', 'MANAGED')).toBe(false);
    expect(canAssignRole('ADMIN', 'SUPER_ADMIN')).toBe(false); expect(canAssignRole('ADMIN', 'ADMIN')).toBe(false);
    expect(canAssignRole('ADMIN', 'MANAGED')).toBe(true); expect(canAssignRole('SUPER_ADMIN', 'ADMIN')).toBe(true);
  });
  it('no ads when entitlements unknown', () => expect(shouldShowAds(null)).toBe(false));
});

describe('RevenueCat → entitlement transitions', () => {
  const T = 1_000;
  it('purchase activates, cancellation keeps access until expiry, expiration revokes', () => {
    const exp = Date.UTC(2026, 5, 1);
    let r = applyRevenueCatEvent(null, { type: 'INITIAL_PURCHASE', app_user_id: 'u', entitlement_ids: ['premium'], expiration_at_ms: exp, event_timestamp_ms: T }, 'premium');
    expect(r?.premiumActive).toBe(true);
    r = applyRevenueCatEvent(r, { type: 'CANCELLATION', app_user_id: 'u', entitlement_ids: ['premium'], event_timestamp_ms: T + 1 }, 'premium');
    expect(r).toMatchObject({ premiumActive: true, willRenew: false });
    r = applyRevenueCatEvent(r, { type: 'EXPIRATION', app_user_id: 'u', entitlement_ids: ['premium'], event_timestamp_ms: T + 2 }, 'premium');
    expect(r?.premiumActive).toBe(false);
  });
  it('ignores stale out-of-order events and other entitlements', () => {
    const r1 = applyRevenueCatEvent(null, { type: 'INITIAL_PURCHASE', app_user_id: 'u', entitlement_ids: ['premium'], event_timestamp_ms: T + 5 }, 'premium');
    expect(applyRevenueCatEvent(r1, { type: 'EXPIRATION', app_user_id: 'u', entitlement_ids: ['premium'], event_timestamp_ms: T }, 'premium')).toBe(r1);
    expect(applyRevenueCatEvent(null, { type: 'INITIAL_PURCHASE', app_user_id: 'u', entitlement_ids: ['other'] }, 'premium')).toBeNull();
  });
});

describe('fake purchase provider', () => {
  it('purchase then restore on a fresh session', async () => {
    const p = new FakePurchaseProvider(); expect((await p.getPackages()).length).toBe(2);
    const r = await p.purchase('$rc_monthly'); expect(r.status).toBe('success');
    await p.logOut(); expect((await p.getState()).premiumActive).toBe(false);
    expect((await p.restore()).status).toBe('success');
    expect(await p.purchase('nope')).toMatchObject({ status: 'error' });
  });
});

describe('revalidation', () => {
  const now = new Date('2026-06-01T12:00:00Z');
  const provider = new MockFlightProvider(() => now);
  const params = { origin: 'NRT', destination: 'HNL', departureDate: '2026-08-15', tripType: 'ONE_WAY' as const, passengers: 1, cabin: 'ECONOMY' as const, currency: 'USD', flexibleDates: false };
  it('stale offers need revalidation', async () => {
    const [o] = await provider.searchFlights(params); expect(o).toBeDefined();
    expect(needsRevalidation(o!, now)).toBe(false);
    expect(needsRevalidation(o!, new Date(now.getTime() + 11 * 60_000))).toBe(true);
  });
  it('re-quotes and recomputes the recommendation', async () => {
    const [o] = await provider.searchFlights(params);
    const res = await revalidateOffer(provider, o!, async (f) => ({ history: await provider.getHistory(f.flightIdentity, now), now }), now);
    expect(['UNCHANGED', 'PRICE_CHANGED']).toContain(res.status); expect(res.canProceed).toBe(true); expect(res.deal?.analysis.decision).toBeDefined();
  });
  it('provider failure never throws and blocks the hand-off', async () => {
    const bad = { ...provider, name: 'bad', revalidateOffer: async () => { throw new Error('boom'); } } as unknown as MockFlightProvider;
    const [o] = await provider.searchFlights(params);
    const res = await revalidateOffer(bad, o!, () => ({ history: [] }), now);
    expect(res).toMatchObject({ status: 'ERROR', canProceed: false });
  });
  it('unavailable offers are reported', async () => {
    const gone = { ...provider, revalidateOffer: async () => null } as unknown as MockFlightProvider;
    const [o] = await provider.searchFlights(params);
    expect((await revalidateOffer(gone, o!, () => ({ history: [] }), now)).status).toBe('UNAVAILABLE');
  });
});

describe('notifications', () => {
  const now = new Date('2026-06-01T12:00:00Z');
  const provider = new MockFlightProvider(() => now);
  const prefs: NotificationPreferences = { enabledTypes: ['EXTREME_DEAL', 'BUY_SIGNAL'], routes: [], minScore: 0, priceThreshold: null, quietHours: null };
  async function deal(): Promise<Deal> {
    const [o] = await provider.searchFlights({ origin: 'NRT', destination: 'HNL', departureDate: '2026-08-15', tripType: 'ONE_WAY', passengers: 1, cabin: 'ECONOMY', currency: 'USD', flexibleDates: false });
    return { offer: o!, analysis: analyzeOffer(o!, { history: await provider.getHistory(o!.flightIdentity, now), now }) };
  }
  it('quiet hours handle overnight windows and offsets', () => {
    const q = { startHour: 22, endHour: 8, utcOffsetMinutes: 540 };
    expect(isQuietHour(q, new Date('2026-06-01T14:00:00Z'))).toBe(true);   // 23:00 JST
    expect(isQuietHour(q, new Date('2026-06-01T03:00:00Z'))).toBe(false);  // 12:00 JST
  });
  it('dedupes, respects filters', async () => {
    const d = await deal();
    const first = shouldNotify(prefs, d, 'BUY_SIGNAL', now, new Set());
    expect(first.send).toBe(true);
    expect(shouldNotify(prefs, d, 'BUY_SIGNAL', now, new Set([first.key]))).toMatchObject({ send: false, reason: 'DUPLICATE' });
    expect(shouldNotify({ ...prefs, enabledTypes: [] }, d, 'BUY_SIGNAL', now, new Set())).toMatchObject({ reason: 'TYPE_DISABLED' });
    expect(shouldNotify({ ...prefs, routes: ['AAA-BBB'] }, d, 'BUY_SIGNAL', now, new Set())).toMatchObject({ reason: 'ROUTE' });
    expect(shouldNotify({ ...prefs, minScore: 101 }, d, 'BUY_SIGNAL', now, new Set())).toMatchObject({ reason: 'SCORE' });
    expect(shouldNotify({ ...prefs, priceThreshold: 1 }, d, 'BUY_SIGNAL', now, new Set())).toMatchObject({ reason: 'THRESHOLD' });
  });
  it('classifies price drops', async () => {
    const d = await deal();
    expect(classifyDeal(d, { price: d.offer.price.amount * 1.5 }, null)).toContain('PRICE_DROP');
    expect(classifyDeal(d, null, d.offer.price.amount + 1)).toContain('TARGET_PRICE');
  });
});

describe('outcomes, monitoring, rate limit', () => {
  it('labels outcomes', () => {
    expect(evaluateOutcome({ price: 100, decision: 'BUY' }, 120)).toBe('GOOD_DECISION');
    expect(evaluateOutcome({ price: 100, decision: 'BUY' }, 80)).toBe('BAD_DECISION');
    expect(evaluateOutcome({ price: 100, decision: 'WAIT' }, 80)).toBe('GOOD_DECISION');
    expect(evaluateOutcome({ price: 100, decision: 'WAIT' }, 101)).toBe('NEUTRAL');
    expect(evaluateOutcome({ price: 100, decision: 'WATCH' }, 50)).toBe('NEUTRAL');
    expect(evaluateOutcome({ price: 100, decision: 'BUY' }, null)).toBe('GOOD_DECISION');
  });
  it('assigns monitoring priority', () => {
    const b = { plan: 'FREE' as const, watched: false, highDemandRoute: false, extremeCandidate: false, daysSinceActive: 1 };
    expect(monitoringPriority({ ...b, plan: 'PREMIUM', watched: true, extremeCandidate: true })).toBe('P0');
    expect(monitoringPriority({ ...b, plan: 'MANAGED', watched: true })).toBe('P1');
    expect(monitoringPriority({ ...b, highDemandRoute: true })).toBe('P2');
    expect(monitoringPriority({ ...b, watched: true })).toBe('P3');
    expect(monitoringPriority({ ...b, daysSinceActive: 90 })).toBe('P4');
    expect(isDue('P4', null, new Date())).toBe(false); expect(isDue('P0', null, new Date())).toBe(true);
  });
  it('rate limits per window', async () => {
    const rl = new InMemoryRateLimiter();
    for (let i = 0; i < 3; i++) expect((await rl.hit('k', 3, 60, 0)).allowed).toBe(true);
    const r = await rl.hit('k', 3, 60, 1000); expect(r.allowed).toBe(false); expect(r.retryAfterSeconds).toBe(59);
    expect((await rl.hit('k', 3, 60, 61_000)).allowed).toBe(true);
  });
});
