// Ingest a recorded research batch into the company database and produce the deterministic evaluation + decision.
// Usage: node scripts/run-research-batch.mjs <run.json> <opportunities.json> [db-file] [out.json]
import fs from 'node:fs';
import path from 'node:path';
import { createRuntime } from '../src/runtime.mjs';
const [runFile,oppFile,dbFile,outFile]=process.argv.slice(2);
const R=JSON.parse(fs.readFileSync(runFile,'utf8')),O=JSON.parse(fs.readFileSync(oppFile,'utf8'));
const rt=createRuntime(dbFile?{file:path.resolve(dbFile)}:{});
const loc=R.run.locales[0];
try{
  const seen=new Set();
  for(const a of R.attempts){if(seen.has(a.source_kind))continue;seen.add(a.source_kind);
    rt.research.recordConnection('SYSTEMS_STAFF',a.source_kind,{status:a.status==='PARTIAL'?'PARTIAL':a.status,capabilities:a.status==='PARTIAL'?(a.source_kind==='web_search'?['search_snippets']:[]):[],adapter_id:a.adapter_id,reason:a.reason,last_success_at:a.status==='PARTIAL'?R.run.ends_at.slice(0,10)+'T00:00:00Z':null});}
  if(!rt.company.db.prepare('SELECT id FROM research_runs WHERE id=?').get(R.run.id))rt.research.startRun('RESEARCH_CHIEF',{...R.run,ends_at:new Date(Date.now()+86400000).toISOString()});
  const attempts={};
  for(const a of R.attempts){const id=R.run.id+':'+a.key;const old=rt.company.db.prepare('SELECT id FROM fetch_attempts WHERE id=?').get(id);
    attempts[a.key]=old?{id}:rt.research.recordAttempt('RESEARCH_STAFF',{id,run_id:R.run.id,locale:loc,...a});}
  const obs={};
  for(const o of R.observations){
    const existing=rt.company.db.prepare("SELECT o.id FROM observations o JOIN research_sources s ON s.id=o.source_id WHERE s.url=? AND o.run_id=?").get(o.url,R.run.id);
    obs[o.key]=existing?existing.id:rt.research.recordObservation('RESEARCH_STAFF',{attempt_id:attempts[o.attempt].id,url:o.url,platform:o.platform,operator_ref:o.operator_ref,coverage:'SEARCH_SNIPPET',
      published_at:null,published_at_null_reason:'not shown in search snippet',locale:loc,evidence_role:o.evidence_role,excerpt:o.excerpt,facts:o.facts??[],claims:o.claims??[],hypotheses:o.hypotheses??[],
      counterevidence:[],unverified:o.unverified??[],metrics:o.metrics??[],usage_terms:{storage:'summary_only',basis:'short paraphrase of a public search snippet'},origin_group_id:o.origin,origin_basis:'same operator/origin type',origin_reason:o.operator_ref}).id;}
  const out={run:rt.research.run(R.run.id),attempts:rt.research.attempts(R.run.id).map(a=>({id:a.id,source:a.body.source_kind,status:a.status,items:a.items,meaning:a.body.meaning,reason:a.body.reason})),evaluations:[]};
  for(const c of O.opportunities){
    const card=rt.research.submitOpportunity(c.actor,{id:c.id,run_id:R.run.id,target:c.target,value:c.value,why_now:c.why_now,build:c.build,delivery:c.delivery,revenue:c.revenue,cost:{},
      evidence:{observation_ids:c.evidence.map(k=>obs[k]),gaps:['full text not read','direct customer voice missing']},counterevidence:c.counterevidence.map(x=>({text:x.text,observation_ids:x.obs.map(k=>obs[k])})),
      counterevidence_search_note:c.counterevidence_search_note,gates:c.gates,domain_tags:c.domain_tags,fame_signal_only:c.fame_signal_only});
    for(const [dept,a] of Object.entries(O.assessments[c.id])){
      try{rt.research.assess(a.actor,{opportunity_id:c.id,revision:card.revision,department:dept,scores:a.scores,findings:a.findings,blockers:a.blockers,unknowns:a.unknowns,cost_view:a.cost_view});}catch(e){if(!/already recorded/.test(e.message))throw e;}}
    out.evaluations.push(rt.research.evaluateCandidate(c.id,card.revision));
  }
  const D=O.decision;
  out.decision=rt.research.decide(D.actor,{id:D.id,candidates:out.evaluations.map(e=>({id:e.opportunity_id,revision:e.revision})),outcome:D.outcome,rationale:D.rationale,next_questions:D.next_questions});
  out.connections=rt.research.connections().map(c=>({source:c.source_kind,status:c.status}));
  const text=JSON.stringify(out,null,2);if(outFile)fs.writeFileSync(outFile,text);console.log(text);
}finally{rt.close();}
