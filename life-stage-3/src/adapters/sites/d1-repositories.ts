import type { D1Database } from './bindings.ts';
import type {
  AuditEntry, BackupRows, BackupStore, FileRepository, GoalRepository, MemberRepository,
} from '../../application/ports.ts';
import type { EligibilityStatus, Member } from '../../domain/member.ts';
import type { Goal } from '../../domain/goal.ts';
import type { StoredFile } from '../../domain/file.ts';

const MEMBER_SELECT = `
SELECT u.id, u.normalized_email, u.display_name, u.created_at,
       e.status, e.changed_at, e.changed_by,
       EXISTS(SELECT 1 FROM role_grants r WHERE r.user_id = u.id AND r.role = 'admin' AND r.revoked_at IS NULL) AS is_admin
FROM users u JOIN member_eligibility e ON e.user_id = u.id`;

type MemberRow = {
  id: string; normalized_email: string; display_name: string; created_at: string;
  status: EligibilityStatus; changed_at: string; changed_by: string | null; is_admin: number;
};
const toMember = (r: MemberRow): Member => ({
  id: r.id, email: r.normalized_email, displayName: r.display_name, createdAt: r.created_at,
  status: r.status, statusChangedAt: r.changed_at, statusChangedBy: r.changed_by,
  roles: Number(r.is_admin) ? ['admin'] : [],
});

const auditStmt = (db: D1Database, id: string, a: AuditEntry, now: string) =>
  db.prepare('INSERT INTO audit_logs (id,actor_user_id,action,target_type,target_id,before_json,after_json,reason,created_at) VALUES (?,?,?,?,?,?,?,?,?)')
    .bind(id, a.actorUserId, a.action, a.targetType, a.targetId, JSON.stringify(a.before), JSON.stringify(a.after), a.reason, now);

export class D1MemberRepository implements MemberRepository {
  private db: D1Database;
  constructor(db: D1Database) { this.db = db; }
  async findByEmail(email: string) {
    const r = await this.db.prepare(`${MEMBER_SELECT} WHERE u.normalized_email = ?`).bind(email).first<MemberRow>();
    return r ? toMember(r) : null;
  }
  async findById(id: string) {
    const r = await this.db.prepare(`${MEMBER_SELECT} WHERE u.id = ?`).bind(id).first<MemberRow>();
    return r ? toMember(r) : null;
  }
  async createOrGet(m: Member) {
    await this.db.batch([
      this.db.prepare('INSERT INTO users (id,normalized_email,display_name,created_at) VALUES (?,?,?,?) ON CONFLICT(normalized_email) DO NOTHING')
        .bind(m.id, m.email, m.displayName, m.createdAt),
      this.db.prepare(`INSERT INTO member_eligibility (user_id,status,changed_at,changed_by)
        SELECT id, 'pending', ?, NULL FROM users WHERE normalized_email = ? ON CONFLICT(user_id) DO NOTHING`)
        .bind(m.createdAt, m.email),
    ]);
    const got = await this.findByEmail(m.email);
    if (!got) throw new Error('member insert failed');
    return got;
  }
  async hasActiveAdmin() {
    const r = await this.db.prepare(`SELECT 1 AS x FROM role_grants r JOIN member_eligibility e ON e.user_id = r.user_id
      WHERE r.role = 'admin' AND r.revoked_at IS NULL AND e.status = 'active' LIMIT 1`).first();
    return !!r;
  }
  async bootstrapAdmin(m: Member, grantId: string, auditId: string, now: string) {
    // 同時サインインでも初代管理者が2人できないよう、付与・有効化・監査をすべて条件付きで1トランザクションに
    await this.db.batch([
      this.db.prepare(`INSERT INTO role_grants (id,user_id,role,granted_at,granted_by,revoked_at)
        SELECT ?, ?, 'admin', ?, 'bootstrap', NULL
        WHERE NOT EXISTS (SELECT 1 FROM role_grants WHERE role = 'admin' AND revoked_at IS NULL)`).bind(grantId, m.id, now),
      this.db.prepare(`UPDATE member_eligibility SET status = 'active', changed_at = ?, changed_by = 'bootstrap'
        WHERE user_id = ? AND status = 'pending' AND EXISTS (SELECT 1 FROM role_grants WHERE id = ?)`).bind(now, m.id, grantId),
      this.db.prepare(`INSERT INTO audit_logs (id,actor_user_id,action,target_type,target_id,before_json,after_json,reason,created_at)
        SELECT ?, 'bootstrap', 'member.bootstrap_admin', 'user', ?, '{"status":"pending"}', '{"status":"active","role":"admin"}', 'ADMIN_EMAILS', ?
        WHERE EXISTS (SELECT 1 FROM role_grants WHERE id = ?)`).bind(auditId, m.id, now, grantId),
    ]);
    return (await this.findById(m.id))!;
  }
  async updateStatus(next: Member, audit: AuditEntry, auditId: string, now: string) {
    await this.db.batch([
      this.db.prepare('UPDATE member_eligibility SET status = ?, changed_at = ?, changed_by = ? WHERE user_id = ?')
        .bind(next.status, next.statusChangedAt, next.statusChangedBy, next.id),
      auditStmt(this.db, auditId, audit, now),
    ]);
  }
  async listByStatus(status: EligibilityStatus) {
    const { results } = await this.db.prepare(`${MEMBER_SELECT} WHERE e.status = ? ORDER BY u.created_at LIMIT 200`).bind(status).all<MemberRow>();
    return results.map(toMember);
  }
}

type GoalRow = { id: string; owner_user_id: string; title: string; detail: string; updated_at: string; archived_at: string | null };
const toGoal = (r: GoalRow): Goal => ({ id: r.id, ownerId: r.owner_user_id, title: r.title, detail: r.detail, updatedAt: r.updated_at });

export class D1GoalRepository implements GoalRepository {
  private db: D1Database;
  constructor(db: D1Database) { this.db = db; }
  async getForOwner(ownerId: string) {
    const r = await this.db.prepare('SELECT * FROM life_goals WHERE owner_user_id = ? AND archived_at IS NULL').bind(ownerId).first<GoalRow>();
    return r ? toGoal(r) : null;
  }
  async upsertForOwner(g: Goal) {
    // WHERE owner_user_id で、既存IDが他人のものなら更新されない
    await this.db.prepare(
      `INSERT INTO life_goals (id, owner_user_id, title, detail, updated_at) VALUES (?,?,?,?,?)
       ON CONFLICT(id) DO UPDATE SET title = excluded.title, detail = excluded.detail, updated_at = excluded.updated_at
       WHERE life_goals.owner_user_id = excluded.owner_user_id`,
    ).bind(g.id, g.ownerId, g.title, g.detail, g.updatedAt).run();
    const saved = await this.getForOwner(g.ownerId);
    if (!saved) throw new Error('goal upsert failed');
    return saved;
  }
}

type FileRow = { id: string; owner_user_id: string; object_key: string; content_type: string; size: number; sha256: string; created_at: string };
const toFile = (r: FileRow): StoredFile => ({
  id: r.id, ownerId: r.owner_user_id, objectKey: r.object_key, contentType: r.content_type,
  size: Number(r.size), sha256: r.sha256, createdAt: r.created_at,
});

export class D1FileRepository implements FileRepository {
  private db: D1Database;
  constructor(db: D1Database) { this.db = db; }
  async insert(f: StoredFile) {
    await this.db.prepare('INSERT INTO file_objects (id,owner_user_id,object_key,content_type,size,sha256,created_at) VALUES (?,?,?,?,?,?,?)')
      .bind(f.id, f.ownerId, f.objectKey, f.contentType, f.size, f.sha256, f.createdAt).run();
  }
  async getForOwner(ownerId: string, id: string) {
    const r = await this.db.prepare('SELECT * FROM file_objects WHERE id = ? AND owner_user_id = ?').bind(id, ownerId).first<FileRow>();
    return r ? toFile(r) : null;
  }
  async listForOwner(ownerId: string) {
    const { results } = await this.db.prepare('SELECT * FROM file_objects WHERE owner_user_id = ? ORDER BY created_at DESC LIMIT 20')
      .bind(ownerId).all<FileRow>();
    return results.map(toFile);
  }
  async delete(ownerId: string, id: string) {
    await this.db.prepare('DELETE FROM file_objects WHERE id = ? AND owner_user_id = ?').bind(id, ownerId).run();
  }
}

export class D1BackupStore implements BackupStore {
  private db: D1Database;
  constructor(db: D1Database) { this.db = db; }
  async dumpAll(): Promise<BackupRows> {
    const all = async <T>(sql: string) => (await this.db.prepare(sql).all<T>()).results;
    const users = await all<{ id: string; normalized_email: string; display_name: string; created_at: string }>('SELECT * FROM users ORDER BY created_at, id');
    const elig = await all<{ user_id: string; status: EligibilityStatus; changed_at: string; changed_by: string | null }>('SELECT * FROM member_eligibility ORDER BY user_id');
    const grants = await all<{ id: string; user_id: string; role: 'admin'; granted_at: string; granted_by: string; revoked_at: string | null }>('SELECT * FROM role_grants ORDER BY granted_at, id');
    const goals = await all<GoalRow>('SELECT * FROM life_goals ORDER BY updated_at, id');
    const files = await all<FileRow>('SELECT * FROM file_objects ORDER BY created_at, id');
    const audits = await all<{ id: string; actor_user_id: string; action: string; target_type: string; target_id: string; before_json: string | null; after_json: string | null; reason: string | null; created_at: string }>('SELECT * FROM audit_logs ORDER BY created_at, rowid');
    return {
      users: users.map((u) => ({ id: u.id, email: u.normalized_email, displayName: u.display_name, createdAt: u.created_at })),
      eligibility: elig.map((e) => ({ userId: e.user_id, status: e.status, changedAt: e.changed_at, changedBy: e.changed_by })),
      roleGrants: grants.map((g) => ({ id: g.id, userId: g.user_id, role: g.role, grantedAt: g.granted_at, grantedBy: g.granted_by, revokedAt: g.revoked_at })),
      goals: goals.map((g) => ({ ...toGoal(g), archivedAt: g.archived_at })),
      files: files.map(toFile),
      auditLogs: audits.map((a) => ({
        id: a.id, actorUserId: a.actor_user_id, action: a.action, targetType: a.target_type, targetId: a.target_id,
        before: a.before_json ? JSON.parse(a.before_json) : null, after: a.after_json ? JSON.parse(a.after_json) : null,
        reason: a.reason, createdAt: a.created_at,
      })),
    };
  }
  async countData() {
    const n = async (t: string) => Number((await this.db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).first<{ n: number }>())?.n ?? 0);
    return { users: await n('users'), goals: await n('life_goals'), files: await n('file_objects') };
  }
  async restoreAll(rows: BackupRows) {
    const db = this.db;
    // 復元操作をした管理者の仮登録も含め全削除→投入を1トランザクションで（途中失敗なら元のまま）
    const stmts = ['audit_logs', 'role_grants', 'member_eligibility', 'life_goals', 'file_objects', 'users']
      .map((t) => db.prepare(`DELETE FROM ${t}`));
    for (const u of rows.users) stmts.push(db.prepare('INSERT INTO users (id,normalized_email,display_name,created_at) VALUES (?,?,?,?)').bind(u.id, u.email, u.displayName, u.createdAt));
    for (const e of rows.eligibility) stmts.push(db.prepare('INSERT INTO member_eligibility (user_id,status,changed_at,changed_by) VALUES (?,?,?,?)').bind(e.userId, e.status, e.changedAt, e.changedBy));
    for (const g of rows.roleGrants) stmts.push(db.prepare('INSERT INTO role_grants (id,user_id,role,granted_at,granted_by,revoked_at) VALUES (?,?,?,?,?,?)').bind(g.id, g.userId, g.role, g.grantedAt, g.grantedBy, g.revokedAt));
    for (const g of rows.goals) stmts.push(db.prepare('INSERT INTO life_goals (id,owner_user_id,title,detail,updated_at,archived_at) VALUES (?,?,?,?,?,?)').bind(g.id, g.ownerId, g.title, g.detail, g.updatedAt, g.archivedAt));
    for (const f of rows.files) stmts.push(db.prepare('INSERT INTO file_objects (id,owner_user_id,object_key,content_type,size,sha256,created_at) VALUES (?,?,?,?,?,?,?)').bind(f.id, f.ownerId, f.objectKey, f.contentType, f.size, f.sha256, f.createdAt));
    for (const a of rows.auditLogs) stmts.push(auditStmt(db, a.id, a, a.createdAt));
    await db.batch(stmts);
  }
}
