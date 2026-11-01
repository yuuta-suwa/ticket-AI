import { funded } from './helpers.mjs';
const loc={language:'en',region:'US'};
export function runFixture(r,{limits={max_items:20,max_pages:10,max_cost_yen:0},sources=['youtube','instagram','reddit','web_search','app_reviews','competitor_pages']}={}){
  return r.research.startRun('RESEARCH_CHIEF',{id:'run1',question:'英語圏の個人が繰り返し困っている作業は何か',locales:[loc],sources,queries:['q1'],limits,ends_at:'2026-11-08T00:00:00Z'});
}
export function attempt(r,over={}){return r.research.recordAttempt('RESEARCH_STAFF',{run_id:'run1',source_kind:'web_search',status:'AVAILABLE',items:3,pages:1,cost_yen:0,query:'q1',locale:loc,...over});}
export function obs(r,a,over={}){return r.research.recordObservation('RESEARCH_STAFF',{attempt_id:a.id,url:'https://example.com/post/1',coverage:'FULL_TEXT',published_at:'2026-10-01T00:00:00Z',locale:loc,evidence_role:'customer_voice',
  excerpt:'I spend hours every week doing X by hand',facts:['author describes manual work'],claims:[],hypotheses:['tool could save time'],counterevidence:[],unverified:['willingness to pay'],
  usage_terms:{storage:'excerpt',basis:'short quote of public post'},...over});}

export function candidate(r,id='opp1',over={}){
  runFixture(r);const a=attempt(r,{items:6});
  const voice=obs(r,a,{url:'https://forum.example/t/1'});
  const alt=obs(r,a,{url:'https://competitor.example/pricing',evidence_role:'alternative_or_spend',facts:['competitor charges $9/mo'],platform:'competitor_pages'});
  const chan=obs(r,a,{url:'https://forum.example/t/2',evidence_role:'channel_or_behavior',facts:['users ask for recommendations in this forum']});
  const counter=obs(r,a,{url:'https://forum.example/t/3',evidence_role:'counterevidence',facts:['several users say a spreadsheet is enough']});
  const opp=r.research.submitOpportunity('MARKETING_DIRECTOR',{id,run_id:'run1',target:{country:'US',language:'en',user:'freelancers',payer:'freelancers',scene:'monthly invoicing'},
    value:{problem_or_desire:'manual work',alternative:'spreadsheet / competitor at $9',difference:'one-step',value_type:'time_saving'},evidence:{observation_ids:[voice.id,alt.id,chan.id,counter.id],gaps:['purchase intent unobserved']},
    why_now:{observed:'competitor raised price',inferred:'AI lowers build cost'},build:{minimum_offer:'single web tool',out_of_scope:['mobile app'],done_criteria:'user completes key action'},
    delivery:{channel:'community answer + landing page',access_basis:'public forum allows links in answers (unverified for promo)',permissions_needed:['publish landing page']},
    revenue:{streams:[{type:'one_time',payer:'freelancers',rate:null}]},cost:{build_hours:10},counterevidence:[{text:'spreadsheet is enough for many',observation_ids:[counter.id]}],
    gates:{domain:'clear',rights:'confirmed',cost_bounded:true,deliverable:true},domain_tags:['productivity'],...over});
  return {opp,o:voice};
}
export function assessAll(r,id='opp1',rev=1,overrides={}){
  const base={opportunity_id:id,revision:rev,findings:'ok',blockers:[],unknowns:['purchase intent']};
  const s=v=>({value:v,basis:'see observations'});
  r.research.assess('MARKETING_DIRECTOR',{...base,department:'MARKETING',scores:{demand_value:s(2),reachability:s(1)},...overrides.MARKETING});
  r.research.assess('PRODUCT_DIRECTOR',{...base,department:'PRODUCT',scores:{buildability:s(3),maintenance_load:s(2)},...overrides.PRODUCT});
  r.research.assess('FINANCE_DIRECTOR',{...base,department:'FINANCE',scores:{revenue_structure:{value:null,basis:'price untested'}},...overrides.FINANCE});
  r.research.assess('SUPPORT_DIRECTOR',{...base,department:'SUPPORT',scores:{maintenance_load:s(2)},...overrides.SUPPORT});
  r.research.assess('AUDITOR',{...base,department:'AUDIT',scores:{},...overrides.AUDIT});
}
export function experimentFixture(r){
  candidate(r);assessAll(r);
  r.research.decide('STRATEGY_DIRECTOR',{id:'dec',candidates:[{id:'opp1',revision:1}],selected:{id:'opp1',revision:1},rationale:'eligible',next_questions:[]});
  return r.research.defineExperiment('STRATEGY_DIRECTOR',{id:'exp1',decision_id:'dec',opportunity_id:'opp1',opportunity_revision:1,target:'US freelancers',value:'faster invoicing',riskiest_hypothesis:'they complete the key action and pay',
    minimum_offer:'single web tool',primary_metric:{id:'PAID_CONVERSION',definition:'paid / visitors who completed key action',numerator:'paid users',denominator:'key-action users',threshold:0.05,direction:'>='},
    min_sample:40,starts_at:'2026-11-01T00:00:00Z',ends_at:'2026-11-29T00:00:00Z',max_cost_yen:3000,max_count:1,observations_needed:['key action events','payments','costs','support'],permissions_needed:['publish landing page'],
    stop_rules:{quality:'any data-loss bug',funding:'reserved+actual > max_cost_yen'},decision_rules:{continue:'metric met and contribution >= 0',improve:'key action ok but conversion low',exit:'key action not completed by >50%'}});
}
