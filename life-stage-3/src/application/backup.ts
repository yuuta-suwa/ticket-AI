// D1/R2 の独自バックアップと復元。Sitesはコードを戻してもDB/R2を戻さないため必須。
import { DomainError } from '../domain/errors.ts';
import { assertAdmin, type Member } from '../domain/member.ts';
import { objectKeyFor, sha256Hex } from '../domain/file.ts';
import type { BackupRows, Deps } from './ports.ts';

export const BACKUP_FORMAT = 'life-stage-backup';
export const BACKUP_VERSION = 1;
export const SCHEMA_VERSION = '0001_gate0';

export interface BackupSnapshot extends Omit<BackupRows, 'files'> {
  format: typeof BACKUP_FORMAT;
  version: number;
  schemaVersion: string;
  exportedAt: string;
  files: (BackupRows['files'][number] & { bodyBase64: string })[];
}

// Buffer はWorkersに無いため、標準の btoa/atob で変換する
function toB64(u: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < u.length; i += 0x8000) bin += String.fromCharCode(...u.subarray(i, i + 0x8000));
  return btoa(bin);
}
function fromB64(s: string): Uint8Array {
  if (typeof s !== 'string' || !/^[A-Za-z0-9+/]*={0,2}$/.test(s)) throw new DomainError('invalid_input', 'bad base64');
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
}

export async function exportBackup(d: Deps, me: Member): Promise<BackupSnapshot> {
  assertAdmin(me);
  const rows = await d.backup.dumpAll();
  const files = [];
  for (const f of rows.files) {
    const o = await d.objects.get(f.objectKey);
    if (!o) throw new Error('r2 object missing'); // 欠損を黙って無視しない
    if ((await sha256Hex(o.body)) !== f.sha256) throw new Error('r2 checksum mismatch');
    files.push({ ...f, bodyBase64: toB64(o.body) });
  }
  return { format: BACKUP_FORMAT, version: BACKUP_VERSION, schemaVersion: SCHEMA_VERSION, exportedAt: d.clock.now(), ...rows, files };
}

function validate(raw: unknown): BackupSnapshot {
  const s = raw as Partial<BackupSnapshot> | null;
  if (!s || s.format !== BACKUP_FORMAT || s.version !== BACKUP_VERSION || s.schemaVersion !== SCHEMA_VERSION)
    throw new DomainError('invalid_input', 'unknown backup format');
  for (const k of ['users', 'eligibility', 'roleGrants', 'goals', 'files', 'auditLogs'] as const)
    if (!Array.isArray(s[k])) throw new DomainError('invalid_input');
  const ids = new Set(s.users!.map((u) => u.id));
  const owned = (id: string) => { if (!ids.has(id)) throw new DomainError('invalid_input', 'owner missing'); };
  s.eligibility!.forEach((e) => owned(e.userId));
  s.roleGrants!.forEach((g) => owned(g.userId));
  s.goals!.forEach((g) => owned(g.ownerId));
  for (const f of s.files!) {
    owned(f.ownerId);
    if (f.objectKey !== objectKeyFor(f.ownerId, f.id)) throw new DomainError('invalid_input', 'bad file entry');
  }
  return s as BackupSnapshot;
}

/**
 * 空のサイトにだけ復元する（既存データとの混在・上書き事故を防ぐ）。
 * 「空」= 目標・ファイルが0件、利用者は復元操作をしている管理者本人のみ。
 */
export async function restoreBackup(d: Deps, me: Member, raw: unknown) {
  assertAdmin(me);
  const snap = validate(raw);
  const c = await d.backup.countData();
  if (c.goals > 0 || c.files > 0 || c.users > 1) throw new DomainError('forbidden', 'target is not empty');
  const bodies = [];
  for (const f of snap.files) {
    const body = fromB64(f.bodyBase64);
    if ((await sha256Hex(body)) !== f.sha256) throw new DomainError('invalid_input', 'checksum mismatch');
    bodies.push(body);
  }
  for (let i = 0; i < snap.files.length; i++) await d.objects.put(snap.files[i]!.objectKey, bodies[i]!, snap.files[i]!.contentType);
  const { format: _f, version: _v, schemaVersion: _s, exportedAt: _e, ...rows } = snap;
  try {
    await d.backup.restoreAll({ ...rows, files: snap.files.map(({ bodyBase64: _b, ...meta }) => meta) });
  } catch (e) {
    for (const f of snap.files) await d.objects.delete(f.objectKey).catch(() => {});
    throw e;
  }
  return { users: snap.users.length, goals: snap.goals.length, files: snap.files.length };
}
