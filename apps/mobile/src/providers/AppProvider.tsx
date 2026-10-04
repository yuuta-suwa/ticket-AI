import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import NetInfo from '@react-native-community/netinfo';
import { DemoApi, SupabaseApi, type DealHunterApi } from '@dealhunter/api-client';
import { MemoryAnalytics, NoopAnalytics, SanitizingAnalytics, type AnalyticsProvider } from '@dealhunter/analytics';
import { entitlementsForPlan, FakePurchaseProvider, NoopAdProvider, type AdProvider, type PurchaseProvider } from '@dealhunter/core';
import type { Entitlements } from '@dealhunter/types';
import { DemoAuthProvider, SupabaseAuthProvider, type AuthProvider, type AuthSession } from '../lib/auth';
import { ENV, hasBackend } from '../lib/env';
import { errors } from '../lib/log';
import { cacheStore } from '../lib/storage';
import { getSupabase } from '../lib/supabase';
import { createReviewSafeApi } from '../lib/review-api';

interface AppState {
  ready: boolean;
  configError: string | null;
  session: AuthSession | null;
  auth: AuthProvider;
  api: DealHunterApi;
  entitlements: Entitlements;
  refreshEntitlements: (opts?: { pollUntilPremium?: boolean }) => Promise<void>;
  purchases: PurchaseProvider | null;
  analytics: AnalyticsProvider;
  ads: AdProvider;
  online: boolean;
  isDemo: boolean;
  signOut: () => Promise<void>;
}
const Ctx = createContext<AppState | null>(null);
export const useApp = (): AppState => { const v = useContext(Ctx); if (!v) throw new Error('AppProvider missing'); return v; };

const FREE = entitlementsForPlan('FREE');
const useDemoBackend = ENV.demoMode || (!hasBackend && !ENV.isProduction);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [ready, setReady] = useState(false);
  const [entitlements, setEntitlements] = useState<Entitlements>(FREE);
  const [online, setOnline] = useState(true);
  const [reviewMode, setReviewMode] = useState(false);
  const [purchases, setPurchases] = useState<PurchaseProvider | null>(null);
  const [ads, setAds] = useState<AdProvider>(() => new NoopAdProvider());

  const configError = !useDemoBackend && !hasBackend ? 'This build is missing its backend configuration.' : null;
  const auth = useMemo<AuthProvider>(() => (useDemoBackend ? new DemoAuthProvider() : new SupabaseAuthProvider(getSupabase())), []);
  const demo = useMemo(() => new DemoApi(), []);
  const real = useMemo<DealHunterApi | null>(() => (useDemoBackend || !hasBackend ? null : new SupabaseApi(getSupabase())), []);
  const api = useMemo<DealHunterApi>(() => (real ? (reviewMode ? createReviewSafeApi(real, demo) : real) : demo), [real, demo, reviewMode]);
  const analytics = useMemo<AnalyticsProvider>(() => new SanitizingAnalytics(ENV.isProduction ? new NoopAnalytics() : new MemoryAnalytics()), []);
  const apiRef = useRef(api); apiRef.current = api;

  // connectivity
  useEffect(() => NetInfo.addEventListener((s) => setOnline(s.isConnected !== false && s.isInternetReachable !== false)), []);

  // auth bootstrap
  useEffect(() => {
    let off = () => {};
    (async () => {
      try { setSession(await auth.getSession()); } catch (e) { errors.captureError(e, { area: 'auth-bootstrap' }); }
      off = auth.onChange(setSession);
      setReady(true);
    })();
    return () => off();
  }, [auth]);

  const refreshEntitlements = useCallback(async (opts?: { pollUntilPremium?: boolean }) => {
    const attempts = opts?.pollUntilPremium ? 10 : 1;
    for (let i = 0; i < attempts; i++) {
      try {
        const e = await apiRef.current.getEntitlements();
        setEntitlements(e); void cacheStore.set('entitlements', e);
        if (!opts?.pollUntilPremium || e.plan !== 'FREE') return;
      } catch (err) {
        errors.captureError(err, { area: 'entitlements' });
        const c = await cacheStore.get<Entitlements>('entitlements'); if (c) setEntitlements(c.value); // offline: last known account state
      }
      if (i < attempts - 1) await new Promise((r) => setTimeout(r, 1500)); // webhook propagation
    }
  }, []);

  // per-session setup: review flag, entitlements, purchases, ads
  useEffect(() => {
    if (!session) { setEntitlements(FREE); setReviewMode(false); void purchases?.logOut(); return; }
    let cancelled = false;
    (async () => {
      if (real && hasBackend) {
        const { data } = await getSupabase().from('profiles').select('review_mode').eq('id', session.userId).maybeSingle();
        if (!cancelled) setReviewMode(!!data?.review_mode);
      }
      const cached = await cacheStore.get<Entitlements>('entitlements'); if (cached && !cancelled) setEntitlements(cached.value);
      await refreshEntitlements();
      try {
        let p: PurchaseProvider;
        if (useDemoBackend) p = new FakePurchaseProvider();
        else { const { RevenueCatPurchaseProvider } = await import('../lib/revenuecat'); p = new RevenueCatPurchaseProvider(); }
        await p.configure(session.userId);
        if (!cancelled) setPurchases(p);
      } catch (e) { errors.captureError(e, { area: 'purchases-config' }); }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.userId]);

  // Ads are initialised only for FREE users (and only after the entitlement is known).
  useEffect(() => {
    if (!session || !entitlements.adsEnabled || useDemoBackend) return;
    let cancelled = false;
    (async () => { const { AdMobAdProvider } = await import('../lib/ads'); const p = new AdMobAdProvider(); await p.initialize({ nonPersonalized: true }); if (!cancelled) setAds(p); })().catch((e) => errors.captureError(e, { area: 'ads' }));
    return () => { cancelled = true; };
  }, [session, entitlements.adsEnabled]);

  const signOut = useCallback(async () => { await auth.signOut(); await cacheStore.clearAll(); }, [auth]);

  const value: AppState = { ready, configError, session, auth, api, entitlements, refreshEntitlements, purchases, analytics, ads, online, isDemo: useDemoBackend || reviewMode, signOut };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
