import { createHash, randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';

// Owner authentication, approvals, execution permits, idempotent owner requests and company stop receipts.
// The owner is established ONLY by a server-side session created from the locally provisioned credential.
// Nothing in a request body (owner flags, employee IDs) is trusted as identity.
const check=(ok,message,code='REJECTED')=>{if(!ok){const e=new Error(message);e.code=code;throw e;}};
const filled=(v,max=12000)=>typeof v==='string'&&v.trim().length>0&&v.length<=max;
const yen=v=>Number.isSafeInteger(v)&&v>=0&&v<=1000000000;
export const sha=v=>createHash('sha256').update(typeof v==='string'?v:JSON.stringify(v)).digest('hex');
const SCRYPT={N:16384,r:8,p:1,keylen:32};
export const DECISION_KINDS=['APPROVAL','PERMISSION','EXCEPTION'];
export const OPERATIONS=['publish','send','charge','refund','spend','contract','fetch','deploy','support_reply'];

export class OwnerAuthority {
  constructor(company,{clock=()=>new Date(),sessionTtlMs=12*3600000,reauthWindowMs=10*60000,maxLoginFailures=5,lockoutMs=15*60000}={}){
    this.company=company;this.db=company.db;this.clock=clock;
    Object.assign(this,{sessionTtlMs,reauthWindowMs,maxLoginFailures,lockoutMs});
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS owner_credentials(id TEXT PRIMARY KEY CHECK(id='owner'),salt TEXT NOT NULL,hash TEXT NOT NULL,params TEXT NOT NULL,created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS owner_sessions(token_hash TEXT PRIMARY KEY,csrf_hash TEXT NOT NULL,created_at TEXT NOT NULL,expires_at TEXT NOT NULL,reauth_at TEXT NOT NULL,revoked_at TEXT,client TEXT);
      CREATE TABLE IF NOT EXISTS owner_login_failures(id INTEGER PRIMARY KEY AUTOINCREMENT,at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS owner_requests(idempotency_key TEXT PRIMARY KEY,request_hash TEXT NOT NULL,kind TEXT NOT NULL,response TEXT NOT NULL,created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS decision_requests(id TEXT PRIMARY KEY,kind TEXT NOT NULL,venture_id TEXT,subject_type TEXT NOT NULL,subject_id TEXT NOT NULL,subject_version INTEGER NOT NULL,
        content_hash TEXT NOT NULL,body TEXT NOT NULL,requested_by TEXT NOT NULL,status TEXT NOT NULL,version INTEGER NOT NULL DEFAULT 1,decided_at TEXT,decision_reason TEXT,created_at TEXT NOT NULL,expires_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS execution_grants(id TEXT PRIMARY KEY,body TEXT NOT NULL,status TEXT NOT NULL,used_count INTEGER NOT NULL DEFAULT 0,used_yen INTEGER NOT NULL DEFAULT 0,version INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL,revoked_at TEXT,revoke_reason TEXT);
      CREATE TABLE IF NOT EXISTS grant_uses(operation_id TEXT PRIMARY KEY,grant_id TEXT NOT NULL REFERENCES execution_grants(id),content_hash TEXT NOT NULL,cost_yen INTEGER NOT NULL,created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS pause_requests(seq INTEGER PRIMARY KEY AUTOINCREMENT,actor TEXT NOT NULL,reason TEXT NOT NULL,requested_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS worker_heartbeats(worker_id TEXT PRIMARY KEY,lane TEXT NOT NULL,seen_at TEXT NOT NULL,observed_pause_seq INTEGER NOT NULL,state TEXT NOT NULL,running TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS owner_directives(id TEXT PRIMARY KEY,task_id TEXT NOT NULL,body TEXT NOT NULL,created_at TEXT NOT NULL);
    `);
  }
  now(){return this.clock().toISOString();}
  ms(){return this.clock().getTime();}
  event(actor,kind,id,body={}){this.company.event(actor,kind,id,body);}

  // ---- Credential & sessions -------------------------------------------------
  // Trusted local provisioning only (owner-cli). Never exposed through HTTP or AI tools.
  provisionOwnerCredential(passphrase,{replace=false}={}){
    check(typeof passphrase==='string'&&passphrase.length>=12&&passphrase.length<=512,'Owner passphrase must be 12-512 characters');
    const salt=randomBytes(16).toString('hex'),hash=scryptSync(passphrase,salt,SCRYPT.keylen,SCRYPT).toString('hex');
    return this.company.tx(()=>{
      const old=this.db.prepare("SELECT id FROM owner_credentials WHERE id='owner'").get();
      check(!old||replace,'Owner credential already exists; rotate explicitly');
      this.db.prepare('INSERT OR REPLACE INTO owner_credentials VALUES(?,?,?,?,?)').run('owner',salt,hash,JSON.stringify(SCRYPT),this.now());
      if(old)this.db.prepare('UPDATE owner_sessions SET revoked_at=? WHERE revoked_at IS NULL').run(this.now());
      this.event('OWNER','OWNER_CREDENTIAL_PROVISIONED','owner',{rotated:!!old});return {provisioned:true,rotated:!!old};
    });
  }
  credentialConfigured(){return !!this.db.prepare("SELECT id FROM owner_credentials WHERE id='owner'").get();}
  verifyPassphrase(passphrase){
    const row=this.db.prepare("SELECT * FROM owner_credentials WHERE id='owner'").get();
    if(!row||typeof passphrase!=='string'||passphrase.length>512)return false;
    const p=JSON.parse(row.params),got=scryptSync(passphrase,row.salt,p.keylen,p),want=Buffer.from(row.hash,'hex');
    return got.length===want.length&&timingSafeEqual(got,want);
  }
  login(passphrase,{client='unknown'}={}){
    const since=new Date(this.ms()-this.lockoutMs).toISOString();
    const failures=this.db.prepare('SELECT COUNT(*) AS n FROM owner_login_failures WHERE at>?').get(since).n;
    check(failures<this.maxLoginFailures,'Too many failed logins; try later','LOCKED');
    if(!this.verifyPassphrase(passphrase)){
      this.db.prepare('INSERT INTO owner_login_failures(at) VALUES(?)').run(this.now());
      this.event('ANONYMOUS','OWNER_LOGIN_FAILED','owner',{client:String(client).slice(0,200)});
      check(false,'Authentication failed','UNAUTHENTICATED');
    }
    const token=randomBytes(32).toString('base64url'),csrf=randomBytes(24).toString('base64url');
    const expires=new Date(this.ms()+this.sessionTtlMs).toISOString();
    this.company.tx(()=>{
      this.db.prepare('INSERT INTO owner_sessions VALUES(?,?,?,?,?,NULL,?)').run(sha(token),sha(csrf),this.now(),expires,this.now(),String(client).slice(0,200));
      this.db.prepare('DELETE FROM owner_login_failures').run();
      this.event('OWNER','OWNER_SESSION_CREATED','owner',{expires_at:expires});
    });
    return {token,csrf,expires_at:expires};
  }
  /** Resolve the authenticated principal from a session token. Returns null when not the owner. */
  session(token){
    if(!filled(token,200))return null;
    const s=this.db.prepare('SELECT * FROM owner_sessions WHERE token_hash=?').get(sha(token));
    if(!s||s.revoked_at||Date.parse(s.expires_at)<=this.ms())return null;
    return {principal:'OWNER',token_hash:s.token_hash,csrf_hash:s.csrf_hash,expires_at:s.expires_at,reauth_at:s.reauth_at};
  }
  requireOwner(token,{csrf=null,mutation=false,reauth=false}={}){
    const s=this.session(token);check(s,'Owner authentication required','UNAUTHENTICATED');
    if(mutation)check(filled(csrf,200)&&timingSafeEqual(Buffer.from(sha(csrf)),Buffer.from(s.csrf_hash)),'CSRF token mismatch','FORBIDDEN');
    if(reauth)check(this.ms()-Date.parse(s.reauth_at)<=this.reauthWindowMs,'Recent re-authentication required','REAUTH_REQUIRED');
    return s;
  }
  reauthenticate(token,passphrase){
    const s=this.requireOwner(token);check(this.verifyPassphrase(passphrase),'Authentication failed','UNAUTHENTICATED');
    this.db.prepare('UPDATE owner_sessions SET reauth_at=? WHERE token_hash=?').run(this.now(),s.token_hash);return {reauth_at:this.now()};
  }
  logout(token){const s=this.session(token);if(s)this.db.prepare('UPDATE owner_sessions SET revoked_at=? WHERE token_hash=?').run(this.now(),s.token_hash);return {logged_out:true};}
  revokeAllSessions(reason){this.db.prepare('UPDATE owner_sessions SET revoked_at=? WHERE revoked_at IS NULL').run(this.now());this.event('OWNER','OWNER_SESSIONS_REVOKED','owner',{reason});return {revoked:true};}

  // ---- Idempotent owner mutations -------------------------------------------
  /** Run an owner mutation exactly once per idempotency key; same key + different payload is a conflict. */
  once(kind,idempotency_key,payload,fn){
    check(filled(idempotency_key,200),'idempotency_key required');
    const requestHash=sha({kind,payload});
    const old=this.db.prepare('SELECT * FROM owner_requests WHERE idempotency_key=?').get(idempotency_key);
    if(old){check(old.request_hash===requestHash,'Idempotency key reused with different payload','CONFLICT');return {...JSON.parse(old.response),replayed:true};}
    // The mutation and its idempotency record commit in the same transaction.
    return this.company.tx(()=>{
      const response=fn();
      this.db.prepare('INSERT INTO owner_requests VALUES(?,?,?,?,?)').run(idempotency_key,requestHash,kind,JSON.stringify(response),this.now());
      return {...response,replayed:false};
    });
  }

  // ---- Decision cards (approval / permission request / exception) ------------
  /** AI side: request a decision. It never grants anything by itself. */
  requestDecision(actor,input){
    this.company.employee(actor);
    check(DECISION_KINDS.includes(input.kind),'Decision kind must be APPROVAL, PERMISSION or EXCEPTION');
    check([input.id,input.subject_type,input.subject_id,input.title,input.proposal].every(v=>filled(v)),'Decision subject and proposal required');
    check(Number.isSafeInteger(input.subject_version)&&input.subject_version>=1&&/^[a-f0-9]{64}$/.test(input.content_hash),'Exact subject version and content hash required');
    check(Array.isArray(input.evidence_refs)&&Array.isArray(input.counterevidence)&&Array.isArray(input.unknowns),'Evidence, counterevidence and unknowns must be explicit lists');
    check(filled(input.expires_at)&&Date.parse(input.expires_at)>this.ms(),'Future decision expiry required');
    if(input.kind==='PERMISSION'){
      const g=input.requested_grant;check(g&&OPERATIONS.includes(g.operation)&&filled(g.target)&&yen(g.max_cost_yen)&&Number.isSafeInteger(g.max_count)&&g.max_count>=1,'Permission request needs operation, target, cost and count');
    }
    const body={title:input.title,proposal:input.proposal,evidence_refs:input.evidence_refs,counterevidence:input.counterevidence,unknowns:input.unknowns,
      customer_impact:input.customer_impact??null,rollback:input.rollback??null,requested_grant:input.requested_grant??null,cost_yen:input.cost_yen??null};
    return this.company.tx(()=>{
      const old=this.db.prepare('SELECT * FROM decision_requests WHERE id=?').get(input.id);
      if(old){check(old.content_hash===input.content_hash&&old.body===JSON.stringify(body),'Decision ID conflict');return this.decision(input.id);}
      this.db.prepare("INSERT INTO decision_requests(id,kind,venture_id,subject_type,subject_id,subject_version,content_hash,body,requested_by,status,created_at,expires_at) VALUES(?,?,?,?,?,?,?,?,?,'PENDING',?,?)")
        .run(input.id,input.kind,input.venture_id??null,input.subject_type,input.subject_id,input.subject_version,input.content_hash,JSON.stringify(body),actor,this.now(),input.expires_at);
      this.event(actor,'DECISION_REQUESTED',input.id,{kind:input.kind,subject_id:input.subject_id,subject_version:input.subject_version});return this.decision(input.id);
    });
  }
  decision(id){const r=this.db.prepare('SELECT * FROM decision_requests WHERE id=?').get(id);check(r,'Unknown decision','NOT_FOUND');
    const expired=r.status==='PENDING'&&Date.parse(r.expires_at)<=this.ms();return {...r,body:JSON.parse(r.body),status:expired?'EXPIRED':r.status};}
  decisions({status=null}={}){return this.db.prepare('SELECT id FROM decision_requests ORDER BY created_at DESC').all().map(r=>this.decision(r.id)).filter(d=>!status||d.status===status);}
  /** Owner side. The owner must see the exact version/hash; stale cards are rejected (A03, U02). */
  decide(session,{id,decision,entity_version,content_hash,reason,idempotency_key,grant=null}){
    check(session?.principal==='OWNER','Owner authentication required','UNAUTHENTICATED');
    check(['approve','reject'].includes(decision)&&filled(reason,4000),'Decision and reason required');
    return this.once('decide',idempotency_key,{id,decision,entity_version,content_hash,reason,grant},()=>{
      const d=this.decision(id);
      check(d.status==='PENDING','Decision is '+d.status,'CONFLICT');
      check(d.version===entity_version&&d.content_hash===content_hash,'Stale decision card: re-sync and review the current version','STALE');
      const status=decision==='approve'?'APPROVED':'REJECTED';
      this.db.prepare('UPDATE decision_requests SET status=?,version=version+1,decided_at=?,decision_reason=? WHERE id=?').run(status,this.now(),reason,id);
      let grantResult=null;
      if(status==='APPROVED'&&d.kind==='PERMISSION'){
        const g=grant??d.body.requested_grant;
        grantResult=this.insertGrant({...g,id:g.id??'grant-'+id,venture_id:g.venture_id??d.venture_id,content_hash:g.content_hash??d.content_hash,decision_id:id});
      }
      this.event('OWNER','DECISION_'+status,id,{kind:d.kind,subject_version:d.subject_version,content_hash:d.content_hash,grant_id:grantResult?.id??null});
      return {state:'applied',decision:this.decision(id),grant:grantResult};
    });
  }

  // ---- Execution permits ----------------------------------------------------
  createGrant(session,input){
    check(session?.principal==='OWNER','Owner authentication required','UNAUTHENTICATED');
    return this.once('grant',input.idempotency_key,input,()=>({state:'applied',grant:this.insertGrant(input)}));
  }
  insertGrant(input){
    check(filled(input.id,200)&&OPERATIONS.includes(input.operation)&&filled(input.target,500),'Grant needs id, operation and exact target');
    check(yen(input.max_cost_yen)&&Number.isSafeInteger(input.max_count)&&input.max_count>=1&&input.max_count<=10000,'Grant needs explicit cost and count bounds');
    check(input.content_hash===null||input.content_hash===undefined||/^[a-f0-9]{64}$/.test(input.content_hash),'content_hash must be a sha256 or null for a rule-scoped grant');
    check(input.content_hash||(input.scope&&typeof input.scope==='object'),'Grant must pin a content hash or a checkable scope');
    check(filled(input.valid_until)&&Date.parse(input.valid_until)>this.ms(),'Future grant expiry required');
    const body={venture_id:input.venture_id??null,operation:input.operation,target:input.target,content_hash:input.content_hash??null,scope:input.scope??null,
      max_cost_yen:input.max_cost_yen,max_count:input.max_count,valid_from:input.valid_from??this.now(),valid_until:new Date(input.valid_until).toISOString(),decision_id:input.decision_id??null};
    const old=this.db.prepare('SELECT * FROM execution_grants WHERE id=?').get(input.id);
    if(old){check(old.body===JSON.stringify(body),'Grant ID conflict');return this.grant(input.id);}
    this.db.prepare("INSERT INTO execution_grants(id,body,status,created_at) VALUES(?,?,'ACTIVE',?)").run(input.id,JSON.stringify(body),this.now());
    this.event('OWNER','EXECUTION_GRANT_CREATED',input.id,body);return this.grant(input.id);
  }
  grant(id){const r=this.db.prepare('SELECT * FROM execution_grants WHERE id=?').get(id);check(r,'Unknown grant','NOT_FOUND');
    const body=JSON.parse(r.body);const expired=r.status==='ACTIVE'&&Date.parse(body.valid_until)<=this.ms();return {...r,body,status:expired?'EXPIRED':r.status};}
  grants(){return this.db.prepare('SELECT id FROM execution_grants ORDER BY created_at DESC').all().map(r=>this.grant(r.id));}
  revokeGrant(session,{id,reason,idempotency_key}){
    check(session?.principal==='OWNER','Owner authentication required','UNAUTHENTICATED');check(filled(reason,4000),'Reason required');
    return this.once('revoke',idempotency_key,{id,reason},()=>{
      const g=this.grant(id);if(g.status==='REVOKED')return {state:'applied',grant:g};
      this.db.prepare("UPDATE execution_grants SET status='REVOKED',revoked_at=?,revoke_reason=?,version=version+1 WHERE id=?").run(this.now(),reason,id);
      this.event('OWNER','EXECUTION_GRANT_REVOKED',id,{reason});return {state:'applied',grant:this.grant(id)};
    });
  }
  /** Deterministic permission check. Called at request time AND immediately before execution. */
  checkGrant({grant_id,venture_id=null,operation,target,content_hash,cost_yen,scope_facts={}}){
    const reasons=[];let g=null;
    try{g=this.grant(grant_id);}catch{return {allowed:false,reasons:['grant-not-found']};}
    const b=g.body;
    if(this.db.prepare('SELECT paused FROM control WHERE id=1').get().paused)reasons.push('company-paused');
    if(g.status!=='ACTIVE')reasons.push('grant-'+g.status.toLowerCase());
    if(Date.parse(b.valid_from)>this.ms())reasons.push('grant-not-yet-valid');
    if(b.operation!==operation)reasons.push('operation-not-granted');
    if(b.target!==target)reasons.push('target-not-granted');
    if(b.venture_id&&b.venture_id!==venture_id)reasons.push('venture-not-granted');
    if(b.content_hash&&b.content_hash!==content_hash)reasons.push('content-changed-since-grant');
    if(!b.content_hash&&b.scope){
      for(const [k,rule] of Object.entries(b.scope)){
        const v=scope_facts[k];
        if(Array.isArray(rule)?!rule.includes(v):typeof rule==='object'&&rule!==null&&'max' in rule?!(typeof v==='number'&&v<=rule.max):v!==rule)reasons.push('scope-violation:'+k);
      }
    }
    if(!yen(cost_yen)||g.used_yen+cost_yen>b.max_cost_yen)reasons.push('grant-cost-exceeded');
    if(g.used_count+1>b.max_count)reasons.push('grant-count-exceeded');
    return {allowed:reasons.length===0,reasons,grant_version:g.version};
  }
  /** Consume a grant for one operation id. Re-using the same operation id is idempotent and never double-counts. */
  consumeGrant(input){
    const old=this.db.prepare('SELECT * FROM grant_uses WHERE operation_id=?').get(input.operation_id);
    if(old){check(old.grant_id===input.grant_id&&old.content_hash===input.content_hash,'Operation ID already bound to another permit','CONFLICT');return {consumed:false,replayed:true};}
    const c=this.checkGrant(input);check(c.allowed,'Execution not permitted: '+c.reasons.join(', '),'FORBIDDEN');
    this.db.prepare('INSERT INTO grant_uses VALUES(?,?,?,?,?)').run(input.operation_id,input.grant_id,input.content_hash,input.cost_yen,this.now());
    this.db.prepare('UPDATE execution_grants SET used_count=used_count+1,used_yen=used_yen+? WHERE id=?').run(input.cost_yen,input.grant_id);
    return {consumed:true,replayed:false};
  }

  // ---- Company stop with receipts -------------------------------------------
  requestPause(session,{reason,idempotency_key}){
    check(session?.principal==='OWNER','Owner authentication required','UNAUTHENTICATED');
    return this.once('pause',idempotency_key,{reason},()=>{
      check(filled(reason,4000),'Pause reason required');
      this.db.prepare('UPDATE control SET paused=1 WHERE id=1').run();this.event('OWNER','COMPANY_PAUSED','company',{reason});
      const seq=Number(this.db.prepare('INSERT INTO pause_requests(actor,reason,requested_at) VALUES(?,?,?)').run('OWNER',reason,this.now()).lastInsertRowid);
      return {state:'accepted',pause_seq:seq,note:'Accepted. Workers confirm separately; operations already sent to providers may still complete.'};
    });
  }
  resume(session,{idempotency_key}){
    check(session?.principal==='OWNER','Owner authentication required','UNAUTHENTICATED');
    return this.once('resume',idempotency_key,{},()=>{this.db.prepare('UPDATE control SET paused=0 WHERE id=1').run();this.event('OWNER','COMPANY_RESUMED','company');return {state:'applied'};});
  }
  workerHeartbeat({worker_id,lane,running=[]}){
    check(filled(worker_id,100)&&filled(lane,40),'Worker ID and lane required');
    const paused=!!this.db.prepare('SELECT paused FROM control WHERE id=1').get().paused;
    const seq=this.db.prepare('SELECT COALESCE(MAX(seq),0) AS s FROM pause_requests').get().s;
    this.db.prepare('INSERT OR REPLACE INTO worker_heartbeats VALUES(?,?,?,?,?,?)').run(worker_id,lane,this.now(),paused?seq:0,paused?'PAUSED_ACK':'RUNNING',JSON.stringify(running));
    return {paused,acknowledged_pause_seq:paused?seq:0};
  }
  controlStatus({staleMs=120000,unstoppable=[]}={}){
    const paused=!!this.db.prepare('SELECT paused FROM control WHERE id=1').get().paused;
    const last=this.db.prepare('SELECT * FROM pause_requests ORDER BY seq DESC LIMIT 1').get()??null;
    const workers=this.db.prepare('SELECT * FROM worker_heartbeats ORDER BY worker_id').all().map(w=>({...w,running:JSON.parse(w.running),
      stale:this.ms()-Date.parse(w.seen_at)>staleMs,acknowledged:!!last&&w.observed_pause_seq>=last.seq}));
    return {paused,accepted_at:paused?last?.requested_at??null:null,pause_seq:last?.seq??null,
      workers,all_live_workers_acknowledged:paused?workers.filter(w=>!w.stale).every(w=>w.acknowledged):null,
      stale_workers:workers.filter(w=>w.stale).map(w=>w.worker_id),
      external_operations_not_stoppable:unstoppable,reconciliation_continues:true,
      meaning:'New work and spending stop. Payment/usage recording and reconciliation of already-started operations continue.'};
  }
  addDirective(session,{task_id,text,priority='normal',idempotency_key}){
    check(session?.principal==='OWNER','Owner authentication required','UNAUTHENTICATED');
    check(filled(text,4000)&&['low','normal','high'].includes(priority),'Directive text and priority required');
    this.company.task(task_id);
    return this.once('directive',idempotency_key,{task_id,text,priority},()=>{
      const id=randomUUID();
      // Free text is stored as an instruction for the task only. It never creates a permit or budget.
      this.db.prepare('INSERT INTO owner_directives VALUES(?,?,?,?)').run(id,task_id,JSON.stringify({text,priority,grants_authority:false}),this.now());
      this.event('OWNER','OWNER_DIRECTIVE_RECORDED',task_id,{directive_id:id,priority});return {state:'applied',directive_id:id};
    });
  }
  directives(task_id){return this.db.prepare('SELECT * FROM owner_directives WHERE task_id=? ORDER BY created_at').all(task_id).map(r=>({...r,body:JSON.parse(r.body)}));}
}
