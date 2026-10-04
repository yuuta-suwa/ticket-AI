import type { Entitlements, Plan } from '@dealhunter/types';
import { PLAN_LIMITS } from '@dealhunter/config';

export interface AccessState {
  /** from public.user_access (admin-assigned only) */
  accessPlan?: Extract<Plan, 'MANAGED' | 'ADMIN' | 'SUPER_ADMIN'> | null;
  /** from public.user_entitlements (written ONLY by the RevenueCat webhook / server) */
  premiumActive: boolean;
  premiumExpiresAt?: string | null;
}

/** Single authorisation layer: derives feature access from server-side state, never from client claims. */
export function resolvePlan(state: AccessState, now = new Date()): Plan {
  if (state.accessPlan) return state.accessPlan;
  const exp = state.premiumExpiresAt ? new Date(state.premiumExpiresAt).getTime() : Infinity;
  return state.premiumActive && exp > now.getTime() ? 'PREMIUM' : 'FREE';
}

export function entitlementsForPlan(plan: Plan): Entitlements {
  const l = PLAN_LIMITS[plan];
  return {
    plan,
    adsEnabled: l.adsEnabled,
    subscriptionRequired: l.subscriptionRequired,
    advancedForecast: l.premiumFeatures,
    instantAlerts: l.premiumFeatures,
    extremeDeals: l.premiumFeatures,
    detailedCharts: l.premiumFeatures,
    priorityMonitoring: l.premiumFeatures,
    watchlistLimit: l.watchlistLimit,
    isAdmin: plan === 'ADMIN' || plan === 'SUPER_ADMIN',
  };
}
export const resolveEntitlements = (s: AccessState, now = new Date()): Entitlements => entitlementsForPlan(resolvePlan(s, now));

export const canAddToWatchlist = (e: Entitlements, currentCount: number): boolean =>
  e.watchlistLimit < 0 || currentCount < e.watchlistLimit;

/** Only server code may call this with a trusted caller identity. Admin = row in user_access, NOT user_metadata. */
export const canManageUsers = (actorPlan: Plan): boolean => actorPlan === 'ADMIN' || actorPlan === 'SUPER_ADMIN';
export const canAssignRole = (actor: Plan, target: Plan): boolean =>
  actor === 'SUPER_ADMIN' ? true : actor === 'ADMIN' ? target === 'MANAGED' || target === 'FREE' : false;

// ---- RevenueCat webhook → entitlement transitions (pure, testable) ----
export interface RevenueCatEvent {
  type: string;                       // INITIAL_PURCHASE, RENEWAL, CANCELLATION, EXPIRATION, BILLING_ISSUE, ...
  app_user_id: string;
  entitlement_ids?: string[] | null;
  expiration_at_ms?: number | null;
  event_timestamp_ms?: number;
  store?: string;
  product_id?: string;
  period_type?: string;
}
export interface EntitlementRow { premiumActive: boolean; expiresAt: string | null; willRenew: boolean; lastEventAt: number }

const ACTIVATING = new Set(['INITIAL_PURCHASE', 'RENEWAL', 'PRODUCT_CHANGE', 'UNCANCELLATION', 'NON_RENEWING_PURCHASE', 'TEMPORARY_ENTITLEMENT_GRANT', 'SUBSCRIPTION_EXTENDED']);

export function applyRevenueCatEvent(prev: EntitlementRow | null, ev: RevenueCatEvent, premiumId: string): EntitlementRow | null {
  const ts = ev.event_timestamp_ms ?? 0;
  if (prev && ts && ts < prev.lastEventAt) return prev;            // out-of-order delivery: ignore stale
  if (ev.entitlement_ids && !ev.entitlement_ids.includes(premiumId)) return prev; // not our entitlement
  const exp = ev.expiration_at_ms ?? null;
  const base: EntitlementRow = prev ?? { premiumActive: false, expiresAt: null, willRenew: false, lastEventAt: ts };
  if (ACTIVATING.has(ev.type)) {
    return { premiumActive: true, expiresAt: exp ? new Date(exp).toISOString() : null, willRenew: true, lastEventAt: ts };
  }
  switch (ev.type) {
    case 'CANCELLATION': // still active until expiry
      return { ...base, willRenew: false, lastEventAt: ts, expiresAt: exp ? new Date(exp).toISOString() : base.expiresAt };
    case 'BILLING_ISSUE': // grace period: keep access until expiry
      return { ...base, lastEventAt: ts };
    case 'EXPIRATION':
    case 'REFUND':
      return { premiumActive: false, expiresAt: exp ? new Date(exp).toISOString() : base.expiresAt, willRenew: false, lastEventAt: ts };
    default:
      return prev;
  }
}
