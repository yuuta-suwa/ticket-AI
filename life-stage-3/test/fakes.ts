import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import type { D1Database, D1PreparedStatement, R2Bucket, Env } from '../src/adapters/sites/bindings.ts';

/** node:sqlite で D1 の最小APIを再現し、実際のマイグレーションSQLを流す */
export function fakeD1(): D1Database {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  db.exec(readFileSync(new URL('../migrations/0001_gate0.sql', import.meta.url), 'utf8'));
  const stmt = (sql: string, params: unknown[]): D1PreparedStatement => ({
    bind: (...v: unknown[]) => stmt(sql, v),
    first: async <T>() => (db.prepare(sql).get(...(params as never[])) as T | undefined) ?? null,
    all: async <T>() => ({ results: db.prepare(sql).all(...(params as never[])) as T[] }),
    run: async () => db.prepare(sql).run(...(params as never[])),
  });
  return { prepare: (sql: string) => stmt(sql, []) };
}

export function fakeR2(): R2Bucket & { keys(): string[] } {
  const m = new Map<string, { body: Uint8Array; ct?: string }>();
  return {
    async put(key, value, opt) { m.set(key, { body: new Uint8Array(value as ArrayBuffer), ct: opt?.httpMetadata?.contentType }); return {}; },
    async get(key) {
      const o = m.get(key); if (!o) return null;
      return { arrayBuffer: async () => o.body.slice().buffer, httpMetadata: { contentType: o.ct } };
    },
    async delete(key) { m.delete(key); },
    keys: () => [...m.keys()],
  };
}

export function fakeEnv(extra: Partial<Env> = {}) {
  const BUCKET = fakeR2();
  return { env: { DB: fakeD1(), BUCKET, ADMIN_EMAILS: 'Admin@Example.com', ...extra } as Env, bucket: BUCKET };
}

export const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d, 1, 2, 3]);
