// BUILD-B の D1 実装。すべての本人データの読み書きで owner_user_id を条件に入れる
import type { D1Database, D1PreparedStatement } from './bindings.ts';
import type {
  AuditRepository, CoachRepository, ConfigRepository, CoreDeps, MissionLog, MissionRepository, ReviewRepository,
  StageRepository, StepRepository, XpRepository,
} from '../../application/core-ports.ts';
import type { AuditEntry } from '../../application/ports.ts';
import type { StepVersion } from '../../domain/steps.ts';
import type { Stage } from '../../domain/stage.ts';
import type { Mission } from '../../domain/mission.ts';
import type { XpEntry, XpRules } from '../../domain/xp.ts';
import type { WeeklyReview } from '../../domain/review.ts';
import type { CoachNote } from '../../domain/coach.ts';

type Row = Record<string, unknown>;
const s = (v: unknown) => (v === null || v === undefined ? null : String(v));
const n = (v: unknown) => Number(v);

const auditStmt = (db: D1Database, id: string, a: AuditEntry, now: string): D1PreparedStatement =>
  db.prepare('INSERT INTO audit_logs (id,actor_user_id,action,target_type,target_id,before_json,after_json,reason,created_at) VALUES (?,?,?,?,?,?,?,?,?)')
    .bind(id, a.actorUserId, a.action, a.targetType, a.targetId, JSON.stringify(a.before), JSON.stringify(a.after), a.reason, now);

const toStep = (r: Row): StepVersion => ({ id: String(r.id), ownerId: String(r.owner_user_id), cycle: n(r.cycle), stepNo: n(r.step_no), version: n(r.version),
  status: r.status as StepVersion['status'], content: JSON.parse(String(r.content_json)), createdAt: String(r.created_at) });

class D1Steps implements StepRepository {
  private db: D1Database;
  constructor(db: D1Database) { this.db = db; }
  async latestAll(ownerId: string, cycle: number) {
    const { results } = await this.db.prepare(`SELECT v.* FROM goal_step_versions v
      JOIN (SELECT step_no, MAX(version) AS mv FROM goal_step_versions WHERE owner_user_id = ? AND cycle = ? GROUP BY step_no) l
        ON l.step_no = v.step_no AND l.mv = v.version
      WHERE v.owner_user_id = ? AND v.cycle = ? ORDER BY v.step_no`).bind(ownerId, cycle, ownerId, cycle).all<Row>();
    return results.map(toStep);
  }
  async history(ownerId: string, cycle: number, stepNo: number) {
    const { results } = await this.db.prepare('SELECT * FROM goal_step_versions WHERE owner_user_id = ? AND cycle = ? AND step_no = ? ORDER BY version DESC LIMIT 50')
      .bind(ownerId, cycle, stepNo).all<Row>();
    return results.map(toStep);
  }
  async insert(v: StepVersion) {
    await this.db.prepare('INSERT INTO goal_step_versions (id,owner_user_id,cycle,step_no,version,status,content_json,created_at) VALUES (?,?,?,?,?,?,?,?)')
      .bind(v.id, v.ownerId, v.cycle, v.stepNo, v.version, v.status, JSON.stringify(v.content), v.createdAt).run();
  }
  async currentCycle(ownerId: string) {
    const r = await this.db.prepare('SELECT MAX(cycle) AS c FROM goal_step_versions WHERE owner_user_id = ?').bind(ownerId).first<Row>();
    return r?.c ? n(r.c) : 1;
  }
}

const toStage = (r: Row): Stage => ({ id: String(r.id), ownerId: String(r.owner_user_id), position: n(r.position), title: String(r.title),
  conditionText: String(r.condition_text), dueOn: s(r.due_on), status: r.status as Stage['status'], evidenceNote: String(r.evidence_note),
  nextChallenge: String(r.next_challenge), createdAt: String(r.created_at), updatedAt: String(r.updated_at), achievedAt: s(r.achieved_at), archivedAt: s(r.archived_at) });

class D1Stages implements StageRepository {
  private db: D1Database;
  constructor(db: D1Database) { this.db = db; }
  async list(ownerId: string) {
    const { results } = await this.db.prepare('SELECT * FROM life_stages WHERE owner_user_id = ? AND archived_at IS NULL ORDER BY position, created_at').bind(ownerId).all<Row>();
    return results.map(toStage);
  }
  async get(ownerId: string, id: string) {
    const r = await this.db.prepare('SELECT * FROM life_stages WHERE owner_user_id = ? AND id = ?').bind(ownerId, id).first<Row>();
    return r ? toStage(r) : null;
  }
  async insert(x: Stage) {
    await this.db.prepare(`INSERT INTO life_stages (id,owner_user_id,position,title,condition_text,due_on,status,evidence_note,next_challenge,created_at,updated_at,achieved_at,archived_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(x.id, x.ownerId, x.position, x.title, x.conditionText, x.dueOn, x.status, x.evidenceNote, x.nextChallenge,
      x.createdAt, x.updatedAt, x.achievedAt, x.archivedAt).run();
  }
  private upd(x: Stage) {
    return this.db.prepare(`UPDATE life_stages SET position=?, title=?, condition_text=?, due_on=?, status=?, evidence_note=?, next_challenge=?, updated_at=?, achieved_at=?, archived_at=?
      WHERE id = ? AND owner_user_id = ?`).bind(x.position, x.title, x.conditionText, x.dueOn, x.status, x.evidenceNote, x.nextChallenge, x.updatedAt, x.achievedAt, x.archivedAt, x.id, x.ownerId);
  }
  async update(x: Stage) { await this.upd(x).run(); }
  async transition(x: Stage, from: string, note: string, eventId: string, now: string) {
    await this.db.batch([this.upd(x), this.db.prepare('INSERT INTO life_stage_events (id,stage_id,owner_user_id,from_status,to_status,note,created_at) VALUES (?,?,?,?,?,?,?)')
      .bind(eventId, x.id, x.ownerId, from, x.status, note, now)]);
  }
  async events(ownerId: string, limit: number) {
    const { results } = await this.db.prepare(`SELECT e.stage_id, s.title, e.from_status, e.to_status, e.note, e.created_at FROM life_stage_events e
      JOIN life_stages s ON s.id = e.stage_id WHERE e.owner_user_id = ? ORDER BY e.created_at DESC, e.rowid DESC LIMIT ?`).bind(ownerId, limit).all<Row>();
    return results.map((r) => ({ stageId: String(r.stage_id), title: String(r.title), fromStatus: String(r.from_status), toStatus: String(r.to_status), note: String(r.note), createdAt: String(r.created_at) }));
  }
}

const toMission = (r: Row): Mission => ({ id: String(r.id), ownerId: String(r.owner_user_id), title: String(r.title), detail: String(r.detail), stageId: s(r.stage_id),
  dueOn: s(r.due_on), contribution: n(r.contribution), effort: n(r.effort), kpiGap: n(r.kpi_gap), verifyMode: r.verify_mode as Mission['verifyMode'],
  status: r.status as Mission['status'], todayOn: s(r.today_on), evidenceNote: String(r.evidence_note), returnReason: String(r.return_reason),
  verifiedBy: s(r.verified_by), verifiedAt: s(r.verified_at), createdAt: String(r.created_at), updatedAt: String(r.updated_at), archivedAt: s(r.archived_at) });
const toLog = (r: Row): MissionLog => ({ id: String(r.id), missionId: String(r.mission_id), ownerId: String(r.owner_user_id), action: String(r.action),
  note: String(r.note), actorUserId: String(r.actor_user_id), createdAt: String(r.created_at) });

class D1Missions implements MissionRepository {
  private db: D1Database;
  constructor(db: D1Database) { this.db = db; }
  async list(ownerId: string, includeClosed: boolean) {
    const q = includeClosed ? 'SELECT * FROM missions WHERE owner_user_id = ? AND archived_at IS NULL ORDER BY created_at DESC LIMIT 300'
      : "SELECT * FROM missions WHERE owner_user_id = ? AND archived_at IS NULL AND status <> 'verified' ORDER BY created_at DESC LIMIT 300";
    return (await this.db.prepare(q).bind(ownerId).all<Row>()).results.map(toMission);
  }
  async get(ownerId: string, id: string) {
    const r = await this.db.prepare('SELECT * FROM missions WHERE owner_user_id = ? AND id = ?').bind(ownerId, id).first<Row>();
    return r ? toMission(r) : null;
  }
  async countOpen(ownerId: string) {
    const r = await this.db.prepare("SELECT COUNT(*) AS c FROM missions WHERE owner_user_id = ? AND archived_at IS NULL AND status IN ('not_started','in_progress','returned','submitted')").bind(ownerId).first<Row>();
    return n(r?.c ?? 0);
  }
  async insert(m: Mission) {
    await this.db.prepare(`INSERT INTO missions (id,owner_user_id,title,detail,stage_id,due_on,contribution,effort,kpi_gap,verify_mode,status,today_on,evidence_note,return_reason,verified_by,verified_at,created_at,updated_at,archived_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(m.id, m.ownerId, m.title, m.detail, m.stageId, m.dueOn, m.contribution, m.effort, m.kpiGap, m.verifyMode,
      m.status, m.todayOn, m.evidenceNote, m.returnReason, m.verifiedBy, m.verifiedAt, m.createdAt, m.updatedAt, m.archivedAt).run();
  }
  async save(m: Mission, log: MissionLog | null) {
    const stmts = [this.db.prepare(`UPDATE missions SET title=?, detail=?, stage_id=?, due_on=?, contribution=?, effort=?, kpi_gap=?, verify_mode=?, status=?, today_on=?,
      evidence_note=?, return_reason=?, verified_by=?, verified_at=?, updated_at=?, archived_at=? WHERE id = ? AND owner_user_id = ?`).bind(m.title, m.detail, m.stageId, m.dueOn,
      m.contribution, m.effort, m.kpiGap, m.verifyMode, m.status, m.todayOn, m.evidenceNote, m.returnReason, m.verifiedBy, m.verifiedAt, m.updatedAt, m.archivedAt, m.id, m.ownerId)];
    if (log) stmts.push(this.db.prepare('INSERT INTO mission_logs (id,mission_id,owner_user_id,action,note,actor_user_id,created_at) VALUES (?,?,?,?,?,?,?)')
      .bind(log.id, log.missionId, log.ownerId, log.action, log.note, log.actorUserId, log.createdAt));
    await this.db.batch(stmts);
  }
  async logs(ownerId: string, missionId: string) {
    return (await this.db.prepare('SELECT * FROM mission_logs WHERE owner_user_id = ? AND mission_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 100').bind(ownerId, missionId).all<Row>()).results.map(toLog);
  }
  async recentLogs(ownerId: string, sinceIso: string) {
    const since = new Date(sinceIso).toISOString();
    const { results } = await this.db.prepare(`SELECT l.*, m.title FROM mission_logs l JOIN missions m ON m.id = l.mission_id
      WHERE l.owner_user_id = ? AND l.created_at >= ? ORDER BY l.created_at DESC LIMIT 500`).bind(ownerId, since).all<Row>();
    return results.map((r) => ({ ...toLog(r), title: String(r.title) }));
  }
  async listSubmitted() {
    const { results } = await this.db.prepare(`SELECT m.*, u.normalized_email AS owner_email, u.display_name AS owner_name FROM missions m JOIN users u ON u.id = m.owner_user_id
      WHERE m.status = 'submitted' AND m.archived_at IS NULL ORDER BY m.updated_at LIMIT 200`).all<Row>();
    return results.map((r) => ({ ...toMission(r), ownerEmail: String(r.owner_email), ownerName: String(r.owner_name) }));
  }
  async getAny(id: string) {
    const r = await this.db.prepare('SELECT * FROM missions WHERE id = ?').bind(id).first<Row>();
    return r ? toMission(r) : null;
  }
}

const toXp = (r: Row): XpEntry => ({ id: String(r.id), ownerId: String(r.owner_user_id), sourceEventId: String(r.source_event_id), ruleKey: String(r.rule_key),
  ruleVersion: n(r.rule_version), points: n(r.points), reason: String(r.reason), awardedOn: String(r.awarded_on), actorUserId: String(r.actor_user_id), createdAt: String(r.created_at) });

class D1Xp implements XpRepository {
  private db: D1Database;
  constructor(db: D1Database) { this.db = db; }
  async award(e: XpEntry) {
    const res = await this.db.prepare(`INSERT INTO xp_ledger (id,owner_user_id,source_event_id,rule_key,rule_version,points,reason,awarded_on,actor_user_id,created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?) ON CONFLICT(source_event_id) DO NOTHING`).bind(e.id, e.ownerId, e.sourceEventId, e.ruleKey, e.ruleVersion, e.points, e.reason,
      e.awardedOn, e.actorUserId, e.createdAt).run() as { meta?: { changes?: number }; changes?: number };
    const changes = res?.meta?.changes ?? res?.changes;
    if (typeof changes === 'number') return changes > 0;
    return (await this.db.prepare('SELECT id FROM xp_ledger WHERE id = ?').bind(e.id).first()) !== null;
  }
  async ledger(ownerId: string, limit: number) {
    return (await this.db.prepare('SELECT * FROM xp_ledger WHERE owner_user_id = ? ORDER BY created_at DESC, rowid DESC LIMIT ?').bind(ownerId, limit).all<Row>()).results.map(toXp);
  }
  async total(ownerId: string) {
    const r = await this.db.prepare('SELECT COALESCE(SUM(points),0) AS t FROM xp_ledger WHERE owner_user_id = ?').bind(ownerId).first<Row>();
    return n(r?.t ?? 0);
  }
  async countOn(ownerId: string, ruleKey: string, awardedOn: string) {
    const r = await this.db.prepare('SELECT COUNT(*) AS c FROM xp_ledger WHERE owner_user_id = ? AND rule_key = ? AND awarded_on = ? AND points > 0').bind(ownerId, ruleKey, awardedOn).first<Row>();
    return n(r?.c ?? 0);
  }
  async getEntry(id: string) {
    const r = await this.db.prepare('SELECT * FROM xp_ledger WHERE id = ?').bind(id).first<Row>();
    return r ? toXp(r) : null;
  }
  async hasSource(src: string) {
    return (await this.db.prepare('SELECT 1 AS x FROM xp_ledger WHERE source_event_id = ?').bind(src).first()) !== null;
  }
}

class D1Config implements ConfigRepository {
  private db: D1Database;
  constructor(db: D1Database) { this.db = db; }
  async latestXpRules() {
    const r = await this.db.prepare('SELECT version, rules_json FROM xp_rule_versions ORDER BY version DESC LIMIT 1').first<Row>();
    return r ? { version: n(r.version), rules: JSON.parse(String(r.rules_json)) as XpRules } : null;
  }
  async insertXpRules(version: number, rules: XpRules, reason: string, actor: string, now: string, audit: AuditEntry, auditId: string) {
    await this.db.batch([
      this.db.prepare('INSERT INTO xp_rule_versions (version,rules_json,reason,created_by,created_at) VALUES (?,?,?,?,?)').bind(version, JSON.stringify(rules), reason, actor, now),
      auditStmt(this.db, auditId, audit, now)]);
  }
  async xpRuleHistory(limit: number) {
    const { results } = await this.db.prepare('SELECT version, reason, created_by, created_at FROM xp_rule_versions ORDER BY version DESC LIMIT ?').bind(limit).all<Row>();
    return results.map((r) => ({ version: n(r.version), reason: String(r.reason), createdBy: String(r.created_by), createdAt: String(r.created_at) }));
  }
}

const toReview = (r: Row): WeeklyReview => ({ id: String(r.id), ownerId: String(r.owner_user_id), weekKey: String(r.week_key), wentWell: String(r.went_well),
  blockers: String(r.blockers), improvements: String(r.improvements), nextActions: String(r.next_actions), submittedAt: s(r.submitted_at), updatedAt: String(r.updated_at) });

class D1Reviews implements ReviewRepository {
  private db: D1Database;
  constructor(db: D1Database) { this.db = db; }
  async get(ownerId: string, weekKey: string) {
    const r = await this.db.prepare('SELECT * FROM weekly_reviews WHERE owner_user_id = ? AND week_key = ?').bind(ownerId, weekKey).first<Row>();
    return r ? toReview(r) : null;
  }
  async upsert(x: WeeklyReview) {
    await this.db.prepare(`INSERT INTO weekly_reviews (id,owner_user_id,week_key,went_well,blockers,improvements,next_actions,submitted_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)
      ON CONFLICT(owner_user_id, week_key) DO UPDATE SET went_well=excluded.went_well, blockers=excluded.blockers, improvements=excluded.improvements,
      next_actions=excluded.next_actions, submitted_at=COALESCE(weekly_reviews.submitted_at, excluded.submitted_at), updated_at=excluded.updated_at`)
      .bind(x.id, x.ownerId, x.weekKey, x.wentWell, x.blockers, x.improvements, x.nextActions, x.submittedAt, x.updatedAt).run();
  }
  async list(ownerId: string, limit: number) {
    return (await this.db.prepare('SELECT * FROM weekly_reviews WHERE owner_user_id = ? ORDER BY week_key DESC LIMIT ?').bind(ownerId, limit).all<Row>()).results.map(toReview);
  }
}

const toNote = (r: Row): CoachNote => ({ id: String(r.id), ownerId: String(r.owner_user_id), theme: r.theme as CoachNote['theme'], body: String(r.body),
  status: r.status as CoachNote['status'], createdAt: String(r.created_at), updatedAt: String(r.updated_at) });

class D1Coach implements CoachRepository {
  private db: D1Database;
  constructor(db: D1Database) { this.db = db; }
  async list(ownerId: string, limit: number) {
    return (await this.db.prepare('SELECT * FROM coach_notes WHERE owner_user_id = ? ORDER BY created_at DESC, rowid DESC LIMIT ?').bind(ownerId, limit).all<Row>()).results.map(toNote);
  }
  async get(ownerId: string, id: string) {
    const r = await this.db.prepare('SELECT * FROM coach_notes WHERE owner_user_id = ? AND id = ?').bind(ownerId, id).first<Row>();
    return r ? toNote(r) : null;
  }
  async insert(x: CoachNote) {
    await this.db.prepare('INSERT INTO coach_notes (id,owner_user_id,theme,body,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?)')
      .bind(x.id, x.ownerId, x.theme, x.body, x.status, x.createdAt, x.updatedAt).run();
  }
  async update(x: CoachNote) {
    await this.db.prepare('UPDATE coach_notes SET status = ?, updated_at = ? WHERE id = ? AND owner_user_id = ?').bind(x.status, x.updatedAt, x.id, x.ownerId).run();
  }
}

class D1Audit implements AuditRepository {
  private db: D1Database;
  constructor(db: D1Database) { this.db = db; }
  async write(a: AuditEntry, id: string, now: string) { await auditStmt(this.db, id, a, now).run(); }
  async recent(limit: number) {
    const { results } = await this.db.prepare('SELECT * FROM audit_logs ORDER BY created_at DESC, rowid DESC LIMIT ?').bind(limit).all<Row>();
    return results.map((r) => ({ id: String(r.id), actorUserId: String(r.actor_user_id), action: String(r.action), targetType: String(r.target_type), targetId: String(r.target_id),
      before: r.before_json ? JSON.parse(String(r.before_json)) : null, after: r.after_json ? JSON.parse(String(r.after_json)) : null, reason: s(r.reason), createdAt: String(r.created_at) }));
  }
}

export function d1Core(db: D1Database): CoreDeps {
  return { steps: new D1Steps(db), stages: new D1Stages(db), missions: new D1Missions(db), xp: new D1Xp(db),
    config: new D1Config(db), reviews: new D1Reviews(db), coach: new D1Coach(db), audit: new D1Audit(db) };
}
