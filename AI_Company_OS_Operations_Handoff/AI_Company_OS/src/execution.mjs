import { sha } from './authority.mjs';

// External execution protocol (SYSTEM_IMPLEMENTATION_BLUEPRINT §11):
// request -> server check (actor, permit, target, hash, budget) -> reserve funding (existing VentureLedger) ->
// re-check immediately before execution -> send once with the operation id -> settle -> UNKNOWN stays held and is
// only ever reconciled with the SAME operation id. There is no "retry with a new id" path in this module.
const check=(ok,message,code='REJECTED')=>{if(!ok){const e=new Error(message);e.code=code;throw e;}};
const filled=(v,max=12000)=>typeof v==='string'&&v.trim().length>0&&v.length<=max;
export const LANES=['RUN','IMPROVE','EXPLORE'];

export class ExecutionGateway {
  constructor({company,ventures,authority,clock=()=>new Date()}){
    Object.assign(this,{company,ventures,authority,clock});this.db=company.db;
    this.db.exec(`CREATE TABLE IF NOT EXISTS external_operations(
      id TEXT PRIMARY KEY,actor TEXT NOT NULL,venture_id TEXT,lane TEXT NOT NULL,operation TEXT NOT NULL,target TEXT NOT NULL,adapter_id TEXT NOT NULL,
      content_hash TEXT NOT NULL,payload_hash TEXT NOT NULL,payload TEXT NOT NULL,cost_yen INTEGER NOT NULL,cost_kind TEXT,grant_id TEXT NOT NULL,
      funding_operation_id TEXT,environment TEXT NOT NULL,task_id TEXT,artifact_ref TEXT,status TEXT NOT NULL,provider_object_id TEXT,result TEXT,
      attempts INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,
      UNIQUE(adapter_id,environment,provider_object_id))`);
  }
  now(){return this.clock().toISOString();}
  get(id){const r=this.db.prepare('SELECT * FROM external_operations WHERE id=?').get(id);check(r,'Unknown operation','NOT_FOUND');return {...r,payload:JSON.parse(r.payload),result:r.result?JSON.parse(r.result):null};}
  list(){return this.db.prepare('SELECT id FROM external_operations ORDER BY created_at').all().map(r=>this.get(r.id));}
  set(id,fields){
    const keys=Object.keys(fields);this.db.prepare(`UPDATE external_operations SET ${keys.map(k=>k+'=?').join(',')},updated_at=? WHERE id=?`).run(...keys.map(k=>fields[k]),this.now(),id);
  }
  /** AI (fixed actor) or a deterministic worker requests an operation. No execution happens here. */
  request(actor,input){
    this.company.employee(actor);
    check(filled(input.id,200)&&filled(input.operation,40)&&filled(input.target,500)&&filled(input.adapter_id,100)&&filled(input.grant_id,200),'Operation id, operation, target, adapter and permit required');
    check(LANES.includes(input.lane??'EXPLORE'),'Invalid lane');
    check(['test','live'].includes(input.environment),'Explicit provider environment (test/live) required');
    check(Number.isSafeInteger(input.cost_yen)&&input.cost_yen>=0,'Explicit maximum cost required (0 only when the action has no charge)');
    const payload=input.payload??{};const content_hash=input.content_hash??sha(payload);
    const payload_hash=sha({operation:input.operation,target:input.target,adapter_id:input.adapter_id,content_hash,cost_yen:input.cost_yen,grant_id:input.grant_id,venture_id:input.venture_id??null,environment:input.environment,lane:input.lane??'EXPLORE'});
    const old=this.db.prepare('SELECT * FROM external_operations WHERE id=?').get(input.id);
    if(old){check(old.payload_hash===payload_hash,'Same operation id with a different payload is rejected','CONFLICT');return this.get(input.id);}
    const permit=this.authority.checkGrant({grant_id:input.grant_id,venture_id:input.venture_id??null,operation:input.operation,target:input.target,content_hash,cost_yen:input.cost_yen,scope_facts:input.scope_facts??{}});
    check(permit.allowed,'Execution not permitted: '+permit.reasons.join(', '),'FORBIDDEN');
    let funding_operation_id=null;
    if(input.cost_yen>0){
      // Costed actions use the existing company funding ledger; no parallel wallet.
      check(filled(input.cost_kind,40)&&filled(input.venture_id,200),'Costed operation needs venture and cost kind');
      this.ventures.reserve({id:input.id,venture_id:input.venture_id,kind:input.cost_kind,ceiling_yen:input.cost_yen,target_ref:input.target,request_hash:payload_hash,
        ...(input.lane==='RUN'?{lane:'RUN',grant_id:input.run_grant_id}:{})});
      funding_operation_id=input.id;
    }
    this.db.prepare(`INSERT INTO external_operations(id,actor,venture_id,lane,operation,target,adapter_id,content_hash,payload_hash,payload,cost_yen,cost_kind,grant_id,funding_operation_id,environment,task_id,artifact_ref,status,created_at,updated_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'REQUESTED',?,?)`).run(input.id,actor,input.venture_id??null,input.lane??'EXPLORE',input.operation,input.target,input.adapter_id,content_hash,payload_hash,
      JSON.stringify(payload),input.cost_yen,input.cost_kind??null,input.grant_id,funding_operation_id,input.environment,input.task_id??null,input.artifact_ref??null,this.now(),this.now());
    this.company.event(actor,'EXTERNAL_OPERATION_REQUESTED',input.id,{operation:input.operation,target:input.target,environment:input.environment,content_hash,cost_yen:input.cost_yen});
    return this.get(input.id);
  }
  /** Worker executes once. The permit and stop state are re-checked immediately before sending. */
  async execute(id,adapter,{scope_facts={}}={}){
    const op=this.get(id);
    if(op.status==='SUCCEEDED')return op;
    check(op.status==='REQUESTED','Operation is '+op.status+'; an uncertain operation must be reconciled with the same id','CONFLICT');
    check(adapter&&adapter.id===op.adapter_id,'Adapter mismatch');
    // Pre-execution re-check (A03/A04): revoked, expired, paused, changed content all stop here.
    this.company.tx(()=>{
      this.authority.consumeGrant({operation_id:op.id,grant_id:op.grant_id,venture_id:op.venture_id,operation:op.operation,target:op.target,content_hash:op.content_hash,cost_yen:op.cost_yen,scope_facts});
      this.set(id,{status:'IN_FLIGHT',attempts:op.attempts+1});
    });
    if(op.funding_operation_id)this.ventures.begin(op.funding_operation_id,{target_ref:op.target,request_hash:op.payload_hash});
    let result;
    try{result=await adapter.execute({operation_id:op.id,idempotency_key:op.id,operation:op.operation,target:op.target,payload:op.payload,environment:op.environment});}
    catch(error){return this.markUnknown(id,'adapter-error: '+String(error?.message??error).slice(0,500));}
    return this.applyResult(id,result);
  }
  applyResult(id,result){
    const op=this.get(id);
    if(result?.status==='SUCCEEDED'){
      check(filled(result.provider_object_id,300),'Provider object id required for a confirmed result');
      if(op.funding_operation_id){
        if(Number.isSafeInteger(result.actual_yen)&&result.actual_yen>=0)this.ventures.settle(op.funding_operation_id,{actual_yen:result.actual_yen,provider_ref:op.adapter_id+':'+result.provider_object_id,source_ref:result.source_ref??'adapter-response'});
        // Action confirmed but its charge is not: the funding hold stays UNKNOWN until the bill is reconciled.
        else if(this.ventures.operation(op.funding_operation_id).status==='IN_FLIGHT')this.ventures.markUnknown(op.funding_operation_id,'action-confirmed-cost-unconfirmed');
      }
      this.set(id,{status:'SUCCEEDED',provider_object_id:result.provider_object_id,result:JSON.stringify(result)});
      this.company.event('SYSTEM','EXTERNAL_OPERATION_SUCCEEDED',id,{provider_object_id:result.provider_object_id,actual_yen:result.actual_yen??null});
      return this.get(id);
    }
    if(result?.status==='REJECTED_NOT_SENT'){
      // Provider affirmatively rejected before acting (e.g. validation). Funding stays held until reconciled to zero.
      if(op.funding_operation_id)this.ventures.settle(op.funding_operation_id,{actual_yen:0,provider_ref:op.adapter_id+':rejected:'+op.id,source_ref:result.source_ref??'adapter-rejection'});
      this.set(id,{status:'FAILED',result:JSON.stringify(result)});return this.get(id);
    }
    return this.markUnknown(id,'unconfirmed-result');
  }
  markUnknown(id,reason){
    const op=this.get(id);
    this.set(id,{status:'UNKNOWN',result:JSON.stringify({reason})});
    if(op.funding_operation_id&&this.ventures.operation(op.funding_operation_id).status==='IN_FLIGHT')this.ventures.markUnknown(op.funding_operation_id,reason);
    this.company.event('SYSTEM','EXTERNAL_OPERATION_UNKNOWN',id,{reason,funding_held:!!op.funding_operation_id});
    return this.get(id);
  }
  /** After restart or timeout: look up by the SAME id. Never re-sends. */
  async reconcile(id,adapter){
    const op=this.get(id);
    check(['UNKNOWN','IN_FLIGHT'].includes(op.status),'Only uncertain operations are reconciled');
    check(adapter&&adapter.id===op.adapter_id&&typeof adapter.lookup==='function','Adapter cannot look up by operation id; keep UNKNOWN and escalate');
    if(op.status==='IN_FLIGHT')this.markUnknown(id,'worker-restart-before-result');
    const found=await adapter.lookup({operation_id:op.id,environment:op.environment});
    if(found?.status==='SUCCEEDED'||found?.status==='REJECTED_NOT_SENT')return this.applyResult(id,found);
    this.company.event('SYSTEM','EXTERNAL_OPERATION_STILL_UNKNOWN',id,{lookup:found?.status??'none'});
    return this.get(id);
  }
  /** Restart recovery: anything left IN_FLIGHT becomes UNKNOWN (never back to REQUESTED). */
  recoverAfterRestart(){
    const rows=this.db.prepare("SELECT id FROM external_operations WHERE status='IN_FLIGHT'").all();
    for(const r of rows)this.markUnknown(r.id,'worker-restart-before-result');
    return {marked_unknown:rows.map(r=>r.id)};
  }
}

/** Local test adapter. Simulates a provider with lookup-by-idempotency-key. Never a live provider. */
export class LocalTestAdapter {
  constructor(id='local-test',{failMode=null}={}){this.id=id;this.failMode=failMode;this.sent=new Map();this.calls=0;}
  async execute({operation_id,payload}){
    this.calls++;
    if(this.failMode==='lose-response'){this.sent.set(operation_id,{provider_object_id:'obj_'+operation_id});throw new Error('timeout after send');}
    if(!this.sent.has(operation_id))this.sent.set(operation_id,{provider_object_id:'obj_'+operation_id});
    return {status:'SUCCEEDED',provider_object_id:this.sent.get(operation_id).provider_object_id,actual_yen:payload.actual_yen??0,source_ref:'local-test-adapter',environment:'test'};
  }
  async lookup({operation_id}){const s=this.sent.get(operation_id);return s?{status:'SUCCEEDED',provider_object_id:s.provider_object_id,actual_yen:0,source_ref:'local-test-adapter:lookup'}:{status:'NOT_FOUND'};}
}
