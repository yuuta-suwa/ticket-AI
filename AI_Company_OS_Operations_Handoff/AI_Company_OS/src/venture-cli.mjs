import fs from 'node:fs';
import { Company } from './company.mjs';
import { VentureLedger } from './ventures.mjs';

// Trusted local-owner interface. Never connect these operations directly to an LLM or HTTP.
const company=new Company();
try{
  const ledger=new VentureLedger(company),command=process.argv[2]??'status';
  if(command==='status')console.log(JSON.stringify(ledger.status(),null,2));
  else{
    const input=JSON.parse(fs.readFileSync(0,'utf8'));
    const operations={policy:()=>ledger.configurePolicy(input),propose:()=>ledger.propose(input),activate:()=>ledger.activate(input.id),
      reserve:()=>ledger.reserve(input),begin:()=>ledger.begin(input.id,input),unknown:()=>ledger.markUnknown(input.id,input.reason),
      cancel:()=>ledger.cancelUnstarted(input.id,input.reason),settle:()=>ledger.settle(input.id,input),review:()=>ledger.reviewOverrun(input.id,input),stop:()=>ledger.stop(input.id,input.reason),
      operate:()=>ledger.promoteToOperating(input.id,input),run_budget:()=>ledger.authorizeOperatingBudget(input.venture_id,input),
      health:()=>ledger.recordServiceHealth(input.venture_id,input),risk_bound:()=>ledger.boundUncertainty(input.id,input),
      close_budget:()=>ledger.closeOperatingBudget(input.id,input.source_ref),close_service:()=>ledger.closeOperatingService(input.id,input.source_ref)};
    if(!Object.hasOwn(operations,command))throw new Error('Unknown local-owner command');
    console.log(JSON.stringify(operations[command](),null,2));
  }
}catch(error){console.error(error.message);process.exitCode=1;}finally{company.close();}
