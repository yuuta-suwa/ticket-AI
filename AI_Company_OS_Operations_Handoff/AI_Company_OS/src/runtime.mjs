import path from 'node:path';
import { Company, ROOT } from './company.mjs';
import { VentureLedger } from './ventures.mjs';
import { CommercialPlanner } from './commercial.mjs';
import { RevenueLedger } from './revenue.mjs';
import { OwnerAuthority } from './authority.mjs';
import { ExecutionGateway } from './execution.mjs';
import { ResearchDesk } from './research.mjs';
import { OperationsLedger } from './operations.mjs';
import { JobQueue } from './jobs.mjs';
import { KnowledgeBase } from './knowledge.mjs';

// One company database is the single business record. Every module shares it (no parallel ledgers).
export function createRuntime({file=path.join(ROOT,'data/company.sqlite'),clock=()=>new Date(),env=process.env,jobs={}}={}){
  const company=new Company(file);
  const ventures=new VentureLedger(company,{clock});
  const commercial=new CommercialPlanner(ventures);
  const revenue=new RevenueLedger(company,{clock});
  const authority=new OwnerAuthority(company,{clock});
  const research=new ResearchDesk(company,{ventures,clock,env});
  const operations=new OperationsLedger(company,{ventures,clock,env});
  const queue=new JobQueue(company,{clock,...jobs});
  const knowledge=new KnowledgeBase(company,{clock,research});
  const gateway=new ExecutionGateway({company,ventures,authority,clock});
  const rt={company,ventures,commercial,revenue,authority,research,operations,queue,knowledge,gateway,clock,close:()=>company.close()};
  rt.lineage=experimentId=>lineage(rt,experimentId);
  rt.overview=()=>overview(rt);
  rt.exitObligations=id=>exitObligations(rt,id);
  /** Close an exiting service only when customer, contract, refund, data and cost obligations are cleared (O08). */
  rt.closeService=(id,source_ref)=>{const o=exitObligations(rt,id);if(!o.clear)throw new Error('Exit obligations remain: '+o.open.join(', '));return ventures.closeOperatingService(id,source_ref);};
  return rt;
}

/** Walk the identifier chain of one experiment so every screen can go back to its evidence (E01). */
export function lineage(rt,experimentId){
  const {research,ventures,commercial,gateway,queue,operations,company}=rt;
  const x=research.experiment(experimentId);const dec=research.selection(x.body.decision_id);
  const opp=research.opportunity(x.body.opportunity_id,x.body.opportunity_revision);
  const obs=opp.body.evidence.observation_ids.map(id=>research.observation(id));
  const runIds=[...new Set(obs.map(o=>o.run_id))];
  const ventureId=x.state.venture_id;
  const models=ventureId?company.db.prepare('SELECT id,revision FROM commercial_models WHERE venture_id=? ORDER BY id,revision').all(ventureId):[];
  const ops=ventureId?gateway.list().filter(o=>o.venture_id===ventureId):[];
  const jobs=ventureId?company.db.prepare('SELECT id,lane,state,task_id,external_operation_id,result_ref FROM jobs WHERE venture_id=?').all(ventureId):[];
  const projects=ventureId?company.db.prepare('SELECT id FROM projects WHERE business_id=?').all(ventureId).map(p=>p.id):[];
  const tasks=projects.length?company.db.prepare(`SELECT id,title,status,assignee FROM tasks WHERE project_id IN (${projects.map(()=>'?').join(',')})`).all(...projects):[];
  const artifacts=tasks.length?company.db.prepare(`SELECT id,task_id,version,mode FROM artifacts WHERE task_id IN (${tasks.map(()=>'?').join(',')})`).all(...tasks.map(t=>t.id)):[];
  const money=ventureId?company.db.prepare('SELECT environment,kind,COUNT(*) AS n,SUM(amount_minor) AS amount,currency FROM money_transactions WHERE venture_id=? GROUP BY environment,kind,currency').all(ventureId):[];
  const usage=ventureId?company.db.prepare('SELECT environment,actor_kind,COUNT(*) AS n FROM usage_events WHERE venture_id=? GROUP BY environment,actor_kind').all(ventureId):[];
  const costs=ventureId?company.db.prepare('SELECT environment,category,COUNT(*) AS n,SUM(amount_minor) AS known_minor,SUM(CASE WHEN amount_minor IS NULL THEN 1 ELSE 0 END) AS unknown FROM cost_entries WHERE venture_id=? GROUP BY environment,category').all(ventureId):[];
  return {
    research_runs:runIds.map(id=>({id,status:research.run(id).status,attempts:research.attempts(id).map(a=>({id:a.id,source:a.body.source_kind,status:a.status,items:a.items,meaning:a.body.meaning}))})),
    observations:obs.map(o=>({id:o.id,source_id:o.source_id,origin_group_id:o.source.origin_group_id,platform:o.source.platform,url:o.source.url,coverage:o.body.coverage,role:o.body.evidence_role,version:o.version})),
    opportunity:{id:opp.id,revision:opp.revision,content_hash:opp.content_hash},
    decision:{id:dec.id,outcome:dec.body.outcome,decided_by:dec.body.decided_by},
    experiment:{id:x.id,locked_revision:x.state.locked_revision,latest_revision:x.revision,status:x.state.status},
    venture:ventureId?{id:ventureId,state:ventures.venture(ventureId).state}:null,
    commercial_models:models,tasks,artifacts,jobs,
    external_operations:ops.map(o=>({id:o.id,operation:o.operation,environment:o.environment,status:o.status,provider_object_id:o.provider_object_id,artifact_ref:o.artifact_ref})),
    money,usage,costs,cases:ventureId?operations.cases(ventureId).map(c=>({id:c.id,status:c.status,overdue:c.overdue,severity:c.severity})):[],
    results:research.results(experimentId).map(r=>({id:r.id,verdict:r.body.verdict}))};
}

export function exitObligations(rt,id){
  const {company,operations,ventures}=rt;const open=[];
  const cases=operations.cases(id).filter(c=>c.status!=='RESOLVED');if(cases.length)open.push('support-cases:'+cases.length);
  const subs=company.db.prepare("SELECT COUNT(*) AS n FROM subscriptions WHERE venture_id=? AND environment='live' AND status IN ('active','trialing','past_due')").get(id).n;if(subs)open.push('active-subscriptions:'+subs);
  const ops=company.db.prepare("SELECT COUNT(*) AS n FROM external_operations WHERE venture_id=? AND status IN ('REQUESTED','IN_FLIGHT','UNKNOWN')").get(id).n;if(ops)open.push('uncertain-external-operations:'+ops);
  const f=ventures.funding(id);if(f.held_yen)open.push('funding-held:'+f.held_yen);if(f.unreviewed_overruns)open.push('unreviewed-overruns');
  const unknownCosts=company.db.prepare('SELECT COUNT(*) AS n FROM cost_entries WHERE venture_id=? AND amount_minor IS NULL').get(id).n;if(unknownCosts)open.push('unknown-costs:'+unknownCosts);
  return {venture_id:id,clear:open.length===0,open};
}

export function overview(rt){
  const {company,ventures,authority,research,operations,queue,gateway,knowledge}=rt;
  const v=ventures.status();
  const live=company.db.prepare("SELECT kind,currency,SUM(amount_minor) AS amount FROM money_transactions WHERE environment='live' GROUP BY kind,currency").all();
  const services=company.db.prepare("SELECT venture_id FROM operating_services").all().map(s=>s.venture_id);
  const ownerMinutes=company.db.prepare("SELECT COALESCE(SUM(minutes),0) AS m,COUNT(*) AS n FROM cost_entries WHERE category='owner_time' AND environment='live'").get();
  return {generated_at:rt.clock().toISOString(),
    company:{paused:authority.controlStatus().paused,organization:company.status('CEO').organization},
    kpi:{cash_contribution:{live_transactions:live,note:live.length?'live provider records':'未接続（本番の支払記録なし）'},
      service_health:{obligated_services:services.length,growth_readiness:v.growth_readiness},
      owner_time:{minutes:ownerMinutes.n?ownerMinutes.m:null,status:ownerMinutes.n?'recorded':'不明（未記録）'}},
    funding:{policy:v.policy,funding:v.funding,bank_balance_connected:false},
    pending_decisions:authority.decisions({status:'PENDING'}).length,
    grants:authority.grants().map(g=>({id:g.id,status:g.status,operation:g.body.operation,target:g.body.target})),
    ventures:v.ventures.map(x=>({id:x.id,state:x.state})),
    opportunities:research.opportunities().map(o=>({id:o.id,revision:o.revision,recommendation:research.evaluateCandidate(o.id,o.revision).recommendation})),
    connections:research.connections().map(c=>({source:c.source_kind,label:c.label,status:c.status})),
    external_operations:gateway.list().reduce((m,o)=>{m[o.status]=(m[o.status]??0)+1;return m;},{}),
    jobs:queue.capacity(),
    support:operations.cases().filter(c=>c.status!=='RESOLVED').length,
    knowledge:knowledge.all().map(k=>({id:k.id,status:k.status})),
    data_labels:{synthetic:'デモ',not_connected:'未接続',unknown:'不明'}};
}
