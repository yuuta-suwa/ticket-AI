// D1/R2 の独自バックアップと復元。Sitesはコードを戻してもDB/R2を戻さないため必須。
import { DomainError } from '../domain/errors.ts';
import { assertAdmin, type Member } from '../domain/member.ts';
import { objectKeyFor, sha256Hex } from '../domain/file.ts';
import { BACKUP_TABLES, type BackupRows, type Deps } from './ports.ts';

export const BACKUP_FORMAT = 'life-stage-backup';
export const BACKUP_VERSION = 2;
export const SCHEMA_VERSION = '0002_core';

export interface BackupSnapshot {
  format: typeof BACKUP_FORMAT;
  version: number;
  schemaVersion: string;
  exportedAt: string;
  tables: BackupRows;
  /** R2の実体（file_objects.id → base64） */
  objects: Record<string, string>;
}

// Buffer はWorkersに無いため、標準の btoa/atob で変換する
function toB64(u: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < u.length; i += 0x8000) bin += String.fromCharCode(...u.subarray(i, i + 0x8000));
  return btoa(bin);
}
function fromB64(s: unknown): Uint8Array {
  if (typeof s !== 'string' || !/^[A-Za-z0-9+/]*={0,2}$/.test(s)) throw new DomainError('invalid_input', 'bad base64');
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
}

export async function exportBackup(d: Deps, me: Member): Promise<BackupSnapshot> {
  assertAdmin(me);
  const tables = await d.backup.dumpAll();
  const objects: Record<string, string> = {};
  for (const f of tables.file_objects) {
    const o = await d.objects.get(String(f.object_key));
    if (!o) throw new Error('r2 object missing'); // 欠損を黙って無視しない
    if ((await sha256Hex(o.body)) !== f.sha256) throw new Error('r2 checksum mismatch');
    objects[String(f.id)] = toB64(o.body);
  }
  return { format: BACKUP_FORMAT, version: BACKUP_VERSION, schemaVersion: SCHEMA_VERSION, exportedAt: d.clock.now(), tables, objects };
}

function validate(raw: unknown): BackupSnapshot {
  const s = raw as Partial<BackupSnapshot> | null;
  if (!s || s.format !== BACKUP_FORMAT || s.version !== BACKUP_VERSION || s.schemaVersion !== SCHEMA_VERSION)
    throw new DomainError('invalid_input', 'unknown backup format');
  if (!s.tables || typeof s.tables !== 'object' || !s.objects || typeof s.objects !== 'object') throw new DomainError('invalid_input');
  for (const t of BACKUP_TABLES) if (!Array.isArray(s.tables[t])) throw new DomainError('invalid_input', `missing ${t}`);
  const ids = new Set(s.tables.users.map((u) => String(u.id)));
  // 本人データはすべてバックアップ内の会員に属していること
  for (const t of BACKUP_TABLES) for (const row of s.tables[t]) {
    for (const col of ['owner_user_id', 'user_id'] as const)
      if (col in row && !ids.has(String(row[col]))) throw new DomainError('invalid_input', `${t}.${col} owner missing`);
  }
  for (const f of s.tables.file_objects) {
    if (f.object_key !== objectKeyFor(String(f.owner_user_id), String(f.id))) throw new DomainError('invalid_input', 'bad file entry');
    if (typeof s.objects[String(f.id)] !== 'string') throw new DomainError('invalid_input', 'object missing');
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
  const bodies = new Map<string, Uint8Array>();
  for (const f of snap.tables.file_objects) {
    const body = fromB64(snap.objects[String(f.id)]);
    if ((await sha256Hex(body)) !== f.sha256) throw new DomainError('invalid_input', 'checksum mismatch');
    bodies.set(String(f.id), body);
  }
  for (const f of snap.tables.file_objects) await d.objects.put(String(f.object_key), bodies.get(String(f.id))!, String(f.content_type));
  try {
    await d.backup.restoreAll(snap.tables);
  } catch (e) {
    for (const f of snap.tables.file_objects) await d.objects.delete(String(f.object_key)).catch(() => {});
    throw e;
  }
  return { users: snap.tables.users.length, goals: snap.tables.goal_step_versions.length + snap.tables.life_goals.length, files: snap.tables.file_objects.length };
}
