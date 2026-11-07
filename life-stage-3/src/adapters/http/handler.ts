// 標準 Request/Response だけで書いたHTTP層。Sites以外の実行環境にもそのまま載せられる。
import { DomainError } from '../../domain/errors.ts';
import { toAdminView, toSelfView, type Identity, type Member } from '../../domain/member.ts';
import { toGoalView } from '../../domain/goal.ts';
import { TEST_IMAGE_MAX_BYTES } from '../../domain/file.ts';
import type { Deps } from '../../application/ports.ts';
import * as uc from '../../application/usecases.ts';
import * as core from '../../application/core.ts';
import { exportBackup, restoreBackup } from '../../application/backup.ts';
import { renderShell } from '../../web/shell.ts';
import { CLIENT_JS } from '../../web/generated/client-bundle.ts';

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
  unauthenticated: 401, not_approved: 403, forbidden: 403, not_found: 404, invalid_input: 400, conflict: 409,
};

/** 状態変更リクエストの同一オリジン確認（CSRF対策） */
function sameOrigin(req: Request): boolean {
  const site = req.headers.get('sec-fetch-site');
  if (site && site !== 'same-origin' && site !== 'none') return false;
  const origin = req.headers.get('origin');
  return !origin || origin === new URL(req.url).origin;
}

async function readJson(req: Request, maxChars = 20_000): Promise<unknown> {
  if (!(req.headers.get('content-type') ?? '').startsWith('application/json')) throw new DomainError('invalid_input');
  const text = await req.text();
  if (text.length > maxChars) throw new DomainError('invalid_input');
  try { return JSON.parse(text); } catch { throw new DomainError('invalid_input'); }
}

interface Ctx { req: Request; d: Deps; me: Member; p: string[]; url: URL; body(max?: number): Promise<unknown> }
type RouteFn = (c: Ctx) => Promise<unknown> | unknown;
const ID = '([A-Za-z0-9-]{8,64})';
const routes: { m: string; re: RegExp; fn: RouteFn; raw?: boolean }[] = [];
const r = (m: string, path: string, fn: RouteFn, raw = false) => routes.push({ m, re: new RegExp(`^${path}$`), fn, raw });

// Gate-0
r('GET', '/api/goal', async ({ d, me }) => { const g = await uc.getMyGoal(d, me); return { goal: g ? toGoalView(g) : null }; });
r('PUT', '/api/goal', async ({ d, me, body }) => ({ goal: toGoalView(await uc.saveMyGoal(d, me, await body())) }));
r('GET', '/api/admin/pending', async ({ d, me }) => ({ members: (await uc.listPending(d, me)).map(toAdminView) }));
r('POST', `/api/admin/members/${ID}/status`, async ({ d, me, p, body }) => {
  const b = (await body()) as { status?: unknown };
  return { member: toAdminView(await uc.setMemberStatus(d, me, p[0]!, b?.status)) };
});
r('GET', '/api/images', async ({ d, me }) => ({ images: (await uc.listMyImages(d, me)).map((f) => ({ id: f.id, contentType: f.contentType, size: f.size, createdAt: f.createdAt })) }));
r('POST', '/api/images', async ({ d, me, req }) => {
  if (Number(req.headers.get('content-length') ?? '0') > TEST_IMAGE_MAX_BYTES) throw new DomainError('invalid_input', 'size out of range');
  const body = new Uint8Array(await req.arrayBuffer());
  const f = await uc.uploadTestImage(d, me, body, (req.headers.get('content-type') ?? '').split(';')[0]!.trim());
  return json({ image: { id: f.id, contentType: f.contentType, size: f.size, createdAt: f.createdAt } }, 201);
}, true);
r('GET', `/api/images/${ID}`, async ({ d, me, p }) => {
  const { file, body } = await uc.readMyImage(d, me, p[0]!);
  return new Response(body as unknown as BodyInit, { headers: { ...SEC_HEADERS, 'content-type': file.contentType, 'content-disposition': 'inline', 'cache-control': 'private, no-store' } });
}, true);
r('DELETE', `/api/images/${ID}`, async ({ d, me, p }) => { await uc.deleteMyImage(d, me, p[0]!); return { ok: true }; });
r('GET', '/api/admin/backup', async ({ d, me }) => {
  const snap = await exportBackup(d, me);
  return new Response(JSON.stringify(snap), { headers: { ...SEC_HEADERS, 'content-type': 'application/json; charset=utf-8',
    'content-disposition': `attachment; filename="life-stage-${snap.exportedAt.slice(0, 10)}.lsbackup.json"` } });
}, true);
r('POST', '/api/admin/restore', async ({ d, me, body }) => ({ restored: await restoreBackup(d, me, await body(50_000_000)) }));

// HOME / MY PAGE
r('GET', '/api/home', ({ d, me }) => core.home(d, me));
r('GET', '/api/mypage', ({ d, me }) => core.myPage(d, me));
r('GET', '/api/xp', ({ d, me }) => core.myXp(d, me));
// MY GOAL：10ステップ
r('GET', '/api/steps', ({ d, me }) => core.getSteps(d, me));
r('PUT', '/api/steps/(10|[1-9])', async ({ d, me, p, body }) => core.saveStep(d, me, Number(p[0]), await body()));
r('GET', '/api/steps/(10|[1-9])/history', ({ d, me, p }) => core.stepHistory(d, me, Number(p[0])));
r('POST', '/api/steps/next-cycle', ({ d, me }) => core.startNextCycle(d, me));
// LIFE MAP
r('GET', '/api/stages', ({ d, me }) => core.listStages(d, me));
r('POST', '/api/stages', async ({ d, me, body }) => core.createStage(d, me, await body()));
r('PUT', `/api/stages/${ID}`, async ({ d, me, p, body }) => core.updateStage(d, me, p[0]!, await body()));
r('POST', `/api/stages/${ID}/status`, async ({ d, me, p, body }) => core.changeStageStatus(d, me, p[0]!, await body()));
r('POST', `/api/stages/${ID}/move`, async ({ d, me, p, body }) => core.moveStage(d, me, p[0]!, ((await body()) as { dir?: unknown })?.dir));
r('DELETE', `/api/stages/${ID}`, ({ d, me, p }) => core.archiveStage(d, me, p[0]!));
// DAILY MISSION
r('GET', '/api/missions', ({ d, me, url }) => core.listMissions(d, me, url.searchParams.get('all') === '1'));
r('POST', '/api/missions', async ({ d, me, body }) => core.createMission(d, me, await body()));
r('PUT', `/api/missions/${ID}`, async ({ d, me, p, body }) => core.updateMission(d, me, p[0]!, await body()));
r('POST', `/api/missions/${ID}/action`, async ({ d, me, p, body }) => core.missionAction(d, me, p[0]!, await body()));
r('POST', `/api/missions/${ID}/today`, async ({ d, me, p, body }) => core.setToday(d, me, p[0]!, ((await body()) as { on?: unknown })?.on));
r('GET', `/api/missions/${ID}/logs`, ({ d, me, p }) => core.missionLogs(d, me, p[0]!));
r('DELETE', `/api/missions/${ID}`, ({ d, me, p }) => core.archiveMission(d, me, p[0]!));
// 週次レビュー
r('GET', '/api/reviews', ({ d, me }) => core.listReviews(d, me));
r('GET', '/api/reviews/current', ({ d, me, url }) => core.getReview(d, me, url.searchParams.get('week')));
r('PUT', '/api/reviews/(\\d{4}-W\\d{2})', async ({ d, me, p, body }) => core.saveReview(d, me, p[0]!, await body()));
// AI LIFE COACH（API不使用）
r('GET', '/api/coach/prompt', ({ d, me, url }) => core.coachPrompt(d, me, url.searchParams.get('theme'), url.searchParams.get('time')));
r('GET', '/api/coach/notes', ({ d, me }) => core.listCoachNotes(d, me));
r('POST', '/api/coach/notes', async ({ d, me, body }) => core.saveCoachNote(d, me, await body()));
r('POST', `/api/coach/notes/${ID}/status`, async ({ d, me, p, body }) => core.setCoachNoteStatus(d, me, p[0]!, ((await body()) as { status?: unknown })?.status));
// MANAGEMENT（管理者のみ。判定はユースケース側）
r('GET', '/api/admin/xp-rules', ({ d, me }) => core.adminXpRules(d, me));
r('PUT', '/api/admin/xp-rules', async ({ d, me, body }) => core.updateXpRules(d, me, await body()));
r('POST', `/api/admin/xp/${ID}/revoke`, async ({ d, me, p, body }) => core.revokeXp(d, me, p[0]!, await body()));
r('GET', `/api/admin/members/${ID}/xp`, ({ d, me, p }) => core.adminMemberXp(d, me, p[0]!));
r('GET', '/api/admin/missions', ({ d, me }) => core.submittedMissions(d, me));
r('POST', `/api/admin/missions/${ID}/review`, async ({ d, me, p, body }) => core.reviewMission(d, me, p[0]!, await body()));
r('GET', '/api/admin/audit', ({ d, me }) => core.auditLog(d, me));

const CSP = "default-src 'self'; img-src 'self' blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'";

export async function handle(req: Request, d: Deps, o: HandlerOptions): Promise<Response> {
  const url = new URL(req.url);
  const p = url.pathname;
  const m = req.method;
  try {
    if (m === 'GET' && (p === '/' || p === '/index.html')) {
      return new Response(renderShell({ signInPath: o.signInPath, signOutPath: o.signOutPath }), {
        headers: { ...SEC_HEADERS, 'content-type': 'text/html; charset=utf-8', 'content-security-policy': CSP },
      });
    }
    if (m === 'GET' && p === '/app.js') {
      return new Response(CLIENT_JS, { headers: { ...SEC_HEADERS, 'content-type': 'text/javascript; charset=utf-8' } });
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

    for (const route of routes) {
      if (route.m !== m) continue;
      const match = route.re.exec(p);
      if (!match) continue;
      const me = await uc.resolveMember(d, identity);
      const out = await route.fn({ req, d, me, p: match.slice(1), url, body: (max?: number) => readJson(req, max) });
      return route.raw || out instanceof Response ? (out as Response) : json(out ?? { ok: true });
    }
    // 経路は無いが認証は確認する（未サインインに経路の有無を教えない）
    await uc.resolveMember(d, identity);
    return json({ error: 'not_found' }, 404);
  } catch (e) {
    if (e instanceof DomainError) return json(e.details.length ? { error: e.code, details: e.details } : { error: e.code }, STATUS[e.code]);
    console.error('unhandled', e instanceof Error ? `${e.name}: ${e.message}`.slice(0, 200) : 'unknown'); // 入力本文・個人情報はログに出さない
    return json({ error: 'internal' }, 500);
  }
}
