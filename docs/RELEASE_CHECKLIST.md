# Release checklist
Automated (`pnpm release:check`): [ ] lint [ ] typecheck [ ] tests [ ] edge bundle [ ] web build [ ] Metro iOS+Android export.
Requires credentials (not run in the build environment — run on CI/your machine): [ ] EAS iOS production build (.ipa) [ ] EAS Android production build (.aab) [ ] TestFlight install [ ] Play Internal install.
Config: [ ] real bundle id/package [ ] EAS project id [ ] Supabase URL/anon [ ] `private` schema exposed + migration applied [ ] Edge secrets set + functions deployed [ ] cron applied [ ] RevenueCat keys/entitlement/offering/webhook [ ] AdMob real app+unit IDs (or ads disabled) [ ] push credentials [ ] real FlightProvider + terms compliance.
Content: [ ] legal placeholders filled [ ] web deployed [ ] review account created [ ] screenshots/icon uploaded [ ] data safety/privacy forms [ ] age rating.
Device QA (physical): [ ] login [ ] search→deal→revalidate→external link [ ] watch add/limit [ ] push opt-in + receive + deep link [ ] purchase (sandbox) → premium unlocks via server [ ] restore on 2nd device [ ] MANAGED account no ads/no paywall [ ] offline banner/cached data [ ] account deletion (+web) [ ] ads only on FREE.
