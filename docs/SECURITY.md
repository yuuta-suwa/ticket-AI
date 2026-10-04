# Security
- Secrets (service role, flight keys, OpenAI, RevenueCat webhook/secret, Expo push, cron) exist only as Supabase/Vercel/EAS secrets. `.env.example` has names only; tests fail on key patterns, server-only names in client code, or `*_PUBLIC_*SECRET*`.
- Auth: Supabase Auth (email OTP; password for the review account). Mobile session in SecureStore (chunked); AsyncStorage holds only non-sensitive cache.
- Authorisation: RLS everywhere; privileged tables are service-role-write only; admin = row in `user_access` verified server-side (Next server components/actions re-check on every call; `canAssignRole` blocks escalation; self-demotion blocked; audit log).
- Webhook: constant-time compare of `REVENUECAT_WEBHOOK_AUTH`, stale/out-of-order event ignoring, idempotent upsert, 5xx on failure so RevenueCat retries.
- Rate limits (SQL fixed window): search 30/min, revalidate 20/min, AI explanation 10/min, auth/deletion 5/5min. Edge Functions fail open only if the limiter itself is down.
- Web: HSTS, nosniff, frame deny, strict referrer, locked permissions policy; admin is `noindex`.
- Logs: no payloads/PII; production client logs silent except errors.
- Privacy: no location/camera/mic/contacts/photos; Android blocked-permissions list; iOS privacy manifest `NSPrivacyTracking=false`; ads non-personalised + UMP consent.
- Known gaps: Edge Functions are not type-checked by CI (Deno); no WAF/bot service beyond rate limiting; add Cloudflare Turnstile/App Attest before large-scale launch.
