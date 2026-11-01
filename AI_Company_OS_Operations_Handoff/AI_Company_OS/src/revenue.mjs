import { createHash, randomUUID } from 'node:crypto';

const assert=(condition,message)=>{if(!condition) throw new Error(message);};
const filled=v=>typeof v==='string' && v.trim().length>0 && v.length<=12000;
const money=v=>Number.isSafeInteger(v) && v>=0 && v<=1000000000;
const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const parse=v=>JSON.parse(v);
const day=v=>typeof v==='string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v+'T00:00:00Z')) && new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v;

// Trusted local-owner ledger. It does not call a payment provider, send a delivery,
// authenticate a remote user, or prove that a manually recorded customer is real.
export class RevenueLedger {
  constructor(company,{clock=()=>new Date(),capacity=1}={}) {
    this.company=company;this.db=company.db;this.clock=clock;this.capacity=capacity;
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS revenue_evidence(id TEXT PRIMARY KEY,entity_id TEXT NOT NULL,event_kind TEXT NOT NULL,snapshot TEXT NOT NULL,created_at TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS revenue_evidence_entity ON revenue_evidence(entity_id);
      CREATE TABLE IF NOT EXISTS revenue_campaigns(id TEXT PRIMARY KEY,domain TEXT NOT NULL CHECK(domain IN ('real','simulation')),source_ref TEXT NOT NULL,labor_complete INTEGER NOT NULL DEFAULT 0,cash_cost_yen INTEGER,cash_cost_ref TEXT);
      CREATE TABLE IF NOT EXISTS revenue_leads(id TEXT PRIMARY KEY,campaign_id TEXT NOT NULL REFERENCES revenue_campaigns(id),customer_id TEXT NOT NULL,source_ref TEXT NOT NULL,qualification TEXT NOT NULL DEFAULT '{}');
      CREATE TABLE IF NOT EXISTS revenue_orders(
        id TEXT PRIMARY KEY,lead_id TEXT NOT NULL REFERENCES revenue_leads(id),campaign_id TEXT NOT NULL,customer_id TEXT NOT NULL,domain TEXT NOT NULL,
        scope TEXT NOT NULL,scope_hash TEXT NOT NULL,total_yen INTEGER NOT NULL,status TEXT NOT NULL DEFAULT 'SCOPED',
        inputs_ref TEXT,grant_ref TEXT,artifact_hash TEXT,artifact_ref TEXT,qa_hash TEXT,qa_ref TEXT,customer_hash TEXT,customer_ref TEXT,
        delivery_ref TEXT,usage TEXT,costs TEXT,labor_complete INTEGER NOT NULL DEFAULT 0,repeat_eligible INTEGER NOT NULL DEFAULT 0,referral_eligible INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS revenue_payments(reference TEXT PRIMARY KEY,order_id TEXT NOT NULL REFERENCES revenue_orders(id),kind TEXT NOT NULL CHECK(kind IN ('receipt','refund')),amount_yen INTEGER NOT NULL,source_ref TEXT NOT NULL,verification TEXT NOT NULL,created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS revenue_time(id TEXT PRIMARY KEY,campaign_id TEXT NOT NULL REFERENCES revenue_campaigns(id),order_id TEXT REFERENCES revenue_orders(id),category TEXT NOT NULL CHECK(category IN ('acquisition','delivery')),minutes INTEGER NOT NULL,hourly_yen INTEGER NOT NULL,source_ref TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS revenue_jobs(id TEXT PRIMARY KEY,order_id TEXT NOT NULL UNIQUE REFERENCES revenue_orders(id),scope_hash TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'PENDING',created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS revenue_refund_reviews(order_id TEXT PRIMARY KEY REFERENCES revenue_orders(id),refunded_yen INTEGER NOT NULL,source_ref TEXT NOT NULL,corrective_action TEXT NOT NULL,created_at TEXT NOT NULL);
    `);
  }
  now(){return this.clock().toISOString();}
  event(kind,id,body={}){
    const snapshot={body};
    for(const [key,table] of Object.entries({campaign:'revenue_campaigns',lead:'revenue_leads',order:'revenue_orders',time:'revenue_time'})){
      const row=this.db.prepare('SELECT * FROM '+table+' WHERE id=?').get(id);
      if(row)snapshot[key]=row;
    }
    if(body.reference)snapshot.payment=this.db.prepare('SELECT * FROM revenue_payments WHERE reference=?').get(body.reference);
    if(kind==='REFUND_CAUSE_REVIEWED')snapshot.refund_review=this.db.prepare('SELECT * FROM revenue_refund_reviews WHERE order_id=?').get(id);
    this.db.prepare('INSERT INTO revenue_evidence VALUES(?,?,?,?,?)').run(randomUUID(),id,kind,JSON.stringify(snapshot),this.now());
    this.company.event('OWNER',kind,id,{...body,verification:'owner-recorded-not-provider-verified'});
  }
  evidenceHistory(entity_id){
    assert(filled(entity_id),'Entity ID required');
    return this.db.prepare('SELECT * FROM revenue_evidence WHERE entity_id=? ORDER BY rowid').all(entity_id).map(row=>({...row,snapshot:parse(row.snapshot)}));
  }
  campaign(id){const row=this.db.prepare('SELECT * FROM revenue_campaigns WHERE id=?').get(id);assert(row,'Unknown campaign');return row;}
  lead(id){const row=this.db.prepare('SELECT * FROM revenue_leads WHERE id=?').get(id);assert(row,'Unknown lead');return row;}
  order(id){const row=this.db.prepare('SELECT * FROM revenue_orders WHERE id=?').get(id);assert(row,'Unknown order');return row;}
  registerCampaign({id,domain='real',source_ref}){
    assert(filled(id)&&filled(source_ref)&&['real','simulation'].includes(domain),'Campaign ID, domain and source required');
    return this.company.tx(()=>{
      const old=this.db.prepare('SELECT * FROM revenue_campaigns WHERE id=?').get(id);
      if(old){assert(old.domain===domain&&old.source_ref===source_ref,'Campaign ID conflict');return old;}
      this.db.prepare('INSERT INTO revenue_campaigns(id,domain,source_ref) VALUES(?,?,?)').run(id,domain,source_ref);
      this.event('CAMPAIGN_RECORDED',id,{domain});return this.campaign(id);
    });
  }
  registerLead({id,campaign_id,customer_id,source_ref}){
    this.campaign(campaign_id);assert([id,customer_id,source_ref].every(filled),'Lead and source required');
    return this.company.tx(()=>{
      const old=this.db.prepare('SELECT * FROM revenue_leads WHERE id=?').get(id);
      if(old){assert(old.campaign_id===campaign_id&&old.customer_id===customer_id&&old.source_ref===source_ref,'Lead ID conflict');return old;}
      this.db.prepare('INSERT INTO revenue_leads(id,campaign_id,customer_id,source_ref) VALUES(?,?,?,?)').run(id,campaign_id,customer_id,source_ref);
      this.db.prepare('UPDATE revenue_campaigns SET labor_complete=0 WHERE id=?').run(campaign_id);
      this.event('LEAD_RECORDED',id,{campaign_id});return this.lead(id);
    });
  }
  qualifyLead(id,qualification){
    this.lead(id);assert(filled(qualification.source_ref),'Qualification source required');
    this.company.tx(()=>{this.db.prepare('UPDATE revenue_leads SET qualification=? WHERE id=?').run(JSON.stringify(qualification),id);this.event('QUALIFICATION_RECORDED',id);});
    return this.qualification(id);
  }
  qualification(id){
    const q=parse(this.lead(id).qualification),reasons=[];
    if(!filled(q.problem))reasons.push('problem-not-evidenced');
    if(!filled(q.existing_alternative_gap))reasons.push('alternative-gap-not-evidenced');
    if(q.decision_maker_confirmed!==true)reasons.push('decision-maker-not-confirmed');
    if(!filled(q.content_reviewer))reasons.push('content-reviewer-missing');
    if(q.material_rights_confirmed!==true)reasons.push('material-rights-not-confirmed');
    if(!money(q.budget_yen))reasons.push('budget-not-confirmed');
    const days=day(q.planned_use_date)?(Date.parse(q.planned_use_date+'T23:59:59Z')-this.clock().getTime())/86400000:NaN;
    if(!(days>=0&&days<=31))reasons.push('no-use-date-within-30-days');
    if(!filled(q.source_ref))reasons.push('source-missing');
    return {qualified:reasons.length===0,reasons,evidence_type:'owner-recorded-interview',qualification:q};
  }
  createOrder({id,lead_id,total_yen,scope}){
    assert(filled(id)&&money(total_yen)&&total_yen>0,'Order and amount required');
    assert(scope&&[scope.theme,scope.job_type,scope.acceptance,scope.agreement_ref].every(filled),'Scope and agreement required');
    assert(day(scope.due_date)&&Date.parse(scope.due_date+'T23:59:59Z')>=this.clock().getTime(),'Explicit future due date required');
    const scopeHash=hash({lead_id,total_yen,scope});
    return this.company.tx(()=>{
      this.company.guard();const old=this.db.prepare('SELECT * FROM revenue_orders WHERE id=?').get(id);
      if(old){assert(old.scope_hash===scopeHash,'Order ID reused with changed scope');return old;}
      const l=this.lead(lead_id),campaign=this.campaign(l.campaign_id),q=this.qualification(lead_id);
      assert(q.qualified,'Lead not qualified: '+q.reasons.join(', '));
      assert(q.qualification.budget_yen>=total_yen,'Order exceeds confirmed buyer budget');
      assert(scope.due_date<=q.qualification.planned_use_date,'Delivery date must precede planned use');
      const open=this.db.prepare("SELECT COUNT(*) AS n FROM revenue_orders WHERE domain=? AND status NOT IN ('DELIVERED','USED','CANCELLED')").get(campaign.domain).n;
      assert(open<this.capacity,'Committed-order capacity reached');
      const repeat=this.db.prepare("SELECT id FROM revenue_orders WHERE customer_id=? AND domain=? AND status='USED' AND usage IS NOT NULL LIMIT 1").get(l.customer_id,campaign.domain)?1:0;
      const ref=q.qualification;
      const referrer=filled(ref.referred_by_customer_id)&&ref.referred_by_customer_id!==l.customer_id&&filled(ref.referral_source_ref)?this.db.prepare("SELECT * FROM revenue_orders WHERE customer_id=? AND domain=? AND status='USED' AND usage IS NOT NULL").all(ref.referred_by_customer_id,campaign.domain):[];
      const referral=referrer.some(o=>this.paymentTotals(o.id).net_received>=o.total_yen)?1:0;
      this.db.prepare('INSERT INTO revenue_orders(id,lead_id,campaign_id,customer_id,domain,scope,scope_hash,total_yen,repeat_eligible,referral_eligible,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)')
        .run(id,lead_id,l.campaign_id,l.customer_id,campaign.domain,JSON.stringify(scope),scopeHash,total_yen,repeat,referral,this.now());
      this.event('ORDER_SCOPED',id,{domain:campaign.domain,scope_hash:scopeHash});return this.order(id);
    });
  }
  paymentTotals(order_id){
    this.order(order_id);const totals=this.db.prepare("SELECT COALESCE(SUM(CASE WHEN kind='receipt' THEN amount_yen ELSE 0 END),0) AS received,COALESCE(SUM(CASE WHEN kind='refund' THEN amount_yen ELSE 0 END),0) AS refunded FROM revenue_payments WHERE order_id=?").get(order_id);
    return {...totals,net_received:totals.received-totals.refunded};
  }
  recordPayment({reference,order_id,amount_yen,kind='receipt',source_ref}){
    assert([reference,source_ref].every(filled)&&money(amount_yen)&&amount_yen>0&&['receipt','refund'].includes(kind),'Payment evidence required');
    return this.company.tx(()=>{
      const order=this.order(order_id);
      const old=this.db.prepare('SELECT * FROM revenue_payments WHERE reference=?').get(reference);
      if(old){assert(old.order_id===order_id&&old.kind===kind&&old.amount_yen===amount_yen&&old.source_ref===source_ref,'Payment reference conflict');return old;}
      const totals=this.paymentTotals(order_id);
      if(kind==='refund')assert(amount_yen<=totals.net_received,'Refund exceeds received amount');
      this.db.prepare('INSERT INTO revenue_payments VALUES(?,?,?,?,?,?,?)').run(reference,order_id,kind,amount_yen,source_ref,order.domain==='real'?'owner-confirmed-record':'simulation',this.now());
      this.event('PAYMENT_RECORDED',order_id,{reference,kind,domain:order.domain});
      if(order.status==='CANCELLED')this.event('PAYMENT_ON_CANCELLED_ORDER',order_id,{reference,kind,reconciliation_required:true});
      return this.db.prepare('SELECT * FROM revenue_payments WHERE reference=?').get(reference);
    });
  }
  confirmInputs(order_id,{scope_hash,source_ref,rights_ref}){
    assert(filled(source_ref)&&filled(rights_ref),'Inputs and rights evidence required');
    this.company.tx(()=>{const order=this.order(order_id);assert(order.scope_hash===scope_hash,'Stale scope');assert(order.status==='SCOPED','Inputs are immutable after production starts');
      const value=JSON.stringify({source_ref,rights_ref});if(order.inputs_ref===value)return;
      this.db.prepare('UPDATE revenue_orders SET inputs_ref=?,grant_ref=NULL WHERE id=?').run(value,order_id);this.event('INPUTS_CONFIRMED',order_id,{previous_approval_invalidated:true});});
  }
  approveProduction(order_id,{scope_hash,source_ref,expires_at}){
    assert(filled(source_ref),'Approval source missing');
    this.company.tx(()=>{const order=this.order(order_id);assert(order.scope_hash===scope_hash&&order.inputs_ref,'Stale scope or inputs missing');assert(filled(expires_at)&&Date.parse(expires_at)>this.clock().getTime(),'Explicit future approval expiry required');
      this.db.prepare('UPDATE revenue_orders SET grant_ref=? WHERE id=?').run(JSON.stringify({scope_hash,input_hash:hash(order.inputs_ref),source_ref,expires_at}),order_id);this.event('PRODUCTION_APPROVED',order_id,{scope_hash,expires_at});});
  }
  revokeProduction(order_id,reason){
    this.order(order_id);assert(filled(reason),'Reason required');
    this.company.tx(()=>{this.db.prepare('UPDATE revenue_orders SET grant_ref=NULL WHERE id=?').run(order_id);this.event('PRODUCTION_REVOKED',order_id,{reason});});
  }
  productionChecks(order){
    this.company.guard();
    assert(order.grant_ref,'Production approval missing or revoked');
    const grant=parse(order.grant_ref);assert(grant.scope_hash===order.scope_hash&&grant.input_hash===hash(order.inputs_ref)&&Date.parse(grant.expires_at)>this.clock().getTime(),'Production approval expired or stale');
    assert(order.inputs_ref,'Inputs not confirmed');
    assert(this.paymentTotals(order.id).net_received>=order.total_yen,'Payment not fully confirmed');
  }
  startProduction(order_id){
    return this.company.tx(()=>{
      const order=this.order(order_id);this.productionChecks(order);
      const old=this.db.prepare('SELECT * FROM revenue_jobs WHERE order_id=?').get(order_id);
      if(old)return old;
      assert(order.status==='SCOPED','Order not ready to start');
      const id=randomUUID();
      this.db.prepare('INSERT INTO revenue_jobs(id,order_id,scope_hash,created_at) VALUES(?,?,?,?)').run(id,order_id,order.scope_hash,this.now());
      this.db.prepare("UPDATE revenue_orders SET status='PRODUCING' WHERE id=?").run(order_id);
      this.event('PRODUCTION_QUEUED',order_id,{job_id:id});return this.db.prepare('SELECT * FROM revenue_jobs WHERE id=?').get(id);
    });
  }
  claimJob(id){
    return this.company.tx(()=>{
      const job=this.db.prepare('SELECT * FROM revenue_jobs WHERE id=?').get(id);assert(job,'Unknown job');
      const order=this.order(job.order_id);this.productionChecks(order);
      assert(job.scope_hash===order.scope_hash&&job.status==='PENDING','Job not claimable');
      this.db.prepare("UPDATE revenue_jobs SET status='RUNNING' WHERE id=?").run(id);
      this.event('PRODUCTION_CLAIMED',order.id,{job_id:id});return {...job,status:'RUNNING'};
    });
  }
  attachArtifact(order_id,{scope_hash,artifact_hash,artifact_ref}){
    assert(/^[a-f0-9]{64}$/.test(artifact_hash)&&filled(artifact_ref),'Artifact hash and reference required');
    this.company.tx(()=>{
      const order=this.order(order_id);assert(order.scope_hash===scope_hash,'Stale scope');
      assert(['PRODUCING','INTERNAL_REVIEW','CUSTOMER_REVIEW'].includes(order.status),'Order does not accept a new artifact');
      const job=this.db.prepare('SELECT * FROM revenue_jobs WHERE order_id=?').get(order_id);assert(job&&['RUNNING','OUTPUT_RECORDED'].includes(job.status),'No running production job');
      if(order.artifact_hash===artifact_hash){assert(order.artifact_ref===artifact_ref,'Artifact reference conflict');return;}
      this.db.prepare("UPDATE revenue_orders SET artifact_hash=?,artifact_ref=?,qa_hash=NULL,qa_ref=NULL,customer_hash=NULL,customer_ref=NULL,status='INTERNAL_REVIEW' WHERE id=?").run(artifact_hash,artifact_ref,order_id);
      this.db.prepare("UPDATE revenue_jobs SET status='OUTPUT_RECORDED' WHERE order_id=?").run(order_id);
      this.event('ARTIFACT_RECORDED',order_id,{artifact_hash,scope_hash});
    });
  }
  recordFinalQA(order_id,{artifact_hash,source_ref}){
    this.company.tx(()=>{
      const order=this.order(order_id);assert(order.status==='INTERNAL_REVIEW'&&order.artifact_hash===artifact_hash&&filled(source_ref),'QA requires the current artifact');
      this.db.prepare("UPDATE revenue_orders SET qa_hash=?,qa_ref=?,status='CUSTOMER_REVIEW' WHERE id=?").run(artifact_hash,source_ref,order_id);this.event('FINAL_QA_RECORDED',order_id,{artifact_hash});
    });
  }
  recordCustomerAcceptance(order_id,{artifact_hash,source_ref}){
    this.company.tx(()=>{
      const order=this.order(order_id);assert(order.status==='CUSTOMER_REVIEW'&&order.qa_hash===artifact_hash&&order.artifact_hash===artifact_hash&&filled(source_ref),'Customer confirmation requires current QA version');
      this.db.prepare('UPDATE revenue_orders SET customer_hash=?,customer_ref=? WHERE id=?').run(artifact_hash,source_ref,order_id);this.event('CUSTOMER_CONFIRMATION_RECORDED',order_id,{artifact_hash});
    });
  }
  recordDelivery(order_id,{artifact_hash,source_ref}){
    this.company.tx(()=>{
      this.company.guard();const order=this.order(order_id);
      assert(order.status==='CUSTOMER_REVIEW'&&order.artifact_hash===artifact_hash&&order.qa_hash===artifact_hash&&order.customer_hash===artifact_hash&&filled(source_ref),'Delivery requires current QA and customer confirmation');
      assert(this.paymentTotals(order_id).net_received>=order.total_yen,'Payment no longer sufficient');
      this.db.prepare("UPDATE revenue_orders SET delivery_ref=?,status='DELIVERED' WHERE id=?").run(source_ref,order_id);this.event('DELIVERY_RECORDED',order_id,{artifact_hash});
    });
  }
  recordUsage(order_id,{use_date,source_ref,note}){
    assert(day(use_date)&&use_date<=this.now().slice(0,10)&&filled(source_ref)&&filled(note),'Usage needs a past or current date and customer evidence');
    this.company.tx(()=>{
      const order=this.order(order_id);assert(['DELIVERED','USED'].includes(order.status),'Delivery is not yet recorded');
      this.db.prepare("UPDATE revenue_orders SET usage=?,status='USED' WHERE id=?").run(JSON.stringify({use_date,source_ref,note,verification:'owner-recorded-customer-report'}),order_id);this.event('CUSTOMER_USAGE_RECORDED',order_id);
    });
  }
  cancelUnfulfilledOrder(order_id,reason){
    assert(filled(reason),'Cancellation reason required');
    this.company.tx(()=>{
      const order=this.order(order_id);assert(order.status==='SCOPED','Only an unstarted order can be cancelled here');
      assert(this.paymentTotals(order_id).net_received===0,'Reconcile refund before cancellation');
      this.db.prepare("UPDATE revenue_orders SET status='CANCELLED',grant_ref=NULL WHERE id=?").run(order_id);this.event('ORDER_CANCELLED',order_id,{reason});
    });
  }
  reviewRefund(order_id,{source_ref,corrective_action}){
    const total=this.paymentTotals(order_id).refunded;assert(total>0&&filled(source_ref)&&filled(corrective_action),'Refund cause review and corrective action required');
    this.company.tx(()=>{this.db.prepare('INSERT OR REPLACE INTO revenue_refund_reviews VALUES(?,?,?,?,?)').run(order_id,total,source_ref,corrective_action,this.now());this.event('REFUND_CAUSE_REVIEWED',order_id,{refunded_yen:total});});
  }
  logTime({id,campaign_id,order_id=null,category,minutes,hourly_yen,source_ref}){
    this.campaign(campaign_id);assert(filled(id)&&filled(source_ref)&&['acquisition','delivery'].includes(category),'Time record required');
    assert(Number.isSafeInteger(minutes)&&minutes>0&&minutes<=100000&&money(hourly_yen)&&hourly_yen>0,'Positive time and economic hourly value required');
    assert((category==='acquisition'&&order_id===null)||(category==='delivery'&&filled(order_id)),'Acquisition belongs to campaign; delivery belongs to order');
    if(order_id)assert(this.order(order_id).campaign_id===campaign_id,'Time record belongs to another campaign');
    return this.company.tx(()=>{
      const old=this.db.prepare('SELECT * FROM revenue_time WHERE id=?').get(id);
      const record={id,campaign_id,order_id,category,minutes,hourly_yen,source_ref};
      if(old){for(const k of Object.keys(record))assert(old[k]===record[k],'Time ID conflict');return old;}
      this.db.prepare('INSERT INTO revenue_time VALUES(?,?,?,?,?,?,?)').run(id,campaign_id,order_id,category,minutes,hourly_yen,source_ref);
      if(category==='acquisition')this.db.prepare('UPDATE revenue_campaigns SET labor_complete=0 WHERE id=?').run(campaign_id);
      else this.db.prepare('UPDATE revenue_orders SET labor_complete=0 WHERE id=?').run(order_id);
      this.event('BUSINESS_TIME_RECORDED',id,{category});return record;
    });
  }
  closeCampaignTime(campaign_id,source_ref){
    this.campaign(campaign_id);assert(filled(source_ref),'Closure evidence required');
    this.company.tx(()=>{this.db.prepare('UPDATE revenue_campaigns SET labor_complete=1 WHERE id=?').run(campaign_id);this.event('ACQUISITION_TIME_CONFIRMED',campaign_id,{source_ref});});
  }
  confirmCampaignCashCosts(campaign_id,{amount_yen,source_ref}){
    this.campaign(campaign_id);assert(money(amount_yen)&&filled(source_ref),'Explicit acquisition cash costs and evidence required');
    this.company.tx(()=>{this.db.prepare('UPDATE revenue_campaigns SET cash_cost_yen=?,cash_cost_ref=? WHERE id=?').run(amount_yen,source_ref,campaign_id);this.event('ACQUISITION_CASH_COSTS_CONFIRMED',campaign_id,{amount_yen});});
  }
  closeOrderCosts(order_id,{ai_yen,fees_yen,other_yen,source_ref,zero_delivery_reason=null}){
    assert([ai_yen,fees_yen,other_yen].every(money)&&filled(source_ref),'All actual variable costs must be explicitly known');
    const order=this.order(order_id),logs=this.db.prepare("SELECT COUNT(*) AS n FROM revenue_time WHERE order_id=? AND category='delivery'").get(order_id).n;
    assert(logs>0||(order.status==='CANCELLED'&&filled(zero_delivery_reason)),'Delivery time has not been recorded');
    this.company.tx(()=>{this.db.prepare('UPDATE revenue_orders SET costs=?,labor_complete=1 WHERE id=?').run(JSON.stringify({ai_yen,fees_yen,other_yen,source_ref,zero_delivery_reason}),order_id);this.event('ORDER_COSTS_CONFIRMED',order_id);});
  }
  acquisitionAllocation(campaign_id){
    const campaign=this.campaign(campaign_id);
    const labor=this.db.prepare("SELECT COALESCE(SUM(minutes*hourly_yen/60.0),0) AS n FROM revenue_time WHERE campaign_id=? AND category='acquisition'").get(campaign_id).n;
    const pool=labor+(campaign.cash_cost_yen??0);
    const paid=this.db.prepare("SELECT o.id,o.customer_id FROM revenue_orders o WHERE o.campaign_id=? AND (SELECT COALESCE(SUM(p.amount_yen),0) FROM revenue_payments p WHERE p.order_id=o.id AND p.kind='receipt')>=o.total_yen ORDER BY o.rowid").all(campaign_id);
    const first=new Map();for(const order of paid)if(!first.has(order.customer_id))first.set(order.customer_id,order.id);
    const firstIds=[...first.values()],allocations=new Map();
    if(firstIds.length){const base=Math.floor(pool*100/firstIds.length),last=Math.round(pool*100)-base*(firstIds.length-1);firstIds.forEach((id,i)=>allocations.set(id,(i===firstIds.length-1?last:base)/100));}
    return {known_pool_yen:pool,labor_value_yen:labor,cash_cost_yen:campaign.cash_cost_yen,paid_customer_count:firstIds.length,allocations,unallocated_yen:firstIds.length?0:pool};
  }
  economics(order_id){
    const o=this.order(order_id),campaign=this.campaign(o.campaign_id),payments=this.paymentTotals(order_id),allocation=this.acquisitionAllocation(o.campaign_id);
    const delivery=this.db.prepare("SELECT COALESCE(SUM(minutes*hourly_yen/60.0),0) AS n FROM revenue_time WHERE order_id=? AND category='delivery'").get(order_id).n;
    const acquisition=allocation.allocations.get(order_id)??0,costs=o.costs?parse(o.costs):null;
    const complete=!!(costs&&o.labor_complete&&campaign.labor_complete&&campaign.cash_cost_yen!==null&&payments.received>0);
    const missing=[];if(!costs)missing.push('actual-variable-costs');if(!o.labor_complete)missing.push('delivery-time');if(!campaign.labor_complete)missing.push('all-acquisition-time');if(campaign.cash_cost_yen===null)missing.push('acquisition-cash-costs');if(!payments.received)missing.push('payment-evidence');
    const contribution=complete?Math.round((payments.net_received-costs.ai_yen-costs.fees_yen-costs.other_yen-delivery-acquisition)*100)/100:null;
    return {order_id,domain:o.domain,payments,measured_delivery_time_value_yen:delivery,allocated_acquisition_cost_yen:acquisition,
      allocation_rule:'campaign-cost-to-first-paid-order-of-distinct-customer-refunds-retain-cost',actual_variable_costs:costs,
      cost_coverage:complete?'OWNER_CONFIRMED':'INCOMPLETE',missing,economic_contribution_before_tax_and_fixed_costs_yen:contribution,
      contribution_share:complete&&payments.net_received>0?contribution/payments.net_received:null,
      verification:'local-owner-records-not-independent-financial-audit'};
  }
  validation(){
    // Simulation data is never eligible for customer/demand/profit gates.
    const orders=this.db.prepare("SELECT * FROM revenue_orders WHERE domain='real'").all();
    const paid=orders.filter(o=>o.status!=='CANCELLED'&&this.paymentTotals(o.id).net_received>=o.total_yen);
    const customers=new Set(paid.map(o=>o.customer_id));
    const used=new Set(paid.filter(o=>o.usage).map(o=>o.customer_id));
    const repeat=new Set(paid.filter(o=>o.repeat_eligible).map(o=>o.customer_id));
    const referred=new Set(paid.filter(o=>o.referral_eligible).map(o=>o.customer_id));
    const economics=paid.map(o=>this.economics(o.id));
    const marginReady=economics.filter(e=>e.contribution_share!==null&&e.contribution_share>=0.30).length;
    const refunds=orders.reduce((sum,o)=>sum+this.paymentTotals(o.id).refunded,0);
    const unreviewedRefunds=orders.filter(o=>{const total=this.paymentTotals(o.id).refunded;const review=this.db.prepare('SELECT refunded_yen FROM revenue_refund_reviews WHERE order_id=?').get(o.id);return total>0&&(!review||review.refunded_yen!==total);}).length;
    const acquired=orders.filter(o=>this.paymentTotals(o.id).received>0).map(o=>this.economics(o.id));
    const completeness=acquired.every(e=>e.cost_coverage==='OWNER_CONFIRMED');
    const campaignIds=this.db.prepare("SELECT id FROM revenue_campaigns WHERE domain='real'").all().map(r=>r.id);
    const pendingAcq=campaignIds.reduce((sum,id)=>sum+this.acquisitionAllocation(id).unallocated_yen,0);
    const allCampaignsComplete=campaignIds.every(id=>this.campaign(id).labor_complete&&this.campaign(id).cash_cost_yen!==null);
    const portfolio=acquired.length&&completeness&&allCampaignsComplete?Math.round((acquired.reduce((sum,e)=>sum+e.economic_contribution_before_tax_and_fixed_costs_yen,0)-pendingAcq)*100)/100:null;
    const checks={independent_paid_customers:customers.size>=3,customers_with_usage:used.size>=2,paid_repeat_or_referral:repeat.size>=1||referred.size>=1,
      complete_costs:acquired.length>0&&completeness&&allCampaignsComplete,two_orders_with_30pct_contribution:marginReady>=2,
      positive_portfolio:portfolio!==null&&portfolio>0,no_unreviewed_refunds:unreviewedRefunds===0};
    return {business_success:'UNVERIFIED',decision:Object.values(checks).every(Boolean)?'LIMITED_EXPANSION_CANDIDATE':'CONTINUE_VALIDATION',
      thresholds_are:'proposed-operating-rules-not-statistical-PMF-proof',independent_paid_customers:customers.size,customers_with_usage:used.size,
      paid_repeat_customers:repeat.size,paid_referred_customers:referred.size,refunds_yen:refunds,unreviewed_refund_orders:unreviewedRefunds,unallocated_acquisition_cost_yen:pendingAcq,portfolio_contribution_yen:portfolio,
      checks,missing:Object.entries(checks).filter(([,v])=>!v).map(([k])=>k),real_payment_feed_connected:false,remote_owner_auth_implemented:false,
      evidence_basis:'owner-recorded-only',order_economics:economics};
  }
}
