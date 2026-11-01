import assert from 'node:assert/strict';
import fs from 'node:fs';
import { Company } from '../src/company.mjs';
import { VentureLedger } from '../src/ventures.mjs';
// Memory-only scenarios. No provider, customer, or real financial operation.
const results=[],hash='a'.repeat(64),target='simulation:service-hosting';
function scenario(name,run){
  const c=new Company(':memory:');let clock=new Date('2026-10-25T09:00:00Z');const v=new VentureLedger(c,{clock:()=>clock});
  try{
    v.configurePolicy({enabled:true,gross_spend_limit_yen:20000,per_venture_limit_yen:8000,active_venture_limit:1,operating_grant_limit_yen:4000,allow_isolated_run:true,allowed_kinds:['compute','hosting'],expires_at:'2026-11-01T00:00:00Z',source_ref:'simulation:owner-policy'});
    const propose=id=>v.propose({id,title:'架空の検証対象',hypothesis:'運営と探索',customer_problem:'架空の課題',success_metric:'両立',failure_rule:'不足を記録',budget_yen:8000,learning_deadline:'2026-10-26T00:00:00Z',evidence_refs:[]});
    propose('service');v.activate('service');
    v.promoteToOperating('service',{delivery_owner:'simulation:delivery',support_owner:'simulation:support',runbook_ref:'simulation:runbook',acceptance_ref:'simulation:acceptance',slo_ref:'simulation:checks',health_ttl_ms:3600000});
    v.authorizeOperatingBudget('service',{id:'protected-run',limit_yen:4000,valid_from:'2026-10-25T00:00:00Z',valid_until:'2026-10-31T00:00:00Z',allowed_kinds:['hosting'],allowed_targets:[target],source_ref:'simulation:owner-budget',isolation_ref:'simulation:isolated-resources'});
    v.recordServiceHealth('service',{id:'health',observed_at:v.now(),source_ref:'simulation:checks',slo_met:true,costs_reconciled:true,spare_capacity:true,critical_incidents:0,overdue_support:0,samples:10});
    const maintenance=()=>{
      v.reserve({id:'maintenance',venture_id:'service',lane:'RUN',grant_id:'protected-run',kind:'hosting',ceiling_yen:300,target_ref:target,request_hash:hash});
      v.begin('maintenance',{target_ref:target,request_hash:hash});
      v.settle('maintenance',{actual_yen:250,provider_ref:'simulation:hosting-invoice',source_ref:'simulation:invoice'});
    };
    results.push({scenario:name,result:'RESOLVED_IN_LOCAL_CONTROL',evidence:run({v,propose,maintenance,setClock:s=>clock=new Date(s)})});
  }finally{c.close();}
}
scenario('operating service and one new experiment coexist',({v,propose})=>{
  propose('new');v.activate('new');assert.equal(v.venture('service').state,'OPERATING');assert.equal(v.venture('new').state,'ACTIVE');
  return {service:v.venture('service').state,experiment:v.venture('new').state};
});
scenario('isolated uncertainty retains funding and permits only preapproved maintenance',({v,propose,maintenance})=>{
  propose('new');v.activate('new');
  v.reserve({id:'research',venture_id:'new',kind:'compute',ceiling_yen:500,target_ref:'simulation:research',request_hash:hash});
  v.begin('research',{target_ref:'simulation:research',request_hash:hash});v.markUnknown('research','simulation:lost-response');
  v.boundUncertainty('research',{upper_bound_yen:600,source_ref:'simulation:owner-checked-provider-cap',expires_at:'2026-10-26T00:00:00Z',allowed_run_grants:['protected-run']});
  maintenance();assert.equal(v.operation('research').status,'UNKNOWN');assert.equal(v.funding().held_yen,600);assert.equal(v.funding().exposure_yen,4600);assert.equal(v.growthReadiness().ready,false);
  return {maintenance:v.operation('maintenance').status,uncertain_cost_still_held:true,new_growth_blocked:true,funding:v.funding()};
});
scenario('maintenance uses its own operating period after the research deadline',({v,maintenance,setClock})=>{
  setClock('2026-10-28T09:00:00Z');maintenance();assert.equal(v.operation('maintenance').status,'SETTLED');
  return {research_deadline_passed:true,maintenance:v.operation('maintenance').status,stale_health_does_not_authorize_growth:!v.growthReadiness().ready};
});
const result={mode:'in-memory-local-integration',live_external_execution:false,customer_or_market_validation:false,results,caveat:'Health and provider bounds are synthetic operator records. Authentication, live monitoring, bank/provider verification and delivery are not connected.'};
if(process.argv[2])fs.writeFileSync(process.argv[2],JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result,null,2));
