import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { Company } from '../src/company.mjs';
import { RevenueLedger } from '../src/revenue.mjs';
import { runRevenueDemo } from '../src/revenue-demo.mjs';

const stamp='2026-10-24T09:00:00.000Z',artifact=createHash('sha256').update('fixture').digest('hex');
function fixture(t,domain='real',capacity=1){
  const c=new Company(':memory:');t.after(()=>c.close());let clock=new Date(stamp);
  const r=new RevenueLedger(c,{clock:()=>clock,capacity});
  r.registerCampaign({id:'camp',domain,source_ref:'test:synthetic-campaign'});
  return {c,r,setClock:value=>clock=new Date(value)};
}
function lead(r,id='lead',customer='customer',campaign='camp'){
  r.registerLead({id,campaign_id:campaign,customer_id:customer,source_ref:'test:'+id});
  r.qualifyLead(id,{problem:'準備負担',existing_alternative_gap:'自社場面の練習が不足',decision_maker_confirmed:true,content_reviewer:'架空の確認担当',material_rights_confirmed:true,budget_yen:55000,planned_use_date:'2026-10-30',source_ref:'test:interview'});return id;
}
function order(r,id='order',lead_id='lead',price=33000){return r.createOrder({id,lead_id,total_yen:price,scope:{theme:'初回ヒアリング',job_type:'接客',acceptance:'合意した教材',agreement_ref:'test:agreement',due_date:'2026-10-29'}});}
function pay(r,o,amount=o.total_yen,ref='pay-'+o.id){return r.recordPayment({reference:ref,order_id:o.id,amount_yen:amount,source_ref:'test:'+ref});}
function authorize(r,o){r.confirmInputs(o.id,{scope_hash:o.scope_hash,source_ref:'test:inputs',rights_ref:'test:rights'});r.approveProduction(o.id,{scope_hash:o.scope_hash,source_ref:'test:approval',expires_at:'2026-10-24T15:00:00Z'});}
function ready(r){lead(r);const o=order(r);pay(r,o);authorize(r,o);return o;}
function finish(r,o,used=true){
  const j=r.startProduction(o.id);r.claimJob(j.id);r.attachArtifact(o.id,{scope_hash:o.scope_hash,artifact_hash:artifact,artifact_ref:'test:artifact'});
  r.recordFinalQA(o.id,{artifact_hash:artifact,source_ref:'test:qa'});r.recordCustomerAcceptance(o.id,{artifact_hash:artifact,source_ref:'test:customer'});r.recordDelivery(o.id,{artifact_hash:artifact,source_ref:'test:delivery'});
  if(used)r.recordUsage(o.id,{use_date:'2026-10-24',source_ref:'test:usage',note:'合成データの使用記録'});
}
function costs(r,o,minutes=300){
  r.logTime({id:'delivery-'+o.id,campaign_id:o.campaign_id,order_id:o.id,category:'delivery',minutes,hourly_yen:2000,source_ref:'test:work'});
  r.closeOrderCosts(o.id,{ai_yen:2000,fees_yen:Math.round(o.total_yen*0.036),other_yen:1000,source_ref:'test:actual-cost-fields'});
}
function closeCampaign(r,id='camp',minutes=480){
  r.logTime({id:'acquisition-'+id,campaign_id:id,category:'acquisition',minutes,hourly_yen:2000,source_ref:'test:all-sales-including-lost-leads'});
  r.closeCampaignTime(id,'test:complete');r.confirmCampaignCashCosts(id,{amount_yen:0,source_ref:'test:confirmed-zero'});
}

test('empty records never establish business success',t=>{const {r}=fixture(t);const v=r.validation();assert.equal(v.independent_paid_customers,0);assert.equal(v.portfolio_contribution_yen,null);assert.equal(v.decision,'CONTINUE_VALIDATION');assert.equal(v.business_success,'UNVERIFIED');});
test('unqualified lead cannot become an order',t=>{const {r}=fixture(t);r.registerLead({id:'lead',campaign_id:'camp',customer_id:'x',source_ref:'test:lead'});assert.throws(()=>order(r),/not qualified/);});
test('a training date outside the initial target window is unqualified',t=>{const {r}=fixture(t);lead(r);const q=r.qualification('lead').qualification;r.qualifyLead('lead',{...q,planned_use_date:'2027-02-01'});assert.equal(r.qualification('lead').qualified,false);});
test('committed-order capacity includes unpaid scoped orders',t=>{const {r}=fixture(t);lead(r);order(r);lead(r,'lead2','customer2');assert.throws(()=>order(r,'order2','lead2'),/capacity/);});
test('production needs payment, inputs and approval',t=>{const {r}=fixture(t);lead(r);const o=order(r);assert.throws(()=>r.startProduction(o.id),/approval/);authorize(r,o);assert.throws(()=>r.startProduction(o.id),/Payment/);pay(r,o);assert.equal(r.startProduction(o.id).status,'PENDING');});
test('partial payment cannot start production or dilute acquisition allocation',t=>{const {r}=fixture(t);lead(r);const o=order(r);pay(r,o,1000);authorize(r,o);assert.throws(()=>r.startProduction(o.id),/Payment/);assert.equal(r.acquisitionAllocation('camp').paid_customer_count,0);});
test('payment reference is idempotent and cannot be reused with changed amount',t=>{const {r}=fixture(t);lead(r);const o=order(r);pay(r,o);pay(r,o);assert.equal(r.paymentTotals(o.id).received,33000);assert.throws(()=>pay(r,o,1000),/conflict/);});
test('an order cannot silently change scope after creation',t=>{const {r}=fixture(t);lead(r);const o=order(r);assert.equal(order(r).id,o.id);assert.throws(()=>order(r,'order','lead',55000),/changed scope/);});
test('replayed start creates exactly one production job',t=>{const {r,c}=fixture(t);const o=ready(r);const first=r.startProduction(o.id);assert.equal(r.startProduction(o.id).id,first.id);assert.equal(c.db.prepare('SELECT COUNT(*) AS n FROM revenue_jobs').get().n,1);});
test('pause stops claims while payment reconciliation still works',t=>{const {r,c}=fixture(t);const o=ready(r);const j=r.startProduction(o.id);c.pause('OWNER','test');assert.throws(()=>r.claimJob(j.id),/paused/);r.recordPayment({reference:'refund',order_id:o.id,amount_yen:1000,kind:'refund',source_ref:'test:refund'});assert.equal(r.paymentTotals(o.id).refunded,1000);});
test('revoked approval is checked again by the worker',t=>{const {r}=fixture(t);const o=ready(r),j=r.startProduction(o.id);r.revokeProduction(o.id,'test:revoke');assert.throws(()=>r.claimJob(j.id),/revoked/);});
test('expired approval is checked again by the worker',t=>{const {r,setClock}=fixture(t);const o=ready(r),j=r.startProduction(o.id);setClock('2026-10-24T16:00:00Z');assert.throws(()=>r.claimJob(j.id),/expired/);});
test('refund between scheduling and claiming blocks production',t=>{const {r}=fixture(t);const o=ready(r),j=r.startProduction(o.id);r.recordPayment({reference:'refund',order_id:o.id,kind:'refund',amount_yen:1000,source_ref:'test:refund'});assert.throws(()=>r.claimJob(j.id),/Payment/);});
test('artifact replacement invalidates both QA and customer confirmation',t=>{const {r}=fixture(t);const o=ready(r),j=r.startProduction(o.id);r.claimJob(j.id);r.attachArtifact(o.id,{scope_hash:o.scope_hash,artifact_hash:artifact,artifact_ref:'test:a'});r.recordFinalQA(o.id,{artifact_hash:artifact,source_ref:'test:qa'});r.recordCustomerAcceptance(o.id,{artifact_hash:artifact,source_ref:'test:customer'});const b=createHash('sha256').update('changed').digest('hex');r.attachArtifact(o.id,{scope_hash:o.scope_hash,artifact_hash:b,artifact_ref:'test:b'});assert.equal(r.order(o.id).qa_hash,null);assert.throws(()=>r.recordDelivery(o.id,{artifact_hash:b,source_ref:'test:delivery'}),/current QA/);});
test('delivery and actual reported usage are distinct',t=>{const {r}=fixture(t);const o=ready(r);finish(r,o,false);assert.equal(r.validation().customers_with_usage,0);r.recordUsage(o.id,{use_date:'2026-10-24',source_ref:'test:customer-report',note:'教材を使用（テスト）'});assert.equal(r.validation().customers_with_usage,1);});
test('unknown costs stay null rather than appearing profitable',t=>{const {r}=fixture(t);const o=ready(r);finish(r,o);assert.equal(r.economics(o.id).economic_contribution_before_tax_and_fixed_costs_yen,null);assert.ok(r.economics(o.id).missing.includes('actual-variable-costs'));});
test('unsuccessful sales time is allocated to the actual paying customer',t=>{const {r}=fixture(t);const o=ready(r);finish(r,o);lead(r,'lost-lead','lost-customer');costs(r,o);closeCampaign(r);const e=r.economics(o.id);assert.equal(e.allocated_acquisition_cost_yen,16000);assert.equal(e.economic_contribution_before_tax_and_fixed_costs_yen,2812);});
test('acquisition cash costs require explicit confirmation and enter contribution',t=>{const {r}=fixture(t);const o=ready(r);finish(r,o);costs(r,o);r.closeCampaignTime('camp','test:done');assert.equal(r.economics(o.id).economic_contribution_before_tax_and_fixed_costs_yen,null);r.confirmCampaignCashCosts('camp',{amount_yen:500,source_ref:'test:cash'});assert.equal(r.economics(o.id).allocated_acquisition_cost_yen,500);});
test('refunds retain acquisition cost and are not removed from portfolio',t=>{const {r}=fixture(t);const o=ready(r);finish(r,o);costs(r,o);closeCampaign(r);r.recordPayment({reference:'full-refund',order_id:o.id,amount_yen:33000,kind:'refund',source_ref:'test:refund'});assert.equal(r.economics(o.id).allocated_acquisition_cost_yen,16000);assert.equal(r.economics(o.id).economic_contribution_before_tax_and_fixed_costs_yen,-30188);assert.equal(r.validation().refunds_yen,33000);assert.equal(r.validation().independent_paid_customers,0);});
test('unconverted campaigns remain a portfolio cost',t=>{const {r}=fixture(t);lead(r);const o=order(r,'order','lead',55000);pay(r,o);authorize(r,o);finish(r,o);costs(r,o);closeCampaign(r);r.registerCampaign({id:'failed-channel',domain:'real',source_ref:'test:channel'});closeCampaign(r,'failed-channel',60);r.confirmCampaignCashCosts('failed-channel',{amount_yen:500,source_ref:'test:cost'});assert.equal(r.validation().unallocated_acquisition_cost_yen,2500);assert.equal(r.validation().portfolio_contribution_yen,21520);});
test('repeat purchases by the same customer do not dilute original acquisition cost',t=>{const {r}=fixture(t);const a=ready(r);finish(r,a);costs(r,a);lead(r,'repeat-lead','customer');const b=order(r,'repeat-order','repeat-lead');pay(r,b);authorize(r,b);finish(r,b);costs(r,b);closeCampaign(r);assert.equal(r.acquisitionAllocation('camp').paid_customer_count,1);assert.equal(r.economics(b.id).allocated_acquisition_cost_yen,0);assert.equal(r.economics(a.id).allocated_acquisition_cost_yen,16000);assert.equal(r.validation().paid_repeat_customers,1);});
test('new time records reopen cost coverage',t=>{const {r}=fixture(t);const o=ready(r);finish(r,o);costs(r,o);closeCampaign(r);assert.equal(r.economics(o.id).cost_coverage,'OWNER_CONFIRMED');r.logTime({id:'forgotten-followup',campaign_id:'camp',category:'acquisition',minutes:30,hourly_yen:2000,source_ref:'test:late-time'});assert.equal(r.economics(o.id).cost_coverage,'INCOMPLETE');});
test('time cannot be recorded against a different campaign',t=>{const {r}=fixture(t);const o=ready(r);r.registerCampaign({id:'other',domain:'real',source_ref:'test:other'});assert.throws(()=>r.logTime({id:'bad-time',campaign_id:'other',order_id:o.id,category:'delivery',minutes:60,hourly_yen:2000,source_ref:'test:wrong'}),/another campaign/);});
test('simulated payments, usage and profit never pass real validation gates',t=>{const {c}=fixture(t);const r=new RevenueLedger(c);const demo=runRevenueDemo(r);assert.equal(demo.scenario.economic_contribution_before_tax_and_fixed_costs_yen,2812);assert.equal(demo.actual_business_validation.independent_paid_customers,0);assert.equal(demo.actual_business_validation.business_success,'UNVERIFIED');});
test('even passing operating gates is only a limited expansion candidate',t=>{const {r}=fixture(t);for(let i=1;i<=3;i++){lead(r,'lead'+i,'customer'+i);const o=order(r,'order'+i,'lead'+i,55000);pay(r,o);authorize(r,o);finish(r,o);costs(r,o,60);}lead(r,'repeat-lead','customer1');const o=order(r,'repeat-order','repeat-lead',55000);pay(r,o);authorize(r,o);finish(r,o);costs(r,o,60);closeCampaign(r,'camp',240);const v=r.validation();assert.equal(v.independent_paid_customers,3);assert.equal(v.paid_repeat_customers,1);assert.equal(v.decision,'LIMITED_EXPANSION_CANDIDATE');assert.equal(v.business_success,'UNVERIFIED');assert.equal(v.real_payment_feed_connected,false);});
test('a paid referral from a customer who used the service is a separate demand signal',t=>{const {r}=fixture(t);const first=ready(r);finish(r,first);lead(r,'referred-lead','referred-customer');const q=r.qualification('referred-lead').qualification;r.qualifyLead('referred-lead',{...q,referred_by_customer_id:'customer',referral_source_ref:'test:customer-confirmed-referral'});const second=order(r,'referred-order','referred-lead');pay(r,second);assert.equal(r.validation().paid_referred_customers,1);assert.equal(r.validation().paid_repeat_customers,0);});
test('a cancelled refunded order can close zero delivery time explicitly',t=>{const {r}=fixture(t);lead(r);const o=order(r);pay(r,o);r.recordPayment({reference:'refund',order_id:o.id,kind:'refund',amount_yen:33000,source_ref:'test:refund'});r.cancelUnfulfilledOrder(o.id,'test:cancel');r.closeOrderCosts(o.id,{ai_yen:0,fees_yen:1188,other_yen:0,source_ref:'test:known-costs',zero_delivery_reason:'制作前に取消'});closeCampaign(r);assert.equal(r.economics(o.id).economic_contribution_before_tax_and_fixed_costs_yen,-17188);});
test('referral classification is not retroactively invented after an order',t=>{const {r}=fixture(t);const first=ready(r);finish(r,first);lead(r,'lead2','customer2');const second=order(r,'second','lead2');pay(r,second);const q=r.qualification('lead2').qualification;r.qualifyLead('lead2',{...q,referred_by_customer_id:'customer',referral_source_ref:'test:added-late'});assert.equal(r.validation().paid_referred_customers,0);});
test('refund review does not erase refunded money and reopens for another refund',t=>{const {r}=fixture(t);const o=ready(r);r.recordPayment({reference:'refund-1',order_id:o.id,amount_yen:1000,kind:'refund',source_ref:'test:refund'});assert.equal(r.validation().unreviewed_refund_orders,1);r.reviewRefund(o.id,{source_ref:'test:root-cause',corrective_action:'対象範囲の説明を修正'});assert.equal(r.validation().refunds_yen,1000);assert.equal(r.validation().unreviewed_refund_orders,0);r.recordPayment({reference:'refund-2',order_id:o.id,amount_yen:1000,kind:'refund',source_ref:'test:second-refund'});assert.equal(r.validation().unreviewed_refund_orders,1);});
test('changing source materials invalidates an earlier production approval',t=>{const {r}=fixture(t);const o=ready(r);r.confirmInputs(o.id,{scope_hash:o.scope_hash,source_ref:'test:new-materials',rights_ref:'test:new-rights'});assert.equal(r.order(o.id).grant_ref,null);assert.throws(()=>r.startProduction(o.id),/approval/);});
test('late payment on a cancelled order is recorded but is not treated as a new customer',t=>{const {r}=fixture(t);lead(r);const o=order(r);r.cancelUnfulfilledOrder(o.id,'test:cancel');pay(r,o);assert.equal(r.paymentTotals(o.id).received,33000);assert.equal(r.order(o.id).status,'CANCELLED');assert.equal(r.validation().independent_paid_customers,0);});

test('qualification history preserves the original source after correction',t=>{
  const {r}=fixture(t);lead(r);
  const q=r.qualification('lead').qualification;
  r.qualifyLead('lead',{...q,problem:'訂正後の課題',source_ref:'test:corrected-interview'});
  const entries=r.evidenceHistory('lead').filter(e=>e.event_kind==='QUALIFICATION_RECORDED');
  assert.equal(entries.length,2);
  assert.equal(JSON.parse(entries[0].snapshot.lead.qualification).source_ref,'test:interview');
  assert.equal(JSON.parse(entries[1].snapshot.lead.qualification).problem,'訂正後の課題');
});
test('cost and usage corrections preserve previous evidence snapshots',t=>{
  const {r}=fixture(t);const o=ready(r);finish(r,o);costs(r,o);
  r.recordUsage(o.id,{use_date:'2026-10-24',source_ref:'test:corrected-usage',note:'利用範囲の訂正'});
  r.closeOrderCosts(o.id,{ai_yen:3000,fees_yen:1188,other_yen:1000,source_ref:'test:corrected-costs'});
  const history=r.evidenceHistory(o.id);
  const usage=history.filter(e=>e.event_kind==='CUSTOMER_USAGE_RECORDED');
  assert.equal(JSON.parse(usage[0].snapshot.order.usage).source_ref,'test:usage');
  assert.equal(JSON.parse(usage[1].snapshot.order.usage).source_ref,'test:corrected-usage');
  const costsHistory=history.filter(e=>e.event_kind==='ORDER_COSTS_CONFIRMED');
  assert.equal(JSON.parse(costsHistory[0].snapshot.order.costs).ai_yen,2000);
  assert.equal(JSON.parse(costsHistory[1].snapshot.order.costs).ai_yen,3000);
});
