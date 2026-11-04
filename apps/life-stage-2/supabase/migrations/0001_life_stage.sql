-- LIFE STAGE 2.0 : 会員・ロール・ワークデータ（RLSでコアメンバーのみコアデータにアクセス可）
create table if not exists public.ls_profiles(
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text not null default '',
  role text not null default 'member' check (role in ('member','core','admin')),
  created_at timestamptz not null default now()
);
create table if not exists public.ls_work(
  user_id uuid not null references auth.users(id) on delete cascade,
  program text not null check (program in ('all','core')),
  data jsonb not null default '{}'::jsonb,
  version integer not null default 1,
  updated_at timestamptz not null default now(),
  primary key(user_id, program)
);
create table if not exists public.ls_ai_usage(
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null default current_date,
  count integer not null default 0,
  primary key(user_id, day)
);

create or replace function public.ls_is_core() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select role in ('core','admin') from public.ls_profiles where user_id = auth.uid()), false)
$$;
create or replace function public.ls_is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select role = 'admin' from public.ls_profiles where user_id = auth.uid()), false)
$$;

-- 新規ユーザー登録時に member として作成（ロールは本人が変更不可）
create or replace function public.ls_handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.ls_profiles(user_id, email) values (new.id, new.email) on conflict do nothing;
  return new;
end $$;
drop trigger if exists ls_on_auth_user_created on auth.users;
create trigger ls_on_auth_user_created after insert on auth.users
  for each row execute function public.ls_handle_new_user();
insert into public.ls_profiles(user_id, email) select id, email from auth.users on conflict do nothing;

create or replace function public.ls_touch() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
drop trigger if exists ls_work_touch on public.ls_work;
create trigger ls_work_touch before update on public.ls_work for each row execute function public.ls_touch();

alter table public.ls_profiles enable row level security;
alter table public.ls_work enable row level security;
alter table public.ls_ai_usage enable row level security;

revoke all on public.ls_profiles, public.ls_work, public.ls_ai_usage from anon, authenticated;
grant select on public.ls_profiles to authenticated;
grant update (display_name) on public.ls_profiles to authenticated;
grant select, insert, update on public.ls_work to authenticated;
-- ls_ai_usage はサーバー（service_role）専用

drop policy if exists ls_profiles_select on public.ls_profiles;
create policy ls_profiles_select on public.ls_profiles for select to authenticated
  using (user_id = auth.uid() or public.ls_is_admin());
drop policy if exists ls_profiles_update on public.ls_profiles;
create policy ls_profiles_update on public.ls_profiles for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists ls_work_select on public.ls_work;
create policy ls_work_select on public.ls_work for select to authenticated
  using (user_id = auth.uid() and (program = 'all' or public.ls_is_core()));
drop policy if exists ls_work_insert on public.ls_work;
create policy ls_work_insert on public.ls_work for insert to authenticated
  with check (user_id = auth.uid() and (program = 'all' or public.ls_is_core()));
drop policy if exists ls_work_update on public.ls_work;
create policy ls_work_update on public.ls_work for update to authenticated
  using (user_id = auth.uid() and (program = 'all' or public.ls_is_core()))
  with check (user_id = auth.uid() and (program = 'all' or public.ls_is_core()));

-- 管理者がメールアドレスでロールを付与
create or replace function public.ls_set_role(target_email text, new_role text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.ls_is_admin() then raise exception 'forbidden'; end if;
  if new_role not in ('member','core','admin') then raise exception 'invalid role'; end if;
  update public.ls_profiles set role = new_role where lower(email) = lower(trim(target_email));
  if not found then raise exception 'user not found'; end if;
end $$;
revoke all on function public.ls_set_role(text, text) from public, anon;
grant execute on function public.ls_set_role(text, text) to authenticated;

-- AI利用回数（1日上限）をアトミックに消費
create or replace function public.ls_ai_consume(uid uuid, lim integer) returns boolean
language plpgsql security definer set search_path = public as $$
declare c integer;
begin
  insert into public.ls_ai_usage(user_id, day, count) values (uid, current_date, 1)
  on conflict (user_id, day) do update set count = ls_ai_usage.count + 1 where ls_ai_usage.count < lim
  returning count into c;
  return c is not null and c <= lim;
end $$;
revoke all on function public.ls_ai_consume(uuid, integer) from public, anon, authenticated;
grant execute on function public.ls_ai_consume(uuid, integer) to service_role;
