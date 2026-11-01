import { DatabaseSync } from 'node:sqlite';
import { randomUUID, createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const now = () => new Date().toISOString();
const digest = value => createHash('sha256').update(value).digest('hex');
const required = (test, message) => { if (!test) throw new Error(message); };
const text = (v, max = 10000) => typeof v === 'string' && v.trim().length > 0 && v.length <= max;
const units = v => Number.isSafeInteger(v) && v >= 0 && v <= 1000000;
const json = value => JSON.stringify(value);

export class Company {
  constructor(filename = path.join(ROOT, 'data/company.sqlite'), organizationFile = path.join(ROOT, 'config/organization.json')) {
    if (filename !== ':memory:') fs.mkdirSync(path.dirname(filename), { recursive: true });
    this.db = new DatabaseSync(filename);
    this.db.exec(`PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS employees(id TEXT PRIMARY KEY, body TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS control(id INTEGER PRIMARY KEY CHECK(id=1), paused INTEGER NOT NULL, simulation_limit INTEGER NOT NULL);
      INSERT OR IGNORE INTO control VALUES(1,0,1000);
      CREATE TABLE IF NOT EXISTS projects(id TEXT PRIMARY KEY, business_id TEXT NOT NULL, goal TEXT NOT NULL, created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS tasks(
        id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id), issuer TEXT NOT NULL REFERENCES employees(id),
        assignee TEXT NOT NULL REFERENCES employees(id), reviewer TEXT NOT NULL REFERENCES employees(id), parent_id TEXT REFERENCES tasks(id),
        title TEXT NOT NULL, brief TEXT NOT NULL, acceptance TEXT NOT NULL, status TEXT NOT NULL, depth INTEGER NOT NULL,
        quote INTEGER NOT NULL CHECK(quote>=0), reserved INTEGER NOT NULL DEFAULT 0, attempts INTEGER NOT NULL DEFAULT 0,
        lease_until TEXT, dedupe_key TEXT NOT NULL, payload_hash TEXT NOT NULL, created_at TEXT NOT NULL,
        UNIQUE(project_id,issuer,dedupe_key));
      CREATE TABLE IF NOT EXISTS dependencies(task_id TEXT NOT NULL REFERENCES tasks(id), dependency_id TEXT NOT NULL REFERENCES tasks(id), PRIMARY KEY(task_id,dependency_id));
      CREATE TABLE IF NOT EXISTS artifacts(id TEXT PRIMARY KEY, task_id TEXT NOT NULL REFERENCES tasks(id), version INTEGER NOT NULL, body TEXT NOT NULL, mode TEXT NOT NULL, created_at TEXT NOT NULL, UNIQUE(task_id,version));
      CREATE TABLE IF NOT EXISTS evidence(id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id), actor TEXT NOT NULL, body TEXT NOT NULL, classification TEXT NOT NULL, created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS messages(id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id), sender TEXT NOT NULL, recipient TEXT NOT NULL, body TEXT NOT NULL, created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS ledger(id TEXT PRIMARY KEY, task_id TEXT NOT NULL REFERENCES tasks(id), units INTEGER NOT NULL CHECK(units>=0), created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS events(seq INTEGER PRIMARY KEY AUTOINCREMENT, actor TEXT NOT NULL, kind TEXT NOT NULL, entity_id TEXT NOT NULL, body TEXT NOT NULL, created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS exports(relative_path TEXT PRIMARY KEY, content_hash TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS tasks_project_status ON tasks(project_id,status);
    `);
    const roster = JSON.parse(fs.readFileSync(organizationFile, 'utf8'));
    this.tx(() => { for (const e of roster.employees) this.db.prepare('INSERT OR IGNORE INTO employees VALUES(?,?)').run(e.id, json(e)); });
  }
  close() { this.db.close(); }
  tx(fn) {
    this.db.exec('BEGIN IMMEDIATE');
    try { const r = fn(); this.db.exec('COMMIT'); return r; }
    catch (e) { this.db.exec('ROLLBACK'); throw e; }
  }
  employee(id) {
    const row = this.db.prepare('SELECT body FROM employees WHERE id=?').get(id);
    required(row, 'Unknown employee'); return JSON.parse(row.body);
  }
  event(actor, kind, id, body = {}) {
    this.db.prepare('INSERT INTO events(actor,kind,entity_id,body,created_at) VALUES(?,?,?,?,?)').run(actor,kind,id,json(body),now());
  }
  project(id) {
    const p = this.db.prepare('SELECT * FROM projects WHERE id=?').get(id);
    required(p, 'Unknown project'); return p;
  }
  task(id) { const t = this.db.prepare('SELECT * FROM tasks WHERE id=?').get(id); required(t, 'Unknown task'); return t; }
  guard() { required(!this.db.prepare('SELECT paused FROM control WHERE id=1').get().paused, 'Company paused'); }
  createProject(actor, { id, business_id = 'sandbox-business', goal }) {
    required(actor === 'CEO', 'Only CEO may register an owner objective');
    required(text(id,100) && text(business_id,100) && text(goal,4000), 'Invalid project');
    return this.tx(() => {
      this.guard();
      const old = this.db.prepare('SELECT * FROM projects WHERE id=?').get(id);
      if (old) { required(old.goal === goal && old.business_id === business_id, 'Project ID conflict'); return old; }
      this.db.prepare('INSERT INTO projects VALUES(?,?,?,?)').run(id,business_id,goal,now());
      this.event(actor,'PROJECT_CREATED',id,{goal,business_id,mode:'simulation-only'});
      return this.project(id);
    });
  }
  issue(actor, input) {
    const { project_id, assignee, title, brief, acceptance, parent_id = null, dependencies = [], quote_units = 1, dedupe_key } = input;
    const issuer = this.employee(actor), worker = this.employee(assignee);
    required([title,brief,acceptance,dedupe_key].every(v=>text(v)), 'Task fields required');
    required(units(quote_units), 'Invalid simulation units');
    required(Array.isArray(dependencies) && dependencies.length <= 20 && dependencies.every(v=>text(v,100)), 'Invalid dependencies');
    const uniqueDeps = [...new Set(dependencies)].sort();
    const signature = digest(json({project_id,assignee,title,brief,acceptance,parent_id,dependencies:uniqueDeps,quote_units}));
    return this.tx(() => {
      this.guard(); this.project(project_id);
      const old = this.db.prepare('SELECT * FROM tasks WHERE project_id=? AND issuer=? AND dedupe_key=?').get(project_id,actor,dedupe_key);
      if (old) { required(old.payload_hash === signature, 'Idempotency key reused with different input'); return old; }
      const selfRoot = actor === 'CEO' && assignee === 'CEO' && parent_id === null;
      required(selfRoot || worker.manager_id === actor, 'Assignment requires a direct reporting relationship');
      let depth=0;
      if (parent_id) {
        const parent = this.task(parent_id);
        required(parent.project_id === project_id && parent.assignee === actor, 'Invalid parent or project');
        required(parent.status === 'ACCEPTED', 'Parent planning deliverable must be accepted first');
        depth=parent.depth+1;
      } else required(selfRoot, 'Only the CEO may create a root planning task');
      required(depth <= 3, 'Delegation depth exceeded');
      required(this.db.prepare('SELECT COUNT(*) AS n FROM tasks WHERE project_id=?').get(project_id).n < 64, 'Project task limit reached');
      for (const d of uniqueDeps) required(this.task(d).project_id === project_id, 'Cross-project dependency rejected');
      const id=randomUUID(), reviewer=worker.manager_id === 'OWNER' ? 'AUDITOR' : worker.manager_id;
      required(assignee !== 'AUDITOR', 'Auditor is a reviewer, not a production assignee');
      this.db.prepare(`INSERT INTO tasks(id,project_id,issuer,assignee,reviewer,parent_id,title,brief,acceptance,status,depth,quote,dedupe_key,payload_hash,created_at)
        VALUES(?,?,?,?,?,?,?,?,?,'QUEUED',?,?,?,?,?)`).run(id,project_id,actor,assignee,reviewer,parent_id,title,brief,acceptance,depth,quote_units,dedupe_key,signature,now());
      for (const d of uniqueDeps) this.db.prepare('INSERT INTO dependencies VALUES(?,?)').run(id,d);
      this.event(actor,'TASK_ISSUED',id,{assignee,reviewer,parent_id,project_id}); return this.task(id);
    });
  }
  claim(actor, task_id) {
    return this.tx(() => {
      this.guard(); const t=this.task(task_id); this.employee(actor);
      required(t.assignee === actor, 'Only the assignee may claim');
      required(['QUEUED','REWORK','RETRY_WAIT'].includes(t.status), 'Task not claimable');
      required(t.attempts < 3, 'Attempt limit reached');
      const blocked=this.db.prepare(`SELECT COUNT(*) AS n FROM dependencies d JOIN tasks t ON t.id=d.dependency_id WHERE d.task_id=? AND t.status!='ACCEPTED'`).get(t.id).n;
      required(!blocked, 'Dependencies not accepted');
      const usage=this.budget();
      required(usage.used_units+usage.reserved_units+t.quote <= usage.limit_units, 'Simulation budget exceeded');
      this.db.prepare("UPDATE tasks SET status='RUNNING',attempts=attempts+1,reserved=quote,lease_until=? WHERE id=?").run(new Date(Date.now()+300000).toISOString(),t.id);
      this.event(actor,'TASK_CLAIMED',t.id,{simulation_reserved_units:t.quote}); return this.task(t.id);
    });
  }
  addEvidence(actor, {project_id,body,classification='internal'}) {
    this.employee(actor); this.project(project_id);
    required(text(body,20000), 'Evidence text required');
    required(['public','internal','restricted'].includes(classification),'Invalid classification');
    const id=randomUUID();
    this.tx(()=>{ this.guard(); this.db.prepare('INSERT INTO evidence VALUES(?,?,?,?,?,?)').run(id,project_id,actor,body,classification,now()); this.event(actor,'EVIDENCE_RECORDED',id,{project_id,classification}); });
    return {id,classification,verification:'unverified-input'};
  }
  submit(actor, {task_id,summary,deliverable,evidence_ids=/** @type {string[]} */([]),limitations,mode='llm_draft'}) {
    required(text(summary,4000) && text(deliverable,20000) && text(limitations,4000), 'Incomplete deliverable');
    required(['simulation','llm_draft'].includes(mode), 'External execution is not implemented');
    required(Array.isArray(evidence_ids) && evidence_ids.length<=20, 'Invalid evidence IDs');
    return this.tx(() => {
      this.guard(); const t=this.task(task_id);
      required(t.assignee === actor && t.status === 'RUNNING','Assignee must own a running task');
      required(t.lease_until > now(), 'Lease expired; recover before resubmitting');
      let classification='internal';
      for (const id of evidence_ids) {
        const e=this.db.prepare('SELECT project_id,classification FROM evidence WHERE id=?').get(id);
        required(e && e.project_id === t.project_id, 'Evidence must belong to the same project');
        if(e.classification === 'restricted') classification='restricted';
      }
      const id=randomUUID(),body={summary,deliverable,evidence_ids,limitations,classification};
      this.db.prepare('INSERT INTO artifacts VALUES(?,?,?,?,?,?)').run(id,t.id,t.attempts,json(body),mode,now());
      this.db.prepare('INSERT INTO ledger VALUES(?,?,?,?)').run(randomUUID(),t.id,t.reserved,now());
      this.db.prepare("UPDATE tasks SET status='REVIEW',reserved=0,lease_until=NULL WHERE id=?").run(t.id);
      this.event(actor,'DELIVERABLE_SUBMITTED',t.id,{artifact_id:id,mode}); return {task:this.task(t.id),artifact_id:id};
    });
  }
  review(actor, {task_id,decision,reason}) {
    required(['accept','rework'].includes(decision) && text(reason,4000), 'Review decision and reason required');
    return this.tx(() => {
      this.guard(); const t=this.task(task_id);
      required(actor !== t.assignee, 'Self-review is forbidden');
      required(actor === t.reviewer || actor === 'AUDITOR','Reviewer not authorized');
      required(t.status === 'REVIEW','Task not awaiting review');
      const status=decision === 'accept' ? 'ACCEPTED' : t.attempts < 3 ? 'REWORK' : 'FAILED';
      this.db.prepare('UPDATE tasks SET status=? WHERE id=?').run(status,t.id);
      this.event(actor,'REVIEWED',t.id,{decision,reason,status}); return this.task(t.id);
    });
  }
  message(actor,{project_id,recipient,body}) {
    this.employee(actor); this.employee(recipient); this.project(project_id); required(text(body,10000),'Invalid message');
    const id=randomUUID();
    this.tx(()=>{ this.guard(); this.db.prepare('INSERT INTO messages VALUES(?,?,?,?,?,?)').run(id,project_id,actor,recipient,body,now()); this.event(actor,'MESSAGE_RECORDED',id,{project_id,recipient}); });
    return {id};
  }
  recover(actor) {
    required(['CEO','AUDITOR','OWNER'].includes(actor),'Not authorized');
    return this.tx(() => {
      const expired=this.db.prepare("SELECT * FROM tasks WHERE status='RUNNING' AND lease_until<=?").all(now());
      for (const t of expired) {
        // No external side effects exist in this prototype; the reservation can safely be released.
        const state=t.attempts < 3 ? 'RETRY_WAIT' : 'FAILED';
        this.db.prepare('UPDATE tasks SET status=?,reserved=0,lease_until=NULL WHERE id=?').run(state,t.id);
        this.event(actor,'LEASE_RECOVERED',t.id,{state});
      }
      return {recovered:expired.length};
    });
  }
  pause(actor,reason) {
    required(['CEO','AUDITOR','OWNER'].includes(actor) && text(reason,4000),'Pause not authorized');
    this.tx(()=>{ this.db.prepare('UPDATE control SET paused=1 WHERE id=1').run(); this.event(actor,'COMPANY_PAUSED','company',{reason}); });
    return {paused:true};
  }
  ownerResume() { this.tx(()=>{ this.db.prepare('UPDATE control SET paused=0 WHERE id=1').run(); this.event('OWNER','COMPANY_RESUMED','company'); }); return {paused:false}; }
  budget() {
    return {limit_units:this.db.prepare('SELECT simulation_limit FROM control WHERE id=1').get().simulation_limit,
      used_units:this.db.prepare('SELECT COALESCE(SUM(units),0) AS n FROM ledger').get().n,
      reserved_units:this.db.prepare('SELECT COALESCE(SUM(reserved),0) AS n FROM tasks').get().n,
      actual_external_spend_jpy:null, external_spend_measurement:'not-connected', llm_cost:'not-collected', external_business_tools:'not-connected', unit_type:'simulation-only'};
  }
  /** @param {string} actor @param {string|null} project_id */
  status(actor='CEO', project_id=null) {
    this.employee(actor); if(project_id) this.project(project_id);
    const allTasks=project_id ? this.db.prepare('SELECT * FROM tasks WHERE project_id=? ORDER BY created_at,id').all(project_id) : this.db.prepare('SELECT * FROM tasks ORDER BY created_at,id').all();
    const e=this.employee(actor);
    const tasks=['ceo','auditor'].includes(e.grade) ? allTasks : allTasks.filter(t=>t.assignee === actor || t.issuer === actor || t.reviewer === actor);
    return {mode:'simulation-and-draft-only',paused:!!this.db.prepare('SELECT paused FROM control WHERE id=1').get().paused,
      organization:{departments:8,sections:16,employees:this.db.prepare('SELECT COUNT(*) AS n FROM employees').get().n},
      projects:this.db.prepare('SELECT * FROM projects ORDER BY created_at').all().filter(p=>(!project_id||p.id===project_id)&&(['ceo','auditor'].includes(e.grade)||tasks.some(t=>t.project_id===p.id))),tasks,budget:this.budget(),
      implementation:{ledger:true,role_identity_bound_tools:true,simulation:true,live_llm_tested:false,external_sales:false,full_chat_ingestion:false,automatic_semantic_learning:false}};
  }
  taskContext(actor,task_id) {
    const t=this.task(task_id),e=this.employee(actor);
    required([t.assignee,t.issuer,t.reviewer].includes(actor) || ['ceo','auditor'].includes(e.grade),'Task access denied');
    const deps=this.db.prepare('SELECT dependency_id FROM dependencies WHERE task_id=?').all(t.id).map(x=>x.dependency_id);
    return {task:t,dependencies:deps.map(id=>({task:this.task(id),artifact:this.db.prepare('SELECT * FROM artifacts WHERE task_id=? ORDER BY version DESC LIMIT 1').get(id) ?? null})),
      artifacts:this.db.prepare('SELECT * FROM artifacts WHERE task_id=? ORDER BY version').all(t.id),
      reviews:this.db.prepare("SELECT * FROM events WHERE entity_id=? AND kind='REVIEWED' ORDER BY seq").all(t.id)};
  }
  searchWork(actor,{project_id,query}) {
    required(text(query,200),'Search query required');
    const visible=this.status(actor,project_id).tasks;const results=[];
    for(const t of visible) {
      const a=this.db.prepare('SELECT * FROM artifacts WHERE task_id=? ORDER BY version DESC LIMIT 1').get(t.id);
      if(!a) continue;const body=JSON.parse(a.body);if(body.classification==='restricted') continue;
      const content=t.title+'\n'+body.summary+'\n'+body.deliverable;
      if(content.toLocaleLowerCase().includes(query.toLocaleLowerCase())) results.push({task_id:t.id,artifact_id:a.id,title:t.title,mode:a.mode,verification:'not-independent-fact-check',snippet:content.slice(0,500)});
      if(results.length>=20) break;
    }
    return {method:'local-keyword-search',results};
  }
  scorecard(actor) {
    const visible=this.status(actor).tasks;
    return [...new Set(visible.map(t=>t.assignee))].map(id=>{
      const work=visible.filter(t=>t.assignee===id),done=work.filter(t=>t.status==='ACCEPTED').length;
      const spent=work.reduce((n,t)=>n+this.db.prepare('SELECT COALESCE(SUM(units),0) AS n FROM ledger WHERE task_id=?').get(t.id).n,0);
      return {employee_id:id,title:this.employee(id).title,tasks:work.length,accepted:done,failed:work.filter(t=>t.status==='FAILED').length,
        rework_or_retry_attempts:work.reduce((n,t)=>n+Math.max(0,t.attempts-1),0),simulation_units:spent,
        accepted_share:work.length?done/work.length:null,customer_value:'unmeasured',profit_contribution:'unmeasured'};
    });
  }
  exportVault(directory=path.join(ROOT,'vault')) {
    const root=path.resolve(directory); fs.mkdirSync(root,{recursive:true});
    required(!fs.lstatSync(root).isSymbolicLink(),'Vault root cannot be a symlink');
    // The owner chooses a trusted vault parent. Every generated child is checked again.
    const rows=[];
    const write=(rel,content)=> {
      const expected=this.db.prepare('SELECT content_hash FROM exports WHERE relative_path=?').get(rel)?.content_hash;
      const target=path.join(root,rel), hash=digest(content);
      ensureSafe(root,rel);
      if(fs.existsSync(target)) {
        const current=digest(fs.readFileSync(target));
        if(current===hash){ this.db.prepare('INSERT OR REPLACE INTO exports VALUES(?,?)').run(rel,hash);rows.push({path:rel,status:'unchanged'});return; }
        if(!expected || current!==expected) {
          const conflict=`90_Conflicts/${digest(rel).slice(0,12)}-${hash.slice(0,12)}.md`;
          safeWrite(root,conflict,`# 更新候補：${rel}\n\n人の編集を保護したため元ノートは変更していません。\n\n${content}`);
          rows.push({path:rel,status:'conflict',candidate:conflict});return;
        }
      }
      safeWrite(root,rel,content);this.db.prepare('INSERT OR REPLACE INTO exports VALUES(?,?)').run(rel,hash);rows.push({path:rel,status:'written'});
    };
    const roster=this.db.prepare('SELECT body FROM employees ORDER BY id').all().map(r=>JSON.parse(r.body));
    write('00_Company/Organization.md',`# AI会社・組織一覧\n\n状態：試作。8部・16課・42職務。\n\n| 社員ID | 所属・役職 | 上司 |\n|---|---|---|\n${roster.map(e=>`| ${e.id} | [[10_Employees/${e.id}|${e.title}]] | ${e.manager_id} |`).join('\n')}\n`);
    for(const e of roster) write(`10_Employees/${e.id}.md`,`---\nrecord_id: ${e.id}\ntype: employee\n---\n# ${e.title}\n\n- 社員ID：${e.id}\n- 上司：${e.manager_id}\n- 職責：${e.mission}\n- 納品物：${e.deliverable}\n- 評価：${e.metric}\n- 記憶：必要な業務記録をIDで検索。モデルに常駐する記憶ではありません。\n`);
    const projects=this.db.prepare('SELECT * FROM projects ORDER BY created_at').all();
    for(const p of projects) {
      const tasks=this.db.prepare('SELECT * FROM tasks WHERE project_id=? ORDER BY created_at,id').all(p.id);
      const file=digest(p.id).slice(0,20);
      write(`20_Projects/${file}.md`,`# 事業プロジェクト\n\n- ID：${p.id}\n- business_id：${p.business_id}\n- 目的：${p.goal}\n- データ：模擬業務またはAI下書き。実売上は含みません。\n\n| タスク | 担当 | 状態 |\n|---|---|---|\n${tasks.map(t=>`| [[30_Work/${t.id}|${t.title.replaceAll('|','／').replaceAll('\n',' ')}]] | ${t.assignee} | ${t.status} |`).join('\n')}\n`);
      for(const t of tasks) {
        const artifacts=this.db.prepare('SELECT * FROM artifacts WHERE task_id=? ORDER BY version').all(t.id);
        const reviews=this.db.prepare("SELECT actor,body FROM events WHERE entity_id=? AND kind='REVIEWED' ORDER BY seq").all(t.id);
        write(`30_Work/${t.id}.md`,`---\nrecord_id: ${t.id}\nproject_id: ${json(p.id)}\ntype: work\n---\n# ${t.title}\n\n- 担当：[[10_Employees/${t.assignee}]]\n- 検収：[[10_Employees/${t.reviewer}]]\n- 状態：${t.status}\n- 完了条件：${t.acceptance}\n\n${artifacts.map(a=>{const b=JSON.parse(a.body);if(b.classification==='restricted') return `## 納品 v${a.version}\n\n機密区分のため本文を書き出していません。`;return `## 納品 v${a.version}（${a.mode}）\n\n${b.summary}\n\n${b.deliverable}\n\n限界：${b.limitations}\n\n根拠ID：${b.evidence_ids.join(', ') || 'なし'}`;}).join('\n\n')}\n\n## 検収履歴\n${reviews.map(r=>`- ${r.actor}: ${r.body}`).join('\n')}\n`);
      }
    }
    // Only public/internal work notes are emitted; raw evidence and full messages stay out of this vault.
    write('README.md','# AI会社・業務保管庫\n\n[[00_Company/Organization]]から所属社員を確認できます。\n\n自動生成ノートを手動編集した場合、次回更新は90_Conflictsに候補を出します。会話原文・顧客情報・秘密鍵をこの保管庫へ一括コピーしないでください。\n');
    return {root,files:rows.length,conflicts:rows.filter(r=>r.status==='conflict').length,results:rows};
  }
}

export function ensureSafe(root,rel) {
  required(typeof rel==='string' && !path.isAbsolute(rel),'Relative path required');
  const segments=rel.split(/[\\/]/); required(segments.every(s=>s && s!=='.' && s!=='..'),'Unsafe path');
  let current=root;
  for(const [i,s] of segments.entries()) {
    current=path.join(current,s);
    if(fs.existsSync(current)) required(!fs.lstatSync(current).isSymbolicLink(),'Symlink in generated path');
    else if(i<segments.length-1) fs.mkdirSync(current);
  }
}
export function safeWrite(root,rel,content) {
  ensureSafe(root,rel);const target=path.join(root,rel),tmp=`${target}.${randomUUID()}.tmp`;
  try {fs.writeFileSync(tmp,content,{flag:'wx',mode:0o600});fs.renameSync(tmp,target);} finally {if(fs.existsSync(tmp)) fs.unlinkSync(tmp);}
}
