# Development
- Node ≥ 20 (22 used), pnpm 10, `node-linker=hoisted` (required by React Native).
- `pnpm test` runs: core engines, api-client, analytics, web metrics, mobile helpers, **RLS integration on real Postgres (PGlite)**, static security scans.
- Edge Functions: `pnpm build:edge-shared`, then `supabase functions serve`. Needs Deno/Supabase CLI (not part of CI).
- Demo/offline: `EXPO_PUBLIC_DEMO_MODE=true` (non-production only; login code `000000`).
- Web screenshots from demo data: see `apps/mobile/scripts/capture-screenshots.mjs` (web export uses stubs in `apps/mobile/web-stubs`, never shipped).
- Expo SDK 57 pinned from `expo/bundledNativeModules.json`; `react-native-purchases` and `react-native-google-mobile-ads` are not bundled by Expo — verify with `npx expo-doctor` / `expo install --check` on a networked machine.
- Adding a flight provider: implement `FlightProvider` in `supabase/functions/_shared/` (or core adapter), register in `getProvider()`; add `provider_logs` + `cost_events` calls.
