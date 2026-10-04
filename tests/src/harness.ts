import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

export const ROOT = join(__dirname, '..', '..');
const STUB = `
create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
create schema auth; create schema extensions;
create table auth.users (id uuid primary key default gen_random_uuid(), email text);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;
-- Supabase's default privileges: everything in public is granted to the API roles; RLS + our explicit REVOKEs do the restricting.
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
`;

export async function freshDb(): Promise<PGlite> {
  const db = new PGlite();
  await db.exec(STUB);
  const dir = join(ROOT, 'supabase', 'migrations');
  for (const f of readdirSync(dir).filter((n) => n.endsWith('.sql')).sort()) {
    await db.exec(readFileSync(join(dir, f), 'utf8').replace(/create extension if not exists pgcrypto;/g, ''));
  }
  return db;
}

export async function addUser(db: PGlite, email: string): Promise<string> {
  const r = await db.query<{ id: string }>('insert into auth.users(email) values ($1) returning id', [email]);
  return (r.rows[0] as { id: string }).id;
}

/** Run `fn` as an API role with a given JWT subject (mimics PostgREST). */
export async function as<T>(db: PGlite, role: 'anon' | 'authenticated' | 'service_role', uid: string | null, fn: () => Promise<T>): Promise<T> {
  await db.exec(`select set_config('request.jwt.claim.sub', '${uid ?? ''}', false); set role ${role};`);
  try { return await fn(); } finally { await db.exec('reset role;'); }
}
export const denied = async (p: Promise<unknown>): Promise<boolean> => { try { await p; return false; } catch { return true; } };
