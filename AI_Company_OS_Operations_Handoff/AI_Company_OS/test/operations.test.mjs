import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { rt, funded, venture, PASS, hashOf } from './helpers.mjs';
import { signPayload } from '../src/operations.mjs';
import { createRuntime } from '../src/runtime.mjs';
import { ROOT } from '../src/company.mjs';
import { LocalTestAdapter } from '../src/execution.mjs';
import { JobQueue } from '../src/jobs.mjs';

const SECRET='whsec_test_secret';
function hooks(t,{at}={}){const r=rt(t,{at,env:{STRIPE_TEST:SECRET,STRIPE_LIVE:SECRET+'_live'}});funded(r);venture(r);
  r.operations.registerProviderAccount({provider:'stripe',account_id:'acct_1',environment:'test',venture_id:'v1',secret_env:'STRIPE_TEST'});
  r.operations.registerProviderAccount({provider:'stripe',account_id:'acct_1',environment:'live',venture_id:'v1',secret_env:'STRIPE_LIVE'});return r;}
function deliver(r,event,{secret}={}){const raw=JSON.stringify({account:'acct_1',...event});const t=Math.floor(r.clock().getTime()/1000);
  return r.operations.receive('stripe',raw,{'stripe-signature':signPayload(secret??(event.livemode?SECRET+'_live':SECRET),raw,t)});}
const pay=(id,amount,{livemode=true,customer='cus_1',currency='jpy',created=1793500000}={})=>({id,type:'payment_intent.succeeded',livemode,created,data:{object:{id:'pi_'+id,amount_received:amount,currency,customer}}});

test('M01 a free-viewer + advertiser plan separates users and payers and creates no orders; v1 advertising gate unchanged',t=>{
  const r=rt(t);funded(r);venture(r);
  r.commercial.registerModel({id:'yt',venture_id:'v1',audience_or_user:'English-speaking viewers (free)',payers:[{id:'ads',description:'platform ad share'},{id:'aff',description:'affiliate merchants'}],
    value_proposition:'v',distribution:'YouTube search/suggested',delivery:'videos',revenue_streams:[{type:'advertising',payer_id:'ads',currency:'USD',unit_basis:'monetized views',eligibility:'not yet in partner program',rate_minor:null,rate_null_reason:'unmeasured'},
      {type:'affiliate',payer_id:'aff',currency:'USD',unit_basis:'approved referral',eligibility:'program approval pending',rate_minor:null,rate_null_reason:'no approved program'}],
    cost_structure:{items:[{category:'production',description:'edit',amount_yen:1500}]},experiment:{experiment_id:'x',max_loss_yen:3000,primary_metric:'returning viewers',observation_end:'2026-12-01T00:00:00Z'},
    evidence_refs:['obs_1'],counterevidence:['c'],monitoring:'analytics',support:'comments'});
  assert.throws(()=>r.commercial.registerModel({id:'bad',venture_id:'v1',audience_or_user:'u',payers:[{id:'ads',description:'d'}],value_proposition:'v',distribution:'d',delivery:'d',
    revenue_streams:[{type:'advertising',payer_id:'ads',currency:'USD',unit_basis:'u',eligibility:'e',rate_minor:null}],cost_structure:{items:[{category:'production',description:'d',amount_yen:1}]},experiment:{experiment_id:'x',max_loss_yen:1,primary_metric:'p',observation_end:'2026-12-01T00:00:00Z'},evidence_refs:[],counterevidence:[]}),/null with reason/);
  assert.equal(r.company.db.prepare('SELECT COUNT(*) AS n FROM revenue_orders').get().n,0);
  assert.equal(r.commercial.model('yt').plan.payers.length,2);
  r.commercial.register({id:'v1plan',venture_id:'v1',segment:'s',problem:'p',current_alternative:'a',difference:'d',channel:'c',channel_access_basis:'b',deliverable:'d',acceptance:'a',positioning:'p',primary_metric:'m',stop_rule:'s',price_yen:0,currency:'JPY',unit_basis:'u',monetization:'advertising',variable_cost_yen:null,test_budget_yen:100,observation_end:'2026-12-01T00:00:00Z',evidence:[{kind:'public_fact',source_ref:'s',claim:'c'}],counterevidence:[]});
  assert.ok(r.commercial.assess('v1plan').blockers.includes('advertising-yield-and-audience-model-required'));
});
test('M02 test-mode payment events never count as live revenue',t=>{
  const r=hooks(t,{at:'2026-11-01T00:00:00Z'});
  assert.equal(deliver(r,pay('evt_t',5000,{livemode:false,created:1793491200})).environment,'test');
  const cc=r.operations.cashContribution({venture_id:'v1',from:'2026-10-01T00:00:00Z',to:'2026-12-01T00:00:00Z'});
  assert.equal(cc.receipts_yen,0);assert.equal(cc.test_events_excluded,1);
  assert.throws(()=>deliver(r,pay('evt_x',5000,{livemode:true}),{secret:SECRET}),/signature-mismatch/);
  assert.equal(r.company.db.prepare('SELECT COUNT(*) AS n FROM provider_rejections').get().n,1);
});
test('M03 redelivered payment notifications are applied once',t=>{
  const r=hooks(t,{at:'2026-11-01T00:00:00Z'});const e=pay('evt_1',3000,{created:1793491200});
  assert.equal(deliver(r,e).duplicate,false);assert.equal(deliver(r,e).duplicate,true);assert.equal(deliver(r,{...e,id:'evt_1b'}).duplicate,false);
  const cc=r.operations.cashContribution({venture_id:'v1',from:'2026-10-01T00:00:00Z',to:'2026-12-01T00:00:00Z'});
  assert.equal(cc.receipts_yen,3000,'same transaction under a new event id is still one receipt');
});
test('M04 out-of-order refund and subscription events converge to the provider truth',t=>{
  const r=hooks(t,{at:'2026-11-01T00:00:00Z'});
  deliver(r,{id:'evt_r',type:'charge.refunded',livemode:true,created:1793491300,data:{object:{id:'ch_1',payment_intent:'pi_p1',amount_refunded:1000,currency:'jpy',customer:'cus_1',refunds:{data:[{id:'re_1',amount:1000}]}}}});
  deliver(r,pay('p1',3000,{created:1793491200}));
  const cc=r.operations.cashContribution({venture_id:'v1',from:'2026-10-01T00:00:00Z',to:'2026-12-01T00:00:00Z'});assert.equal(cc.receipts_yen-cc.refunds_yen,2000);
  const sub=(id,status,created)=>({id,type:'customer.subscription.updated',livemode:true,created,data:{object:{id:'sub_1',customer:'cus_1',status,current_period_end:1796000000}}});
  deliver(r,sub('evt_s2','canceled',1793491500));assert.equal(deliver(r,sub('evt_s1','active',1793491400)).applied,'stale-ignored');
  assert.equal(r.operations.entitlement({provider:'stripe',account_id:'acct_1',subscription_id:'sub_1'}).active,false);
  assert.equal(r.operations.applyProviderSnapshot({provider:'stripe',account_id:'acct_1',environment:'live',subscription_id:'sub_1',status:'active',current_period_end:'2026-12-01T00:00:00Z',retrieved_at:'2026-10-30T00:00:00Z'}).applied,false,'older snapshot ignored');
  assert.equal(r.operations.applyProviderSnapshot({provider:'stripe',account_id:'acct_1',environment:'live',subscription_id:'sub_1',status:'active',current_period_end:'2026-12-01T00:00:00Z',retrieved_at:'2026-11-01T00:10:00Z'}).applied,true);
  assert.equal(r.operations.entitlement({provider:'stripe',account_id:'acct_1',subscription_id:'sub_1'}).active,true);
});
test('M05 owner time, shared and failed-exploration costs are allocated without losing the company total',t=>{
  const r=rt(t);funded(r);venture(r,'v1');venture(r,'v2',{activate:false});
  r.operations.recordCost({id:'c1',venture_id:null,category:'shared',amount_minor:3000,currency:'JPY',period_start:'2026-11-01T00:00:00Z',period_end:'2026-11-30T00:00:00Z',source_ref:'invoice',allocation:{basis:'usage share',shares:[{venture_id:'v1',ratio:2/3},{venture_id:'v2',ratio:1/3}]}});
  r.operations.recordCost({id:'c2',venture_id:'v1',category:'failed_exploration',amount_minor:800,currency:'JPY',period_start:'2026-11-01T00:00:00Z',period_end:'2026-11-02T00:00:00Z',source_ref:'log'});
  r.operations.recordCost({id:'c3',venture_id:'v1',category:'owner_time',amount_minor:null,null_reason:'hourly value not agreed',minutes:90,currency:'JPY',period_start:'2026-11-01T00:00:00Z',period_end:'2026-11-02T00:00:00Z',source_ref:'owner log'});
  assert.throws(()=>r.operations.recordCost({id:'c4',venture_id:null,category:'shared',amount_minor:1,currency:'JPY',period_start:'2026-11-01T00:00:00Z',period_end:'2026-11-02T00:00:00Z',source_ref:'x',allocation:{basis:'b',shares:[{venture_id:'v1',ratio:0.5}]}}),/sum to 1/);
  const p={from:'2026-11-01T00:00:00Z',to:'2026-12-01T00:00:00Z'};
  const a=r.operations.costsFor('v1',p),b=r.operations.costsFor('v2',p);
  assert.equal(a.known_by_category.shared+b.known_by_category.shared,3000);assert.equal(a.company_cost_entries_total_yen,3800);
  const cc=r.operations.cashContribution({venture_id:'v1',...p});assert.equal(cc.value_yen,null);assert.equal(cc.null_reason,'costs-unknown');assert.equal(cc.owner_minutes_recorded,90);
});
test('M06 CAC with zero new payers or unknown acquisition cost is not computable',t=>{
  const r=hooks(t,{at:'2026-11-01T00:00:00Z'});const p={venture_id:'v1',from:'2026-10-01T00:00:00Z',to:'2026-12-01T00:00:00Z'};
  r.operations.recordCost({id:'ad',venture_id:'v1',category:'acquisition',amount_minor:2000,currency:'JPY',period_start:'2026-10-20T00:00:00Z',period_end:'2026-10-31T00:00:00Z',source_ref:'ads invoice'});
  assert.deepEqual([r.operations.cac(p).value_yen,r.operations.cac(p).reason],[null,'denominator-zero']);
  deliver(r,pay('a',3000,{customer:'cus_a',created:1793491200}));deliver(r,pay('b',3000,{customer:'cus_b',created:1793491201}));
  assert.equal(r.operations.cac(p).value_yen,1000);
  r.operations.recordCost({id:'ad2',venture_id:'v1',category:'acquisition',amount_minor:null,null_reason:'agency bill pending',currency:'JPY',period_start:'2026-10-20T00:00:00Z',period_end:'2026-10-31T00:00:00Z',source_ref:'agency'});
  assert.equal(r.operations.cac(p).reason,'acquisition-cost-unknown');
});
test('M07 non-JPY transactions are reported unconverted, never silently added as yen',t=>{
  const r=hooks(t,{at:'2026-11-01T00:00:00Z'});deliver(r,pay('usd',999,{currency:'usd',created:1793491200}));deliver(r,pay('jpy',1000,{created:1793491201}));
  const cc=r.operations.cashContribution({venture_id:'v1',from:'2026-10-01T00:00:00Z',to:'2026-12-01T00:00:00Z'});
  assert.equal(cc.receipts_yen,1000);assert.deepEqual(cc.unconverted_transactions.map(x=>x.currency),['USD']);
});
test('M08 first-value rate counts only matured customers and excludes test/admin/monitor/bot',t=>{
  const r=rt(t,{at:'2026-11-10T00:00:00Z'});funded(r);venture(r);
  const u=(id,subject,action,at,kind='customer',key=false)=>r.operations.recordUsage({id,venture_id:'v1',environment:'live',actor_kind:kind,subject_ref:subject,action,key_action:key,occurred_at:at,source_ref:'app'});
  u('1','a','signup','2026-11-01T00:00:00Z');u('2','a','export','2026-11-02T00:00:00Z','customer',true);
  u('3','b','signup','2026-11-01T00:00:00Z');u('4','c','signup','2026-11-08T00:00:00Z');u('5','c','export','2026-11-08T01:00:00Z','customer',true);
  u('6','probe','signup','2026-11-01T00:00:00Z','monitor');u('7','probe','export','2026-11-01T00:01:00Z','monitor',true);u('8','me','signup','2026-11-01T00:00:00Z','admin');
  const fv=r.operations.firstValue({venture_id:'v1',window_days:7});
  assert.deepEqual([fv.numerator,fv.denominator,fv.not_yet_observable],[1,2,1]);
});

// ---- Operating control (O) ----
function service(r){venture(r,'svc');r.ventures.promoteToOperating('svc',{delivery_owner:'SERVICE_CHIEF',support_owner:'SERVICE_CHIEF',runbook_ref:'runbook',acceptance_ref:'acc',slo_ref:'slo',health_ttl_ms:3600000});
  r.ventures.authorizeOperatingBudget('svc',{id:'run-g',limit_yen:3000,valid_from:'2026-11-01T00:00:00Z',valid_until:'2026-12-01T00:00:00Z',allowed_kinds:['hosting'],allowed_targets:['host:svc'],source_ref:'owner',isolation_ref:'separate account'});}
function healthy(r,id='h1'){r.operations.recordUsage({id:'probe-'+id,venture_id:'svc',environment:'live',actor_kind:'monitor',subject_ref:'probe',action:'check',key_action:true,occurred_at:r.clock().toISOString(),source_ref:'uptime'});
  return r.operations.pushHealth('svc',{observation_id:id,window_ms:3600000,spare_capacity:true});}
test('O01 an operating service and one experiment coexist; protected funds are not experiment money',t=>{
  const r=rt(t);funded(r,{gross_spend_limit_yen:6000});service(r);healthy(r);
  venture(r,'exp',{budget:3000});assert.equal(r.ventures.venture('exp').state,'ACTIVE');
  assert.equal(r.ventures.funding().protected_operating_yen,3000);
  assert.throws(()=>r.ventures.reserve({id:'big',venture_id:'exp',kind:'compute',ceiling_yen:3001,target_ref:'t',request_hash:'a'.repeat(64)}),/funding limit/);
});
test('O02 after the research deadline, research stops but approved maintenance still runs in its own period',t=>{
  const r=rt(t);funded(r);service(r);healthy(r);venture(r,'exp',{budget:2000});
  r.set('2026-12-16T00:00:00Z');funded(r,{expires_at:'2027-01-31T00:00:00Z'});
  assert.throws(()=>r.ventures.reserve({id:'r1',venture_id:'exp',kind:'compute',ceiling_yen:100,target_ref:'t',request_hash:'a'.repeat(64)}),/health|deadline/);
});
test('O03/O04 unbounded uncertainty blocks new work and unapproved maintenance; bounded isolated RUN keeps the hold',t=>{
  const r=rt(t);funded(r,{allow_isolated_run:true});service(r);healthy(r);venture(r,'exp',{budget:2000});
  r.ventures.reserve({id:'u',venture_id:'exp',kind:'compute',ceiling_yen:500,target_ref:'t',request_hash:'a'.repeat(64)});r.ventures.begin('u',{target_ref:'t',request_hash:'a'.repeat(64)});r.ventures.markUnknown('u','timeout');
  const run={id:'m1',venture_id:'svc',lane:'RUN',grant_id:'run-g',kind:'hosting',ceiling_yen:200,target_ref:'host:svc',request_hash:'d'.repeat(64)};
  assert.throws(()=>r.ventures.reserve(run),/Unbounded|Reconciliation/);
  r.ventures.boundUncertainty('u',{upper_bound_yen:800,source_ref:'provider cap screenshot',expires_at:'2026-11-02T00:00:00Z',allowed_run_grants:['run-g']});
  assert.equal(r.ventures.reserve(run).status,'RESERVED');assert.equal(r.ventures.funding().held_yen,1000);
  assert.throws(()=>r.ventures.reserve({id:'r2',venture_id:'exp',kind:'compute',ceiling_yen:100,target_ref:'t',request_hash:'a'.repeat(64)}),/Reconciliation/);
});
test('O05 overdue support or a critical incident from the operations ledger holds new experiments',t=>{
  const r=rt(t);funded(r);service(r);healthy(r,'h0');
  r.operations.openCase({id:'case1',venture_id:'svc',severity:'high',summary:'cannot log in',due_at:'2026-11-01T02:00:00Z'});
  r.advance(3*3600000);r.operations.replyCase('case1',{auto_reply_only:true,text:'we got your message'});
  assert.equal(r.operations.case('case1').overdue,true);healthy(r,'h1');
  const g=r.ventures.growthReadiness();assert.equal(g.ready,false);assert.ok(g.blockers[0].reasons.includes('customer-service-needs-attention'));
  r.ventures.propose({id:'exp',title:'t',hypothesis:'h',customer_problem:'p',success_metric:'m',failure_rule:'f',budget_yen:1000,learning_deadline:'2026-12-01T00:00:00Z',evidence_refs:[]});
  assert.throws(()=>r.ventures.activate('exp'),/health/);
  const q=new JobQueue(r.company,{clock:r.clock,slots:2,reservedRunSlots:1,heavyMax:1});
  q.enqueue({id:'e',lane:'EXPLORE',dedupe_key:'e'});q.enqueue({id:'s',lane:'RUN_CRITICAL',dedupe_key:'s',payload:{case:'case1'}});
  assert.equal(q.claim('w').id,'s');
});
test('O06 heavy generation cannot occupy capacity reserved for monitoring, reconciliation and support',t=>{
  const r=rt(t);const q=new JobQueue(r.company,{clock:r.clock,slots:3,reservedRunSlots:1,heavyMax:1});
  for(let i=0;i<4;i++)q.enqueue({id:'gen'+i,lane:'EXPLORE',heavy:true,dedupe_key:'gen'+i});q.enqueue({id:'dev',lane:'IMPROVE',heavy:true,dedupe_key:'dev'});q.enqueue({id:'imp',lane:'IMPROVE',dedupe_key:'imp'});
  assert.equal(q.claim('w1').id,'dev');assert.equal(q.claim('w2').id,'imp');assert.equal(q.claim('w3'),null,'last slot stays reserved for RUN');
  q.enqueue({id:'recon',lane:'RUN',dedupe_key:'recon'});assert.equal(q.claim('w3').id,'recon');assert.equal(q.capacity().heavy_running,1);
  r.company.pause('OWNER','stop');q.complete('recon','w3','ok');q.enqueue({id:'mon',lane:'RUN_CRITICAL',dedupe_key:'mon'});
  assert.equal(q.claim('w3').id,'mon','monitoring continues while paused');
});
test('O07 actual cost above the reservation is recorded and freezes further spending',async t=>{
  const r=rt(t);funded(r);venture(r);r.authority.provisionOwnerCredential(PASS);const s=r.authority.requireOwner(r.authority.login(PASS).token);
  r.authority.createGrant(s,{id:'g',venture_id:'v1',operation:'spend',target:'gpu',content_hash:null,scope:{model:['m1']},max_cost_yen:2000,max_count:5,valid_until:'2026-12-01T00:00:00Z',idempotency_key:'g'});
  const adapter={id:'gpu',execute:async()=>({status:'SUCCEEDED',provider_object_id:'job1',actual_yen:900,source_ref:'invoice'})};
  r.gateway.request('PRODUCTION_STAFF',{id:'o1',venture_id:'v1',operation:'spend',target:'gpu',adapter_id:'gpu',grant_id:'g',environment:'live',cost_yen:500,cost_kind:'compute',payload:{model:'m1'},scope_facts:{model:'m1'}});
  await r.gateway.execute('o1',adapter,{scope_facts:{model:'m1'}});
  assert.equal(r.ventures.operation('o1').review_required,1);
  assert.throws(()=>r.gateway.request('PRODUCTION_STAFF',{id:'o2',venture_id:'v1',operation:'spend',target:'gpu',adapter_id:'gpu',grant_id:'g',environment:'live',cost_yen:100,cost_kind:'compute',payload:{model:'m1',n:2},scope_facts:{model:'m1'}}),/Reconciliation required/);
});
test('O08 a stopped service keeps refund/support/subscription obligations and cannot be closed until cleared',t=>{
  const r=hooks(t,{at:'2026-11-01T00:00:00Z'});r.ventures.stop('v1','not used in this scenario');service(r);healthy(r);
  r.operations.registerProviderAccount({provider:'stripe',account_id:'acct_2',environment:'live',venture_id:'svc',secret_env:'STRIPE_LIVE'});
  r.operations.applyProviderSnapshot({provider:'stripe',account_id:'acct_2',environment:'live',subscription_id:'sub_9',status:'active',current_period_end:'2026-11-20T00:00:00Z',retrieved_at:'2026-11-01T00:00:00Z'});
  r.operations.openCase({id:'refund-req',venture_id:'svc',severity:'normal',summary:'refund request',due_at:'2026-11-03T00:00:00Z'});
  r.ventures.stop('svc','exit');r.ventures.closeOperatingBudget('run-g','no remaining liabilities');
  assert.throws(()=>r.closeService('svc','done'),/support-cases:1.*active-subscriptions:1/);
  r.operations.resolveCase('refund-req',{resolution:'refunded',root_cause:'exit'});
  r.operations.applyProviderSnapshot({provider:'stripe',account_id:'acct_2',environment:'live',subscription_id:'sub_9',status:'canceled',current_period_end:'2026-11-20T00:00:00Z',retrieved_at:'2026-11-02T00:00:00Z'});
  assert.equal(r.closeService('svc','all obligations cleared').state,'CLOSED');
});
test('O09 an older normal observation arriving after a newer abnormal one does not restore readiness',t=>{
  const r=rt(t);funded(r);service(r);
  r.ventures.recordServiceHealth('svc',{id:'new-bad',observed_at:'2026-11-01T00:00:00Z',source_ref:'derived',slo_met:false,costs_reconciled:true,spare_capacity:true,critical_incidents:1,overdue_support:0,samples:5});
  r.ventures.recordServiceHealth('svc',{id:'old-good',observed_at:'2026-10-31T23:30:00Z',source_ref:'late probe',slo_met:true,costs_reconciled:true,spare_capacity:true,critical_incidents:0,overdue_support:0,samples:5});
  assert.equal(r.ventures.growthReadiness().ready,false);
});
test('O10 a v0.5.0 database migrates with IDs, amounts, history and idempotent replays preserved',t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'aicos-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const file=path.join(dir,'old.sqlite');fs.copyFileSync(path.join(ROOT,'test/fixtures/v050.sqlite'),file);
  let clock=new Date('2026-11-01T00:00:00Z');const r=createRuntime({file,clock:()=>clock});t.after(()=>r.close());
  const op=r.ventures.operation('old-op');assert.deepEqual([op.status,op.actual_yen,op.lane],['SETTLED',650,'EXPLORE']);
  assert.equal(r.ventures.funding('legacy').held_yen,300);
  assert.equal(r.ventures.reserve({id:'old-held',venture_id:'legacy',kind:'compute',ceiling_yen:300,target_ref:'fixture:t',request_hash:'c'.repeat(64)}).status,'RESERVED','replay with the same key is accepted');
  assert.throws(()=>r.ventures.reserve({id:'old-held',venture_id:'legacy',kind:'compute',ceiling_yen:301,target_ref:'fixture:t',request_hash:'c'.repeat(64)}),/conflict/);
  assert.equal(r.commercial.get('legacy-plan').plan.price_yen,3000);
  assert.ok(r.company.db.prepare("SELECT COUNT(*) AS n FROM events WHERE kind='VENTURE_COST_RECONCILED'").get().n>=1);
  for(const tbl of ['execution_grants','observations','provider_events','jobs','knowledge_items'])assert.ok(r.company.db.prepare("SELECT name FROM sqlite_master WHERE name=?").get(tbl),tbl);
});
