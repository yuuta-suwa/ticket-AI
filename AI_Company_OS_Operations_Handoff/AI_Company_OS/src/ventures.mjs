import { createHash } from 'node:crypto';

const requireValue=(ok,message)=>{if(!ok)throw new Error(message);};
const filled=v=>typeof v==='string'&&v.trim().length>0&&v.length<=12000;
const yen=v=>Number.isSafeInteger(v)&&v>=0&&v<=1000000000;
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const KINDS=['research','compute','hosting','ads','tools'];

// Local control prototype, NOT an authenticated API or payment executor.
// Only an authenticated owner adapter may expose configurePolicy/reviewOverrun.
export class VentureLedger {
  constructor(company,{clock=()=>new Date()}={}){
    this.company=company;this.db=company.db;this.clock=clock;
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS venture_policies(version INTEGER PRIMARY KEY AUTOINCREMENT,body TEXT NOT NULL,created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS ventures(id TEXT PRIMARY KEY,body TEXT NOT NULL,payload_hash TEXT NOT NULL,state TEXT NOT NULL,created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS venture_operations(
        id TEXT PRIMARY KEY,venture_id TEXT NOT NULL REFERENCES ventures(id),kind TEXT NOT NULL,ceiling_yen INTEGER NOT NULL,
        target_ref TEXT NOT NULL,request_hash TEXT NOT NULL,payload_hash TEXT NOT NULL,policy_version INTEGER NOT NULL,
        status TEXT NOT NULL,actual_yen INTEGER,provider_ref TEXT UNIQUE,source_ref TEXT,review_required INTEGER NOT NULL DEFAULT 0,
        review_ref TEXT,created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS operating_services(venture_id TEXT PRIMARY KEY REFERENCES ventures(id),body TEXT NOT NULL,created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS operating_grants(id TEXT PRIMARY KEY,venture_id TEXT NOT NULL REFERENCES operating_services(venture_id),body TEXT NOT NULL,status TEXT NOT NULL,created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS operating_health(id TEXT PRIMARY KEY,venture_id TEXT NOT NULL REFERENCES operating_services(venture_id),body TEXT NOT NULL,payload_hash TEXT NOT NULL,created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS venture_risk_bounds(operation_id TEXT PRIMARY KEY REFERENCES venture_operations(id),body TEXT NOT NULL,created_at TEXT NOT NULL);
    `);
    this.company.tx(()=>{
      const columns=new Set(this.db.prepare('PRAGMA table_info(venture_operations)').all().map(c=>c.name));
      if(!columns.has('lane'))this.db.exec("ALTER TABLE venture_operations ADD COLUMN lane TEXT NOT NULL DEFAULT 'EXPLORE'");
      if(!columns.has('grant_id'))this.db.exec('ALTER TABLE venture_operations ADD COLUMN grant_id TEXT');
    });
  }
  now(){return this.clock().toISOString();}
  future(value){return filled(value)&&Number.isFinite(Date.parse(value))&&Date.parse(value)>this.clock().getTime();}
  event(kind,id,body={}){this.company.event('OWNER',kind,id,{...body,verification:'local-record-only'});}
  policy(){
    const row=this.db.prepare('SELECT * FROM venture_policies ORDER BY version DESC LIMIT 1').get();
    return row?{...JSON.parse(row.body),version:row.version}:{version:0,enabled:false,gross_spend_limit_yen:0,per_venture_limit_yen:0,active_venture_limit:1,allowed_kinds:[],expires_at:null,operating_grant_limit_yen:0,allow_isolated_run:false};
  }
  configurePolicy(input){
    requireValue(typeof input.enabled==='boolean'&&yen(input.gross_spend_limit_yen)&&yen(input.per_venture_limit_yen),'Explicit owner funding limits required');
    requireValue(Number.isSafeInteger(input.active_venture_limit)&&input.active_venture_limit>=1&&input.active_venture_limit<=10,'Invalid venture concurrency');
    requireValue(Array.isArray(input.allowed_kinds)&&input.allowed_kinds.every(k=>KINDS.includes(k)),'Invalid allowed cost kinds');
    requireValue(filled(input.source_ref)&&(!input.enabled||this.future(input.expires_at)),'Owner evidence and future policy expiry required');
    requireValue(input.operating_grant_limit_yen===undefined||yen(input.operating_grant_limit_yen),'Invalid operating grant limit');
    requireValue(input.allow_isolated_run===undefined||typeof input.allow_isolated_run==='boolean','Explicit isolated operation policy required');
    return this.company.tx(()=>{
      const body={enabled:input.enabled,gross_spend_limit_yen:input.gross_spend_limit_yen,per_venture_limit_yen:input.per_venture_limit_yen,
        active_venture_limit:input.active_venture_limit,allowed_kinds:[...new Set(input.allowed_kinds)].sort(),expires_at:input.expires_at??null,source_ref:input.source_ref,
        operating_grant_limit_yen:input.operating_grant_limit_yen??0,allow_isolated_run:input.allow_isolated_run??false};
      this.db.prepare('INSERT INTO venture_policies(body,created_at) VALUES(?,?)').run(JSON.stringify(body),this.now());
      this.event('VENTURE_POLICY_RECORDED','company',body);return this.policy();
    });
  }
  venture(id){const row=this.db.prepare('SELECT * FROM ventures WHERE id=?').get(id);requireValue(row,'Unknown venture');return {...row,definition:JSON.parse(row.body)};}
  operation(id){const row=this.db.prepare('SELECT * FROM venture_operations WHERE id=?').get(id);requireValue(row,'Unknown operation');return row;}
  propose(input){
    requireValue([input.id,input.title,input.hypothesis,input.customer_problem,input.success_metric,input.failure_rule].every(filled),'Venture hypothesis and preregistered decision rules required');
    requireValue(yen(input.budget_yen)&&this.future(input.learning_deadline),'Explicit experiment budget and future learning deadline required');
    requireValue(Array.isArray(input.evidence_refs)&&input.evidence_refs.length<=30&&input.evidence_refs.every(filled),'Evidence references must be explicit, including an empty list if missing');
    const definition={id:input.id,title:input.title,hypothesis:input.hypothesis,customer_problem:input.customer_problem,success_metric:input.success_metric,
      failure_rule:input.failure_rule,budget_yen:input.budget_yen,learning_deadline:input.learning_deadline,evidence_refs:input.evidence_refs};
    const signature=digest(definition);
    return this.company.tx(()=>{
      const old=this.db.prepare('SELECT * FROM ventures WHERE id=?').get(input.id);
      if(old){requireValue(old.payload_hash===signature,'Venture ID conflict: create a new hypothesis version');return this.venture(input.id);}
      this.company.guard();this.db.prepare("INSERT INTO ventures VALUES(?,?,?,'PROPOSED',?)").run(input.id,JSON.stringify(definition),signature,this.now());
      this.event('VENTURE_PROPOSED',input.id,definition);return this.venture(input.id);
    });
  }
  sumOperations(rows){
    const actual=rows.reduce((sum,r)=>sum+(r.status==='SETTLED'?r.actual_yen:0),0);
    const reserved=rows.reduce((sum,r)=>{
      if(!['RESERVED','IN_FLIGHT','UNKNOWN'].includes(r.status))return sum;
      const bound=this.db.prepare('SELECT body FROM venture_risk_bounds WHERE operation_id=?').get(r.id);
      return sum+Math.max(r.ceiling_yen,bound?JSON.parse(bound.body).upper_bound_yen:0);
    },0);
    return {gross_recorded_spend_yen:actual,held_yen:reserved,exposure_yen:actual+reserved,unknown_operations:rows.filter(r=>r.status==='UNKNOWN').length,
      in_flight_operations:rows.filter(r=>r.status==='IN_FLIGHT').length,unreviewed_overruns:rows.filter(r=>r.review_required&&!r.review_ref).length};
  }
  grantFunding(id){return this.sumOperations(this.db.prepare('SELECT * FROM venture_operations WHERE grant_id=?').all(id));}
  funding(venture_id=null){
    const rows=venture_id?this.db.prepare('SELECT * FROM venture_operations WHERE venture_id=?').all(venture_id):this.db.prepare('SELECT * FROM venture_operations').all();
    const result=this.sumOperations(rows);
    const grants=venture_id?this.db.prepare("SELECT * FROM operating_grants WHERE venture_id=? AND status='OPEN'").all(venture_id):this.db.prepare("SELECT * FROM operating_grants WHERE status='OPEN'").all();
    const protectedUnused=grants.reduce((sum,g)=>sum+Math.max(0,JSON.parse(g.body).limit_yen-this.grantFunding(g.id).exposure_yen),0);
    return {...result,protected_operating_yen:protectedUnused,exposure_yen:result.exposure_yen+protectedUnused};
  }
  grant(id){const row=this.db.prepare('SELECT * FROM operating_grants WHERE id=?').get(id);requireValue(row,'Unknown operating grant');return {...row,definition:JSON.parse(row.body)};}
  guardFunding({lane='EXPLORE',venture_id=null,grant_id=null}={}){
    this.company.guard();const p=this.policy(),f=this.funding();
    requireValue(p.enabled&&this.future(p.expires_at),'Funding policy disabled or expired');
    requireValue(!f.in_flight_operations&&!f.unreviewed_overruns,'Reconciliation required before further spending');
    if(f.unknown_operations){
      requireValue(lane==='RUN'&&p.allow_isolated_run===true&&grant_id,'Reconciliation required before further spending');
      for(const o of this.db.prepare("SELECT * FROM venture_operations WHERE status='UNKNOWN'").all()){
        const row=this.db.prepare('SELECT body FROM venture_risk_bounds WHERE operation_id=?').get(o.id),bound=row?JSON.parse(row.body):null;
        requireValue(o.venture_id!==venture_id&&bound&&this.future(bound.expires_at)&&bound.allowed_run_grants.includes(grant_id),'Unbounded or non-isolated uncertainty blocks operating work');
      }
    }
    requireValue(f.exposure_yen<=p.gross_spend_limit_yen,'Company funding limit exceeded');return p;
  }
  activate(id){
    return this.company.tx(()=>{
      const v=this.venture(id),p=this.guardFunding();requireValue(v.state==='PROPOSED','Only a proposed venture can activate');
      requireValue(this.growthReadiness().ready,'Existing service health or operating funding blocks new experiments');
      requireValue(this.future(v.definition.learning_deadline),'Experiment learning deadline expired');
      requireValue(v.definition.budget_yen<=p.per_venture_limit_yen,'Venture exceeds owner per-venture limit');
      const count=this.db.prepare("SELECT COUNT(*) AS n FROM ventures WHERE state='ACTIVE'").get().n;
      requireValue(count<p.active_venture_limit,'Active venture limit reached');
      this.db.prepare("UPDATE ventures SET state='ACTIVE' WHERE id=?").run(id);this.event('VENTURE_ACTIVATED',id);return this.venture(id);
    });
  }
  reserve(input){
    requireValue([input.id,input.venture_id,input.target_ref].every(filled)&&yen(input.ceiling_yen)&&input.ceiling_yen>0,'Operation target and bounded maximum cost required');
    requireValue(KINDS.includes(input.kind)&&/^[a-f0-9]{64}$/.test(input.request_hash),'Cost kind and exact request hash required');
    const lane=input.lane??'EXPLORE';requireValue(['EXPLORE','RUN'].includes(lane),'Invalid funding lane');
    requireValue(lane==='RUN'?filled(input.grant_id):input.grant_id===undefined||input.grant_id===null,'Operating grant required only for RUN');
    const payload={id:input.id,venture_id:input.venture_id,kind:input.kind,ceiling_yen:input.ceiling_yen,target_ref:input.target_ref,request_hash:input.request_hash};
    const signature=digest(lane==='RUN'?{...payload,lane,grant_id:input.grant_id}:payload);
    return this.company.tx(()=>{
      const old=this.db.prepare('SELECT * FROM venture_operations WHERE id=?').get(input.id);
      if(old){requireValue(old.payload_hash===signature,'Operation ID conflict');return old;}
      const p=this.guardFunding({lane,venture_id:input.venture_id,grant_id:input.grant_id}),v=this.venture(input.venture_id);
      requireValue(p.allowed_kinds.includes(input.kind),'Cost kind not permitted');
      if(lane==='RUN')this.checkOperatingReservation(v,input.grant_id,input,p);
      else{
        requireValue(this.growthReadiness().ready,'Existing service health blocks new investment reservations');
        requireValue(v.state==='ACTIVE'&&this.future(v.definition.learning_deadline),'Venture not active or learning deadline expired');
        requireValue(this.funding().exposure_yen+input.ceiling_yen<=p.gross_spend_limit_yen,'Company funding limit exceeded');
        requireValue(this.funding(v.id).exposure_yen+input.ceiling_yen<=Math.min(p.per_venture_limit_yen,v.definition.budget_yen),'Venture funding limit exceeded');
      }
      this.db.prepare("INSERT INTO venture_operations(id,venture_id,kind,ceiling_yen,target_ref,request_hash,payload_hash,policy_version,status,created_at,lane,grant_id) VALUES(?,?,?,?,?,?,?,?,'RESERVED',?,?,?)")
        .run(input.id,v.id,input.kind,input.ceiling_yen,input.target_ref,input.request_hash,signature,p.version,this.now(),lane,input.grant_id??null);
      this.event('VENTURE_COST_RESERVED',input.id,{...input,policy_version:p.version});return this.operation(input.id);
    });
  }
  begin(id,{target_ref,request_hash}){
    return this.company.tx(()=>{
      const o=this.operation(id),p=this.guardFunding({lane:o.lane,venture_id:o.venture_id,grant_id:o.grant_id}),v=this.venture(o.venture_id);
      requireValue(o.status==='RESERVED','Operation already started, uncertain, or closed');
      requireValue(o.policy_version===p.version,'Policy changed; cancel unstarted reservation and reserve again');
      requireValue(o.target_ref===target_ref&&o.request_hash===request_hash,'Operation payload or target changed');
      if(o.lane==='RUN')this.checkOperatingReservation(v,o.grant_id,{...o,ceiling_yen:0},p);
      else{
        requireValue(v.state==='ACTIVE'&&this.future(v.definition.learning_deadline),'Venture stopped or learning deadline expired');
        requireValue(this.funding(v.id).exposure_yen<=Math.min(p.per_venture_limit_yen,v.definition.budget_yen),'Venture funding limit exceeded');
        requireValue(this.growthReadiness().ready,'Existing service health blocks experiment execution');
      }
      this.db.prepare("UPDATE venture_operations SET status='IN_FLIGHT' WHERE id=?").run(id);this.event('VENTURE_OPERATION_STARTED',id);return this.operation(id);
    });
  }
  markUnknown(id,reason){
    requireValue(filled(reason),'Uncertainty reason required');
    return this.company.tx(()=>{const o=this.operation(id);requireValue(o.status==='IN_FLIGHT','Only an in-flight operation can become unknown');
      this.db.prepare("UPDATE venture_operations SET status='UNKNOWN' WHERE id=?").run(id);this.event('VENTURE_OPERATION_UNKNOWN',id,{reason});return this.operation(id);});
  }
  cancelUnstarted(id,reason){
    requireValue(filled(reason),'Cancellation reason required');
    return this.company.tx(()=>{requireValue(this.operation(id).status==='RESERVED','Cannot release money for an executed or uncertain operation');
      this.db.prepare("UPDATE venture_operations SET status='CANCELLED' WHERE id=?").run(id);this.event('VENTURE_RESERVATION_CANCELLED',id,{reason});return this.operation(id);});
  }
  settle(id,{actual_yen,provider_ref,source_ref}){
    requireValue(yen(actual_yen)&&filled(provider_ref)&&filled(source_ref),'Actual cost and provider evidence required');
    return this.company.tx(()=>{
      const o=this.operation(id);
      if(o.status==='SETTLED'){requireValue(o.actual_yen===actual_yen&&o.provider_ref===provider_ref&&o.source_ref===source_ref,'Settlement conflict');return o;}
      requireValue(['IN_FLIGHT','UNKNOWN'].includes(o.status),'Only a started operation can be reconciled');
      const overrun=actual_yen>o.ceiling_yen?1:0;
      this.db.prepare("UPDATE venture_operations SET status='SETTLED',actual_yen=?,provider_ref=?,source_ref=?,review_required=? WHERE id=?").run(actual_yen,provider_ref,source_ref,overrun,id);
      this.event('VENTURE_COST_RECONCILED',id,{actual_yen,provider_ref,source_ref,overrun});return this.operation(id);
    });
  }
  reviewOverrun(id,{source_ref,corrective_action}){
    requireValue(filled(source_ref)&&filled(corrective_action),'Owner review and corrective action required');
    return this.company.tx(()=>{requireValue(this.operation(id).review_required,'No overrun to review');
      this.db.prepare('UPDATE venture_operations SET review_ref=? WHERE id=?').run(source_ref,id);
      this.event('VENTURE_OVERRUN_REVIEWED',id,{source_ref,corrective_action});return this.operation(id);});
  }
  promoteToOperating(id,input){
    requireValue([input.delivery_owner,input.support_owner,input.runbook_ref,input.acceptance_ref,input.slo_ref].every(filled),'Operating responsibility, runbook, acceptance and SLO references required');
    requireValue(Number.isSafeInteger(input.health_ttl_ms)&&input.health_ttl_ms>=60000&&input.health_ttl_ms<=86400000,'Explicit health freshness window required');
    return this.company.tx(()=>{
      this.guardFunding();const v=this.venture(id),f=this.funding(id);
      requireValue(this.growthReadiness().ready,'Existing service health blocks another service launch');
      requireValue(v.state==='ACTIVE','Only an active experiment can become an operating service');
      requireValue(!f.held_yen&&!f.unreviewed_overruns,'Reconcile or cancel experiment operations before promotion');
      const body={delivery_owner:input.delivery_owner,support_owner:input.support_owner,runbook_ref:input.runbook_ref,
        acceptance_ref:input.acceptance_ref,slo_ref:input.slo_ref,health_ttl_ms:input.health_ttl_ms};
      this.db.prepare('INSERT INTO operating_services VALUES(?,?,?)').run(id,JSON.stringify(body),this.now());
      this.db.prepare("UPDATE ventures SET state='OPERATING' WHERE id=?").run(id);
      this.event('SERVICE_REGISTERED',id,body);return this.venture(id);
    });
  }
  authorizeOperatingBudget(id,input){
    requireValue(filled(input.id)&&yen(input.limit_yen)&&input.limit_yen>0&&filled(input.source_ref)&&filled(input.isolation_ref),'Owner operating budget and isolation evidence required');
    requireValue(filled(input.valid_from)&&Number.isFinite(Date.parse(input.valid_from))&&this.future(input.valid_until)&&Date.parse(input.valid_from)<Date.parse(input.valid_until),'Operating funding period required');
    requireValue(Array.isArray(input.allowed_kinds)&&input.allowed_kinds.length>0&&input.allowed_kinds.every(k=>['compute','hosting','tools'].includes(k)),'Explicit maintenance cost kinds required');
    requireValue(Array.isArray(input.allowed_targets)&&input.allowed_targets.length>0&&input.allowed_targets.length<=20&&input.allowed_targets.every(filled),'Exact maintenance resource targets required');
    const body={limit_yen:input.limit_yen,valid_from:new Date(input.valid_from).toISOString(),valid_until:new Date(input.valid_until).toISOString(),
      allowed_kinds:[...new Set(input.allowed_kinds)].sort(),allowed_targets:[...new Set(input.allowed_targets)].sort(),source_ref:input.source_ref,isolation_ref:input.isolation_ref};
    return this.company.tx(()=>{
      const old=this.db.prepare('SELECT * FROM operating_grants WHERE id=?').get(input.id);
      if(old){requireValue(old.venture_id===id&&old.body===JSON.stringify(body),'Operating grant ID conflict');return this.grant(input.id);}
      const p=this.guardFunding(),v=this.venture(id);
      requireValue(v.state==='OPERATING','Operating service required');
      requireValue(input.limit_yen<=(p.operating_grant_limit_yen??0),'Operating grant exceeds owner policy');
      requireValue(body.allowed_kinds.every(k=>p.allowed_kinds.includes(k)),'Operating cost kind outside policy');
      requireValue(this.funding().exposure_yen+input.limit_yen<=p.gross_spend_limit_yen,'Company funding limit exceeded');
      this.db.prepare("INSERT INTO operating_grants VALUES(?,?,?,'OPEN',?)").run(input.id,id,JSON.stringify(body),this.now());
      this.event('OPERATING_BUDGET_PROTECTED',id,{grant_id:input.id,...body});return this.grant(input.id);
    });
  }
  checkOperatingReservation(v,grant_id,input,p){
    const g=this.grant(grant_id),d=g.definition;
    requireValue(['OPERATING','EXITING'].includes(v.state),'Service not operating or exiting');
    requireValue(g.venture_id===v.id&&g.status==='OPEN','Operating grant belongs to another service or is closed');
    requireValue(Date.parse(d.valid_from)<=this.clock().getTime()&&this.future(d.valid_until),'Operating grant is outside its period');
    requireValue(d.limit_yen<=(p.operating_grant_limit_yen??0),'Operating budget no longer within owner policy');
    requireValue(p.allowed_kinds.includes(input.kind)&&d.allowed_kinds.includes(input.kind)&&d.allowed_targets.includes(input.target_ref),'Maintenance action outside approved resources');
    requireValue(this.grantFunding(grant_id).exposure_yen+input.ceiling_yen<=d.limit_yen,'Protected operating budget exceeded');
  }
  recordServiceHealth(id,input){
    requireValue([input.id,input.source_ref,input.observed_at].every(filled),'Health observation and source required');
    requireValue(Number.isFinite(Date.parse(input.observed_at))&&Date.parse(input.observed_at)<=this.clock().getTime(),'Health must be observed, not a future prediction');
    requireValue(['slo_met','costs_reconciled','spare_capacity'].every(k=>typeof input[k]==='boolean'),'Explicit service health facts required');
    requireValue(['critical_incidents','overdue_support','samples'].every(k=>Number.isSafeInteger(input[k])&&input[k]>=0),'Nonnegative health counts required');
    const body={observed_at:new Date(input.observed_at).toISOString(),source_ref:input.source_ref,slo_met:input.slo_met,costs_reconciled:input.costs_reconciled,
      spare_capacity:input.spare_capacity,critical_incidents:input.critical_incidents,overdue_support:input.overdue_support,samples:input.samples};
    const signature=digest(body);
    return this.company.tx(()=>{
      requireValue(this.db.prepare('SELECT venture_id FROM operating_services WHERE venture_id=?').get(id),'Unknown operating service');
      const old=this.db.prepare('SELECT * FROM operating_health WHERE id=?').get(input.id);
      if(old){requireValue(old.venture_id===id&&old.payload_hash===signature,'Health observation ID conflict');return body;}
      this.db.prepare('INSERT INTO operating_health VALUES(?,?,?,?,?)').run(input.id,id,JSON.stringify(body),signature,this.now());
      this.event('SERVICE_HEALTH_RECORDED',id,{observation_id:input.id,...body});return body;
    });
  }
  growthReadiness(){
    const blockers=[],policy=this.policy();
    const funding=this.funding(),global=[];
    if(!policy.enabled||!this.future(policy.expires_at))global.push('funding-policy-disabled-or-expired');
    if(this.db.prepare('SELECT paused FROM control WHERE id=1').get().paused)global.push('company-paused');
    if(funding.unknown_operations||funding.in_flight_operations||funding.unreviewed_overruns)global.push('financial-reconciliation-open');
    if(funding.exposure_yen>policy.gross_spend_limit_yen)global.push('company-funding-exceeded');
    if(global.length)blockers.push({venture_id:null,reasons:global});
    for(const s of this.db.prepare("SELECT s.*,v.state FROM operating_services s JOIN ventures v ON v.id=s.venture_id WHERE v.state IN ('OPERATING','EXITING')").all()){
      const reasons=[],config=JSON.parse(s.body);
      if(s.state==='EXITING')reasons.push('customer-exit-obligations-open');
      const row=this.db.prepare("SELECT body FROM operating_health WHERE venture_id=? ORDER BY json_extract(body,'$.observed_at') DESC,rowid DESC LIMIT 1").get(s.venture_id);
      const health=row?JSON.parse(row.body):null;
      if(!health||this.clock().getTime()-Date.parse(health.observed_at)>config.health_ttl_ms)reasons.push('health-unknown-or-stale');
      if(health){
        if(!health.samples)reasons.push('no-service-observations');
        if(!health.slo_met||health.critical_incidents||health.overdue_support)reasons.push('customer-service-needs-attention');
        if(!health.costs_reconciled||!health.spare_capacity)reasons.push('costs-or-capacity-not-ready');
      }
      const funded=this.db.prepare("SELECT * FROM operating_grants WHERE venture_id=? AND status='OPEN'").all(s.venture_id)
        .some(g=>{const d=JSON.parse(g.body);return policy.enabled&&this.future(policy.expires_at)&&d.limit_yen<=(policy.operating_grant_limit_yen??0)&&d.allowed_kinds.every(k=>policy.allowed_kinds.includes(k))&&Date.parse(d.valid_from)<=this.clock().getTime()&&this.future(d.valid_until)&&this.grantFunding(g.id).exposure_yen<d.limit_yen;});
      if(!funded)reasons.push('operating-funding-not-protected');
      if(reasons.length)blockers.push({venture_id:s.venture_id,reasons});
    }
    return {ready:blockers.length===0,blockers,verification:'operator-recorded-health-not-live-monitoring'};
  }
  boundUncertainty(id,input){
    requireValue(yen(input.upper_bound_yen),'Conservative upper bound required');
    requireValue(filled(input.source_ref)&&this.future(input.expires_at),'External bound evidence and expiry required');
    requireValue(Array.isArray(input.allowed_run_grants)&&input.allowed_run_grants.length>0&&input.allowed_run_grants.length<=20,'Explicit isolated RUN grants required');
    return this.company.tx(()=>{
      const o=this.operation(id);
      requireValue(o.status==='UNKNOWN'&&input.upper_bound_yen>=o.ceiling_yen,'Unknown operation and conservative upper bound required');
      for(const grant_id of input.allowed_run_grants){const g=this.grant(grant_id);requireValue(g.status==='OPEN'&&g.venture_id!==o.venture_id,'Cannot isolate an uncertain service from itself');}
      const prior=this.db.prepare('SELECT body FROM venture_risk_bounds WHERE operation_id=?').get(id);
      requireValue(!prior||input.upper_bound_yen>=JSON.parse(prior.body).upper_bound_yen,'Uncertainty hold cannot shrink before reconciliation');
      const body={upper_bound_yen:input.upper_bound_yen,source_ref:input.source_ref,expires_at:input.expires_at,allowed_run_grants:[...new Set(input.allowed_run_grants)].sort()};
      this.db.prepare('INSERT OR REPLACE INTO venture_risk_bounds VALUES(?,?,?)').run(id,JSON.stringify(body),this.now());
      this.event('UNCERTAINTY_BOUND_RECORDED',id,body);return body;
    });
  }
  closeOperatingBudget(id,source_ref){
    requireValue(filled(source_ref),'Evidence of no remaining provider liabilities required');
    return this.company.tx(()=>{
      const g=this.grant(id);requireValue(g.status==='OPEN'&&!this.grantFunding(id).held_yen,'Reconcile operating costs before releasing unused funds');
      this.db.prepare("UPDATE operating_grants SET status='CLOSED' WHERE id=?").run(id);this.event('OPERATING_BUDGET_CLOSED',g.venture_id,{grant_id:id,source_ref});return this.grant(id);
    });
  }
  closeOperatingService(id,source_ref){
    requireValue(filled(source_ref),'Customer and provider obligations clearance evidence required');
    return this.company.tx(()=>{
      requireValue(this.venture(id).state==='EXITING','Service must complete exit processing first');
      const funding=this.funding(id);
      requireValue(!funding.held_yen&&!funding.unreviewed_overruns&&!this.db.prepare("SELECT id FROM operating_grants WHERE venture_id=? AND status='OPEN'").get(id),'Outstanding operations or operating grants remain');
      this.db.prepare("UPDATE ventures SET state='CLOSED' WHERE id=?").run(id);this.event('OPERATING_SERVICE_CLOSED',id,{source_ref});return this.venture(id);
    });
  }
  stop(id,reason){
    requireValue(filled(reason),'Stop reason required');
    return this.company.tx(()=>{const v=this.venture(id);if(v.state==='CLOSED')return v;this.db.prepare('UPDATE ventures SET state=? WHERE id=?').run(['OPERATING','EXITING'].includes(v.state)?'EXITING':'STOPPED',id);
      this.event('VENTURE_STOPPED',id,{reason,outstanding:this.funding(id)});return this.venture(id);});
  }
  status(){return {mode:'local-funding-control-prototype',policy:this.policy(),funding:this.funding(),growth_readiness:this.growthReadiness(),ventures:this.db.prepare('SELECT id,state,body FROM ventures ORDER BY rowid').all(),
    live_external_execution:false,owner_auth_connected:false,bank_balance_connected:false,market_validation:'UNVERIFIED',
    note:'Recorded gross spending and reserved exposure. No automatic release, ad spend, bank transfer, or budget replenishment from revenue.'};}
}
