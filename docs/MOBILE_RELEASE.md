# Mobile release (iOS + Android)
Identity is configured in **one file**: `packages/config/identity.cjs` (or env `DEALHUNTER_IOS_BUNDLE_ID`, `DEALHUNTER_ANDROID_PACKAGE`, AdMob app IDs). The defaults `ai.dealhunter.app` are placeholders — set the real IDs before the first build (they cannot change after store registration).

## One-time setup (needs your accounts)
1. `eas login`; `cd apps/mobile && eas init` → put the project id in `EXPO_PUBLIC_EAS_PROJECT_ID`.
2. Apple: enrol, create App ID (Push + IAP), create the app in App Store Connect, set `ascAppId` in `eas.json`. `eas credentials` (distribution cert, profile, APNs key).
3. Google: create the app in Play Console, create a service account, save as `apps/mobile/google-service-account.json` (git-ignored); first AAB upload must be manual per Play rules, then `eas submit` works.
4. RevenueCat: create project, add iOS+Android apps, entitlement `premium`, offering `default` with packages (store products created in ASC/Play), webhook → `https://<project>.functions.supabase.co/revenuecat-webhook` with `Authorization` = `REVENUECAT_WEBHOOK_AUTH`. **App user ID = Supabase user id** (the app calls `configure/logIn(userId)`).
5. Push: Expo push + FCM v1 credentials via `eas credentials`; APNs key for iOS.
6. Supabase: link project, expose `private` schema, `supabase db push`, `pnpm build:edge-shared && supabase functions deploy`, set secrets (`supabase secrets set …`), apply `cron.sql.example`.
7. Env for builds: `EXPO_PUBLIC_SUPABASE_URL/ANON_KEY`, RevenueCat public SDK keys, AdMob IDs/unit IDs (EAS secrets).

## Builds
`eas build --profile production --platform ios` → `.ipa`; `--platform android` → `.aab`. Profiles: development (dev client), preview (internal APK/ad-hoc), screenshots (demo data), production (store, auto-increment).
## TestFlight
`eas submit --profile production --platform ios --latest` → processed in App Store Connect → Internal Testing group. Verify: login, search, paywall (sandbox purchase), restore, push (physical device), deletion.
## Google Internal Testing
Upload `.aab` (or `eas submit … track internal`) → Internal testing → add testers → closed → production. Verify the same list plus Data Safety/Content rating.
## CI/CD
PR: lint, typecheck, tests, web build, Metro iOS+Android export. Tag `vX.Y.Z`: validate → approval (`production-build` environment) → EAS builds. `submit.yml`: manual + approval (`store-submission`). No auto-publish.
