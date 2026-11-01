import { createHmac, timingSafeEqual, createHash } from 'node:crypto';

// Operating records after launch: provider events (payments/subscriptions), usage, support, incidents, costs, metrics.
// Provider events are verified (signature, account, environment) and de-duplicated before any state change.
const check=(ok,message,code='REJECTED')=>{if(!ok){const e=new Error(message);e.code=code;throw e;}};
const filled=(v,max=12000)=>typeof v==='string'&&v.trim().length>0&&v.length<=max;
const minor=v=>Number.isSafeInteger(v)&&v>=0&&v<=100000000000;
const iso=v=>filled(v,64)&&Number.isFinite(Date.parse(v));
const sha=v=>createHash('sha256').update(typeof v==='string'?v:JSON.stringify(v)).digest('hex');
export const ACTOR_KINDS=['customer','test','admin','monitor','bot'];
export const COST_CATEGORIES=['production','acquisition','delivery','maintenance','shared','failed_exploration','owner_time','fees'];

/** Stripe-compatible signature header: "t=<unix>,v1=<hex hmac_sha256(secret, `${t}.${raw}`)>". */
export function signPayload(secret,raw,t=Math.floor(Date.now()/1000)){return `t=${t},v1=${createHmac('sha256',secret).update(`${t}.${raw}`).digest('hex')}`;}
export function verifySignature(secret,raw,header,{nowSec,toleranceSec=300}){
  if(!filled(header,2000)||!filled(secret,500))return {ok:false,reason:'missing-signature-or-secret'};
  const parts=Object.fromEntries(header.split(',').map(p=>p.split('=')).filter(p=>p.length===2));
  const t=Number(parts.t);if(!Number.isSafeInteger(t))return {ok:false,reason:'bad-timestamp'};
  if(Math.abs(nowSec-t)>toleranceSec)return {ok:false,reason:'timestamp-outside-tolerance'};
  const want=Buffer.from(createHmac('sha256',secret).update(`${t}.${raw}`).digest('hex')),got=Buffer.from(String(parts.v1??''));
  return got.length===want.length&&timingSafeEqual(got,want)?{ok:true}:{ok:false,reason:'signature-mismatch'};
}
/** Map a Stripe event to the normalized shape. Unknown types are stored but not applied. */
export function normalizeStripe(e){
  const o=e.data?.object??{};const base={id:e.id,account:e.account??null,livemode:!!e.livemode,occurred_at:new Date((e.created??0)*1000).toISOString(),raw_type:e.type};
  switch(e.type){
    case 'payment_intent.succeeded':case 'invoice.paid':return {...base,type:'payment.succeeded',object:{transaction_id:o.id,customer_ref:o.customer??null,amount_minor:o.amount_received??o.amount_paid??o.amount,currency:String(o.currency??'').toUpperCase(),order_ref:o.metadata?.order_ref??null,subscription_id:o.subscription??null}};
    case 'charge.refunded':{const r=o.refunds?.data?.[0]??{};return {...base,type:'refund.succeeded',object:{refund_id:r.id??o.id+':refund',transaction_id:o.payment_intent??o.id,customer_ref:o.customer??null,amount_minor:r.amount??o.amount_refunded,currency:String(o.currency??'').toUpperCase()}};}
    case 'customer.subscription.created':case 'customer.subscription.updated':case 'customer.subscription.deleted':
      return {...base,type:'subscription.state',object:{subscription_id:o.id,customer_ref:o.customer??null,status:e.type.endsWith('deleted')?'canceled':o.status,current_period_end:o.current_period_end?new Date(o.current_period_end*1000).toISOString():null,product_ref:o.items?.data?.[0]?.price?.product??null}};
    default:return {...base,type:'unsupported',object:{}};
  }
}

export class OperationsLedger {
  constructor(company,{ventures=null,clock=()=>new Date(),env=process.env}={}){
    this.company=company;this.db=company.db;this.ventures=ventures;this.clock=clock;this.env=env;
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS provider_accounts(provider TEXT NOT NULL,account_id TEXT NOT NULL,environment TEXT NOT NULL CHECK(environment IN ('test','live')),venture_id TEXT NOT NULL,secret_env TEXT NOT NULL,created_at TEXT NOT NULL,PRIMARY KEY(provider,account_id,environment));
      CREATE TABLE IF NOT EXISTS provider_events(provider TEXT NOT NULL,account_id TEXT NOT NULL,environment TEXT NOT NULL,event_id TEXT NOT NULL,type TEXT NOT NULL,occurred_at TEXT NOT NULL,payload_hash TEXT NOT NULL,body TEXT NOT NULL,received_at TEXT NOT NULL,applied TEXT NOT NULL,PRIMARY KEY(provider,account_id,environment,event_id));
      CREATE TABLE IF NOT EXISTS provider_rejections(id INTEGER PRIMARY KEY AUTOINCREMENT,provider TEXT NOT NULL,reason TEXT NOT NULL,received_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS money_transactions(provider TEXT NOT NULL,account_id TEXT NOT NULL,environment TEXT NOT NULL,transaction_key TEXT NOT NULL,venture_id TEXT NOT NULL,kind TEXT NOT NULL CHECK(kind IN ('receipt','refund')),
        amount_minor INTEGER NOT NULL,currency TEXT NOT NULL,customer_ref TEXT,order_ref TEXT,occurred_at TEXT NOT NULL,source_event TEXT NOT NULL,PRIMARY KEY(provider,account_id,environment,transaction_key));
      CREATE TABLE IF NOT EXISTS subscriptions(provider TEXT NOT NULL,account_id TEXT NOT NULL,environment TEXT NOT NULL,subscription_id TEXT NOT NULL,venture_id TEXT NOT NULL,customer_ref TEXT,status TEXT NOT NULL,
        current_period_end TEXT,state_as_of TEXT NOT NULL,source TEXT NOT NULL,PRIMARY KEY(provider,account_id,environment,subscription_id));
      CREATE TABLE IF NOT EXISTS usage_events(id TEXT PRIMARY KEY,venture_id TEXT NOT NULL,environment TEXT NOT NULL,actor_kind TEXT NOT NULL,subject_ref TEXT NOT NULL,action TEXT NOT NULL,key_action INTEGER NOT NULL,occurred_at TEXT NOT NULL,source_ref TEXT NOT NULL,payload_hash TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS support_cases(id TEXT PRIMARY KEY,venture_id TEXT NOT NULL,customer_ref TEXT,severity TEXT NOT NULL,summary TEXT NOT NULL,opened_at TEXT NOT NULL,due_at TEXT NOT NULL,status TEXT NOT NULL,resolved_at TEXT,resolution TEXT,root_cause TEXT,linked_ref TEXT);
      CREATE TABLE IF NOT EXISTS incidents(id TEXT PRIMARY KEY,venture_id TEXT NOT NULL,severity TEXT NOT NULL,summary TEXT NOT NULL,started_at TEXT NOT NULL,resolved_at TEXT,status TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS cost_entries(id TEXT PRIMARY KEY,venture_id TEXT,category TEXT NOT NULL,amount_minor INTEGER,currency TEXT NOT NULL,null_reason TEXT,minutes INTEGER,period_start TEXT NOT NULL,period_end TEXT NOT NULL,
        allocation TEXT,environment TEXT NOT NULL,source_ref TEXT NOT NULL,payload_hash TEXT NOT NULL,created_at TEXT NOT NULL);
    `);
  }
  now(){return this.clock().toISOString();}
  ms(){return this.clock().getTime();}

  // ---- Provider accounts & events ------------------------------------------------
  /** Owner/systems registers which account+environment belongs to which venture. The secret value stays in env. */
  registerProviderAccount({provider,account_id,environment,venture_id,secret_env}){
    check([provider,account_id,venture_id,secret_env].every(v=>filled(v,200))&&['test','live'].includes(environment),'Provider, account, environment, venture and secret env name required');
    if(this.ventures)this.ventures.venture(venture_id);
    this.db.prepare('INSERT OR IGNORE INTO provider_accounts VALUES(?,?,?,?,?,?)').run(provider,account_id,environment,venture_id,secret_env,this.now());
    return this.db.prepare('SELECT provider,account_id,environment,venture_id,secret_env FROM provider_accounts WHERE provider=? AND account_id=? AND environment=?').get(provider,account_id,environment);
  }
  reject(provider,reason){this.db.prepare('INSERT INTO provider_rejections(provider,reason,received_at) VALUES(?,?,?)').run(provider,reason,this.now());check(false,'Provider event rejected: '+reason,'FORBIDDEN');}
  /** Verify, store once, then apply. Returns {duplicate} for redelivery (M03). */
  receive(provider,raw,headers,{normalize=normalizeStripe}={}){
    check(typeof raw==='string'&&raw.length<=1000000,'Body required');
    let event;try{event=normalize(JSON.parse(raw));}catch{this.reject(provider,'malformed-json');}
    const environment=event.livemode?'live':'test';
    const accounts=this.db.prepare('SELECT * FROM provider_accounts WHERE provider=? AND environment=?').all(provider,environment);
    const acct=accounts.find(a=>a.account_id===(event.account??a.account_id)&&(event.account?true:accounts.length===1));
    if(!acct)this.reject(provider,'unknown-account-or-environment');
    const secret=this.env[acct.secret_env];if(!secret)this.reject(provider,'secret-not-configured');
    const sig=verifySignature(secret,raw,headers['stripe-signature']??headers['x-signature'],{nowSec:Math.floor(this.ms()/1000)});
    if(!sig.ok)this.reject(provider,sig.reason);
    check(filled(event.id,300)&&iso(event.occurred_at),'Event id and time required');
    return this.company.tx(()=>{
      const old=this.db.prepare('SELECT * FROM provider_events WHERE provider=? AND account_id=? AND environment=? AND event_id=?').get(provider,acct.account_id,environment,event.id);
      if(old)return {duplicate:true,event_id:event.id,environment,applied:old.applied};
      const applied=this.apply(provider,acct,environment,event);
      this.db.prepare('INSERT INTO provider_events VALUES(?,?,?,?,?,?,?,?,?,?)').run(provider,acct.account_id,environment,event.id,event.type,event.occurred_at,sha(raw),JSON.stringify(event),this.now(),applied);
      this.company.event('PROVIDER:'+provider,'PROVIDER_EVENT_RECORDED',event.id,{type:event.type,environment,applied,verification:environment==='live'?'PROVIDER_LIVE':'PROVIDER_TEST'});
      return {duplicate:false,event_id:event.id,environment,applied};
    });
  }
  apply(provider,acct,environment,e){
    const o=e.object??{};
    if(e.type==='payment.succeeded'){
      check(filled(o.transaction_id,300)&&minor(o.amount_minor)&&/^[A-Z]{3}$/.test(o.currency),'Payment needs transaction, amount and currency');
      this.db.prepare('INSERT OR IGNORE INTO money_transactions VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run(provider,acct.account_id,environment,'pay:'+o.transaction_id,acct.venture_id,'receipt',o.amount_minor,o.currency,o.customer_ref??null,o.order_ref??null,e.occurred_at,e.id);
      return 'receipt';
    }
    if(e.type==='refund.succeeded'){
      check(filled(o.refund_id,300)&&minor(o.amount_minor),'Refund needs refund id and amount');
      // Refunds are keyed by refund id, so a refund that arrives BEFORE its payment is still counted exactly once (M04).
      this.db.prepare('INSERT OR IGNORE INTO money_transactions VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run(provider,acct.account_id,environment,'ref:'+o.refund_id,acct.venture_id,'refund',o.amount_minor,o.currency,o.customer_ref??null,o.transaction_id??null,e.occurred_at,e.id);
      return 'refund';
    }
    if(e.type==='subscription.state'){
      check(filled(o.subscription_id,300)&&filled(o.status,40),'Subscription id and status required');
      const cur=this.db.prepare('SELECT * FROM subscriptions WHERE provider=? AND account_id=? AND environment=? AND subscription_id=?').get(provider,acct.account_id,environment,o.subscription_id);
      // Older events never overwrite newer state (out-of-order delivery).
      if(cur&&Date.parse(cur.state_as_of)>Date.parse(e.occurred_at))return 'stale-ignored';
      this.db.prepare('INSERT OR REPLACE INTO subscriptions VALUES(?,?,?,?,?,?,?,?,?,?)').run(provider,acct.account_id,environment,o.subscription_id,acct.venture_id,o.customer_ref??null,o.status,o.current_period_end??null,e.occurred_at,'event:'+e.id);
      return 'subscription';
    }
    return 'stored-unsupported-type';
  }
  /** Reconcile against an authoritative provider lookup (snapshot). Snapshot time wins only if newer. */
  applyProviderSnapshot({provider,account_id,environment,subscription_id,status,current_period_end,retrieved_at,customer_ref=null}){
    const acct=this.db.prepare('SELECT * FROM provider_accounts WHERE provider=? AND account_id=? AND environment=?').get(provider,account_id,environment);check(acct,'Unknown provider account');
    check(iso(retrieved_at),'Snapshot time required');
    return this.company.tx(()=>{
      const cur=this.db.prepare('SELECT * FROM subscriptions WHERE provider=? AND account_id=? AND environment=? AND subscription_id=?').get(provider,account_id,environment,subscription_id);
      if(cur&&Date.parse(cur.state_as_of)>Date.parse(retrieved_at))return {applied:false,reason:'snapshot-older-than-state'};
      this.db.prepare('INSERT OR REPLACE INTO subscriptions VALUES(?,?,?,?,?,?,?,?,?,?)').run(provider,account_id,environment,subscription_id,acct.venture_id,customer_ref??cur?.customer_ref??null,status,current_period_end??null,retrieved_at,'snapshot');
      return {applied:true};
    });
  }
  entitlement({provider,account_id,environment='live',subscription_id}){
    const s=this.db.prepare('SELECT * FROM subscriptions WHERE provider=? AND account_id=? AND environment=? AND subscription_id=?').get(provider,account_id,environment,subscription_id);
    if(!s)return {active:false,reason:'no-subscription-record'};
    const active=['active','trialing'].includes(s.status)&&(!s.current_period_end||Date.parse(s.current_period_end)>this.ms());
    return {active,status:s.status,current_period_end:s.current_period_end,state_as_of:s.state_as_of,note:'Entitlement follows contract state; it is not proof of cash received.'};
  }

  // ---- Usage, support, incidents -------------------------------------------------
  recordUsage(input){
    check(filled(input.id,200)&&filled(input.venture_id,200)&&['test','live'].includes(input.environment)&&ACTOR_KINDS.includes(input.actor_kind),'Usage id, venture, environment and actor kind required');
    check(filled(input.subject_ref,200)&&filled(input.action,100)&&iso(input.occurred_at)&&Date.parse(input.occurred_at)<=this.ms()+60000&&filled(input.source_ref,500),'Subject, action, past time and source required');
    const h=sha({...input});const old=this.db.prepare('SELECT * FROM usage_events WHERE id=?').get(input.id);
    if(old){check(old.payload_hash===h,'Usage event id conflict');return old;}
    this.db.prepare('INSERT INTO usage_events VALUES(?,?,?,?,?,?,?,?,?,?)').run(input.id,input.venture_id,input.environment,input.actor_kind,input.subject_ref,input.action,input.key_action?1:0,new Date(input.occurred_at).toISOString(),input.source_ref,h);
    return this.db.prepare('SELECT * FROM usage_events WHERE id=?').get(input.id);
  }
  openCase(input){
    check(filled(input.id,200)&&filled(input.venture_id,200)&&['low','normal','high','critical'].includes(input.severity)&&filled(input.summary,2000)&&iso(input.due_at),'Case id, venture, severity, summary and due time required');
    this.db.prepare("INSERT OR IGNORE INTO support_cases(id,venture_id,customer_ref,severity,summary,opened_at,due_at,status,linked_ref) VALUES(?,?,?,?,?,?,?,'OPEN',?)").run(input.id,input.venture_id,input.customer_ref??null,input.severity,input.summary,input.opened_at??this.now(),new Date(input.due_at).toISOString(),input.linked_ref??null);
    return this.case(input.id);
  }
  case(id){const r=this.db.prepare('SELECT * FROM support_cases WHERE id=?').get(id);check(r,'Unknown case');return {...r,overdue:r.status!=='RESOLVED'&&Date.parse(r.due_at)<this.ms()};}
  replyCase(id,{auto_reply_only,text}){
    check(filled(text,4000),'Reply text required');const c=this.case(id);
    // An automatic acknowledgement never resolves a case.
    if(auto_reply_only){this.db.prepare("UPDATE support_cases SET status='ACKNOWLEDGED' WHERE id=? AND status='OPEN'").run(id);return this.case(id);}
    return c;
  }
  resolveCase(id,{resolution,root_cause}){check(filled(resolution,4000)&&filled(root_cause,1000),'Resolution and root cause required');
    this.db.prepare("UPDATE support_cases SET status='RESOLVED',resolved_at=?,resolution=?,root_cause=? WHERE id=?").run(this.now(),resolution,root_cause,id);return this.case(id);}
  cases(venture_id=null){return (venture_id?this.db.prepare('SELECT id FROM support_cases WHERE venture_id=? ORDER BY due_at').all(venture_id):this.db.prepare('SELECT id FROM support_cases ORDER BY due_at').all()).map(r=>this.case(r.id));}
  openIncident({id,venture_id,severity,summary,started_at}){check(filled(id,200)&&['minor','major','critical'].includes(severity)&&filled(summary,2000),'Incident fields required');
    this.db.prepare("INSERT OR IGNORE INTO incidents VALUES(?,?,?,?,?,NULL,'OPEN')").run(id,venture_id,severity,summary,started_at??this.now());return this.db.prepare('SELECT * FROM incidents WHERE id=?').get(id);}
  resolveIncident(id){this.db.prepare("UPDATE incidents SET status='RESOLVED',resolved_at=? WHERE id=?").run(this.now(),id);return this.db.prepare('SELECT * FROM incidents WHERE id=?').get(id);}

  // ---- Costs -----------------------------------------------------------------------
  recordCost(input){
    check(filled(input.id,200)&&COST_CATEGORIES.includes(input.category)&&/^[A-Z]{3}$/.test(input.currency??'')&&['test','live'].includes(input.environment??'live'),'Cost id, category and currency required');
    check(input.amount_minor===null?filled(input.null_reason,500):minor(input.amount_minor),'Measured amount or null with reason (never silent zero)');
    if(input.category==='owner_time')check(Number.isSafeInteger(input.minutes)&&input.minutes>0,'Owner time needs minutes');
    check(iso(input.period_start)&&iso(input.period_end)&&filled(input.source_ref,500),'Period and source required');
    if(input.venture_id===null||input.venture_id===undefined)check(input.allocation&&Array.isArray(input.allocation.shares)&&filled(input.allocation.basis,500),'Shared costs need an allocation basis and shares');
    if(input.allocation){const total=input.allocation.shares.reduce((s,x)=>s+x.ratio,0);check(Math.abs(total-1)<1e-9,'Allocation shares must sum to 1 so the company total is preserved');}
    const h=sha(input);const old=this.db.prepare('SELECT * FROM cost_entries WHERE id=?').get(input.id);
    if(old){check(old.payload_hash===h,'Cost id conflict');return old;}
    this.db.prepare('INSERT INTO cost_entries VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(input.id,input.venture_id??null,input.category,input.amount_minor,input.currency,input.null_reason??null,input.minutes??null,
      new Date(input.period_start).toISOString(),new Date(input.period_end).toISOString(),input.allocation?JSON.stringify(input.allocation):null,input.environment??'live',input.source_ref,h,this.now());
    return this.db.prepare('SELECT * FROM cost_entries WHERE id=?').get(input.id);
  }
  /** Costs attributed to a venture, including allocated shares of shared costs. Unknowns are listed, never zeroed. */
  costsFor(venture_id,{from,to,environment='live'}){
    const rows=this.db.prepare('SELECT * FROM cost_entries WHERE environment=? AND period_end>? AND period_start<?').all(environment,from,to);
    const known={},unknown=[],unconverted=[];let companyTotal=0,allocatedToThis=0;
    for(const r of rows){
      const share=r.venture_id===venture_id?1:r.allocation?(JSON.parse(r.allocation).shares.find(s=>s.venture_id===venture_id)?.ratio??0):0;
      if(r.amount_minor===null){if(share>0)unknown.push({id:r.id,category:r.category,reason:r.null_reason});continue;}
      if(r.currency!=='JPY'){if(share>0)unconverted.push({id:r.id,currency:r.currency,amount_minor:r.amount_minor});continue;}
      companyTotal+=r.amount_minor;if(share>0){const amt=Math.round(r.amount_minor*share);known[r.category]=(known[r.category]??0)+amt;allocatedToThis+=amt;}
    }
    let ledger=0;
    if(this.ventures){for(const o of this.db.prepare("SELECT * FROM venture_operations WHERE venture_id=? AND status='SETTLED' AND created_at>=? AND created_at<?").all(venture_id,from,to))ledger+=o.actual_yen;
      for(const o of this.db.prepare("SELECT id,status FROM venture_operations WHERE venture_id=? AND status IN ('RESERVED','IN_FLIGHT','UNKNOWN')").all(venture_id))unknown.push({id:o.id,category:'funding-ledger',reason:'operation '+o.status});}
    return {known_by_category:known,ledger_settled_yen:ledger,total_known_yen:allocatedToThis+ledger,unknown,unconverted,company_cost_entries_total_yen:companyTotal};
  }

  // ---- Metrics dictionary (SYSTEM §18) ---------------------------------------------
  cashContribution({venture_id,from,to}){
    check(iso(from)&&iso(to),'Period required');
    const tx=this.db.prepare("SELECT * FROM money_transactions WHERE venture_id=? AND environment='live' AND occurred_at>=? AND occurred_at<?").all(venture_id,from,to);
    const jpy=tx.filter(t=>t.currency==='JPY'),other=tx.filter(t=>t.currency!=='JPY');
    const receipts=jpy.filter(t=>t.kind==='receipt').reduce((s,t)=>s+t.amount_minor,0),refunds=jpy.filter(t=>t.kind==='refund').reduce((s,t)=>s+t.amount_minor,0);
    const costs=this.costsFor(venture_id,{from,to});
    const ownerMinutes=this.db.prepare("SELECT COALESCE(SUM(minutes),0) AS m FROM cost_entries WHERE category='owner_time' AND environment='live' AND (venture_id=? OR venture_id IS NULL) AND period_end>? AND period_start<?").get(venture_id,from,to).m;
    return {metric:'CASH_CONTRIBUTION',venture_id,period:{from,to},environment:'live',currency:'JPY',receipts_yen:receipts,refunds_yen:refunds,known_costs_yen:costs.total_known_yen,
      value_yen:costs.unknown.length?null:receipts-refunds-costs.total_known_yen,partial_value_yen:receipts-refunds-costs.total_known_yen,
      null_reason:costs.unknown.length?'costs-unknown':null,unknown_costs:costs.unknown,unconverted_transactions:other.map(t=>({key:t.transaction_key,currency:t.currency,amount_minor:t.amount_minor})),
      owner_minutes_recorded:ownerMinutes,test_events_excluded:this.db.prepare("SELECT COUNT(*) AS n FROM money_transactions WHERE venture_id=? AND environment='test'").get(venture_id).n,
      note:'Cash contribution, not accounting profit. Bank deposit is a separate fact.'};
  }
  cac({venture_id,from,to}){
    const firstPay=this.db.prepare("SELECT customer_ref,MIN(occurred_at) AS first FROM money_transactions WHERE venture_id=? AND environment='live' AND kind='receipt' AND customer_ref IS NOT NULL GROUP BY customer_ref").all(venture_id);
    const newPayers=firstPay.filter(r=>r.first>=from&&r.first<to).length;
    const costs=this.costsFor(venture_id,{from,to});const acqUnknown=costs.unknown.filter(u=>u.category==='acquisition');
    const acq=costs.known_by_category.acquisition??0; // acquisition-tagged cash and valued time
    if(newPayers===0)return {metric:'CAC_COHORT',value_yen:null,reason:'denominator-zero',new_paying_customers:0,acquisition_cost_yen:acq};
    if(acqUnknown.length)return {metric:'CAC_COHORT',value_yen:null,reason:'acquisition-cost-unknown',unknown:acqUnknown,new_paying_customers:newPayers};
    return {metric:'CAC_COHORT',value_yen:Math.round(acq/newPayers),new_paying_customers:newPayers,acquisition_cost_yen:acq};
  }
  firstValue({venture_id,window_days=7,signup_action='signup'}){
    const subjects=this.db.prepare("SELECT subject_ref,MIN(occurred_at) AS signup FROM usage_events WHERE venture_id=? AND environment='live' AND actor_kind='customer' AND action=? GROUP BY subject_ref").all(venture_id,signup_action);
    const w=window_days*86400000,matured=subjects.filter(s=>Date.parse(s.signup)+w<=this.ms());
    const done=matured.filter(s=>this.db.prepare("SELECT 1 FROM usage_events WHERE venture_id=? AND environment='live' AND actor_kind='customer' AND subject_ref=? AND key_action=1 AND occurred_at>=? AND occurred_at<=? LIMIT 1").get(venture_id,s.subject_ref,s.signup,new Date(Date.parse(s.signup)+w).toISOString()));
    return {metric:'FIRST_VALUE_'+window_days+'D',numerator:done.length,denominator:matured.length,value:matured.length?done.length/matured.length:null,
      not_yet_observable:subjects.length-matured.length,excluded_actor_kinds:['test','admin','monitor','bot']};
  }
  supportOverdue(venture_id){const open=this.cases(venture_id).filter(c=>c.status!=='RESOLVED');const overdue=open.filter(c=>c.overdue);
    return {metric:'SUPPORT_OVERDUE',open:open.length,overdue:overdue.length,by_severity:overdue.reduce((m,c)=>{m[c.severity]=(m[c.severity]??0)+1;return m;},{}),oldest_due:overdue[0]?.due_at??null};}
  /** Derive a service-health observation from operating records and push it into the existing growth gate. */
  deriveHealth(venture_id,{window_ms=3600000,spare_capacity}){
    const since=new Date(this.ms()-window_ms).toISOString();
    const probes=this.db.prepare("SELECT action,key_action FROM usage_events WHERE venture_id=? AND actor_kind='monitor' AND occurred_at>=?").all(venture_id,since);
    const critical=this.db.prepare("SELECT COUNT(*) AS n FROM incidents WHERE venture_id=? AND status='OPEN' AND severity IN ('major','critical')").get(venture_id).n;
    const failedProbes=probes.filter(p=>!p.key_action).length;
    const costsUnknown=this.costsFor(venture_id,{from:since,to:this.now()}).unknown.length>0;
    return {observed_at:this.now(),slo_met:probes.length>0&&failedProbes===0&&critical===0,costs_reconciled:!costsUnknown,spare_capacity:!!spare_capacity,
      critical_incidents:critical,overdue_support:this.supportOverdue(venture_id).overdue,samples:probes.length,
      source_ref:'derived:operations-ledger:monitor-probes+incidents+support (probes are not customers)'};
  }
  pushHealth(venture_id,{observation_id,window_ms,spare_capacity}){check(this.ventures,'Venture ledger required');const h=this.deriveHealth(venture_id,{window_ms,spare_capacity});return this.ventures.recordServiceHealth(venture_id,{id:observation_id,...h});}
  /** K05: remove a customer's personal data while keeping financial facts with a pseudonymous key. */
  eraseCustomer(customer_ref,{reason}){
    check(filled(customer_ref,200)&&filled(reason,500),'Customer and reason required');
    const pseudo='erased:'+sha(customer_ref).slice(0,16);
    return this.company.tx(()=>{
      const counts={};
      counts.usage=this.db.prepare('UPDATE usage_events SET subject_ref=? WHERE subject_ref=?').run(pseudo,customer_ref).changes;
      counts.cases=this.db.prepare("UPDATE support_cases SET customer_ref=?,summary='[erased on request]',resolution=CASE WHEN resolution IS NULL THEN NULL ELSE '[erased]' END WHERE customer_ref=?").run(pseudo,customer_ref).changes;
      counts.transactions=this.db.prepare('UPDATE money_transactions SET customer_ref=? WHERE customer_ref=?').run(pseudo,customer_ref).changes;
      counts.subscriptions=this.db.prepare('UPDATE subscriptions SET customer_ref=? WHERE customer_ref=?').run(pseudo,customer_ref).changes;
      this.company.event('OWNER','CUSTOMER_DATA_ERASED',pseudo,{reason,counts,financial_records_retained:true});
      return {pseudonym:pseudo,counts,financial_records_retained:true};
    });
  }
}
