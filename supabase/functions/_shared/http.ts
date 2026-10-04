// deno-lint-ignore-file no-explicit-any
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.117.2';

/** Native mobile clients do not need CORS; the web admin / account-deletion page calls from the site origin only. */
const ALLOWED_ORIGIN = Deno.env.get('SITE_ORIGIN') ?? '';
export const cors = (req: Request) => ({
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN && req.headers.get('origin') === ALLOWED_ORIGIN ? ALLOWED_ORIGIN : 'null',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info',
  'Vary': 'Origin',
});
export const json = (req: Request, body: unknown, status = 200, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...cors(req), ...extra } });

export const admin = (): SupabaseClient => createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });

export class HttpError extends Error { constructor(readonly status: number, msg: string, readonly extra: Record<string, string> = {}) { super(msg); } }

/** Verifies the caller's JWT against Supabase Auth. Never trust user_metadata for authorisation. */
export async function requireUser(req: Request, sb: SupabaseClient) {
  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) throw new HttpError(401, 'Unauthenticated');
  const { data, error } = await sb.auth.getUser(token);
  if (error || !data.user) throw new HttpError(401, 'Unauthenticated');
  return data.user;
}

export async function limit(sb: SupabaseClient, key: string, uid: string, cfg: { limit: number; windowSeconds: number }) {
  const { data, error } = await sb.rpc('rate_limit_hit', { p_key: `${key}:${uid}`, p_limit: cfg.limit, p_window_seconds: cfg.windowSeconds });
  if (error) return; // fail open on limiter outage, but errors are logged by platform
  const r = (data as any[])[0];
  if (r && !r.allowed) throw new HttpError(429, 'Rate limited', { 'Retry-After': String(r.retry_after_seconds) });
}

export function requireCronSecret(req: Request) {
  const expected = Deno.env.get('CRON_SECRET');
  const got = req.headers.get('x-cron-secret') ?? '';
  if (!expected || !timingSafeEqual(got, expected)) throw new HttpError(401, 'Unauthorized');
}
export function timingSafeEqual(a: string, b: string): boolean {
  const ea = new TextEncoder().encode(a), eb = new TextEncoder().encode(b);
  let diff = ea.length ^ eb.length;
  for (let i = 0; i < Math.max(ea.length, eb.length); i++) diff |= (ea[i] ?? 0) ^ (eb[i] ?? 0);
  return diff === 0;
}

export function handler(fn: (req: Request, sb: SupabaseClient) => Promise<Response>) {
  return async (req: Request) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: cors(req) });
    try { return await fn(req, admin()); }
    catch (e) {
      if (e instanceof HttpError) return json(req, { error: e.message }, e.status, e.extra);
      console.error('[edge] unhandled', e instanceof Error ? e.message : String(e)); // no payloads / PII
      return json(req, { error: 'Internal error' }, 500);
    }
  };
}
