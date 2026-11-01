import fs from 'node:fs';
import { Company } from './company.mjs';
import { RevenueLedger } from './revenue.mjs';
import { runRevenueDemo } from './revenue-demo.mjs';
const command=process.argv[2]??'status';
const company=new Company(command==='demo'?':memory:':undefined);
try{
  const revenue=new RevenueLedger(company);let result;
  if(command==='demo') result=runRevenueDemo(revenue);
  else if(command==='status') result=revenue.validation();
  else{
    const input=JSON.parse(fs.readFileSync(0,'utf8'));
    const operations={
      history:()=>revenue.evidenceHistory(input.entity_id),
      campaign:()=>revenue.registerCampaign(input),lead:()=>revenue.registerLead(input),
      qualify:()=>revenue.qualifyLead(input.id,input.qualification),order:()=>revenue.createOrder(input),
      payment:()=>revenue.recordPayment(input),inputs:()=>revenue.confirmInputs(input.order_id,input),
      approve:()=>revenue.approveProduction(input.order_id,input),revoke:()=>revenue.revokeProduction(input.order_id,input.reason),
      start:()=>revenue.startProduction(input.order_id),claim:()=>revenue.claimJob(input.job_id),
      artifact:()=>revenue.attachArtifact(input.order_id,input),qa:()=>revenue.recordFinalQA(input.order_id,input),
      accept:()=>revenue.recordCustomerAcceptance(input.order_id,input),deliver:()=>revenue.recordDelivery(input.order_id,input),
      usage:()=>revenue.recordUsage(input.order_id,input),time:()=>revenue.logTime(input),
      campaign_time:()=>revenue.closeCampaignTime(input.campaign_id,input.source_ref),
      campaign_costs:()=>revenue.confirmCampaignCashCosts(input.campaign_id,input),
      order_costs:()=>revenue.closeOrderCosts(input.order_id,input),economics:()=>revenue.economics(input.order_id),
      cancel:()=>revenue.cancelUnfulfilledOrder(input.order_id,input.reason),
      refund_review:()=>revenue.reviewRefund(input.order_id,input)
    };
    if(!Object.hasOwn(operations,command))throw new Error('Unknown local-owner operation');result=operations[command]();
  }
  console.log(JSON.stringify(result??{recorded:true},null,2));
}catch(e){console.error(e.message);process.exitCode=1;}finally{company.close();}
