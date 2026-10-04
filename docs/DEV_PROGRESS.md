# DEV_PROGRESS

## Phase 0–22 summary (this session)
**Completed**
- P0 Monorepo (pnpm workspaces, TS, ESLint, vitest). P1 Expo shell + Next.js web. P2 Supabase schema/RLS (verified on real Postgres via PGlite). P3 `FlightProvider` + `MockFlightProvider` (fictional carriers). P4 search (app + `search-flights`). P5 `private.price_snapshots` ingestion + history API. P6 anomaly engine. P7 forecast (`ForecastModel`, `stat-v1`). P8 decision engine + reason codes + outcome labelling. P9 deal detail + SVG chart + revalidation flow. P10 watchlist (DB-enforced limits). P11 push (opt-in, devices table, dedupe/quiet hours/min score/route/threshold, Expo sender). P12 `PurchaseProvider` (RevenueCat adapter + Fake), paywall, restore, webhook → entitlements. P13 FREE-only AdMob (non-personalised, UMP). P14 MANAGED via admin-only assignment. P15 admin dashboard. P16 account deletion (in-app + `/account-deletion`), privacy, terms. P17 `eas.json` + CI/release workflows. P20 store metadata/assets/compliance docs. P21 automated release check.
**Changed files**: whole repository (initial build).
**Tests**: ~90 automated — core 35, api-client 4, analytics 2, web metrics 5, mobile 3, security/RLS/static 42. Lint + typecheck clean. Web `next build` OK. Metro export iOS+Android OK. Demo flow rendered in Chromium (screenshots in `store-assets/screenshots`).

**Risks**
- **EAS production builds (.ipa/.aab), TestFlight and Play uploads were NOT run** — they need your Apple/Google/Expo accounts and credentials. Metro bundling and config resolution are verified; native compilation is not.
- Edge Functions (Deno) are written but not executed/type-checked here (no Deno/Supabase CLI/network). Core logic they call is tested; function wiring needs a staging run.
- Only `MockFlightProvider` exists. Real provider (Duffel/Skyscanner) + its licensing/terms (esp. deep-link/affiliate rules and price display) must be added; the mock `deepLink` points at example.com.
- RevenueCat, AdMob, Expo push, OpenAI are integrated by code but unconfigured/untested against live services. Sandbox purchase + restore must be tested on devices.
- Forecast is a heuristic statistical model; accuracy is unproven until `model_outcomes` accumulates data.
- UI is English-only; no i18n yet. Dark mode implemented, screenshots are light only.
- Legal text is a good-faith draft with placeholders; needs lawyer review. Bundle IDs are placeholders.
- Analytics is a no-op in production until a vendor adapter is chosen. Error tracking = console adapter (Sentry adapter to add).
- Admin Users lookup scales to ~200 users; MRR/ad revenue/affiliate dashboards are "Not connected" by design (no invented numbers).

**Open issues / Next**
1. Provide accounts → run EAS builds, TestFlight/Internal Testing; fix any native build issue. 2. Staging Supabase: deploy functions, run end-to-end incl. webhook with RevenueCat test events. 3. Real flight provider adapter. 4. Sentry + analytics vendor. 5. i18n (ja). 6. Maestro E2E on devices (`apps/mobile/.maestro`). 7. Lawyer review, fill placeholders.
