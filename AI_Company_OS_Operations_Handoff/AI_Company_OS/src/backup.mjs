import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

// Consistent SQLite backup (VACUUM INTO) and a restore that starts PAUSED and reports what must be reconciled (K06).
const fileHash=f=>createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const has=(db,t)=>!!db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(t);

export function backupDatabase(db,destination,{clock=()=>new Date()}={}){
  const dest=path.resolve(destination);if(fs.existsSync(dest))throw new Error('Backup target already exists');
  fs.mkdirSync(path.dirname(dest),{recursive:true});
  db.exec(`VACUUM INTO '${dest.replaceAll("'","''")}'`);
  const manifest={file:path.basename(dest),sha256:fileHash(dest),created_at:clock().toISOString(),note:'Contains business records. Store encrypted; never sync as a substitute for backup.'};
  fs.writeFileSync(dest+'.manifest.json',JSON.stringify(manifest,null,2),{mode:0o600});return manifest;
}
/** Read-only inspection of a backup file against "now". */
export function inspectBackup(file,{clock=()=>new Date()}={}){
  const m=JSON.parse(fs.readFileSync(file+'.manifest.json','utf8'));
  if(fileHash(file)!==m.sha256)throw new Error('Backup checksum mismatch');
  const db=new DatabaseSync(file,{readOnly:true});const now=clock().getTime();
  try{
    const rows=(t,sql)=>has(db,t)?db.prepare(sql).all():[];
    const grants=rows('execution_grants','SELECT id,body,status FROM execution_grants').map(g=>({...g,body:JSON.parse(g.body)}));
    return {backup_created_at:m.created_at,checksum_ok:true,
      grants_expired_since_backup:grants.filter(g=>g.status==='ACTIVE'&&Date.parse(g.body.valid_until)<=now).map(g=>g.id),
      grants_active_need_reconfirmation:grants.filter(g=>g.status==='ACTIVE'&&Date.parse(g.body.valid_until)>now).map(g=>g.id),
      uncertain_external_operations:rows('external_operations',"SELECT id,status,adapter_id FROM external_operations WHERE status IN ('IN_FLIGHT','UNKNOWN','REQUESTED')"),
      uncertain_funding_operations:rows('venture_operations',"SELECT id,status,ceiling_yen FROM venture_operations WHERE status IN ('RESERVED','IN_FLIGHT','UNKNOWN')"),
      last_provider_event_at:has(db,'provider_events')?db.prepare('SELECT MAX(received_at) AS t FROM provider_events').get().t:null,
      pending_decisions:rows('decision_requests',"SELECT id,expires_at FROM decision_requests WHERE status='PENDING'"),
      artifacts:has(db,'artifacts')?db.prepare('SELECT COUNT(*) AS n FROM artifacts').get().n:0,
      events:has(db,'events')?db.prepare('SELECT COUNT(*) AS n FROM events').get().n:0};
  }finally{db.close();}
}
/**
 * Restore into a NEW database file. The restored company is paused, all owner sessions are revoked,
 * and any operation that was in flight becomes UNKNOWN (to be looked up by the same id, never re-sent).
 */
export function restoreDatabase(file,destination,{clock=()=>new Date()}={}){
  const report=inspectBackup(file,{clock});const dest=path.resolve(destination);
  if(fs.existsSync(dest))throw new Error('Restore target already exists; restore never overwrites the live database');
  fs.copyFileSync(file,dest);
  const db=new DatabaseSync(dest);const now=clock().toISOString();
  try{
    db.exec('BEGIN IMMEDIATE');
    db.prepare('UPDATE control SET paused=1 WHERE id=1').run();
    if(has(db,'owner_sessions'))db.prepare('UPDATE owner_sessions SET revoked_at=? WHERE revoked_at IS NULL').run(now);
    if(has(db,'external_operations'))db.prepare("UPDATE external_operations SET status='UNKNOWN',updated_at=? WHERE status='IN_FLIGHT'").run(now);
    if(has(db,'venture_operations'))db.prepare("UPDATE venture_operations SET status='UNKNOWN' WHERE status='IN_FLIGHT'").run();
    db.prepare('INSERT INTO events(actor,kind,entity_id,body,created_at) VALUES(?,?,?,?,?)').run('OWNER','RESTORED_FROM_BACKUP','company',JSON.stringify({backup_created_at:report.backup_created_at,paused:true}),now);
    db.exec('COMMIT');
  }catch(e){db.exec('ROLLBACK');throw e;}finally{db.close();}
  return {...report,restored_to:dest,company_paused:true,sessions_revoked:true,
    next_steps:['re-fetch provider events after '+(report.last_provider_event_at??'backup time'),'look up uncertain operations by the same id','re-confirm or revoke active grants','owner resumes after checks']};
}
