# Database
Migration: `supabase/migrations/20260101000000_core_schema.sql` (apply with `supabase db push`).

**public (RLS on, owner-only `auth.uid() = user_id`)**: profiles, watchlists, saved_deals, search_history, notification_preferences, notification_devices, notification_history, subscriptions (read-only for users), user_access (read-only), user_entitlements (read-only), plan_limits.
Column-level grants: users can update only `profiles(display_name, locale, currency)`, `watchlists(target_price)`, `notification_history(read_at)`. `anon` has no grants on public tables.

**private (RLS on, zero policies, zero grants to anon/authenticated)**: flight_offers, price_snapshots, route_statistics, anomaly_results, forecasts, recommendations, model_outcomes, ai_explanations, provider_logs, provider_raw_responses, cost_events, notification_jobs, analysis_jobs, audit_logs, rate_limits.

> **Deployment note:** Edge Functions reach `private` through PostgREST as the service role, so `private` must be listed under *Exposed schemas* (done in `supabase/config.toml` for local; set it in the dashboard for production). Clients still cannot read it: no `USAGE`/table grants (proved in `tests/src/rls.test.ts`).

Functions: `effective_plan(uid)`, `rate_limit_hit(key,limit,window)` (service only), `delete_user_data(uid)` (service only). `plan_limits` must equal `PLAN_LIMITS` in `packages/config` (test enforces).
Retention/cron: `supabase/cron.sql.example`.
