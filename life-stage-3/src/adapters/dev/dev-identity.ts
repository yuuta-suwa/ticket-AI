import type { Identity } from '../../domain/member.ts';

/**
 * ローカル開発専用の疑似サインイン。DEV_AUTH=1 かつ localhost のときだけ有効。
 * Sites本番では DEV_AUTH を設定しないため、この経路は使われない。
 */
export const DEV_COOKIE = 'ls_dev_email';

export function devAuthEnabled(env: { DEV_AUTH?: string }, req: Request): boolean {
  if (env.DEV_AUTH !== '1') return false;
  const host = new URL(req.url).hostname;
  return host === 'localhost' || host === '127.0.0.1';
}

export function devIdentity(req: Request): Identity | null {
  const cookie = req.headers.get('cookie') ?? '';
  const m = cookie.split(/;\s*/).find((c) => c.startsWith(`${DEV_COOKIE}=`));
  if (!m) return null;
  const email = decodeURIComponent(m.slice(DEV_COOKIE.length + 1));
  return email.includes('@') ? { email, fullName: null } : null;
}

export function devSignInResponse(req: Request): Response {
  const url = new URL(req.url);
  const email = url.searchParams.get('email');
  if (!email || !/^[^@\s]+@[^@\s]+$/.test(email)) {
    return new Response(
      `<!doctype html><meta name=viewport content="width=device-width"><form>DEVサインイン（ローカル専用）<br><input name=email type=email required placeholder="a@example.com"><button>サインイン</button></form>`,
      { headers: { 'content-type': 'text/html; charset=utf-8' } },
    );
  }
  return new Response(null, {
    status: 302,
    headers: { location: '/', 'set-cookie': `${DEV_COOKIE}=${encodeURIComponent(email)}; Path=/; HttpOnly; SameSite=Lax` },
  });
}

export function devSignOutResponse(): Response {
  return new Response(null, {
    status: 302,
    headers: { location: '/', 'set-cookie': `${DEV_COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax` },
  });
}
