// D1/R2 の独自バックアップと復元。Sitesはコードを戻してもDB/R2を戻さないため必須。
import { DomainError } from '../domain/errors.ts';
import { assertAdmin, type Member } from '../domain/member.ts';
import type { Goal } from '../domain/goal.ts';
import { objectKeyFor, type StoredFile } from '../domain/file.ts';
import type { Deps } from './ports.ts';

export const BACKUP_FORMAT = 'life-stage-backup';
export const BACKUP_VERSION = 1;

export interface BackupSnapshot {
  format: typeof BACKUP_FORMAT;
  version: number;
  exportedAt: string;
  members: Member[];
  goals: Goal[];
  files: (StoredFile & { bodyBase64: string })[];
}

// Buffer はWorkersに無いため、標準の btoa/atob で変換する
function toB64(u: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < u.length; i += 0x8000) bin += String.fromCharCode(...u.subarray(i, i + 0x8000));
  return btoa(bin);
}
function fromB64(s: string): Uint8Array {
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(s)) throw new DomainError('invalid_input', 'bad base64');
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
}

export async function exportBackup(d: Deps, me: Member): Promise<BackupSnapshot> {
  assertAdmin(me);
  const { members, goals, files } = await d.backup.dumpAll();
  const withBodies = [];
  for (const f of files) {
    const o = await d.objects.get(f.objectKey);
    if (!o) throw new Error('r2 object missing'); // 欠損を黙って無視しない
    withBodies.push({ ...f, bodyBase64: toB64(o.body) });
  }
  return { format: BACKUP_FORMAT, version: BACKUP_VERSION, exportedAt: d.clock.now(), members, goals, files: withBodies };
}

function validate(raw: unknown): BackupSnapshot {
  const s = raw as Partial<BackupSnapshot> | null;
  if (!s || s.format !== BACKUP_FORMAT || s.version !== BACKUP_VERSION) throw new DomainError('invalid_input', 'unknown backup format');
  if (!Array.isArray(s.members) || !Array.isArray(s.goals) || !Array.isArray(s.files)) throw new DomainError('invalid_input');
  const ids = new Set(s.members.map((m) => m.id));
  for (const g of s.goals) if (!ids.has(g.ownerId)) throw new DomainError('invalid_input', 'goal owner missing');
  for (const f of s.files) {
    if (!ids.has(f.ownerId) || f.objectKey !== objectKeyFor(f.ownerId, f.id)) throw new DomainError('invalid_input', 'bad file entry');
  }
  return s as BackupSnapshot;
}

/**
 * 空のサイトにだけ復元する（既存データとの混在・上書き事故を防ぐ）。
 * 「空」= 目標・ファイルが0件、会員は復元操作をしている管理者本人のみ。
 */
export async function restoreBackup(d: Deps, me: Member, raw: unknown): Promise<{ members: number; goals: number; files: number }> {
  assertAdmin(me);
  const snap = validate(raw);
  const c = await d.backup.countData();
  if (c.goals > 0 || c.files > 0 || c.members > 1) throw new DomainError('forbidden', 'target is not empty');
  // 復元を実行した管理者の仮登録は restoreRows で消え、バックアップ側の会員に置き換わる
  const members = snap.members;
  for (const f of snap.files) await d.objects.put(f.objectKey, fromB64(f.bodyBase64), f.contentType);
  await d.backup.restoreRows({
    members,
    goals: snap.goals,
    files: snap.files.map(({ bodyBase64: _b, ...meta }) => meta),
  });
  return { members: members.length, goals: snap.goals.length, files: snap.files.length };
}
