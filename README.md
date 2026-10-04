# DEAL HUNTER AI

> AI finds price distortions and tells you whether to **buy now or wait**. Phase 1: flights. Native iOS + Android (Expo), Next.js web/admin, Supabase backend.

Not a PWA wrapper: the app is native React Native (Expo Router). Flights are **not sold** by this product — it is decision support that hands off to the airline / booking partner after re-validating the latest price.

## Layout
```
apps/mobile      Expo (React Native, Expo Router, TS) — iOS/Android app
apps/web         Next.js — landing, /privacy, /terms, /support, /account-deletion, /admin (Vercel)
packages/types   shared types        packages/config   identity + engine/plan config (single source)
packages/core    anomaly · forecast · decision · entitlements · revalidation · notifications · outcomes · providers (mock) · purchase/ad ports
packages/api-client  DealHunterApi interface; SupabaseApi (prod) + DemoApi (review-safe/offline)
packages/analytics   analytics + error-tracking abstractions with PII sanitising
supabase/        migrations (public RLS + private intelligence), Edge Functions, cron template
tests/           RLS/security tests against real Postgres (PGlite) + static security scans
store-assets/    icon, feature graphic, screenshot candidates, listing copy
docs/            architecture, release, compliance, store review notes
```

## Quick start
```bash
corepack enable && pnpm install
pnpm lint && pnpm typecheck && pnpm test      # 90+ tests
pnpm build:edge-shared                          # bundles core engines for Deno Edge Functions
pnpm build:web
cd apps/mobile && EXPO_PUBLIC_DEMO_MODE=true EXPO_PUBLIC_APP_ENV=development npx expo start   # runs fully offline on the demo dataset (login code 000000)
```
Copy `.env.example` → `.env` (names only in git). Demo mode is **impossible in production builds** (`EXPO_PUBLIC_APP_ENV=production` forces it off).

## Build & ship (EAS) — see docs/MOBILE_RELEASE.md
```bash
cd apps/mobile
eas build --profile development --platform all      # dev client
eas build --profile preview --platform all          # internal testers
eas build --profile production --platform ios       # .ipa (App Store / TestFlight)
eas build --profile production --platform android   # .aab (Play)
eas submit --profile production --platform ios|android
```
Stores are never auto-published: tags run validation + EAS build behind a GitHub Environment approval; submission is a separate approval-gated workflow.

## Status
See [docs/DEV_PROGRESS.md](docs/DEV_PROGRESS.md) for what is verified vs. what still needs your accounts/credentials (EAS builds, store consoles, real flight provider, RevenueCat products).
