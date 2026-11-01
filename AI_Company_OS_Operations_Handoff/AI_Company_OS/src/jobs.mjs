import { createHash } from 'node:crypto';

// Durable priority job queue with reserved capacity for RUN work (O06).
// Heavy generation/development can never occupy the slots reserved for monitoring, payment reconciliation and support.
const check=(ok,message)=>{if(!ok)throw new Error(message);};
const filled=(v,max=12000)=>typeof v==='string'&&v.trim().length>0&&v.length<=max;
const sha=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
export const JOB_LANES={RUN_CRITICAL:0,RUN:1,IMPROVE:2,EXPLORE:3};

export class JobQueue {
  constructor(company,{clock=()=>new Date(),slots=4,reservedRunSlots=1,heavyMax=1,leaseMs=600000}={}){
    check(reservedRunSlots<slots&&heavyMax<=slots-reservedRunSlots,'Reserved RUN capacity must remain free of heavy work');
    Object.assign(this,{company,clock,slots,reservedRunSlots,heavyMax,leaseMs});this.db=company.db;
    this.db.exec(`CREATE TABLE IF NOT EXISTS jobs(id TEXT PRIMARY KEY,venture_id TEXT,task_id TEXT,lane TEXT NOT NULL,priority INTEGER NOT NULL,heavy INTEGER NOT NULL,state TEXT NOT NULL,
      dedupe_key TEXT NOT NULL UNIQUE,payload_hash TEXT NOT NULL,payload TEXT NOT NULL,not_before TEXT,deadline TEXT,lease_until TEXT,worker_id TEXT,attempts INTEGER NOT NULL DEFAULT 0,
      max_attempts INTEGER NOT NULL,external_operation_id TEXT,last_progress_at TEXT,result_ref TEXT,created_at TEXT NOT NULL)`);
  }
  now(){return this.clock().toISOString();}
  enqueue(input){
    check(filled(input.id,200)&&Object.hasOwn(JOB_LANES,input.lane)&&filled(input.dedupe_key,200),'Job id, lane and dedupe key required');
    const payload=input.payload??{},h=sha({lane:input.lane,heavy:!!input.heavy,payload,venture_id:input.venture_id??null});
    const old=this.db.prepare('SELECT * FROM jobs WHERE dedupe_key=?').get(input.dedupe_key);
    if(old){check(old.payload_hash===h,'Dedupe key reused with a different payload');return old;}
    this.db.prepare(`INSERT INTO jobs(id,venture_id,task_id,lane,priority,heavy,state,dedupe_key,payload_hash,payload,not_before,deadline,max_attempts,external_operation_id,created_at)
      VALUES(?,?,?,?,?,?,'QUEUED',?,?,?,?,?,?,?,?)`).run(input.id,input.venture_id??null,input.task_id??null,input.lane,JOB_LANES[input.lane],input.heavy?1:0,input.dedupe_key,h,JSON.stringify(payload),
      input.not_before??null,input.deadline??null,input.max_attempts??3,input.external_operation_id??null,this.now());
    return this.get(input.id);
  }
  get(id){const r=this.db.prepare('SELECT * FROM jobs WHERE id=?').get(id);check(r,'Unknown job');return r;}
  running(){return this.db.prepare("SELECT * FROM jobs WHERE state='RUNNING'").all();}
  /** Claim the highest-priority job that fits the capacity rules. Paused company => only RUN lanes. */
  claim(worker_id){
    check(filled(worker_id,100),'Worker id required');
    return this.company.tx(()=>{
      const paused=!!this.db.prepare('SELECT paused FROM control WHERE id=1').get().paused;
      const run=this.running(),free=this.slots-run.length,heavyRunning=run.filter(j=>j.heavy).length;
      if(free<=0)return null;
      const candidates=this.db.prepare(`SELECT * FROM jobs WHERE state='QUEUED' AND (not_before IS NULL OR not_before<=?) ORDER BY priority,COALESCE(deadline,'9999'),created_at`).all(this.now());
      for(const j of candidates){
        const isRun=j.lane==='RUN_CRITICAL'||j.lane==='RUN';
        // Stop means: no new IMPROVE/EXPLORE work; monitoring, reconciliation and support continue.
        if(paused&&!isRun)continue;
        if(!isRun&&free<=this.reservedRunSlots)continue;
        if(j.heavy&&heavyRunning>=this.heavyMax)continue;
        this.db.prepare("UPDATE jobs SET state='RUNNING',worker_id=?,attempts=attempts+1,lease_until=?,last_progress_at=? WHERE id=?").run(worker_id,new Date(this.clock().getTime()+this.leaseMs).toISOString(),this.now(),j.id);
        return this.get(j.id);
      }
      return null;
    });
  }
  progress(id,worker_id){const j=this.get(id);check(j.state==='RUNNING'&&j.worker_id===worker_id,'Not your running job');this.db.prepare('UPDATE jobs SET last_progress_at=?,lease_until=? WHERE id=?').run(this.now(),new Date(this.clock().getTime()+this.leaseMs).toISOString(),id);}
  complete(id,worker_id,result_ref){const j=this.get(id);check(j.state==='RUNNING'&&j.worker_id===worker_id&&filled(result_ref,500),'Not your running job / result ref required');
    this.db.prepare("UPDATE jobs SET state='DONE',result_ref=?,lease_until=NULL WHERE id=?").run(result_ref,id);return this.get(id);}
  fail(id,worker_id,reason){const j=this.get(id);check(j.state==='RUNNING'&&j.worker_id===worker_id,'Not your running job');
    this.db.prepare('UPDATE jobs SET state=?,result_ref=?,lease_until=NULL WHERE id=?').run(j.attempts<j.max_attempts?'QUEUED':'FAILED',String(reason).slice(0,500),id);return this.get(id);}
  /** Expired leases: jobs that touched an external operation go to NEEDS_RECONCILE, never a blind re-run. */
  recoverExpired(){
    const rows=this.db.prepare("SELECT * FROM jobs WHERE state='RUNNING' AND lease_until<=?").all(this.now());
    for(const j of rows)this.db.prepare('UPDATE jobs SET state=?,lease_until=NULL,worker_id=NULL WHERE id=?').run(j.external_operation_id?'NEEDS_RECONCILE':j.attempts<j.max_attempts?'QUEUED':'FAILED',j.id);
    return rows.map(j=>j.id);
  }
  capacity(){const run=this.running();return {slots:this.slots,running:run.length,reserved_run_slots:this.reservedRunSlots,heavy_running:run.filter(j=>j.heavy).length,heavy_max:this.heavyMax,
    run_capacity_available:this.slots-run.filter(j=>!['RUN','RUN_CRITICAL'].includes(j.lane)).length>=this.reservedRunSlots,queued:this.db.prepare("SELECT lane,COUNT(*) AS n FROM jobs WHERE state='QUEUED' GROUP BY lane").all()};}
}
