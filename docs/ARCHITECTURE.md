# Architecture

```
 Mobile (Expo) ──JWT──► Supabase Edge Functions ──► FlightProvider (mock → Duffel/Skyscanner…)
     │  ▲                     │  uses packages/core (bundled)     └► private.* (price_snapshots, recommendations, outcomes, costs…)
     │  └─ RLS tables (watchlists, prefs, devices) ◄──┘
     └─ RevenueCat SDK ──store──► RevenueCat ──webhook──► Edge Fn ──► public.user_entitlements ──► feature access
 Web (Vercel): static legal + account deletion (client → Edge Fn) + /admin (server components, service role, admin check via user_access)
```
## Principles
- **One domain core** (`packages/core`) runs in the app (demo), the Edge Functions (bundled with esbuild → `_shared/core.mjs`) and tests. Provider-specific code lives only behind `FlightProvider`.
- **Single authorisation layer:** `user_entitlements` (written only by the RevenueCat webhook / service role) + `user_access` (MANAGED/ADMIN set only by admins). Client results never grant access; the app polls the server entitlement after purchase/restore. Admin is never derived from `user_metadata`.
- **Server-side premium enforcement:** FREE callers get an analysis whose advanced forecast is redacted *before* it leaves the server (`redactAnalysis`); watchlist limits are enforced by a DB trigger.
- **Engines (no LLM):** anomaly (6 weighted components, config-managed, renormalised when data is missing, capped when history is thin) → statistical forecast (`ForecastModel` interface, `stat-v1`) → decision (`waitLoss` vs `buyLoss`, confidence gate → WATCH, reason codes). Every recommendation is stored with price/decision/prediction/confidence/modelVersion and labelled at 1h/6h/24h/72h/7d by `evaluate-outcomes` (future ML dataset).
- **LLM only explains** (`explain-deal`): compact structured input, cached per deal+decision (1 call for N viewers), template fallback, rate-limited, cost-logged.
- **Revalidation before purchase:** `revalidateOffer()` re-quotes, re-analyses, and only then enables "Continue to the seller" (external browser). Provider failure → no crash, hand-off blocked, message shown.
- **Adaptive monitoring:** `monitor-prices` polls only watched identities, by priority P0–P3 (P4 never) at configured intervals.
- **Ports:** `PurchaseProvider` (RevenueCat primary, Fake), `AdProvider` (AdMob, Noop), `AuthProvider` (Supabase email OTP/password, Demo), `AnalyticsProvider`, `ErrorTracker`, `RateLimiter`.
- **Offline:** stale-while-revalidate cache (AsyncStorage, non-sensitive) for home/watchlist/alerts/entitlements; offline banner; "last updated" shown.
- **Secrets:** server-only variables are enforced absent from client code by `tests/src/static-security.test.ts`.
