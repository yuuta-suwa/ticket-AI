import type { D1Database } from './bindings.ts';
import type { FileRepository, GoalRepository, MemberRepository } from '../../application/ports.ts';
import type { Member } from '../../domain/member.ts';
import type { Goal } from '../../domain/goal.ts';
import type { StoredFile } from '../../domain/file.ts';

type MemberRow = {
  id: string; email: string; display_name: string; status: Member['status']; role: Member['role'];
  created_at: string; approved_at: string | null; approved_by: string | null;
};
const toMember = (r: MemberRow): Member => ({
  id: r.id, email: r.email, displayName: r.display_name, status: r.status, role: r.role,
  createdAt: r.created_at, approvedAt: r.approved_at, approvedBy: r.approved_by,
});

export class D1MemberRepository implements MemberRepository {
  private db: D1Database;
  constructor(db: D1Database) { this.db = db; }
  async findByEmail(email: string) {
    const r = await this.db.prepare('SELECT * FROM members WHERE email = ?').bind(email).first<MemberRow>();
    return r ? toMember(r) : null;
  }
  async findById(id: string) {
    const r = await this.db.prepare('SELECT * FROM members WHERE id = ?').bind(id).first<MemberRow>();
    return r ? toMember(r) : null;
  }
  async insert(m: Member) {
    await this.db.prepare(
      'INSERT INTO members (id,email,display_name,status,role,created_at,approved_at,approved_by) VALUES (?,?,?,?,?,?,?,?)',
    ).bind(m.id, m.email, m.displayName, m.status, m.role, m.createdAt, m.approvedAt, m.approvedBy).run();
  }
  async insertOrGet(m: Member) {
    await this.db.prepare(
      'INSERT INTO members (id,email,display_name,status,role,created_at,approved_at,approved_by) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(email) DO NOTHING',
    ).bind(m.id, m.email, m.displayName, m.status, m.role, m.createdAt, m.approvedAt, m.approvedBy).run();
    const got = await this.findByEmail(m.email);
    if (!got) throw new Error('member insert failed');
    return got;
  }
  async updateStatus(m: Member) {
    await this.db.prepare('UPDATE members SET status = ?, approved_at = ?, approved_by = ? WHERE id = ?')
      .bind(m.status, m.approvedAt, m.approvedBy, m.id).run();
  }
  async listByStatus(status: Member['status']) {
    const { results } = await this.db.prepare('SELECT * FROM members WHERE status = ? ORDER BY created_at LIMIT 200')
      .bind(status).all<MemberRow>();
    return results.map(toMember);
  }
}

type GoalRow = { id: string; owner_id: string; title: string; detail: string; updated_at: string };
const toGoal = (r: GoalRow): Goal => ({ id: r.id, ownerId: r.owner_id, title: r.title, detail: r.detail, updatedAt: r.updated_at });

export class D1GoalRepository implements GoalRepository {
  private db: D1Database;
  constructor(db: D1Database) { this.db = db; }
  async getForOwner(ownerId: string) {
    const r = await this.db.prepare('SELECT * FROM goals WHERE owner_id = ?').bind(ownerId).first<GoalRow>();
    return r ? toGoal(r) : null;
  }
  async upsertForOwner(g: Goal) {
    await this.db.prepare(
      `INSERT INTO goals (id, owner_id, title, detail, updated_at) VALUES (?,?,?,?,?)
       ON CONFLICT(owner_id) DO UPDATE SET title = excluded.title, detail = excluded.detail, updated_at = excluded.updated_at`,
    ).bind(g.id, g.ownerId, g.title, g.detail, g.updatedAt).run();
    const saved = await this.getForOwner(g.ownerId);
    if (!saved) throw new Error('goal upsert failed');
    return saved;
  }
}

type FileRow = { id: string; owner_id: string; object_key: string; content_type: string; size: number; created_at: string };
const toFile = (r: FileRow): StoredFile => ({
  id: r.id, ownerId: r.owner_id, objectKey: r.object_key, contentType: r.content_type, size: Number(r.size), createdAt: r.created_at,
});

export class D1FileRepository implements FileRepository {
  private db: D1Database;
  constructor(db: D1Database) { this.db = db; }
  async insert(f: StoredFile) {
    await this.db.prepare('INSERT INTO files (id,owner_id,object_key,content_type,size,created_at) VALUES (?,?,?,?,?,?)')
      .bind(f.id, f.ownerId, f.objectKey, f.contentType, f.size, f.createdAt).run();
  }
  async getForOwner(ownerId: string, id: string) {
    const r = await this.db.prepare('SELECT * FROM files WHERE id = ? AND owner_id = ?').bind(id, ownerId).first<FileRow>();
    return r ? toFile(r) : null;
  }
  async listForOwner(ownerId: string) {
    const { results } = await this.db.prepare('SELECT * FROM files WHERE owner_id = ? ORDER BY created_at DESC LIMIT 20')
      .bind(ownerId).all<FileRow>();
    return results.map(toFile);
  }
  async delete(ownerId: string, id: string) {
    await this.db.prepare('DELETE FROM files WHERE id = ? AND owner_id = ?').bind(id, ownerId).run();
  }
}
