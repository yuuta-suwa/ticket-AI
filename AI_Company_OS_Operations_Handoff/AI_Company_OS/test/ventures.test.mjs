import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Company } from '../src/company.mjs';
import { VentureLedger } from '../src/ventures.mjs';

const stamp='2026-10-24T09:00:00Z',request='a'.repeat(64);
const policy={enabled:true,gross_spend_limit_yen:10000,per_venture_limit_yen:8000,active_venture_limit:1,allowed_kinds:['research','compute'],expires_at:'2026-11-01T00:00:00Z',source_ref:'test:owner-policy'};
function fixture(t){const c=new Company(':memory:');t.after(()=>c.close());let clock=new Date(stamp);const v=new VentureLedger(c,{clock:()=>clock});return {c,v,setClock:s=>clock=new Date(s)};}
function propose(v,id='v',budget=8000){return v.propose({id,title:'合成データの事業案',hypothesis:'顧客の作業を短縮できる仮説',customer_problem:'未検証の課題',success_metric:'有料利用と実使用を確認',failure_rule:'期限までに反応がなければ見直す',budget_yen:budget,learning_deadline:'2026-10-30T00:00:00Z',evidence_refs:[]});}
function active(v){v.configurePolicy(policy);propose(v);v.activate('v');}
function reserve(v,id='o',amount=1000,venture_id='v'){return v.reserve({id,venture_id,kind:'compute',ceiling_yen:amount,target_ref:'test:provider:resource',request_hash:request});}
function begin(v,id='o'){return v.begin(id,{target_ref:'test:provider:resource',request_hash:request});}
function settle(v,id='o',amount=900,provider='test:provider:charge-1'){return v.settle(id,{actual_yen:amount,provider_ref:provider,source_ref:'test:receipt'});}

test('funding is disabled with zero limits before owner policy',t=>{const {v}=fixture(t);propose(v);assert.equal(v.status().policy.gross_spend_limit_yen,0);assert.throws(()=>v.activate('v'),/disabled/);});
test('a venture can be proposed without a fictional customer or paid order',t=>{const {v}=fixture(t);assert.equal(propose(v).state,'PROPOSED');assert.equal(v.status().funding.exposure_yen,0);});
test('hypothesis and decision rules are versioned instead of silently overwritten',t=>{const {v}=fixture(t);propose(v);assert.equal(propose(v).id,'v');assert.throws(()=>propose(v,'v',7000),/version/);});
test('active experiment limit prevents concurrent unfunded expansion',t=>{const {v}=fixture(t);active(v);propose(v,'v2');assert.throws(()=>v.activate('v2'),/Active venture limit/);});
test('per-venture exposure includes every pending reservation',t=>{const {v}=fixture(t);active(v);reserve(v,'a',5000);assert.throws(()=>reserve(v,'b',4000),/Venture funding limit/);});
test('company exposure covers multiple ventures',t=>{const {v}=fixture(t);v.configurePolicy({...policy,active_venture_limit:2});propose(v);v.activate('v');propose(v,'v2');v.activate('v2');reserve(v,'a',6000);assert.throws(()=>reserve(v,'b',5000,'v2'),/Company funding limit/);});
test('reservation replay preserves exposure and changed payload is rejected',t=>{const {v}=fixture(t);active(v);reserve(v);reserve(v);assert.equal(v.funding().held_yen,1000);assert.throws(()=>reserve(v,'o',2000),/ID conflict/);});
test('a reservation binds the target and exact request hash',t=>{const {v}=fixture(t);active(v);reserve(v);assert.throws(()=>v.begin('o',{target_ref:'test:other',request_hash:request}),/payload or target/);assert.equal(v.operation('o').status,'RESERVED');});
test('in-flight and unknown operations hold funds and block new external work',t=>{const {v}=fixture(t);active(v);reserve(v);begin(v);assert.throws(()=>reserve(v,'new'),/Reconciliation/);v.markUnknown('o','test:lost response');assert.equal(v.funding().held_yen,1000);assert.throws(()=>v.cancelUnstarted('o','test:timeout'),/Cannot release/);assert.throws(()=>reserve(v,'new'),/Reconciliation/);});
test('a timed-out external action cannot be blindly started again',t=>{const {v}=fixture(t);active(v);reserve(v);begin(v);v.markUnknown('o','test:timeout');assert.throws(()=>begin(v),/Reconciliation/);});
test('pausing blocks new spending but never blocks recording actual cost',t=>{const {v,c}=fixture(t);active(v);reserve(v);begin(v);c.pause('OWNER','test:pause');assert.throws(()=>reserve(v,'new'),/paused/);settle(v);assert.equal(v.funding().gross_recorded_spend_yen,900);});
test('stopping a venture does not erase outstanding exposure or pending bills',t=>{const {v}=fixture(t);active(v);reserve(v);begin(v);v.stop('v','test:stop');assert.equal(v.funding().held_yen,1000);settle(v);assert.equal(v.funding().gross_recorded_spend_yen,900);assert.throws(()=>reserve(v,'new'),/not active/);});
test('expired policy cannot be used but outstanding costs can still reconcile',t=>{const {v,setClock}=fixture(t);active(v);reserve(v);begin(v);setClock('2026-11-02T00:00:00Z');assert.throws(()=>reserve(v,'new'),/expired/);settle(v);assert.equal(v.funding().gross_recorded_spend_yen,900);});
test('learning deadline blocks a new attempt even while policy remains valid',t=>{const {v,setClock}=fixture(t);active(v);reserve(v);setClock('2026-10-31T00:00:00Z');assert.throws(()=>begin(v),/learning deadline/);});
test('policy changes invalidate an unstarted operation permit',t=>{const {v}=fixture(t);active(v);reserve(v);v.configurePolicy({...policy,gross_spend_limit_yen:9000});assert.throws(()=>begin(v),/Policy changed/);v.cancelUnstarted('o','test:replace permit');reserve(v,'replacement');assert.equal(begin(v,'replacement').status,'IN_FLIGHT');});
test('real cost above a reservation is recorded and freezes further spending',t=>{const {v}=fixture(t);active(v);reserve(v);begin(v);settle(v,'o',1500);assert.equal(v.funding().gross_recorded_spend_yen,1500);assert.equal(v.funding().unreviewed_overruns,1);assert.throws(()=>reserve(v,'new'),/Reconciliation/);v.reviewOverrun('o',{source_ref:'test:owner-review',corrective_action:'正しい最大額へ修正'});reserve(v,'new');assert.equal(v.funding().exposure_yen,2500);});
test('policy renewal cannot reset cumulative gross spending',t=>{const {v}=fixture(t);active(v);reserve(v,'o',8000);begin(v);settle(v,'o',8000);v.configurePolicy(policy);assert.throws(()=>reserve(v,'new',1000),/Venture funding limit/);assert.equal(v.funding().gross_recorded_spend_yen,8000);});
test('settlement is idempotent and the same provider charge is not counted twice',t=>{const {v}=fixture(t);active(v);reserve(v);begin(v);settle(v);settle(v);assert.equal(v.funding().gross_recorded_spend_yen,900);reserve(v,'second');begin(v,'second');assert.throws(()=>settle(v,'second'),/UNIQUE/);assert.equal(v.funding().gross_recorded_spend_yen,900);assert.equal(v.operation('second').status,'IN_FLIGHT');});
test('only an unstarted reservation can free its funding hold',t=>{const {v}=fixture(t);active(v);reserve(v);v.cancelUnstarted('o','test:not sent');assert.equal(v.funding().exposure_yen,0);});
test('owner cost permissions are checked before reserving',t=>{const {v}=fixture(t);active(v);assert.throws(()=>v.reserve({id:'ad',venture_id:'v',kind:'ads',ceiling_yen:1000,target_ref:'test:ad',request_hash:request}),/not permitted/);});
test('separate database connections observe the same held funding',t=>{const dir=fs.mkdtempSync(path.join(os.tmpdir(),'venture-ledger-')),file=path.join(dir,'ledger.sqlite');const a=new Company(file),b=new Company(file);t.after(()=>{a.close();b.close();fs.rmSync(dir,{recursive:true,force:true});});const v1=new VentureLedger(a,{clock:()=>new Date(stamp)}),v2=new VentureLedger(b,{clock:()=>new Date(stamp)});active(v1);reserve(v1,'one',7000);assert.throws(()=>reserve(v2,'two',2000),/Venture funding limit/);assert.equal(v2.funding().held_yen,7000);});
