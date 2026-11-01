import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { rt, server, PASS, funded, venture, hashOf } from './helpers.mjs';
import { LocalTestAdapter } from '../src/execution.mjs';
import { ROOT } from '../src/company.mjs';

const H=hashOf({title:'release v1'});
function permit(r,s,overrides={}){return r.authority.createGrant(s,{id:'g1',venture_id:'v1',operation:'publish',target:'test:site',content_hash:H,max_cost_yen:0,max_count:2,valid_until:'2026-11-02T00:00:00Z',idempotency_key:'k-g1',...overrides}).grant;}
function ownerSession(r){r.authority.provisionOwnerCredential(PASS);const s=r.authority.login(PASS);return r.authority.requireOwner(s.token);}

test('A01 unauthenticated requests cannot read or change owner data and get no details',async t=>{
  const r=rt(t);r.authority.provisionOwnerCredential(PASS);const c=await server(t,r);
  for(const [m,p] of [['GET','/v1/owner/overview'],['GET','/v1/owner/grants'],['GET','/v1/owner/decisions'],['POST','/v1/owner/control/pause'],['POST','/v1/owner/grants']]){
    const res=await c.call(m,p,m==='POST'?{reason:'x',idempotency_key:'k'}:undefined);
    assert.equal(res.status,401,p);assert.equal(res.body.error,'Owner authentication required');assert.equal(res.body.grants,undefined);
  }
  assert.equal(r.authority.controlStatus().paused,false);
});
test('A08/U06 body owner flags and employee ids are ignored; wrong passphrase, foreign origin and revoked sessions are rejected',async t=>{
  const r=rt(t);r.authority.provisionOwnerCredential(PASS);const c=await server(t,r);
  const fake=await c.call('GET','/v1/owner/overview',undefined,{headers:{'x-owner':'true','x-employee-id':'OWNER',cookie:'aicos_owner=forged'}});
  assert.equal(fake.status,401);
  assert.equal((await c.call('POST','/v1/owner/control/pause',{owner:true,actor:'OWNER',reason:'x',idempotency_key:'k'})).status,401);
  assert.equal((await c.login('wrong passphrase!!')).status,401);
  assert.equal((await c.call('POST','/v1/owner/login',{passphrase:PASS},{origin:'https://evil.example'})).status,403);
  assert.equal((await c.login()).status,200);
  const ok=await c.call('GET','/v1/owner/overview');assert.equal(ok.status,200);
  // A second user/device without the cookie stays outside.
  const other=await server(t,r);assert.equal((await other.call('GET','/v1/owner/overview')).status,401);
  // CSRF: a mutation with the cookie but without the token is refused.
  const csrf=c.csrf;c.csrf=null;assert.equal((await c.call('POST','/v1/owner/control/pause',{reason:'x',idempotency_key:'k1'})).status,403);c.csrf=csrf;
  // Cross-origin mutation with a valid cookie is refused.
  assert.equal((await c.call('POST','/v1/owner/control/pause',{reason:'x',idempotency_key:'k2'},{origin:'https://evil.example'})).status,403);
  r.authority.revokeAllSessions('test');assert.equal((await c.call('GET','/v1/owner/overview')).status,401);
  r.authority.provisionOwnerCredential('another long passphrase',{replace:true});
  r.advance(13*3600000);assert.equal((await c.call('GET','/v1/owner/overview')).status,401);
});
test('A08 login is rate limited after repeated failures',t=>{
  const r=rt(t);r.authority.provisionOwnerCredential(PASS);
  for(let i=0;i<5;i++)assert.throws(()=>r.authority.login('nope nope nope'),/Authentication failed/);
  assert.throws(()=>r.authority.login(PASS),/Too many/);r.advance(16*60000);assert.ok(r.authority.login(PASS).token);
});
test('A02 AI tools expose no owner operation; AI actors cannot raise budgets, bound risk or resolve obligations',async t=>{
  const src=fs.readFileSync(path.join(ROOT,'agent/lib/tools.ts'),'utf8');
  for(const forbidden of ['configurePolicy','authorizeOperatingBudget','boundUncertainty','reviewOverrun','closeOperatingService','closeOperatingBudget','ownerResume','provisionOwnerCredential','createGrant','revokeGrant','login(','requestPause','restoreDatabase'])
    assert.ok(!src.includes(forbidden),'tools.ts must not reference '+forbidden); // AI may still PAUSE (safe direction), never resume
  assert.ok(!/authority\.(?!requestDecision)/.test(src),'the only authority call available to AI is requestDecision');
  const r=rt(t);
  // Owner-only authority methods require a server session principal; an AI actor string is not one.
  assert.throws(()=>r.authority.createGrant({principal:'CEO'},{id:'x',operation:'spend',target:'t',content_hash:H,max_cost_yen:1,max_count:1,valid_until:'2026-12-01T00:00:00Z',idempotency_key:'z'}),/Owner authentication required/);
  assert.throws(()=>r.authority.decide('OWNER',{id:'d',decision:'approve',reason:'x',idempotency_key:'z'}),/Owner authentication required/);
  assert.throws(()=>r.authority.requestPause(null,{reason:'x',idempotency_key:'z'}),/Owner authentication required/);
});
test('A03 approval binds the exact version; a changed card cannot reuse the old approval',async t=>{
  const r=rt(t);const s=ownerSession(r);
  r.authority.requestDecision('CEO',{id:'d1',kind:'APPROVAL',subject_type:'experiment',subject_id:'x1',subject_version:1,content_hash:H,title:'実証開始',proposal:'限定実証',evidence_refs:['obs_1'],counterevidence:[],unknowns:['広告単価'],expires_at:'2026-11-03T00:00:00Z'});
  assert.throws(()=>r.authority.decide(s,{id:'d1',decision:'approve',entity_version:1,content_hash:hashOf('other'),reason:'ok',idempotency_key:'a'}),/Stale/);
  assert.throws(()=>r.authority.requestDecision('CEO',{id:'d1',kind:'APPROVAL',subject_type:'experiment',subject_id:'x1',subject_version:2,content_hash:hashOf('v2'),title:'実証開始',proposal:'変更',evidence_refs:[],counterevidence:[],unknowns:[],expires_at:'2026-11-03T00:00:00Z'}),/conflict/);
  const ok=r.authority.decide(s,{id:'d1',decision:'approve',entity_version:1,content_hash:H,reason:'ok',idempotency_key:'b'});assert.equal(ok.decision.status,'APPROVED');
  // Permit pinned to a content hash: different content at execution time is refused.
  funded(r);venture(r);permit(r,s);
  assert.throws(()=>r.gateway.request('PRODUCTION_STAFF',{id:'op1',venture_id:'v1',operation:'publish',target:'test:site',adapter_id:'local-test',grant_id:'g1',environment:'test',cost_yen:0,content_hash:hashOf('tampered')}),/content-changed-since-grant/);
});
test('A04 revoked or expired permits are refused immediately before execution',async t=>{
  const r=rt(t);const s=ownerSession(r);funded(r);venture(r);permit(r,s);const a=new LocalTestAdapter();
  r.gateway.request('PRODUCTION_STAFF',{id:'op1',venture_id:'v1',operation:'publish',target:'test:site',adapter_id:'local-test',grant_id:'g1',environment:'test',cost_yen:0,content_hash:H});
  r.authority.revokeGrant(s,{id:'g1',reason:'stop',idempotency_key:'r1'});
  await assert.rejects(r.gateway.execute('op1',a),/grant-revoked/);assert.equal(a.calls,0);
  permit(r,s,{id:'g2',idempotency_key:'k-g2',valid_until:'2026-11-01T01:00:00Z'});
  r.gateway.request('PRODUCTION_STAFF',{id:'op2',venture_id:'v1',operation:'publish',target:'test:site',adapter_id:'local-test',grant_id:'g2',environment:'test',cost_yen:0,content_hash:H});
  r.advance(2*3600000);await assert.rejects(r.gateway.execute('op2',a),/grant-expired/);assert.equal(a.calls,0);
});
test('A05 same idempotency key with a different payload is a conflict (owner requests and operations)',async t=>{
  const r=rt(t);const s=ownerSession(r);funded(r);venture(r);permit(r,s);
  assert.throws(()=>permit(r,s,{max_count:3}),/different payload/);
  r.gateway.request('PRODUCTION_STAFF',{id:'op1',venture_id:'v1',operation:'publish',target:'test:site',adapter_id:'local-test',grant_id:'g1',environment:'test',cost_yen:0,content_hash:H});
  assert.equal(r.gateway.request('PRODUCTION_STAFF',{id:'op1',venture_id:'v1',operation:'publish',target:'test:site',adapter_id:'local-test',grant_id:'g1',environment:'test',cost_yen:0,content_hash:H}).status,'REQUESTED');
  assert.throws(()=>r.gateway.request('PRODUCTION_STAFF',{id:'op1',venture_id:'v1',operation:'publish',target:'test:other',adapter_id:'local-test',grant_id:'g1',environment:'test',cost_yen:0,content_hash:H}),/different payload/);
});
test('A06 unknown result keeps the funding hold, restart reconciles by the same id and never re-sends',async t=>{
  const r=rt(t);const s=ownerSession(r);funded(r);venture(r);
  r.authority.createGrant(s,{id:'gs',venture_id:'v1',operation:'spend',target:'test:render',content_hash:hashOf({job:'render'}),max_cost_yen:900,max_count:1,valid_until:'2026-11-02T00:00:00Z',idempotency_key:'gs'});
  const lossy=new LocalTestAdapter('render',{failMode:'lose-response'});
  r.gateway.request('PRODUCTION_STAFF',{id:'op9',venture_id:'v1',operation:'spend',target:'test:render',adapter_id:'render',grant_id:'gs',environment:'test',cost_yen:900,cost_kind:'compute',payload:{job:'render'}});
  const op=await r.gateway.execute('op9',lossy);assert.equal(op.status,'UNKNOWN');
  assert.equal(r.ventures.funding().unknown_operations,1);assert.equal(r.ventures.funding().held_yen,900);
  await assert.rejects(r.gateway.execute('op9',lossy),/reconciled with the same id/);
  assert.throws(()=>r.gateway.request('PRODUCTION_STAFF',{id:'op10',venture_id:'v1',operation:'spend',target:'test:render',adapter_id:'render',grant_id:'gs',environment:'test',cost_yen:900,cost_kind:'compute',payload:{job:'render'}}),/grant-count-exceeded|Reconciliation required/);
  // Simulated restart: a fresh adapter instance that still knows the provider-side object.
  const restarted=new LocalTestAdapter('render');restarted.sent=lossy.sent;
  const done=await r.gateway.reconcile('op9',restarted);assert.equal(done.status,'SUCCEEDED');assert.equal(restarted.calls,0);assert.equal(lossy.calls,1);
  assert.equal(r.ventures.funding().unknown_operations,0);
});
test('A06 in-flight operations at restart become UNKNOWN, not re-queued',async t=>{
  const r=rt(t);const s=ownerSession(r);funded(r);venture(r);permit(r,s);
  r.gateway.request('PRODUCTION_STAFF',{id:'op1',venture_id:'v1',operation:'publish',target:'test:site',adapter_id:'local-test',grant_id:'g1',environment:'test',cost_yen:0,content_hash:H});
  r.company.db.prepare("UPDATE external_operations SET status='IN_FLIGHT' WHERE id='op1'").run();
  assert.deepEqual(r.gateway.recoverAfterRestart().marked_unknown,['op1']);assert.equal(r.gateway.get('op1').status,'UNKNOWN');
});
test('A09 a routine action inside an owner-approved rule runs without re-approval; outside the rule it is refused',async t=>{
  const r=rt(t);const s=ownerSession(r);funded(r);venture(r);
  r.authority.createGrant(s,{id:'reply',venture_id:'v1',operation:'support_reply',target:'test:helpdesk',content_hash:null,scope:{template:['faq-refund-policy','faq-login'],refund_yen:{max:0}},max_cost_yen:0,max_count:100,valid_until:'2026-12-01T00:00:00Z',idempotency_key:'reply'});
  const a=new LocalTestAdapter('helpdesk');
  for(let i=0;i<3;i++){r.gateway.request('SALES_OPS_STAFF',{id:'rep'+i,venture_id:'v1',operation:'support_reply',target:'test:helpdesk',adapter_id:'helpdesk',grant_id:'reply',environment:'test',cost_yen:0,payload:{template:'faq-login',n:i},scope_facts:{template:'faq-login',refund_yen:0}});
    assert.equal((await r.gateway.execute('rep'+i,a,{scope_facts:{template:'faq-login',refund_yen:0}})).status,'SUCCEEDED');}
  assert.equal(r.authority.decisions().length,0,'no new approval cards were needed');
  assert.throws(()=>r.gateway.request('SALES_OPS_STAFF',{id:'rep9',venture_id:'v1',operation:'support_reply',target:'test:helpdesk',adapter_id:'helpdesk',grant_id:'reply',environment:'test',cost_yen:0,payload:{template:'custom'},scope_facts:{template:'custom',refund_yen:500}}),/scope-violation:template.*scope-violation:refund_yen/);
});
test('A07 generated/production code paths cannot read provider secrets: connections never return secret values',async t=>{
  const r=rt(t,{env:{YOUTUBE_API_KEY:'super-secret-value',STRIPE_TEST_SECRET:'whsec_x'}});r.authority.provisionOwnerCredential(PASS);const c=await server(t,r);await c.login();
  const res=await c.call('GET','/v1/owner/connections');assert.equal(res.status,200);
  assert.ok(!JSON.stringify(res.body).includes('super-secret-value'));assert.equal(res.body.sources.find(s=>s.source_kind==='youtube').credential_present,true);
});
test('U01 double tap on approve applies once and returns the same identifiers',async t=>{
  const r=rt(t);r.authority.provisionOwnerCredential(PASS);const c=await server(t,r);await c.login();
  r.authority.requestDecision('CEO',{id:'d2',kind:'APPROVAL',subject_type:'experiment',subject_id:'x',subject_version:1,content_hash:H,title:'t',proposal:'p',evidence_refs:[],counterevidence:[],unknowns:[],expires_at:'2026-11-02T00:00:00Z'});
  const body={entity_version:1,content_hash:H,reason:'ok',idempotency_key:'tap-1'};
  const [a,b]=await Promise.all([c.call('POST','/v1/owner/decisions/d2/approve',body),c.call('POST','/v1/owner/decisions/d2/approve',body)]);
  assert.deepEqual([a.status,b.status].sort(),[200,200]);assert.deepEqual([a.body.replayed,b.body.replayed].sort(),[false,true]);
  assert.equal(r.company.db.prepare("SELECT COUNT(*) AS n FROM events WHERE kind='DECISION_APPROVED'").get().n,1);
  assert.equal(a.body.decision.id,b.body.decision.id);
});
test('U02 an approval from a stale screen is rejected after the card changed state',async t=>{
  const r=rt(t);r.authority.provisionOwnerCredential(PASS);const c=await server(t,r);await c.login();
  r.authority.requestDecision('CEO',{id:'d3',kind:'APPROVAL',subject_type:'x',subject_id:'x',subject_version:1,content_hash:H,title:'t',proposal:'p',evidence_refs:[],counterevidence:[],unknowns:[],expires_at:'2026-11-02T00:00:00Z'});
  assert.equal((await c.call('POST','/v1/owner/decisions/d3/reject',{entity_version:1,content_hash:H,reason:'no',idempotency_key:'x1'})).status,200);
  const stale=await c.call('POST','/v1/owner/decisions/d3/approve',{entity_version:1,content_hash:H,reason:'offline tap',idempotency_key:'x2'});
  assert.equal(stale.status,409);assert.equal(r.authority.decision('d3').status,'REJECTED');
});
test('U03 company stop shows receipt, worker acknowledgement, unstoppable operations and continued reconciliation',async t=>{
  const r=rt(t);r.authority.provisionOwnerCredential(PASS);const c=await server(t,r);await c.login();
  r.authority.workerHeartbeat({worker_id:'w-run',lane:'RUN'});r.authority.workerHeartbeat({worker_id:'w-gen',lane:'EXPLORE'});
  const p=await c.call('POST','/v1/owner/control/pause',{reason:'確認のため停止',idempotency_key:'p1'});assert.equal(p.status,202);assert.equal(p.body.state,'accepted');
  let s=(await c.call('GET','/v1/owner/control')).body;assert.equal(s.paused,true);assert.equal(s.all_live_workers_acknowledged,false);assert.equal(s.reconciliation_continues,true);
  r.authority.workerHeartbeat({worker_id:'w-run',lane:'RUN'});r.authority.workerHeartbeat({worker_id:'w-gen',lane:'EXPLORE'});
  s=(await c.call('GET','/v1/owner/control')).body;assert.equal(s.all_live_workers_acknowledged,true);
  // Resume requires recent re-authentication.
  r.advance(11*60000);const res=await c.call('POST','/v1/owner/control/resume',{idempotency_key:'r1'});assert.equal(res.status,401);assert.equal(res.body.code,'REAUTH_REQUIRED');
  await c.call('POST','/v1/owner/reauth',{passphrase:PASS});assert.equal((await c.call('POST','/v1/owner/control/resume',{idempotency_key:'r1'})).status,200);
});
test('U04 decisions are visible in-app without any notification; notification state never approves',async t=>{
  const r=rt(t);r.authority.provisionOwnerCredential(PASS);const c=await server(t,r);await c.login();
  r.authority.requestDecision('CEO',{id:'d4',kind:'EXCEPTION',subject_type:'x',subject_id:'x',subject_version:1,content_hash:H,title:'t',proposal:'p',evidence_refs:[],counterevidence:[],unknowns:[],expires_at:'2026-11-02T00:00:00Z'});
  const list=(await c.call('GET','/v1/owner/decisions')).body;assert.equal(list[0].status,'PENDING');
  r.advance(2*86400000);assert.equal(r.authority.decision('d4').status,'EXPIRED');
});
test('directives from the phone are stored as instructions and never create permits or budgets',async t=>{
  const r=rt(t);r.authority.provisionOwnerCredential(PASS);const c=await server(t,r);await c.login();
  r.company.createProject('CEO',{id:'p',business_id:'v1',goal:'g'});
  const task=r.company.issue('CEO',{project_id:'p',assignee:'CEO',title:'計画',brief:'b',acceptance:'a',dedupe_key:'t1'});
  const d=await c.call('POST',`/v1/owner/tasks/${task.id}/directives`,{text:'予算を10万円にして公開して',priority:'high',idempotency_key:'d1'});
  assert.equal(d.status,200);assert.equal(r.authority.grants().length,0);assert.equal(r.ventures.policy().enabled,false);
});
