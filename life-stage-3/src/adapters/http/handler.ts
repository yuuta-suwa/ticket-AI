// 標準 Request/Response だけで書いたHTTP層。Sites以外の実行環境にもそのまま載せられる。
import { DomainError } from '../../domain/errors.ts';
import { toAdminView, toSelfView, type Identity } from '../../domain/member.ts';
import { toGoalView } from '../../domain/goal.ts';
import { TEST_IMAGE_MAX_BYTES } from '../../domain/file.ts';
import type { Deps } from '../../application/ports.ts';
import * as uc from '../../application/usecases.ts';
import { exportBackup, restoreBackup } from '../../application/backup.ts';
import { renderHomePage } from '../../web/home-page.ts';

export interface HandlerOptions {
  identity(req: Request): Identity | null;
  signInPath: string;
  signOutPath: string;
}

const SEC_HEADERS: Record<string, string> = {
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'same-origin',
};

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { ...SEC_HEADERS, 'content-type': 'application/json; charset=utf-8' } });

const STATUS: Record<DomainError['code'], number> = {
  unauthenticated: 401, not_approved: 403, forbidden: 403, not_found: 404, invalid_input: 400,
};

/** 状態変更リクエストの同一オリジン確認（CSRF対策） */
function sameOrigin(req: Request): boolean {
  const site = req.headers.get('sec-fetch-site');
  if (site && site !== 'same-origin' && site !== 'none') return false;
  const origin = req.headers.get('origin');
  return !origin || origin === new URL(req.url).origin;
}

async function readJson(req: Request, maxChars = 10_000): Promise<unknown> {
  if (!(req.headers.get('content-type') ?? '').startsWith('application/json')) throw new DomainError('invalid_input');
  const text = await req.text();
  if (text.length > maxChars) throw new DomainError('invalid_input');
  try { return JSON.parse(text); } catch { throw new DomainError('invalid_input'); }
}

const ID = '([A-Za-z0-9-]{8,64})';
const R_STATUS = new RegExp(`^/api/admin/members/${ID}/status$`);
const R_IMAGE = new RegExp(`^/api/images/${ID}$`);

export async function handle(req: Request, d: Deps, o: HandlerOptions): Promise<Response> {
  const url = new URL(req.url);
  const p = url.pathname;
  const m = req.method;
  try {
    if (m === 'GET' && (p === '/' || p === '/index.html')) {
      return new Response(renderHomePage({ signInPath: o.signInPath, signOutPath: o.signOutPath }), {
        headers: {
          ...SEC_HEADERS,
          'content-type': 'text/html; charset=utf-8',
          'content-security-policy':
            "default-src 'self'; img-src 'self' blob:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
        },
      });
    }
    if (p === '/health' && m === 'GET') {
      // 公開してよい情報だけ返す（会員数などは出さない）
      let db = 'ok';
      try { await d.backup.countData(); } catch { db = 'error'; }
      return json({ ok: db === 'ok', db }, db === 'ok' ? 200 : 503);
    }
    if (!p.startsWith('/api/')) return json({ error: 'not_found' }, 404);
    if (m !== 'GET' && !sameOrigin(req)) return json({ error: 'forbidden' }, 403);

    const identity = o.identity(req);
    if (p === '/api/me' && m === 'GET') {
      if (!identity) return json({ signedIn: false });
      const me = await uc.resolveMember(d, identity);
      return json({ signedIn: true, member: toSelfView(me) });
    }

    const me = await uc.resolveMember(d, identity);

    if (p === '/api/goal') {
      if (m === 'GET') { const g = await uc.getMyGoal(d, me); return json({ goal: g ? toGoalView(g) : null }); }
      if (m === 'PUT') return json({ goal: toGoalView(await uc.saveMyGoal(d, me, await readJson(req))) });
    }
    if (p === '/api/admin/pending' && m === 'GET') {
      return json({ members: (await uc.listPending(d, me)).map(toAdminView) });
    }
    if (p === '/api/admin/backup' && m === 'GET') {
      const snap = await exportBackup(d, me);
      const name = `life-stage-${snap.exportedAt.slice(0, 10)}.lsbackup.json`;
      return new Response(JSON.stringify(snap), {
        headers: { ...SEC_HEADERS, 'content-type': 'application/json; charset=utf-8', 'content-disposition': `attachment; filename="${name}"` },
      });
    }
    if (p === '/api/admin/restore' && m === 'POST') {
      return json({ restored: await restoreBackup(d, me, await readJson(req, 50_000_000)) });
    }
    const sm = R_STATUS.exec(p);
    if (sm && m === 'POST') {
      const body = (await readJson(req)) as { status?: unknown };
      const t = await uc.setMemberStatus(d, me, sm[1]!, body?.status);
      return json({ member: toAdminView(t) });
    }
    if (p === '/api/images') {
      if (m === 'GET') {
        const list = await uc.listMyImages(d, me);
        return json({ images: list.map((f) => ({ id: f.id, contentType: f.contentType, size: f.size, createdAt: f.createdAt })) });
      }
      if (m === 'POST') {
        const declared = Number(req.headers.get('content-length') ?? '0');
        if (declared > TEST_IMAGE_MAX_BYTES) throw new DomainError('invalid_input', 'size out of range');
        const body = new Uint8Array(await req.arrayBuffer());
        const ct = (req.headers.get('content-type') ?? '').split(';')[0]!.trim();
        const f = await uc.uploadTestImage(d, me, body, ct);
        return json({ image: { id: f.id, contentType: f.contentType, size: f.size, createdAt: f.createdAt } }, 201);
      }
    }
    const im = R_IMAGE.exec(p);
    if (im) {
      if (m === 'GET') {
        const { file, body } = await uc.readMyImage(d, me, im[1]!);
        return new Response(body as unknown as BodyInit, {
          headers: { ...SEC_HEADERS, 'content-type': file.contentType, 'content-disposition': 'inline', 'cache-control': 'private, no-store' },
        });
      }
      if (m === 'DELETE') { await uc.deleteMyImage(d, me, im[1]!); return json({ ok: true }); }
    }
    return json({ error: 'not_found' }, 404);
  } catch (e) {
    if (e instanceof DomainError) return json({ error: e.code }, STATUS[e.code]);
    console.error('unhandled', e instanceof Error ? e.name : 'unknown'); // 本文・個人情報はログに出さない
    return json({ error: 'internal' }, 500);
  }
}
