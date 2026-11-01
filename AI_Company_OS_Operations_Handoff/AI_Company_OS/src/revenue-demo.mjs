import { createHash } from 'node:crypto';

// Synthetic example only. No customer, payment, sale or delivery is performed.
export function runRevenueDemo(r){
  const today=r.now().slice(0,10),soon=new Date(r.clock().getTime()+7*86400000).toISOString().slice(0,10);
  r.registerCampaign({id:'sample-campaign',domain:'simulation',source_ref:'simulation:campaign'});
  r.registerLead({id:'sample-lead',campaign_id:'sample-campaign',customer_id:'fictional-customer',source_ref:'simulation:lead'});
  r.qualifyLead('sample-lead',{problem:'新人研修の準備が繰り返し発生（架空）',existing_alternative_gap:'自社場面の練習が不足（架空）',decision_maker_confirmed:true,content_reviewer:'架空の教育担当',material_rights_confirmed:true,budget_yen:33000,planned_use_date:soon,source_ref:'simulation:interview'});
  const order=r.createOrder({id:'sample-order',lead_id:'sample-lead',total_yen:33000,scope:{theme:'初回ヒアリング',job_type:'接客',acceptance:'1テーマの教材・ロープレ・評価表を確認',agreement_ref:'simulation:scope',due_date:soon}});
  r.recordPayment({reference:'simulation-payment',order_id:order.id,amount_yen:33000,source_ref:'simulation:payment'});
  r.confirmInputs(order.id,{scope_hash:order.scope_hash,source_ref:'simulation:inputs',rights_ref:'simulation:rights'});
  r.approveProduction(order.id,{scope_hash:order.scope_hash,source_ref:'simulation:approval',expires_at:new Date(r.clock().getTime()+86400000).toISOString()});
  const job=r.startProduction(order.id);r.claimJob(job.id);
  const artifact_hash=createHash('sha256').update('simulation-document').digest('hex');
  r.attachArtifact(order.id,{scope_hash:order.scope_hash,artifact_hash,artifact_ref:'simulation:artifact'});
  r.recordFinalQA(order.id,{artifact_hash,source_ref:'simulation:qa'});
  r.recordCustomerAcceptance(order.id,{artifact_hash,source_ref:'simulation:customer-confirmation'});
  r.recordDelivery(order.id,{artifact_hash,source_ref:'simulation:delivery'});
  r.recordUsage(order.id,{use_date:today,source_ref:'simulation:usage',note:'架空ケースの使用記録'});
  r.logTime({id:'sample-acquisition',campaign_id:'sample-campaign',category:'acquisition',minutes:480,hourly_yen:2000,source_ref:'simulation:includes-unsuccessful-sales'});
  r.logTime({id:'sample-delivery',campaign_id:'sample-campaign',order_id:order.id,category:'delivery',minutes:300,hourly_yen:2000,source_ref:'simulation:delivery-work'});
  r.confirmCampaignCashCosts('sample-campaign',{amount_yen:0,source_ref:'simulation:no-cash-acquisition'});
  r.closeCampaignTime('sample-campaign','simulation:all-sales-time');
  r.closeOrderCosts(order.id,{ai_yen:2000,fees_yen:1188,other_yen:1000,source_ref:'simulation:scenario-variable-costs'});
  return {mode:'simulation',scenario:r.economics(order.id),actual_business_validation:r.validation(),notice:'模擬シナリオは実績の判定から除外しています。実際の販売と外部連携は実施していません。'};
}
