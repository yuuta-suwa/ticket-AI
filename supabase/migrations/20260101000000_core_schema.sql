-- DEAL HUNTER AI — core schema. public = user-facing (RLS), private = intelligence (no client access).
create extension if not exists pgcrypto;
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

-- ---------------------------------------------------------------- helpers
create or replace function private.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

-- ---------------------------------------------------------------- plan limits (mirrors packages/config PLAN_LIMITS; verified by tests)
create table public.plan_limits (
  plan text primary key check (plan in ('FREE','PREMIUM','MANAGED','ADMIN','SUPER_ADMIN')),
  watchlist_limit int not null
);
insert into public.plan_limits(plan, watchlist_limit) values
  ('FREE',3),('PREMIUM',50),('MANAGED',200),('ADMIN',200),('SUPER_ADMIN',200);
alter table public.plan_limits enable row level security;
create policy plan_limits_read on public.plan_limits for select to authenticated using (true);

-- ---------------------------------------------------------------- profiles
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  locale text default 'en',
  currency text default 'USD',
  /** Set ONLY by service role (create-review-account script). Enables review-safe demo dataset for that account. */
  review_mode boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger profiles_touch before update on public.profiles for each row execute function private.touch_updated_at();
alter table public.profiles enable row level security;
create policy profiles_select_own on public.profiles for select to authenticated using (auth.uid() = id);
create policy profiles_update_own on public.profiles for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);
-- column-level hardening: users can only edit these columns (never review_mode)
revoke update on public.profiles from authenticated, anon;
grant update (display_name, locale, currency) on public.profiles to authenticated;

create or replace function private.handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles(id) values (new.id) on conflict do nothing;
  insert into public.notification_preferences(user_id) values (new.id) on conflict do nothing;
  return new;
end $$;

-- ---------------------------------------------------------------- access / entitlements (server-written only)
create table public.user_access (
  user_id uuid primary key references auth.users(id) on delete cascade,
  plan text not null check (plan in ('MANAGED','ADMIN','SUPER_ADMIN')),
  assigned_by uuid references auth.users(id) on delete set null,
  assigned_at timestamptz not null default now()
);
alter table public.user_access enable row level security;
create policy user_access_select_own on public.user_access for select to authenticated using (auth.uid() = user_id);
revoke insert, update, delete on public.user_access from authenticated, anon;

create table public.user_entitlements (
  user_id uuid primary key references auth.users(id) on delete cascade,
  premium_active boolean not null default false,
  expires_at timestamptz,
  will_renew boolean not null default false,
  last_event_at bigint not null default 0,
  updated_at timestamptz not null default now()
);
alter table public.user_entitlements enable row level security;
create policy user_entitlements_select_own on public.user_entitlements for select to authenticated using (auth.uid() = user_id);
revoke insert, update, delete on public.user_entitlements from authenticated, anon;

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  store text, product_id text, status text, period_end timestamptz, raw_event_type text,
  created_at timestamptz not null default now()
);
create index on public.subscriptions(user_id);
alter table public.subscriptions enable row level security;
create policy subscriptions_select_own on public.subscriptions for select to authenticated using (auth.uid() = user_id);
revoke insert, update, delete on public.subscriptions from authenticated, anon;

-- ---------------------------------------------------------------- user-owned data
create table public.watchlists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  origin text not null check (origin ~ '^[A-Z]{3}$'),
  destination text not null check (destination ~ '^[A-Z]{3}$'),
  departure_date date not null,
  cabin text not null default 'ECONOMY',
  target_price numeric,
  flight_identity text,
  last_price numeric,
  last_decision text,
  category text not null default 'FLIGHT',
  created_at timestamptz not null default now(),
  unique (user_id, flight_identity)
);
create index on public.watchlists(user_id);
alter table public.watchlists enable row level security;
create policy watchlists_own_select on public.watchlists for select to authenticated using (auth.uid() = user_id);
create policy watchlists_own_insert on public.watchlists for insert to authenticated with check (auth.uid() = user_id);
create policy watchlists_own_update on public.watchlists for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy watchlists_own_delete on public.watchlists for delete to authenticated using (auth.uid() = user_id);
revoke update on public.watchlists from authenticated;
grant update (target_price) on public.watchlists to authenticated;

create or replace function public.effective_plan(uid uuid) returns text language sql stable security definer set search_path = public as $$
  select coalesce(
    (select plan from public.user_access where user_id = uid),
    (select 'PREMIUM' from public.user_entitlements e where e.user_id = uid and e.premium_active and (e.expires_at is null or e.expires_at > now())),
    'FREE');
$$;
revoke execute on function public.effective_plan(uuid) from public, anon;
grant execute on function public.effective_plan(uuid) to authenticated, service_role;

-- Server-side enforcement of the watchlist limit (client checks are only UX).
create or replace function private.enforce_watchlist_limit() returns trigger language plpgsql security definer set search_path = public as $$
declare lim int; cnt int;
begin
  select watchlist_limit into lim from public.plan_limits where plan = public.effective_plan(new.user_id);
  select count(*) into cnt from public.watchlists where user_id = new.user_id;
  if cnt >= lim then raise exception 'Watchlist limit reached for your plan' using errcode = 'P0001'; end if;
  return new;
end $$;
create trigger watchlists_limit before insert on public.watchlists for each row execute function private.enforce_watchlist_limit();

create table public.saved_deals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  offer_id text not null, snapshot jsonb not null, created_at timestamptz not null default now(),
  unique (user_id, offer_id)
);
alter table public.saved_deals enable row level security;
create policy saved_deals_own on public.saved_deals for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table public.search_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  params jsonb not null, created_at timestamptz not null default now()
);
create index on public.search_history(user_id, created_at desc);
alter table public.search_history enable row level security;
create policy search_history_own on public.search_history for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table public.notification_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  enabled_types text[] not null default array['EXTREME_DEAL','TARGET_PRICE','BUY_SIGNAL'],
  routes text[] not null default '{}',
  min_score int not null default 65 check (min_score between 0 and 100),
  price_threshold numeric,
  quiet_start_hour int check (quiet_start_hour between 0 and 23) default 22,
  quiet_end_hour int check (quiet_end_hour between 0 and 23) default 8,
  utc_offset_minutes int not null default 0 check (utc_offset_minutes between -840 and 840),
  updated_at timestamptz not null default now()
);
create trigger notification_preferences_touch before update on public.notification_preferences for each row execute function private.touch_updated_at();
alter table public.notification_preferences enable row level security;
create policy notification_preferences_own on public.notification_preferences for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table public.notification_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  platform text not null check (platform in ('ios','android')),
  push_token text not null unique,
  enabled boolean not null default true,
  last_seen timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.notification_devices(user_id);
create trigger notification_devices_touch before update on public.notification_devices for each row execute function private.touch_updated_at();
alter table public.notification_devices enable row level security;
create policy notification_devices_own on public.notification_devices for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table public.notification_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null, title text not null, body text not null, deal_id text,
  dedupe_key text not null, created_at timestamptz not null default now(), read_at timestamptz,
  unique (user_id, dedupe_key)
);
create index on public.notification_history(user_id, created_at desc);
alter table public.notification_history enable row level security;
create policy notification_history_select on public.notification_history for select to authenticated using (auth.uid() = user_id);
create policy notification_history_mark_read on public.notification_history for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
revoke update on public.notification_history from authenticated;
grant update (read_at) on public.notification_history to authenticated;

-- new-user trigger (after the tables it writes to exist)
create trigger on_auth_user_created after insert on auth.users for each row execute function private.handle_new_user();

-- ================================================================ PRIVATE (intelligence) — never exposed to clients
create table private.flight_offers (
  id text primary key, provider text not null, provider_offer_id text not null, flight_identity text not null,
  carrier text, origin text not null, destination text not null, departure_at timestamptz, cabin text,
  stops int, duration_minutes int, last_price numeric, currency text, availability text, offer_expiry timestamptz,
  updated_at timestamptz not null default now()
);
create index on private.flight_offers(flight_identity);
create table private.price_snapshots (
  id bigserial primary key,
  route text not null, flight_identity text not null, provider text not null, carrier text,
  departure_date date not null, cabin text not null, price numeric not null check (price >= 0), currency text not null,
  captured_at timestamptz not null default now(), availability_state text not null default 'AVAILABLE', offer_expiry timestamptz
);
create index on private.price_snapshots(flight_identity, captured_at desc);
create index on private.price_snapshots(route, captured_at desc);
create table private.route_statistics (route text, cabin text, window_days int, median numeric, p10 numeric, p90 numeric, samples int, computed_at timestamptz default now(), primary key(route, cabin, window_days));
create table private.anomaly_results (id bigserial primary key, offer_id text not null, score numeric, level text, components jsonb, computed_at timestamptz default now());
create table private.forecasts (id bigserial primary key, offer_id text not null, model_version text not null, result jsonb not null, computed_at timestamptz default now());
create table private.recommendations (
  id bigserial primary key, offer_id text not null, flight_identity text not null, price numeric not null,
  decision text not null, reasons text[] not null, prediction jsonb not null, confidence numeric not null,
  model_version text not null, created_at timestamptz not null default now()
);
create index on private.recommendations(created_at);
create table private.model_outcomes (
  id bigserial primary key, recommendation_id bigint not null references private.recommendations(id) on delete cascade,
  horizon_hours int not null check (horizon_hours in (1,6,24,72,168)), later_price numeric, label text not null check (label in ('GOOD_DECISION','BAD_DECISION','NEUTRAL')),
  evaluated_at timestamptz default now(), unique (recommendation_id, horizon_hours)
);
create table private.ai_explanations (offer_key text primary key, text text not null, model text, tokens int, created_at timestamptz default now());
create table private.provider_logs (id bigserial primary key, provider text not null, operation text not null, ok boolean not null, status int, latency_ms int, error text, created_at timestamptz default now());
create table private.provider_raw_responses (id bigserial primary key, provider text not null, operation text not null, payload jsonb, created_at timestamptz default now());
create table private.cost_events (
  id bigserial primary key, provider text not null, operation text not null, estimated_cost numeric not null default 0,
  tokens int, request_count int not null default 1, user_id uuid references auth.users(id) on delete set null, deal_id text, created_at timestamptz not null default now()
);
create index on private.cost_events(created_at);
create table private.notification_jobs (
  id bigserial primary key, user_id uuid not null references auth.users(id) on delete cascade, type text not null, dedupe_key text not null,
  payload jsonb not null, status text not null default 'PENDING' check (status in ('PENDING','SENT','FAILED','SKIPPED')),
  attempts int not null default 0, error text, created_at timestamptz default now(), sent_at timestamptz, unique (user_id, dedupe_key)
);
create table private.analysis_jobs (id bigserial primary key, flight_identity text not null, priority text not null, next_run_at timestamptz not null default now(), last_run_at timestamptz, status text default 'PENDING');
create unique index on private.analysis_jobs(flight_identity);
create table private.audit_logs (id bigserial primary key, actor uuid, action text not null, target text, meta jsonb, created_at timestamptz default now());
create table private.rate_limits (key text not null, window_start timestamptz not null, count int not null default 0, primary key (key, window_start));

-- RLS on + zero policies + revoked grants = no client access whatsoever (service role bypasses RLS).
do $$ declare t record; begin
  for t in select tablename from pg_tables where schemaname = 'private' loop
    execute format('alter table private.%I enable row level security', t.tablename);
    execute format('revoke all on private.%I from public, anon, authenticated', t.tablename);
  end loop;
end $$;
grant usage on schema private to service_role;
grant all on all tables in schema private to service_role;
grant all on all sequences in schema private to service_role;

-- SQL-backed fixed-window rate limiter used by Edge Functions (service role only).
create or replace function public.rate_limit_hit(p_key text, p_limit int, p_window_seconds int)
returns table(allowed boolean, remaining int, retry_after_seconds int) language plpgsql security definer set search_path = private, public as $$
declare ws timestamptz := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds); c int;
begin
  insert into private.rate_limits(key, window_start, count) values (p_key, ws, 1)
  on conflict (key, window_start) do update set count = private.rate_limits.count + 1 returning count into c;
  delete from private.rate_limits where window_start < now() - interval '1 day';
  return query select c <= p_limit, greatest(0, p_limit - c), case when c <= p_limit then 0 else ceil(extract(epoch from (ws + make_interval(secs => p_window_seconds) - now())))::int end;
end $$;
revoke execute on function public.rate_limit_hit(text,int,int) from public, anon, authenticated;
grant execute on function public.rate_limit_hit(text,int,int) to service_role;

-- Account deletion helper: removes personal data not covered by FK cascades, anonymises audit/cost rows.
create or replace function public.delete_user_data(uid uuid) returns void language plpgsql security definer set search_path = public, private as $$
begin
  update private.audit_logs set actor = null where actor = uid;
  update private.cost_events set user_id = null where user_id = uid;
  delete from public.search_history where user_id = uid;
  delete from public.saved_deals where user_id = uid;
  delete from public.watchlists where user_id = uid;
  delete from public.notification_history where user_id = uid;
  delete from public.notification_devices where user_id = uid;
  delete from public.notification_preferences where user_id = uid;
  delete from public.subscriptions where user_id = uid;
  delete from public.user_entitlements where user_id = uid;
  delete from public.user_access where user_id = uid;
  delete from public.profiles where id = uid;
end $$;
revoke execute on function public.delete_user_data(uuid) from public, anon, authenticated;
grant execute on function public.delete_user_data(uuid) to service_role;

-- Cost views for the admin dashboard (service role only)
create or replace view private.v_cost_daily as
  select date_trunc('day', created_at) as day, provider, sum(estimated_cost) as cost, sum(request_count) as requests, sum(coalesce(tokens,0)) as tokens
  from private.cost_events group by 1, 2;
