// Sites（Workers互換ランタイム）用のエントリ。ここだけがプラットフォーム依存。
import type { Env } from './bindings.ts';
import type { Deps } from '../../application/ports.ts';
import { D1BackupStore, D1FileRepository, D1GoalRepository, D1MemberRepository } from './d1-repositories.ts';
import { R2ObjectStore } from './r2-object-store.ts';
import { SITES_SIGNIN_PATH, SITES_SIGNOUT_PATH, sitesIdentity } from './identity.ts';
import { devAuthEnabled, devIdentity, devSignInResponse, devSignOutResponse } from '../dev/dev-identity.ts';
import { handle } from '../http/handler.ts';
import { normalizeEmail } from '../../domain/member.ts';

export function buildDeps(env: Env): Deps {
  return {
    members: new D1MemberRepository(env.DB),
    goals: new D1GoalRepository(env.DB),
    files: new D1FileRepository(env.DB),
    objects: new R2ObjectStore(env.FILES),
    clock: { now: () => new Date().toISOString() },
    ids: { next: () => crypto.randomUUID() },
    backup: new D1BackupStore(env.DB),
    adminEmails: new Set((env.ADMIN_EMAILS ?? '').split(',').map(normalizeEmail).filter(Boolean)),
  };
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const dev = devAuthEnabled(env, req);
    if (dev) {
      const p = new URL(req.url).pathname;
      if (p === SITES_SIGNIN_PATH) return devSignInResponse(req);
      if (p === SITES_SIGNOUT_PATH) return devSignOutResponse();
    }
    return handle(req, buildDeps(env), {
      identity: dev ? devIdentity : sitesIdentity,
      signInPath: SITES_SIGNIN_PATH,
      signOutPath: SITES_SIGNOUT_PATH,
    });
  },
};
