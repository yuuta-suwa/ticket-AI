import { createHash } from 'node:crypto';

const check=(ok,message)=>{if(!ok)throw new Error(message);};
const text=v=>typeof v==='string'&&v.trim().length>0&&v.length<=12000;
const money=v=>Number.isSafeInteger(v)&&v>=0&&v<=1000000000;

const STREAMS=['one_time','subscription','usage','advertising','sponsorship','affiliate'];
const COST_CATEGORIES=['production','acquisition','delivery','maintenance','shared','failed_exploration','owner_time','fees'];

// Planning records only: sources are operator-declared, never proof of demand.
export class CommercialPlanner {
  constructor(ventures){
    this.ventures=ventures;this.company=ventures.company;this.db=ventures.db;
    this.db.exec('CREATE TABLE IF NOT EXISTS commercial_plans(id TEXT PRIMARY KEY,venture_id TEXT NOT NULL REFERENCES ventures(id),body TEXT NOT NULL,payload_hash TEXT NOT NULL,created_at TEXT NOT NULL)');
    // v2 business-model plans. The v1 table and assess() keep their original meaning (compatibility).
    this.db.exec('CREATE TABLE IF NOT EXISTS commercial_models(id TEXT NOT NULL,revision INTEGER NOT NULL,venture_id TEXT NOT NULL REFERENCES ventures(id),body TEXT NOT NULL,payload_hash TEXT NOT NULL,supersedes_v1 TEXT,change_reason TEXT,created_at TEXT NOT NULL,PRIMARY KEY(id,revision))');
  }
  register(input){
    check(input&&[input.id,input.venture_id,input.segment,input.problem,input.current_alternative,input.difference,input.channel,input.channel_access_basis,input.deliverable,input.acceptance,input.positioning,input.unit_basis,input.primary_metric,input.stop_rule].every(text),'Customer problem, alternative, differentiation, reachable channel, deliverable and test rules required');
    check(money(input.price_yen)&&money(input.test_budget_yen),'Explicit price and test budget required');
    check(input.variable_cost_yen===null||money(input.variable_cost_yen),'Unknown variable cost must be null');
    check(input.currency==='JPY','Prototype supports JPY only');
    check(['one_time','subscription','usage','advertising'].includes(input.monetization),'Explicit monetization required');
    check(Array.isArray(input.evidence)&&input.evidence.every(e=>e&&text(e.source_ref)&&text(e.claim)&&['public_fact','customer_report','ai_hypothesis'].includes(e.kind)),'Evidence sources and claim types required');
    check(Array.isArray(input.counterevidence)&&input.counterevidence.every(text),'Counterevidence must be explicit');
    check(text(input.observation_end)&&Number.isFinite(Date.parse(input.observation_end))&&Date.parse(input.observation_end)>this.ventures.clock().getTime(),'Future observation end required');
    const v=this.ventures.venture(input.venture_id);
    check(input.test_budget_yen<=v.definition.budget_yen,'Test exceeds venture budget');
    check(Date.parse(input.observation_end)<=Date.parse(v.definition.learning_deadline),'Observation exceeds venture deadline');
    const body={id:input.id,venture_id:input.venture_id,segment:input.segment,problem:input.problem,current_alternative:input.current_alternative,difference:input.difference,
      channel:input.channel,channel_access_basis:input.channel_access_basis,deliverable:input.deliverable,acceptance:input.acceptance,positioning:input.positioning,
      price_yen:input.price_yen,currency:input.currency,unit_basis:input.unit_basis,monetization:input.monetization,variable_cost_yen:input.variable_cost_yen,test_budget_yen:input.test_budget_yen,
      primary_metric:input.primary_metric,stop_rule:input.stop_rule,observation_end:input.observation_end,evidence:input.evidence,counterevidence:input.counterevidence};
    const raw=JSON.stringify(body),hash=createHash('sha256').update(raw).digest('hex');
    return this.company.tx(()=>{
      const old=this.db.prepare('SELECT * FROM commercial_plans WHERE id=?').get(body.id);
      if(old){check(old.payload_hash===hash,'Commercial plan changed: create a new version');return this.get(body.id);}
      this.company.guard();
      this.db.prepare('INSERT INTO commercial_plans VALUES(?,?,?,?,?)').run(body.id,body.venture_id,raw,hash,this.ventures.now());
      this.company.event('OWNER','COMMERCIAL_PLAN_RECORDED',body.id,{venture_id:body.venture_id,payload_hash:hash,verification:'operator-recorded-plan'});
      return this.get(body.id);
    });
  }
  get(id){const row=this.db.prepare('SELECT * FROM commercial_plans WHERE id=?').get(id);check(row,'Unknown commercial plan');return {...row,plan:JSON.parse(row.body)};}
  assess(id){
    const p=this.get(id).plan,v=this.ventures.venture(p.venture_id),blockers=[];
    if(!p.evidence.some(e=>e.kind!=='ai_hypothesis'))blockers.push('external-source-missing');
    if(p.variable_cost_yen===null)blockers.push('variable-cost-unknown');
    if(p.monetization==='advertising')blockers.push('advertising-yield-and-audience-model-required');
    else if(p.price_yen===0||p.variable_cost_yen!==null&&p.price_yen<=p.variable_cost_yen)blockers.push('nonpositive-unit-contribution');
    if(Date.parse(p.observation_end)<=this.ventures.clock().getTime())blockers.push('observation-window-ended');
    if(['STOPPED','EXITING','CLOSED'].includes(v.state))blockers.push('venture-stopped');
    return {plan_id:id,planning_status:blockers.length?'REVISE_PLAN':'PLANNING_COMPLETE',blockers,
      operating_readiness:this.ventures.growthReadiness(),test_execution_authorized:false,market_demand:'UNVERIFIED',profitability:'UNVERIFIED',external_execution_connected:false,
      verification:'sources-and-costs-are-operator-declared-not-independently-verified',
      note:'Planning completeness is not permission to spend, publish, contact customers, or build the full product. Acquisition and fixed costs still require separate assessment.'};
  }

  // ---- v2: revenue-model plans (SYSTEM_IMPLEMENTATION_BLUEPRINT §10) ------------------------
  /**
   * Users/viewers and payers are separate. Each revenue stream may leave its rate null with a reason.
   * Nothing here creates customers, orders or ad rates; unknowns stay null.
   */
  registerModel(input){
    check(input&&text(input.id)&&text(input.venture_id),'Model plan id and venture required');
    const v=this.ventures.venture(input.venture_id);
    check(text(input.audience_or_user)&&text(input.value_proposition)&&text(input.distribution)&&text(input.delivery),'Audience/user, value, distribution and delivery required');
    check(Array.isArray(input.payers)&&input.payers.length>0&&input.payers.every(p=>text(p.id)&&text(p.description)),'Payers must be listed separately from users');
    check(Array.isArray(input.revenue_streams)&&input.revenue_streams.length>0,'At least one revenue stream required');
    for(const r of input.revenue_streams){
      check(STREAMS.includes(r.type)&&input.payers.some(p=>p.id===r.payer_id),'Stream type and a declared payer required');
      check(text(r.currency)&&/^[A-Z]{3}$/.test(r.currency),'ISO currency required per stream');
      check(text(r.unit_basis)&&text(r.eligibility),'Unit basis and monetization eligibility required');
      check(r.rate_minor===null?text(r.rate_null_reason):money(r.rate_minor),'Rate must be a measured/declared integer (minor units) or null with reason');
      check(['declared_price','estimated','observed'].includes(r.rate_basis??'estimated'),'Invalid rate basis');
      check(['not_started','accruing','estimated','confirmed','received'].includes(r.recognition_status??'not_started'),'Invalid recognition status');
    }
    const c=input.cost_structure??{};
    check(Array.isArray(c.items)&&c.items.length>0&&c.items.every(i=>COST_CATEGORIES.includes(i.category)&&text(i.description)&&(i.amount_yen===null?text(i.null_reason):money(i.amount_yen))),'Cost items need category and amount or null with reason');
    const x=input.experiment??{};
    check(text(x.experiment_id)&&money(x.max_loss_yen)&&text(x.primary_metric)&&text(x.observation_end)&&Number.isFinite(Date.parse(x.observation_end)),'Linked experiment, maximum loss, primary metric and observation end required');
    check(x.max_loss_yen<=v.definition.budget_yen,'Maximum loss exceeds venture budget');
    check(Array.isArray(input.evidence_refs)&&Array.isArray(input.counterevidence),'Evidence references and counterevidence lists required');
    const body={venture_id:input.venture_id,audience_or_user:input.audience_or_user,payers:input.payers,value_proposition:input.value_proposition,distribution:input.distribution,delivery:input.delivery,
      revenue_streams:input.revenue_streams.map(r=>({rate_basis:'estimated',recognition_status:'not_started',cash_received_status:'none',attribution_period:null,...r})),
      cost_structure:c,experiment:x,evidence_refs:input.evidence_refs,counterevidence:input.counterevidence,supports:{monitoring:input.monitoring??null,support:input.support??null,refund_policy:input.refund_policy??null}};
    const raw=JSON.stringify(body),hash=createHash('sha256').update(raw).digest('hex');
    return this.company.tx(()=>{
      const last=this.db.prepare('SELECT * FROM commercial_models WHERE id=? ORDER BY revision DESC LIMIT 1').get(input.id);
      if(last&&last.payload_hash===hash)return this.model(input.id);
      if(last)check(text(input.change_reason),'Changing a plan needs a reason; the previous revision is kept');
      this.company.guard();
      const revision=(last?.revision??0)+1;
      this.db.prepare('INSERT INTO commercial_models VALUES(?,?,?,?,?,?,?,?)').run(input.id,revision,input.venture_id,raw,hash,input.supersedes_v1??null,input.change_reason??null,this.ventures.now());
      this.company.event('OWNER','COMMERCIAL_MODEL_RECORDED',input.id,{revision,venture_id:input.venture_id,payload_hash:hash});return this.model(input.id);
    });
  }
  /** @param {string} id @param {number|null} [revision] */
  model(id,revision=null){
    const row=revision?this.db.prepare('SELECT * FROM commercial_models WHERE id=? AND revision=?').get(id,revision):this.db.prepare('SELECT * FROM commercial_models WHERE id=? ORDER BY revision DESC LIMIT 1').get(id);
    check(row,'Unknown commercial model');return {...row,plan:JSON.parse(row.body)};
  }
  /** Four separate judgments. None of them is permission to spend or publish (§10). */
  /** @param {string} id @param {{growth?:any}} [options] */
  assessModel(id,{growth=null}={}){
    const m=this.model(id),p=m.plan,v=this.ventures.venture(p.venture_id),now=this.ventures.clock().getTime();
    const missing=[];
    for(const r of p.revenue_streams)if(r.rate_minor===null)missing.push('rate-unknown:'+r.type+':'+r.payer_id);
    for(const i of p.cost_structure.items)if(i.amount_yen===null)missing.push('cost-unknown:'+i.category);
    if(!p.evidence_refs.length)missing.push('no-evidence-refs');
    if(!p.counterevidence.length)missing.push('no-counterevidence');
    const nonJpy=[...new Set(p.revenue_streams.map(r=>r.currency).filter(c=>c!=='JPY'))];
    const completeness={status:p.evidence_refs.length&&p.counterevidence.length?'COMPLETE_WITH_UNKNOWNS':'INCOMPLETE',unknowns:missing,
      currency_note:nonJpy.length?'Funding control is JPY-only; '+nonJpy.join(',')+' streams are reported unconverted':'JPY'};
    const blockers=[];
    if(!p.evidence_refs.length)blockers.push('evidence-missing');
    if(Date.parse(p.experiment.observation_end)<=now)blockers.push('observation-window-ended');
    if(Date.parse(p.experiment.observation_end)>Date.parse(v.definition.learning_deadline))blockers.push('observation-exceeds-venture-deadline');
    if(['STOPPED','EXITING','CLOSED'].includes(v.state))blockers.push('venture-stopped');
    if(!p.supports.monitoring||!p.supports.support)blockers.push('monitoring-or-support-path-missing');
    // Unknown ad yield does NOT block a bounded value test (D04); it blocks profitability claims.
    const readiness={status:blockers.length?'NOT_READY':'READY_TO_REQUEST_LIMITED_TEST',blockers,max_loss_yen:p.experiment.max_loss_yen,
      bounded_by:'experiment.max_loss_yen within venture budget and existing funding policy',permission_issued:false};
    const operating=this.ventures.growthReadiness();
    const g=growth??{};const growthReasons=[];
    if(!(g.paying_or_monetized_units>0))growthReasons.push('no-observed-monetized-units');
    if(!(g.retained_cohorts>0))growthReasons.push('no-matured-retention-cohort');
    if(g.cash_contribution_yen===undefined||g.cash_contribution_yen===null||g.cash_contribution_yen<=0)growthReasons.push('no-positive-reconciled-cash-contribution');
    if(missing.some(x=>x.startsWith('cost-unknown')))growthReasons.push('full-costs-unknown');
    if(!operating.ready)growthReasons.push('operating-readiness-blocked');
    return {model_id:id,revision:m.revision,plan_completeness:completeness,experiment_readiness:readiness,operating_readiness:operating,
      growth_evidence:{status:growthReasons.length?'NOT_SUPPORTED':'SUPPORTS_LIMITED_EXPANSION_REVIEW',reasons:growthReasons},
      market_demand:'UNVERIFIED',profitability:growthReasons.length?'UNVERIFIED':'OBSERVED_IN_PERIOD_ONLY',test_execution_authorized:false};
  }
}
