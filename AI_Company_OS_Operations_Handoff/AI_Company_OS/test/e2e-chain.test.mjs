import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { rt, funded, server, PASS } from './helpers.mjs';
import { experimentFixture } from './fixtures-research.mjs';
import { LocalTestAdapter } from '../src/execution.mjs';
import { signPayload } from '../src/operations.mjs';

// E01/E02: one candidate from research to minimum offer, local test-mode delivery, usage, revenue, cost and support,
// all linked by identifiers and visible from the owner API. Everything here is LOCAL/TEST data, not live results.
async function chain(t){
  const r=rt(t,{env:{STRIPE_TEST:'whsec_t'}});funded(r);
  const x=experimentFixture(r);const launched=r.research.launchExperiment('STRATEGY_DIRECTOR','exp1');const vid=launched.state.venture_id;
  r.commercial.registerModel({id:'m1',venture_id:vid,audience_or_user:'US freelancers',payers:[{id:'user',description:'the freelancer'}],value_proposition:'faster invoicing',distribution:'forum answers + landing page',delivery:'web tool',
    revenue_streams:[{type:'one_time',payer_id:'user',currency:'JPY',unit_basis:'one purchase',eligibility:'checkout live',rate_minor:1500,rate_basis:'declared_price'}],
    cost_structure:{items:[{category:'production',description:'build',amount_yen:0},{category:'fees',description:'payment fees',amount_yen:null,null_reason:'depends on provider plan'}]},
    experiment:{experiment_id:'exp1',max_loss_yen:3000,primary_metric:'PAID_CONVERSION',observation_end:'2026-11-29T00:00:00Z'},evidence_refs:x.body?[...r.research.opportunity('opp1').body.evidence.observation_ids]:[],counterevidence:['spreadsheet is enough'],
    monitoring:'uptime probe',support:'email within 48h',refund_policy:'7 days'});
  // Work: CEO -> PRODUCT_DIRECTOR -> PRODUCTION_CHIEF -> PRODUCTION_STAFF builds the offer.
  r.company.createProject('CEO',{id:'prj-exp1',business_id:vid,goal:'build minimum offer for exp1'});
  const root=r.company.issue('CEO',{project_id:'prj-exp1',assignee:'CEO',title:'計画',brief:'exp1',acceptance:'plan',dedupe_key:'root'});
  r.company.claim('CEO',root.id);r.company.submit('CEO',{task_id:root.id,summary:'s',deliverable:'plan',limitations:'l'});r.company.review('AUDITOR',{task_id:root.id,decision:'accept',reason:'ok'});
  const pd=r.company.issue('CEO',{project_id:'prj-exp1',assignee:'PRODUCT_DIRECTOR',title:'最小提供物',brief:'spec',acceptance:'key action works',parent_id:root.id,dedupe_key:'pd'});
  r.company.claim('PRODUCT_DIRECTOR',pd.id);const sub=r.company.submit('PRODUCT_DIRECTOR',{task_id:pd.id,summary:'built single web tool',deliverable:'release bundle sha',limitations:'local only'});
  r.company.review('CEO',{task_id:pd.id,decision:'accept',reason:'meets done criteria in local test'});
  const release=createHash('sha256').update('release-bundle-v1').digest('hex');
  // Owner permits publishing exactly this release to the test target.
  r.authority.provisionOwnerCredential(PASS);const s=r.authority.requireOwner(r.authority.login(PASS).token);
  r.authority.requestDecision('CEO',{id:'perm-publish',kind:'PERMISSION',venture_id:vid,subject_type:'release',subject_id:sub.artifact_id,subject_version:1,content_hash:release,title:'テスト環境へ公開',proposal:'publish release v1 to test site',
    evidence_refs:['experiment:exp1@1'],counterevidence:[],unknowns:['real demand'],expires_at:'2026-11-03T00:00:00Z',requested_grant:{operation:'publish',target:'test:landing',max_cost_yen:0,max_count:1,valid_until:'2026-11-08T00:00:00Z'}});
  const dec=r.authority.decide(s,{id:'perm-publish',decision:'approve',entity_version:1,content_hash:release,reason:'test env only',idempotency_key:'pp'});
  const job=r.queue.enqueue({id:'job-publish',venture_id:vid,task_id:pd.id,lane:'EXPLORE',dedupe_key:'publish-v1',payload:{release},external_operation_id:'op-publish'});
  r.gateway.request('PRODUCTION_STAFF',{id:'op-publish',venture_id:vid,operation:'publish',target:'test:landing',adapter_id:'local-test',grant_id:dec.grant.id,environment:'test',cost_yen:0,content_hash:release,artifact_ref:sub.artifact_id,task_id:pd.id});
  const claimed=r.queue.claim('worker-1');assert.equal(claimed.id,job.id);
  const op=await r.gateway.execute('op-publish',new LocalTestAdapter());r.queue.complete(job.id,'worker-1','op:'+op.id);
  // Test-mode usage, payment, cost, support.
  r.operations.registerProviderAccount({provider:'stripe',account_id:'acct_t',environment:'test',venture_id:vid,secret_env:'STRIPE_TEST'});
  for(const [i,kind] of [['1','customer'],['2','monitor']])r.operations.recordUsage({id:'use'+i,venture_id:vid,environment:'test',actor_kind:kind,subject_ref:'tester'+i,action:'export',key_action:true,occurred_at:'2026-11-01T00:00:00Z',source_ref:'test app'});
  const raw=JSON.stringify({id:'evt_test_1',account:'acct_t',type:'payment_intent.succeeded',livemode:false,created:1793491200,data:{object:{id:'pi_t',amount_received:1500,currency:'jpy',customer:'cus_tester'}}});
  r.operations.receive('stripe',raw,{'stripe-signature':signPayload('whsec_t',raw,Math.floor(r.clock().getTime()/1000))});
  r.operations.recordCost({id:'cost-fee',venture_id:vid,category:'fees',amount_minor:null,null_reason:'test mode has no fee',currency:'JPY',environment:'test',period_start:'2026-11-01T00:00:00Z',period_end:'2026-11-02T00:00:00Z',source_ref:'stripe test'});
  r.operations.openCase({id:'case-t',venture_id:vid,customer_ref:'cus_tester',severity:'low',summary:'test question',due_at:'2026-11-02T00:00:00Z',linked_ref:'op-publish'});
  return {r,vid,op,s};
}
test('E01 one candidate passes research -> decision -> experiment -> plan -> job -> artifact with connected IDs',async t=>{
  const {r,vid,op}=await chain(t);const L=r.lineage('exp1');
  assert.equal(L.research_runs[0].id,'run1');assert.equal(L.observations.length,4);assert.equal(L.opportunity.id,'opp1');assert.equal(L.decision.outcome,'ADOPT_FOR_LIMITED_TEST');
  assert.equal(L.experiment.locked_revision,1);assert.equal(L.venture.id,vid);assert.deepEqual(L.commercial_models.map(m=>m.id),['m1']);
  assert.equal(L.jobs[0].external_operation_id,'op-publish');assert.equal(L.external_operations[0].status,'SUCCEEDED');
  assert.ok(L.artifacts.some(a=>a.id===L.external_operations[0].artifact_ref),'released artifact links back to the accepted task output');
  assert.equal(op.environment,'test');
  assert.ok(r.ventures.venture(vid).definition.evidence_refs.includes('decision:dec'));
});
test('E02 test-mode usage, revenue, cost and support are traceable and separate from live results',async t=>{
  const {r,vid}=await chain(t);const L=r.lineage('exp1');
  assert.deepEqual(JSON.parse(JSON.stringify(L.money)),[{environment:'test',kind:'receipt',n:1,amount:1500,currency:'JPY'}]);
  assert.deepEqual(L.usage.map(u=>u.actor_kind).sort(),['customer','monitor']);assert.equal(L.cases[0].id,'case-t');
  const cc=r.operations.cashContribution({venture_id:vid,from:'2026-10-01T00:00:00Z',to:'2026-12-01T00:00:00Z'});
  assert.equal(cc.receipts_yen,0,'test payments are not live revenue');assert.equal(cc.test_events_excluded,1);
  const a=r.commercial.assessModel('m1');assert.equal(a.growth_evidence.status,'NOT_SUPPORTED');assert.equal(a.market_demand,'UNVERIFIED');
});
test('U05 from the phone API the owner can follow a candidate to its sources, counterevidence, owner and next decision',async t=>{
  const {r}=await chain(t);const c=await server(t,r);await c.login();
  const opps=(await c.call('GET','/v1/owner/opportunities')).body;assert.equal(opps[0].id,'opp1');
  const d=(await c.call('GET','/v1/owner/opportunities/opp1')).body;
  assert.equal(d.evidence.length,4);assert.ok(d.evidence.every(e=>e.source.url&&e.observed_at&&e.body.coverage));assert.ok(d.opportunity.body.counterevidence.length>0);
  assert.equal(d.assessments.length,5);
  const L=(await c.call('GET','/v1/owner/experiments/exp1/lineage')).body;assert.equal(L.external_operations[0].id,'op-publish');
  const tasks=(await c.call('GET','/v1/owner/tasks')).body.tasks;assert.ok(tasks.every(x=>x.assignee&&x.reviewer));
  const ov=(await c.call('GET','/v1/owner/overview')).body;assert.equal(ov.kpi.owner_time.status,'不明（未記録）');assert.match(ov.kpi.cash_contribution.note,/未接続/);
});
