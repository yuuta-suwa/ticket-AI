import { createHash, randomUUID } from 'node:crypto';

// Market research -> source/observation -> opportunity revision -> department assessments -> decision -> experiment contract.
// Everything here is a business record. Observations are DATA: imperative text inside them never changes authority.
const check=(ok,message,code='REJECTED')=>{if(!ok){const e=new Error(message);e.code=code;throw e;}};
const filled=(v,max=12000)=>typeof v==='string'&&v.trim().length>0&&v.length<=max;
const sha=v=>createHash('sha256').update(typeof v==='string'?v:JSON.stringify(v)).digest('hex');
const isoOrNull=v=>v===null||(filled(v,64)&&Number.isFinite(Date.parse(v)));
const list=v=>Array.isArray(v)?v:[];

// Source catalog: capabilities are per source, never a single "connected" flag (SYSTEM §7).
export const SOURCE_CATALOG={
  youtube:{label:'YouTube',capabilities:['search','video_metadata','comments','captions','public_metrics','own_analytics'],official_route:'YouTube Data API v3 (API key / OAuth)',env:'YOUTUBE_API_KEY'},
  instagram:{label:'Instagram',capabilities:['hashtag_search','business_discovery','own_insights'],official_route:'Instagram Graph API (Meta app review, professional account)',env:'INSTAGRAM_ACCESS_TOKEN'},
  tiktok:{label:'TikTok',capabilities:['research_api_search','own_analytics'],official_route:'TikTok Research / Display API (application required)',env:'TIKTOK_ACCESS_TOKEN'},
  x:{label:'X',capabilities:['recent_search','post_metrics'],official_route:'X API (paid tier)',env:'X_BEARER_TOKEN'},
  threads:{label:'Threads',capabilities:['keyword_search','own_insights'],official_route:'Threads API (Meta)',env:'THREADS_ACCESS_TOKEN'},
  reddit:{label:'Reddit',capabilities:['search','post_text','comments'],official_route:'Reddit Data API (OAuth app)',env:'REDDIT_CLIENT_ID'},
  quora_forums:{label:'Quora・公開フォーラム',capabilities:['page_text'],official_route:'公開ページ（利用規約の範囲）',env:null},
  web_search:{label:'検索エンジン',capabilities:['search_snippets'],official_route:'検索API またはエージェントのWeb検索',env:null},
  search_trends:{label:'検索動向',capabilities:['relative_interest'],official_route:'Google Trends（相対値。顧客数ではない）',env:null},
  app_reviews:{label:'App Store・Google Play レビュー',capabilities:['review_text','ratings'],official_route:'公開ページ/公式フィード',env:null},
  product_reviews:{label:'EC・ソフト・サービスのレビュー',capabilities:['review_text','ratings'],official_route:'公開ページ（G2/Capterra/Amazon等）',env:null},
  competitor_pages:{label:'競合の公式商品・価格ページ',capabilities:['page_text','prices'],official_route:'公開ページ',env:null},
  launches_research:{label:'新製品・公式発表・研究・開発者情報',capabilities:['page_text'],official_route:'公開ページ・GitHub API',env:null},
  public_statistics:{label:'公的統計',capabilities:['datasets'],official_route:'政府統計API等',env:null},
  own_data:{label:'自社の問い合わせ・利用・収支',capabilities:['usage','support','revenue','costs'],official_route:'業務正本（本書の operations）',env:null},
};
export const CONNECTION_STATES=['AVAILABLE','PARTIAL','AUTH_REQUIRED','RATE_LIMITED','FAILED','NOT_CONNECTED','UNSUPPORTED'];
export const COVERAGE=['SEARCH_SNIPPET','METADATA_ONLY','FULL_TEXT','VIDEO_SEGMENT','TRANSCRIPT','COMMENTS_SAMPLE','COMMENTS_ALL','OPERATOR_PROVIDED'];
export const VALUE_TYPES=['problem','fun','learning','information','creation','time_saving'];
export const EVIDENCE_ROLES=['customer_voice','alternative_or_spend','channel_or_behavior','change_signal','counterevidence','competitor_fact'];
const DIMENSIONS=['demand_value','reachability','buildability','revenue_structure','maintenance_load','uniqueness','reuse','mission_fit'];
const DEPARTMENTS={MARKETING:'MARKETING',PRODUCT:'PRODUCT',FINANCE:'FINANCE',SUPPORT:'SUPPORT',AUDIT:'AUDIT'};
const INJECTION=[/ignore (all )?(previous|prior) instructions/i,/system prompt/i,/(api|secret|private)[ _-]?key/i,/password/i,/(grant|give|raise|increase).{0,30}(permission|budget|limit|access)/i,
  /権限|予算.{0,6}(増|上げ)|鍵を?送|パスワード|指示を無視|送金|振り?込/];

export class ResearchDesk {
  constructor(company,{ventures=null,clock=()=>new Date(),env=process.env}={}){
    this.company=company;this.db=company.db;this.ventures=ventures;this.clock=clock;this.env=env;
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS source_connections(source_kind TEXT PRIMARY KEY,body TEXT NOT NULL,updated_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS research_policy(version INTEGER PRIMARY KEY AUTOINCREMENT,body TEXT NOT NULL,created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS research_runs(id TEXT PRIMARY KEY,project_id TEXT,body TEXT NOT NULL,status TEXT NOT NULL,stop_reason TEXT,created_by TEXT NOT NULL,created_at TEXT NOT NULL,closed_at TEXT);
      CREATE TABLE IF NOT EXISTS fetch_attempts(id TEXT PRIMARY KEY,run_id TEXT NOT NULL REFERENCES research_runs(id),body TEXT NOT NULL,status TEXT NOT NULL,items INTEGER NOT NULL,pages INTEGER NOT NULL,cost_yen INTEGER,created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS origin_groups(id TEXT PRIMARY KEY,body TEXT NOT NULL,created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS research_sources(id TEXT PRIMARY KEY,platform TEXT NOT NULL,canonical_key TEXT NOT NULL,url TEXT,external_id TEXT,operator_ref TEXT,origin_group_id TEXT NOT NULL REFERENCES origin_groups(id),
        published_at TEXT,published_at_status TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'LIVE',created_at TEXT NOT NULL,UNIQUE(platform,canonical_key));
      CREATE TABLE IF NOT EXISTS observations(id TEXT PRIMARY KEY,source_id TEXT NOT NULL REFERENCES research_sources(id),attempt_id TEXT NOT NULL REFERENCES fetch_attempts(id),run_id TEXT NOT NULL,
        version INTEGER NOT NULL,body TEXT NOT NULL,content_hash TEXT NOT NULL,observed_at TEXT NOT NULL,created_by TEXT NOT NULL,UNIQUE(source_id,version));
      CREATE TABLE IF NOT EXISTS source_changes(id TEXT PRIMARY KEY,source_id TEXT NOT NULL,body TEXT NOT NULL,created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS reverification_items(id TEXT PRIMARY KEY,subject_type TEXT NOT NULL,subject_id TEXT NOT NULL,source_id TEXT NOT NULL,reason TEXT NOT NULL,status TEXT NOT NULL,created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS opportunities(id TEXT NOT NULL,revision INTEGER NOT NULL,run_id TEXT,body TEXT NOT NULL,content_hash TEXT NOT NULL,created_by TEXT NOT NULL,created_at TEXT NOT NULL,PRIMARY KEY(id,revision));
      CREATE TABLE IF NOT EXISTS opportunity_assessments(id TEXT PRIMARY KEY,opportunity_id TEXT NOT NULL,revision INTEGER NOT NULL,department TEXT NOT NULL,actor TEXT NOT NULL,body TEXT NOT NULL,created_at TEXT NOT NULL,UNIQUE(opportunity_id,revision,department));
      CREATE TABLE IF NOT EXISTS selection_decisions(id TEXT PRIMARY KEY,body TEXT NOT NULL,content_hash TEXT NOT NULL,created_by TEXT NOT NULL,created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS experiment_contracts(id TEXT NOT NULL,revision INTEGER NOT NULL,body TEXT NOT NULL,content_hash TEXT NOT NULL,change_reason TEXT,created_by TEXT NOT NULL,created_at TEXT NOT NULL,PRIMARY KEY(id,revision));
      CREATE TABLE IF NOT EXISTS experiment_state(id TEXT PRIMARY KEY,locked_revision INTEGER,venture_id TEXT,started_at TEXT,status TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS experiment_results(id TEXT PRIMARY KEY,experiment_id TEXT NOT NULL,body TEXT NOT NULL,created_at TEXT NOT NULL);
    `);
  }
  now(){return this.clock().toISOString();}
  ms(){return this.clock().getTime();}
  ev(actor,kind,id,body={}){this.company.event(actor,kind,id,body);}

  // ---- Connections ------------------------------------------------------------
  /** Systems role records the observed connection state per source. Unknown sources default to NOT_CONNECTED. */
  recordConnection(actor,source_kind,input){
    this.company.employee(actor);check(SOURCE_CATALOG[source_kind],'Unknown source kind');check(CONNECTION_STATES.includes(input.status),'Invalid connection status');
    check(Array.isArray(input.capabilities)&&input.capabilities.every(c=>SOURCE_CATALOG[source_kind].capabilities.includes(c)),'Capabilities must be declared per source');
    const body={status:input.status,capabilities:input.capabilities,adapter_id:input.adapter_id??null,account_scope:input.account_scope??null,limits:input.limits??null,
      cost_basis:input.cost_basis??null,retention_policy:input.retention_policy??null,reason:input.reason??null,last_success_at:input.last_success_at??null,checked_by:actor};
    this.db.prepare('INSERT OR REPLACE INTO source_connections VALUES(?,?,?)').run(source_kind,JSON.stringify(body),this.now());
    this.ev(actor,'SOURCE_CONNECTION_RECORDED',source_kind,{status:body.status});return this.connection(source_kind);
  }
  connection(source_kind){
    const c=SOURCE_CATALOG[source_kind];check(c,'Unknown source kind');
    const row=this.db.prepare('SELECT * FROM source_connections WHERE source_kind=?').get(source_kind);
    const recorded=row?JSON.parse(row.body):null;
    const credentialPresent=c.env?!!this.env[c.env]:null;
    return {source_kind,label:c.label,official_route:c.official_route,declared_capabilities:c.capabilities,
      status:recorded?.status??(c.env&&!credentialPresent?'AUTH_REQUIRED':'NOT_CONNECTED'),available_capabilities:recorded?.capabilities??[],
      credential_env:c.env,credential_present:credentialPresent,updated_at:row?.updated_at??null,detail:recorded};
  }
  connections(){return Object.keys(SOURCE_CATALOG).map(k=>this.connection(k));}

  // ---- Owner policy (prohibited domains). Set through the trusted owner path only. ----
  configurePolicy(input){
    check(Array.isArray(input.prohibited_domains)&&input.prohibited_domains.every(v=>filled(v,200)),'Prohibited domains list required');
    check(filled(input.source_ref),'Owner source required');
    const body={prohibited_domains:input.prohibited_domains,max_parallel_experiments:input.max_parallel_experiments??1,source_ref:input.source_ref};
    this.db.prepare('INSERT INTO research_policy(body,created_at) VALUES(?,?)').run(JSON.stringify(body),this.now());this.ev('OWNER','RESEARCH_POLICY_RECORDED','company',body);return this.policy();
  }
  policy(){const r=this.db.prepare('SELECT * FROM research_policy ORDER BY version DESC LIMIT 1').get();return r?{...JSON.parse(r.body),version:r.version}:{version:0,prohibited_domains:[],max_parallel_experiments:1,source_ref:'default-not-configured'};}

  // ---- Research runs ----------------------------------------------------------
  startRun(actor,input){
    this.company.employee(actor);
    check(filled(input.id,200)&&filled(input.question,4000),'Run id and question required');
    check(Array.isArray(input.locales)&&input.locales.length>0&&input.locales.every(l=>filled(l.language,20)&&filled(l.region,20)),'Explicit region/language pairs required');
    check(Array.isArray(input.sources)&&input.sources.length>0&&input.sources.every(s=>SOURCE_CATALOG[s]),'Target sources must be from the catalog');
    check(Array.isArray(input.queries)&&input.queries.length>0&&input.queries.every(q=>filled(q,500)),'Search conditions required');
    const L=input.limits??{};check(['max_items','max_pages','max_cost_yen'].every(k=>Number.isSafeInteger(L[k])&&L[k]>=0),'Item, page and cost limits required');
    check(filled(input.ends_at,64)&&Date.parse(input.ends_at)>this.ms(),'Future end condition required');
    const body={question:input.question,locales:input.locales,sources:input.sources,queries:input.queries,published_range:input.published_range??null,limits:L,ends_at:input.ends_at,
      discovery_paths:input.discovery_paths??['problem_or_desire','change','own_results'],stop_condition:input.stop_condition??'limits or end time'};
    const old=this.db.prepare('SELECT * FROM research_runs WHERE id=?').get(input.id);
    if(old){check(old.body===JSON.stringify(body),'Run ID conflict');return this.run(input.id);}
    this.db.prepare("INSERT INTO research_runs VALUES(?,?,?,'OPEN',NULL,?,?,NULL)").run(input.id,input.project_id??null,JSON.stringify(body),actor,this.now());
    this.ev(actor,'RESEARCH_RUN_STARTED',input.id,{sources:input.sources});return this.run(input.id);
  }
  run(id){
    const r=this.db.prepare('SELECT * FROM research_runs WHERE id=?').get(id);check(r,'Unknown research run','NOT_FOUND');
    const body=JSON.parse(r.body);
    const used=this.db.prepare('SELECT COALESCE(SUM(items),0) AS items,COALESCE(SUM(pages),0) AS pages,COALESCE(SUM(cost_yen),0) AS cost,SUM(CASE WHEN cost_yen IS NULL THEN 1 ELSE 0 END) AS unknown_cost FROM fetch_attempts WHERE run_id=?').get(id);
    return {...r,body,usage:{items:used.items,pages:used.pages,cost_yen:used.cost,attempts_with_unknown_cost:used.unknown_cost??0}};
  }
  stopRun(actor,id,reason){
    this.company.employee(actor);check(filled(reason,1000),'Stop reason required');
    this.db.prepare("UPDATE research_runs SET status='STOPPED',stop_reason=?,closed_at=? WHERE id=? AND status='OPEN'").run(reason,this.now(),id);
    this.ev(actor,'RESEARCH_RUN_STOPPED',id,{reason});return this.run(id);
  }
  /** Record one fetch attempt — including failures, rate limits and NOT_CONNECTED. Limits stop new fetching (R08). */
  recordAttempt(actor,input){
    this.company.employee(actor);const run=this.run(input.run_id);
    check(run.status==='OPEN','Research run is '+run.status+(run.stop_reason?': '+run.stop_reason:''),'STOPPED');
    check(SOURCE_CATALOG[input.source_kind]&&run.body.sources.includes(input.source_kind),'Source not in this run');
    check(CONNECTION_STATES.includes(input.status),'Explicit fetch status required');
    check(Number.isSafeInteger(input.items)&&input.items>=0&&Number.isSafeInteger(input.pages??0)&&(input.pages??0)>=0,'Item/page counts required');
    check(input.cost_yen===null||(Number.isSafeInteger(input.cost_yen)&&input.cost_yen>=0),'Cost must be a measured integer or null');
    check(input.cost_yen!==null||filled(input.cost_null_reason,500),'Unknown cost needs a reason');
    check(filled(input.query,500)&&filled(input.locale?.language,20)&&filled(input.locale?.region,20),'Attempted query and locale required');
    if(input.status!=='AVAILABLE'&&input.status!=='PARTIAL')check(input.items===0&&filled(input.reason,1000),'Failed/unavailable attempts need a reason and cannot carry items');
    const L=run.body.limits,u=run.usage,pages=input.pages??0;
    const over=[];if(u.items>=L.max_items)over.push('max_items');if(u.pages>=L.max_pages)over.push('max_pages');if(u.cost_yen>=L.max_cost_yen&&L.max_cost_yen>0)over.push('max_cost_yen');
    if(Date.parse(run.body.ends_at)<=this.ms())over.push('ends_at');
    if(over.length){this.stopRun(actor,run.id,'limit-reached:'+over.join(','));check(false,'Research limit reached: '+over.join(','),'LIMIT');}
    const items=Math.min(input.items,L.max_items-u.items),truncatedByLimit=items<input.items;
    const id=input.id??randomUUID();
    const body={source_kind:input.source_kind,adapter_id:input.adapter_id??'unspecified',query:input.query,locale:input.locale,published_range:input.published_range??run.body.published_range,sort:input.sort??null,
      status:input.status,reason:input.reason??null,coverage:input.coverage??null,truncated:!!input.truncated||truncatedByLimit,next_cursor:input.next_cursor??null,cost_null_reason:input.cost_null_reason??null,
      retry_after:input.retry_after??null,started_at:input.started_at??this.now(),ended_at:input.ended_at??this.now(),
      meaning:input.status==='AVAILABLE'&&input.items===0?'searched-range-returned-zero-items':['AVAILABLE','PARTIAL'].includes(input.status)?'items-returned':'not-acquired-NOT-evidence-of-zero-demand'};
    this.db.prepare('INSERT INTO fetch_attempts VALUES(?,?,?,?,?,?,?,?)').run(id,run.id,JSON.stringify(body),input.status,items,pages,input.cost_yen,this.now());
    this.ev(actor,'FETCH_ATTEMPT_RECORDED',id,{run_id:run.id,status:input.status,items});
    const after=this.run(run.id);const stopNow=[];
    if(after.usage.items>=L.max_items)stopNow.push('max_items');if(after.usage.pages>=L.max_pages&&L.max_pages>0)stopNow.push('max_pages');
    if(L.max_cost_yen>0&&after.usage.cost_yen>=L.max_cost_yen)stopNow.push('max_cost_yen');
    if(stopNow.length)this.stopRun(actor,run.id,'limit-reached:'+stopNow.join(','));
    return {id,...body,items,accepted_items:items,run_status:this.run(run.id).status};
  }
  attempts(run_id){return this.db.prepare('SELECT * FROM fetch_attempts WHERE run_id=? ORDER BY created_at').all(run_id).map(r=>({...r,body:JSON.parse(r.body)}));}

  // ---- Sources, origin groups and versioned observations ----------------------
  canonical(platform,url,external_id){
    if(filled(external_id,300))return platform+':'+external_id.trim();
    check(filled(url,2000),'URL or external id required');
    const u=new URL(url);u.hash='';for(const k of [...u.searchParams.keys()])if(/^utm_|^fbclid$|^gclid$|^si$/.test(k))u.searchParams.delete(k);
    u.hostname=u.hostname.replace(/^www\.|^m\./,'');return u.toString().replace(/\/$/,'');
  }
  ensureOriginGroup(actor,input){
    const id=input.origin_group_id??null;
    if(id){const old=this.db.prepare('SELECT * FROM origin_groups WHERE id=?').get(id);if(old)return id;}
    const gid=id??'og_'+randomUUID();
    const body={basis:input.origin_basis??'self',inferred_by:actor,reason:input.origin_reason??'distinct original until shown otherwise',ai_inferred:input.origin_ai_inferred??false};
    this.db.prepare('INSERT INTO origin_groups VALUES(?,?,?)').run(gid,JSON.stringify(body),this.now());return gid;
  }
  /**
   * Record an observation of a source. Re-fetching the same source creates a new version of the same source (R04),
   * never a new independent source. Coverage is mandatory (R02).
   */
  recordObservation(actor,input){
    this.company.employee(actor);
    const attempt=this.db.prepare('SELECT * FROM fetch_attempts WHERE id=?').get(input.attempt_id);check(attempt,'Observation must reference its fetch attempt');
    check(['AVAILABLE','PARTIAL'].includes(attempt.status),'Cannot record items from an attempt that acquired nothing');
    check(COVERAGE.includes(input.coverage),'Explicit coverage (snippet/full text/segment/...) required');
    if(input.coverage==='VIDEO_SEGMENT')check(Array.isArray(input.coverage_detail?.segments)&&input.coverage_detail.segments.length>0,'Video claims need the reviewed time segments');
    if(input.coverage==='COMMENTS_SAMPLE')check(Number.isSafeInteger(input.coverage_detail?.comments_reviewed),'Comment sample size required');
    check(isoOrNull(input.published_at??null),'published_at must be ISO or null');
    check(input.published_at||filled(input.published_at_null_reason,300),'Unknown publish time needs a reason (never copy the fetch time)');
    check(filled(input.locale?.language,20)&&filled(input.locale?.region,20),'Observation locale required');
    check(EVIDENCE_ROLES.includes(input.evidence_role),'Evidence role required');
    const metrics=list(input.metrics);
    for(const m of metrics){check(filled(m.name,100)&&(m.value===null?filled(m.null_reason,300):typeof m.value==='number'&&Number.isFinite(m.value)),'Metric needs a measured value or null with reason');
      check(m.value===null||filled(m.period,100)&&filled(m.method,200),'Measured metric needs period and method');}
    const usage=input.usage_terms??{};check(['excerpt','summary_only','reference_only'].includes(usage.storage)&&filled(usage.basis,500),'Usage/storage terms required');
    const excerpt=input.excerpt??'';check(typeof excerpt==='string'&&excerpt.length<=1200,'Store only a short permitted excerpt (<=1200 chars)');
    if(usage.storage==='reference_only')check(excerpt==='','Reference-only sources cannot store excerpts');
    const flags=[];for(const re of INJECTION)if(re.test(excerpt)||list(input.claims).some(c=>re.test(c.text??'')))flags.push('embedded-instruction-treated-as-data');
    const platform=input.platform??JSON.parse(attempt.body).source_kind;
    const key=this.canonical(platform,input.url,input.external_id);
    return this.company.tx(()=>{
      let src=this.db.prepare('SELECT * FROM research_sources WHERE platform=? AND canonical_key=?').get(platform,key);
      if(!src){
        const og=this.ensureOriginGroup(actor,input);const sid='src_'+sha(platform+'|'+key).slice(0,16);
        this.db.prepare('INSERT INTO research_sources(id,platform,canonical_key,url,external_id,operator_ref,origin_group_id,published_at,published_at_status,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)')
          .run(sid,platform,key,input.url??null,input.external_id??null,input.operator_ref??null,og,input.published_at??null,input.published_at?'KNOWN':'UNKNOWN:'+input.published_at_null_reason,this.now());
        src=this.db.prepare('SELECT * FROM research_sources WHERE id=?').get(sid);
      }
      const version=this.db.prepare('SELECT COALESCE(MAX(version),0)+1 AS v FROM observations WHERE source_id=?').get(src.id).v;
      const body={coverage:input.coverage,coverage_detail:input.coverage_detail??null,locale:input.locale,query:JSON.parse(attempt.body).query,evidence_role:input.evidence_role,excerpt,
        facts:list(input.facts),claims:list(input.claims),hypotheses:list(input.hypotheses),counterevidence:list(input.counterevidence),unverified:list(input.unverified),
        metrics,usage_terms:{...usage,retention_until:usage.retention_until??null},flags,refetch_of_existing_source:version>1};
      const id='obs_'+randomUUID();
      this.db.prepare('INSERT INTO observations VALUES(?,?,?,?,?,?,?,?,?)').run(id,src.id,attempt.id,attempt.run_id,version,JSON.stringify(body),sha(body),input.observed_at??this.now(),actor);
      this.ev(actor,'OBSERVATION_RECORDED',id,{source_id:src.id,version,coverage:input.coverage,flags});
      return this.observation(id);
    });
  }
  observation(id){
    const o=this.db.prepare('SELECT * FROM observations WHERE id=?').get(id);check(o,'Unknown observation','NOT_FOUND');
    const s=this.db.prepare('SELECT * FROM research_sources WHERE id=?').get(o.source_id);const body=JSON.parse(o.body);
    return {...o,body,source:s,display:{coverage_label:{SEARCH_SNIPPET:'検索抜粋のみ（本文・動画は未確認）',METADATA_ONLY:'メタデータのみ',FULL_TEXT:'本文確認',VIDEO_SEGMENT:'動画の一部区間のみ確認',TRANSCRIPT:'字幕確認（内容の正しさは未保証）',COMMENTS_SAMPLE:'コメントの一部標本',COMMENTS_ALL:'取得可能な全コメント',OPERATOR_PROVIDED:'本人提供資料'}[body.coverage],
      watched_full_video:false,read_all_comments:body.coverage==='COMMENTS_ALL'}};
  }
  mergeOriginGroup(actor,{source_ids,reason,ai_inferred=true}){
    this.company.employee(actor);check(Array.isArray(source_ids)&&source_ids.length>=2&&filled(reason,1000),'Sources and reason required');
    const gid='og_'+randomUUID();this.db.prepare('INSERT INTO origin_groups VALUES(?,?,?)').run(gid,JSON.stringify({basis:'merged-same-origin',inferred_by:actor,reason,ai_inferred}),this.now());
    for(const s of source_ids)this.db.prepare('UPDATE research_sources SET origin_group_id=? WHERE id=?').run(gid,s);
    this.ev(actor,'ORIGIN_GROUP_MERGED',gid,{source_ids,reason,ai_inferred});return gid;
  }
  /** Raw count vs distinct sources vs distinct origin groups (R03/R04). */
  independence(observation_ids){
    const obs=observation_ids.map(id=>this.observation(id));
    const by=f=>new Set(obs.map(f)).size;
    const roles={};for(const o of obs){(roles[o.body.evidence_role]??=new Set()).add(o.source.origin_group_id);}
    const dist=k=>obs.reduce((m,o)=>{const v=k(o);m[v]=(m[v]??0)+1;return m;},{});
    return {raw_observations:obs.length,distinct_sources:by(o=>o.source_id),independent_origin_groups:by(o=>o.source.origin_group_id),
      distinct_operators:by(o=>o.source.operator_ref??o.source_id),by_role:Object.fromEntries(Object.entries(roles).map(([k,v])=>[k,v.size])),
      by_platform:dist(o=>o.source.platform),by_region_language:dist(o=>o.body.locale.region+'/'+o.body.locale.language),
      snippet_only:obs.filter(o=>o.body.coverage==='SEARCH_SNIPPET').length,flagged_instructions:obs.filter(o=>o.body.flags.length).length,
      note:'Independent count = distinct origin groups. Re-fetches and reposts are not new demand.'};
  }
  /** Refuse to aggregate values whose region/language/period/denominator differ (R06). */
  compareMetrics(observation_ids,metric_name){
    const rows=observation_ids.map(id=>this.observation(id)).flatMap(o=>o.body.metrics.filter(m=>m.name===metric_name).map(m=>({observation_id:o.id,region:o.body.locale.region,language:o.body.locale.language,period:m.period??null,denominator:m.denominator??null,unit:m.unit??null,value:m.value,null_reason:m.null_reason??null})));
    const measured=rows.filter(r=>r.value!==null);
    const keys=['region','language','period','denominator','unit'];const differing=keys.filter(k=>new Set(measured.map(r=>JSON.stringify(r[k]))).size>1);
    return {metric:metric_name,rows,comparable:measured.length>=2&&differing.length===0,differing_conditions:differing,missing:rows.filter(r=>r.value===null).map(r=>({observation_id:r.observation_id,reason:r.null_reason})),
      aggregate:differing.length===0&&measured.length?{sum:measured.reduce((s,r)=>s+r.value,0),n:measured.length}:null};
  }
  /** Source deleted / price updated / corrected: keep the past reference, raise re-verification for dependents (R10, K04). */
  recordSourceChange(actor,{source_id,kind,detail}){
    this.company.employee(actor);check(['deleted','price_changed','corrected','terms_changed'].includes(kind)&&filled(detail,2000),'Change kind and detail required');
    const s=this.db.prepare('SELECT * FROM research_sources WHERE id=?').get(source_id);check(s,'Unknown source');
    const id=randomUUID();this.db.prepare('INSERT INTO source_changes VALUES(?,?,?,?)').run(id,source_id,JSON.stringify({kind,detail,by:actor}),this.now());
    if(kind==='deleted')this.db.prepare("UPDATE research_sources SET status='DELETED_AT_ORIGIN' WHERE id=?").run(source_id);
    const obsIds=new Set(this.db.prepare('SELECT id FROM observations WHERE source_id=?').all(source_id).map(r=>r.id));
    const raised=[];
    for(const o of this.db.prepare('SELECT id,revision,body FROM opportunities').all()){
      const b=JSON.parse(o.body);if(this.opportunityObservationIds(b).some(x=>obsIds.has(x))){const rid=randomUUID();this.db.prepare("INSERT INTO reverification_items VALUES(?,?,?,?,?,'OPEN',?)").run(rid,'opportunity',o.id+'@'+o.revision,source_id,kind,this.now());raised.push(rid);}
    }
    for(const fn of this.reverifyHooks??[])raised.push(...fn({source_id,observation_ids:[...obsIds],kind}));
    this.ev(actor,'SOURCE_CHANGE_RECORDED',source_id,{kind,reverification_items:raised.length});
    return {change_id:id,reverification_items:raised,past_observations_retained:obsIds.size};
  }
  reverifications(status='OPEN'){return this.db.prepare('SELECT * FROM reverification_items WHERE status=? ORDER BY created_at').all(status);}

  // ---- Opportunity cards (versioned) ------------------------------------------
  opportunityObservationIds(b){return [...new Set([...list(b.evidence?.observation_ids),...list(b.counterevidence).flatMap(c=>list(c.observation_ids))])];}
  submitOpportunity(actor,input){
    const e=this.company.employee(actor);check(['MARKETING','STRATEGY','PRODUCT','EXECUTIVE'].includes(e.department),'Opportunity cards come from marketing/strategy/product');
    check(filled(input.id,200),'Opportunity id required');
    const t=input.target??{},v=input.value??{},b=input.build??{},d=input.delivery??{},r=input.revenue??{},c=input.cost??{},x=input.experiment??{};
    check([t.country,t.language,t.user,t.payer,t.scene].every(s=>filled(s,500)),'Target country, language, user, payer and scene required');
    check(filled(v.problem_or_desire)&&filled(v.alternative)&&filled(v.difference)&&VALUE_TYPES.includes(v.value_type),'Value, current alternative, difference and value type required');
    check(filled(input.why_now?.observed??'')||filled(input.why_now?.inferred??''),'Why-now must be stated (observed or inferred)');
    check(filled(b.minimum_offer)&&filled(b.done_criteria)&&Array.isArray(b.out_of_scope),'Minimum offer, done criteria and out-of-scope required');
    check(filled(d.channel)&&filled(d.access_basis)&&Array.isArray(d.permissions_needed),'Delivery channel, access basis and needed permissions required');
    check(Array.isArray(r.streams)&&r.streams.length>0,'At least one revenue stream (who pays for what) required');
    check(Array.isArray(input.counterevidence)&&input.counterevidence.every(ce=>filled(ce.text,2000)),'Counterevidence list required (may be empty only with explicit search note)');
    check(input.counterevidence.length>0||filled(input.counterevidence_search_note,1000),'Record where counterevidence was searched if none was found');
    const obsIds=list(input.evidence?.observation_ids);for(const id of obsIds)this.observation(id);
    const gates=input.gates??{};
    check(['clear','prohibited','unknown'].includes(gates.domain)&&['confirmed','unknown','blocked'].includes(gates.rights)&&typeof gates.cost_bounded==='boolean'&&typeof gates.deliverable==='boolean','Gate facts (domain, rights, cost bounded, deliverable) required');
    const body={target:t,value:v,evidence:{observation_ids:obsIds,gaps:list(input.evidence?.gaps)},why_now:input.why_now,build:b,delivery:d,revenue:r,cost:c,
      counterevidence:input.counterevidence,counterevidence_search_note:input.counterevidence_search_note??null,experiment:x,gates,domain_tags:list(input.domain_tags),
      fame_signal_only:!!input.fame_signal_only};
    const hash=sha(body);
    return this.company.tx(()=>{
      const last=this.db.prepare('SELECT * FROM opportunities WHERE id=? ORDER BY revision DESC LIMIT 1').get(input.id);
      if(last&&last.content_hash===hash)return this.opportunity(input.id,last.revision);
      const revision=(last?.revision??0)+1;
      this.db.prepare('INSERT INTO opportunities VALUES(?,?,?,?,?,?,?)').run(input.id,revision,input.run_id??null,JSON.stringify(body),hash,actor,this.now());
      this.ev(actor,'OPPORTUNITY_REVISION_RECORDED',input.id,{revision,content_hash:hash});return this.opportunity(input.id,revision);
    });
  }
  /** @param {string} id @param {number|null} [revision] */
  opportunity(id,revision=null){
    const r=revision?this.db.prepare('SELECT * FROM opportunities WHERE id=? AND revision=?').get(id,revision):this.db.prepare('SELECT * FROM opportunities WHERE id=? ORDER BY revision DESC LIMIT 1').get(id);
    check(r,'Unknown opportunity','NOT_FOUND');return {...r,body:JSON.parse(r.body)};
  }
  opportunities(){return this.db.prepare('SELECT id,MAX(revision) AS revision FROM opportunities GROUP BY id ORDER BY id').all().map(r=>this.opportunity(r.id,r.revision));}
  /** One structured assessment per department per revision. The actor's department is checked from the roster. */
  assess(actor,input){
    const e=this.company.employee(actor);const dept=actor==='AUDITOR'?'AUDIT':e.department;
    check(DEPARTMENTS[input.department]&&dept===input.department,'Assessor must belong to the assessed department');
    const o=this.opportunity(input.opportunity_id,input.revision);
    const scores=input.scores??{};
    for(const [k,s] of Object.entries(scores)){check(DIMENSIONS.includes(k),'Unknown dimension '+k);check(s&&(s.value===null||[0,1,2,3].includes(s.value))&&filled(s.basis,1000),'Score must be 0-3 or null with a basis');}
    check(filled(input.findings,6000)&&Array.isArray(input.blockers)&&Array.isArray(input.unknowns),'Findings, blockers and unknowns required');
    const body={scores,findings:input.findings,blockers:input.blockers,unknowns:input.unknowns,counterevidence:list(input.counterevidence),cost_view:input.cost_view??null,
      note:'Role-separated review by the same model family is not independent assurance.'};
    const id='asm_'+sha(o.id+'|'+o.revision+'|'+input.department).slice(0,16);
    const old=this.db.prepare('SELECT * FROM opportunity_assessments WHERE id=?').get(id);
    if(old){check(old.body===JSON.stringify(body)&&old.actor===actor,'Assessment already recorded for this revision; revise the opportunity');return {...old,body};}
    this.db.prepare('INSERT INTO opportunity_assessments VALUES(?,?,?,?,?,?,?)').run(id,o.id,o.revision,input.department,actor,JSON.stringify(body),this.now());
    this.ev(actor,'OPPORTUNITY_ASSESSED',o.id,{revision:o.revision,department:input.department});return {id,body};
  }
  assessments(id,revision){return this.db.prepare('SELECT * FROM opportunity_assessments WHERE opportunity_id=? AND revision=? ORDER BY department').all(id,revision).map(r=>({...r,body:JSON.parse(r.body)}));}

  /** Deterministic gate + evidence profile. Gates are evaluated first and never offset by scores (D02). */
  /** @param {string} id @param {number|null} [revision] */
  evaluateCandidate(id,revision=null){
    const o=this.opportunity(id,revision),b=o.body,policy=this.policy(),blockers=[],gaps=[];
    const prohibited=b.domain_tags.filter(t=>policy.prohibited_domains.includes(t));
    if(b.gates.domain==='prohibited'||prohibited.length)blockers.push('prohibited-domain'+(prohibited.length?':'+prohibited.join(','):''));
    if(b.gates.domain==='unknown')blockers.push('domain-check-unknown');
    if(b.gates.rights!=='confirmed')blockers.push('rights-'+b.gates.rights);
    if(!b.gates.cost_bounded)blockers.push('unbounded-cost');
    if(!b.gates.deliverable)blockers.push('cannot-deliver');
    const asm=this.assessments(o.id,o.revision);const depts=new Set(asm.map(a=>a.department));
    for(const d of ['MARKETING','PRODUCT','FINANCE','SUPPORT','AUDIT'])if(!depts.has(d))gaps.push('assessment-missing:'+d);
    for(const a of asm)for(const bl of a.body.blockers)blockers.push(a.department.toLowerCase()+':'+bl);
    const ind=b.evidence.observation_ids.length?this.independence(b.evidence.observation_ids):{independent_origin_groups:0,by_role:{},snippet_only:0,raw_observations:0};
    for(const role of ['customer_voice','alternative_or_spend','channel_or_behavior'])if(!(ind.by_role[role]>0))gaps.push('evidence-type-missing:'+role);
    if(b.counterevidence.length===0)gaps.push('no-counterevidence-recorded');
    if(ind.raw_observations&&ind.snippet_only===ind.raw_observations)gaps.push('snippet-only-evidence');
    if(b.fame_signal_only)gaps.push('attention-signal-only-not-purchase-evidence');
    const dims={};for(const k of DIMENSIONS){const vals=asm.map(a=>a.body.scores[k]).filter(Boolean);dims[k]={values:vals.map(v=>v.value),min:vals.some(v=>v.value!==null)?Math.min(...vals.filter(v=>v.value!==null).map(v=>v.value)):null,unscored:vals.length===0||vals.every(v=>v.value===null)};}
    const zeroDims=Object.entries(dims).filter(([,d])=>d.min===0).map(([k])=>k);
    if(zeroDims.length)gaps.push('counterevidence-scored-zero:'+zeroDims.join(','));
    const recommendation=blockers.length?(blockers.some(x=>x.startsWith('prohibited')||x==='cannot-deliver')?'REJECT':'HOLD'):gaps.length?'MORE_RESEARCH':'ELIGIBLE_FOR_LIMITED_TEST';
    return {opportunity_id:o.id,revision:o.revision,content_hash:o.content_hash,blockers,gaps,evidence:ind,dimensions:dims,recommendation,
      note:'Scores are aids. Missing scores stay null; gates are never offset by high scores; eligibility is not permission to spend or publish.'};
  }
  /**
   * Record a selection decision across compared candidates. NO_ADOPTION is always allowed (D01).
   * A candidate can be selected only if its deterministic evaluation is ELIGIBLE_FOR_LIMITED_TEST.
   */
  decide(actor,input){
    const e=this.company.employee(actor);check(['CEO','STRATEGY_DIRECTOR'].includes(actor)||e.grade==='ceo','Selection is recorded by the CEO or strategy director');
    check(filled(input.id,200)&&Array.isArray(input.candidates)&&input.candidates.length>=1,'Decision id and compared candidates required');
    check(filled(input.rationale,6000)&&Array.isArray(input.next_questions),'Rationale and next questions required');
    const evaluations=input.candidates.map(c=>this.evaluateCandidate(c.id,c.revision));
    const selected=input.selected??null;
    if(selected){const ev=evaluations.find(x=>x.opportunity_id===selected.id&&x.revision===selected.revision);check(ev,'Selected candidate was not compared');
      check(ev.recommendation==='ELIGIBLE_FOR_LIMITED_TEST','Selected candidate is not eligible: '+[...ev.blockers,...ev.gaps].join('; '),'BLOCKED');}
    const outcome=selected?'ADOPT_FOR_LIMITED_TEST':(input.outcome??'NO_ADOPTION');check(['ADOPT_FOR_LIMITED_TEST','NO_ADOPTION','MORE_RESEARCH'].includes(outcome),'Invalid outcome');
    const body={candidates:evaluations.map(ev=>({id:ev.opportunity_id,revision:ev.revision,content_hash:ev.content_hash,recommendation:ev.recommendation,blockers:ev.blockers,gaps:ev.gaps})),
      selected,outcome,rationale:input.rationale,next_questions:input.next_questions,decided_by:actor,review_at:input.review_at??null,owner_selected_product:false};
    const hash=sha(body);const old=this.db.prepare('SELECT * FROM selection_decisions WHERE id=?').get(input.id);
    if(old){check(old.content_hash===hash,'Decision ID conflict');return {...old,body:JSON.parse(old.body)};}
    this.db.prepare('INSERT INTO selection_decisions VALUES(?,?,?,?,?)').run(input.id,JSON.stringify(body),hash,actor,this.now());
    this.ev(actor,'SELECTION_DECIDED',input.id,{outcome,selected});return this.selection(input.id);
  }
  selection(id){const r=this.db.prepare('SELECT * FROM selection_decisions WHERE id=?').get(id);check(r,'Unknown decision','NOT_FOUND');return {...r,body:JSON.parse(r.body)};}

  // ---- Experiment contracts ---------------------------------------------------
  defineExperiment(actor,input){
    this.company.employee(actor);
    const dec=this.selection(input.decision_id);check(dec.body.outcome==='ADOPT_FOR_LIMITED_TEST','Experiment requires an adopted candidate');
    check(dec.body.selected.id===input.opportunity_id&&dec.body.selected.revision===input.opportunity_revision,'Experiment must reference the selected opportunity revision');
    const pm=input.primary_metric??{};
    check([pm.id,pm.definition,pm.numerator,pm.denominator].every(v=>filled(v,1000))&&typeof pm.threshold==='number'&&['>=','<='].includes(pm.direction),'One primary metric with definition, numerator, denominator, threshold and direction required');
    check([input.target,input.value,input.riskiest_hypothesis,input.minimum_offer].every(v=>filled(v,4000)),'Target, value, riskiest hypothesis and minimum offer required');
    check(Number.isSafeInteger(input.min_sample)&&input.min_sample>=1,'Minimum sample required');
    check(Number.isSafeInteger(input.max_cost_yen)&&input.max_cost_yen>=0&&Number.isSafeInteger(input.max_count)&&input.max_count>=1,'Max cost and count required');
    check(filled(input.starts_at,64)&&filled(input.ends_at,64)&&Date.parse(input.ends_at)>Date.parse(input.starts_at),'Period required');
    const sr=input.stop_rules??{},dr=input.decision_rules??{};
    check(filled(sr.quality)&&filled(sr.funding),'Quality and funding stop rules required');
    check(filled(dr.continue)&&filled(dr.improve)&&filled(dr.exit),'Continue / improve / exit rules required');
    check(Array.isArray(input.observations_needed)&&input.observations_needed.length>0&&Array.isArray(input.permissions_needed),'Needed observations and permissions required');
    const body={decision_id:input.decision_id,opportunity_id:input.opportunity_id,opportunity_revision:input.opportunity_revision,target:input.target,value:input.value,
      riskiest_hypothesis:input.riskiest_hypothesis,minimum_offer:input.minimum_offer,primary_metric:pm,secondary_metrics:list(input.secondary_metrics),observations_needed:input.observations_needed,
      starts_at:input.starts_at,ends_at:input.ends_at,max_cost_yen:input.max_cost_yen,max_count:input.max_count,permissions_needed:input.permissions_needed,stop_rules:sr,decision_rules:dr,min_sample:input.min_sample,
      judge:input.judge??'STRATEGY_DIRECTOR'};
    const hash=sha(body);
    return this.company.tx(()=>{
      const last=this.db.prepare('SELECT * FROM experiment_contracts WHERE id=? ORDER BY revision DESC LIMIT 1').get(input.id);
      if(last&&last.content_hash===hash)return this.experiment(input.id);
      if(last)check(filled(input.change_reason,2000),'Changing an experiment requires a recorded reason; the old revision is kept');
      const revision=(last?.revision??0)+1;
      this.db.prepare('INSERT INTO experiment_contracts VALUES(?,?,?,?,?,?,?)').run(input.id,revision,JSON.stringify(body),hash,input.change_reason??null,actor,this.now());
      if(!last)this.db.prepare("INSERT INTO experiment_state VALUES(?,NULL,NULL,NULL,'DRAFT')").run(input.id);
      this.ev(actor,'EXPERIMENT_REVISION_RECORDED',input.id,{revision,change_reason:input.change_reason??null});return this.experiment(input.id);
    });
  }
  /** @param {string} id @param {number|null} [revision] */
  experiment(id,revision=null){
    const rows=this.db.prepare('SELECT * FROM experiment_contracts WHERE id=? ORDER BY revision').all(id);check(rows.length,'Unknown experiment','NOT_FOUND');
    const st=this.db.prepare('SELECT * FROM experiment_state WHERE id=?').get(id);
    const pick=revision?rows.find(r=>r.revision===revision):rows.at(-1);
    return {id,revision:pick.revision,body:JSON.parse(pick.body),content_hash:pick.content_hash,state:st,revisions:rows.map(r=>({revision:r.revision,change_reason:r.change_reason,created_at:r.created_at,content_hash:r.content_hash})),
      changed_after_lock:!!st.locked_revision&&rows.at(-1).revision>st.locked_revision};
  }
  /** Lock the preregistered revision and create the venture in the existing funding ledger (reuse, no new wallet). */
  launchExperiment(actor,id){
    this.company.employee(actor);check(this.ventures,'Venture ledger required');
    const x=this.experiment(id);check(x.state.status==='DRAFT','Experiment already '+x.state.status);
    const b=x.body,o=this.opportunity(b.opportunity_id,b.opportunity_revision);
    const ventureId='exp-'+id;
    this.ventures.propose({id:ventureId,title:o.body.build.minimum_offer.slice(0,200),hypothesis:b.riskiest_hypothesis,customer_problem:o.body.value.problem_or_desire,
      success_metric:b.primary_metric.id+' '+b.primary_metric.direction+' '+b.primary_metric.threshold+' ('+b.primary_metric.numerator+'/'+b.primary_metric.denominator+')',
      failure_rule:b.decision_rules.exit,budget_yen:b.max_cost_yen,learning_deadline:b.ends_at,
      evidence_refs:[...o.body.evidence.observation_ids,'decision:'+b.decision_id,'experiment:'+id+'@'+x.revision]});
    this.db.prepare("UPDATE experiment_state SET locked_revision=?,venture_id=?,started_at=?,status='LOCKED' WHERE id=?").run(x.revision,ventureId,this.now(),id);
    this.ev(actor,'EXPERIMENT_LOCKED',id,{revision:x.revision,venture_id:ventureId});return this.experiment(id);
  }
  /**
   * Evaluate against the LOCKED preregistered revision (D06). Insufficient sample/period is INCONCLUSIVE (D05).
   * Technical failure is separated from weak market response (E04).
   */
  evaluateExperiment(actor,id,input){
    this.company.employee(actor);const x=this.experiment(id);check(x.state.locked_revision,'Experiment not launched');
    const pre=this.experiment(id,x.state.locked_revision).body,pm=pre.primary_metric;
    check(Number.isSafeInteger(input.sample)&&input.sample>=0,'Observed sample size required');
    check(input.value===null||typeof input.value==='number','Observed value or null required');
    const tech=input.technical??{};check(Number.isSafeInteger(tech.delivery_attempts)&&Number.isSafeInteger(tech.delivery_failures)&&typeof tech.measurement_complete==='boolean','Technical delivery facts required');
    const reasons=[];let verdict;
    const failRate=tech.delivery_attempts?tech.delivery_failures/tech.delivery_attempts:null;
    if(tech.delivery_attempts===0||failRate>0.2||!tech.measurement_complete){verdict='IMPLEMENTATION_OR_MEASUREMENT_FAILURE';reasons.push(tech.delivery_attempts===0?'offer-never-delivered':failRate>0.2?'delivery-failure-rate-'+failRate.toFixed(2):'measurement-incomplete');}
    else if(this.ms()<Date.parse(pre.ends_at)&&!input.early_stop){verdict='IN_PROGRESS';reasons.push('observation-window-open');}
    else if(input.sample<pre.min_sample||input.value===null){verdict='INCONCLUSIVE';reasons.push('sample-below-preregistered-minimum:'+input.sample+'/'+pre.min_sample);}
    else{const met=pm.direction==='>='?input.value>=pm.threshold:input.value<=pm.threshold;verdict=met?'PRIMARY_METRIC_MET':'MARKET_RESPONSE_BELOW_THRESHOLD';}
    const body={evaluated_revision:x.state.locked_revision,latest_revision:x.revision,changed_after_lock:x.changed_after_lock,primary_metric:pm,observed:{value:input.value,sample:input.sample},technical:tech,
      verdict,reasons,recommended_next:{PRIMARY_METRIC_MET:'continue-per-rule: '+pre.decision_rules.continue,MARKET_RESPONSE_BELOW_THRESHOLD:'improve-or-exit-per-rule: '+pre.decision_rules.improve+' / '+pre.decision_rules.exit,
        INCONCLUSIVE:'unknown — extend only with explicit reason and added limit, or exit',IN_PROGRESS:'keep observing',IMPLEMENTATION_OR_MEASUREMENT_FAILURE:'fix delivery/measurement; this is NOT market evidence'}[verdict],
      not_proven:['product-market fit','continuing profit'],evidence_refs:list(input.evidence_refs)};
    const rid='res_'+randomUUID();this.db.prepare('INSERT INTO experiment_results VALUES(?,?,?,?)').run(rid,id,JSON.stringify(body),this.now());
    this.ev(actor,'EXPERIMENT_EVALUATED',id,{result_id:rid,verdict});return {id:rid,...body};
  }
  results(id){return this.db.prepare('SELECT * FROM experiment_results WHERE experiment_id=? ORDER BY created_at').all(id).map(r=>({...r,body:JSON.parse(r.body)}));}
}
