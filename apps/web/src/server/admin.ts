import 'server-only';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createServerClient } from '@supabase/ssr';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Plan } from '@dealhunter/types';
import { canManageUsers } from '@dealhunter/core';

/** Service-role client. SERVER ONLY (guarded by `server-only`); the key is never sent to the browser. */
export function serviceClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL; const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Server Supabase configuration missing');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export interface Actor { id: string; email: string | null; plan: Plan }

/** Identity from the verified Supabase session; privilege from public.user_access (NOT from user_metadata). */
export async function getActor(): Promise<Actor | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL; const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return null;
  const store = await cookies();
  const sb = createServerClient(url, anon, { cookies: { getAll: () => store.getAll(), setAll: () => { /* read-only in server components */ } } });
  const { data } = await sb.auth.getUser(); // validates the JWT with Supabase Auth
  if (!data.user) return null;
  const { data: row } = await serviceClient().from('user_access').select('plan').eq('user_id', data.user.id).maybeSingle();
  const plan = (row?.plan as Plan | undefined) ?? 'FREE';
  return canManageUsers(plan) ? { id: data.user.id, email: data.user.email ?? null, plan } : null;
}

export async function requireAdmin(): Promise<Actor> {
  const a = await getActor();
  if (!a) redirect('/admin/login');
  return a;
}
