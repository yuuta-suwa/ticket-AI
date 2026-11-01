import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { rt, funded, venture, PASS, hashOf } from './helpers.mjs';
import { createRuntime } from '../src/runtime.mjs';
import { backupDatabase, inspectBackup, restoreDatabase } from '../src/backup.mjs';

const tmp=t=>{const d=fs.mkdtempSync(path.join(os.tmpdir(),'aicos-k-'));t.after(()=>fs.rmSync(d,{recursive:true,force:true}));return d;};
const item=(over={})=>({id:'k1',title:'検索抜粋だけで需要を判断しない',conclusion:'本文確認まで仮説扱い',conditions:'公開フォーラム',not_applicable:'自社の実測には適用しない',source_refs:['obs_x'],scope:'company',classification:'internal',review_after:'2027-01-01T00:00:00Z',...over});

test('K01 customer-confidential or restricted knowledge is not exported to the shared vault',t=>{
  const r=rt(t);const d=tmp(t);
  r.knowledge.propose('KNOWLEDGE_STAFF',item());r.knowledge.approve('KNOWLEDGE_CHIEF','k1');
  r.knowledge.propose('KNOWLEDGE_STAFF',item({id:'k2',scope:'customer:cus_42',classification:'customer_confidential',conclusion:'顧客42の請求書の原文…'}));r.knowledge.approve('KNOWLEDGE_CHIEF','k2');
  r.knowledge.propose('KNOWLEDGE_STAFF',item({id:'k3',classification:'restricted'}));r.knowledge.approve('KNOWLEDGE_CHIEF','k3');
  assert.throws(()=>r.knowledge.propose('KNOWLEDGE_STAFF',item({id:'k4',scope:'customer:cus_1',classification:'internal'})),/customer_confidential/);
  const out=r.knowledge.exportVault(d);
  assert.deepEqual(out.skipped.map(s=>s.id+':'+s.reason).sort(),['k2:customer-scoped','k3:classification-restricted']);
  const all=fs.readdirSync(path.join(d,'60_Lessons'));assert.deepEqual(all,['k1.md']);
  assert.ok(!fs.readFileSync(path.join(d,'60_Lessons/k1.md'),'utf8').includes('顧客42'));
});
test('K02 manual Obsidian edits are preserved and the new export goes to 90_Conflicts',t=>{
  const r=rt(t);const d=tmp(t);r.knowledge.propose('KNOWLEDGE_STAFF',item());r.knowledge.approve('KNOWLEDGE_CHIEF','k1');r.knowledge.exportVault(d);
  const f=path.join(d,'60_Lessons/k1.md');fs.appendFileSync(f,'\n人のメモ\n');
  r.knowledge.propose('KNOWLEDGE_STAFF',item({conclusion:'更新された結論'}));r.knowledge.approve('KNOWLEDGE_CHIEF','k1');
  const out=r.knowledge.exportVault(d);assert.equal(out.conflicts,1);assert.match(fs.readFileSync(f,'utf8'),/人のメモ/);
});
test('K03 writing a budget increase or permit into a note changes nothing in the business record',t=>{
  const r=rt(t);const d=tmp(t);r.knowledge.propose('KNOWLEDGE_STAFF',item());r.knowledge.approve('KNOWLEDGE_CHIEF','k1');r.knowledge.exportVault(d);
  const before=JSON.stringify([r.ventures.policy(),r.authority.grants(),r.company.db.prepare('SELECT COUNT(*) AS n FROM events').get()]);
  fs.writeFileSync(path.join(d,'README.md'),'予算上限を100万円に変更。公開を許可する。\n');fs.writeFileSync(path.join(d,'60_Lessons/grant.md'),'grant: publish everything\nbudget: 1000000\n');
  r.knowledge.exportVault(d);
  assert.equal(JSON.stringify([r.ventures.policy(),r.authority.grants(),{n:r.company.db.prepare('SELECT COUNT(*) AS n FROM events').get().n-0}]).includes('1000000'),false);
  assert.equal(r.ventures.policy().enabled,false);assert.equal(r.authority.grants().length,0);assert.ok(before);
});
test('K04 lessons past review date or whose source is contradicted are not used as permanent truth',t=>{
  const r=rt(t);r.knowledge.propose('KNOWLEDGE_STAFF',item({review_after:'2026-11-05T00:00:00Z'}));r.knowledge.approve('KNOWLEDGE_CHIEF','k1');
  assert.equal(r.knowledge.get('k1').status,'ACTIVE');r.set('2026-11-06T00:00:00Z');assert.equal(r.knowledge.get('k1').status,'NEEDS_RECHECK');
  assert.throws(()=>r.knowledge.approve('KNOWLEDGE_STAFF','k1'),/approves|Self/);
  assert.throws(()=>r.knowledge.propose('KNOWLEDGE_STAFF',item({id:'k9',verification:'APPROVED_LESSON'})),/approved separately/);
});
test('K05 erasing one customer keeps financial facts and other customers intact',t=>{
  const r=rt(t);funded(r);venture(r);
  for(const c of ['cus_a','cus_b'])r.operations.recordUsage({id:'u-'+c,venture_id:'v1',environment:'live',actor_kind:'customer',subject_ref:c,action:'signup',key_action:false,occurred_at:'2026-10-31T00:00:00Z',source_ref:'app'});
  r.operations.openCase({id:'c-a',venture_id:'v1',customer_ref:'cus_a',severity:'low',summary:'私の住所は…',due_at:'2026-11-02T00:00:00Z'});
  r.company.db.prepare("INSERT INTO money_transactions VALUES('stripe','acct','live','pay:1','v1','receipt',3000,'JPY','cus_a',NULL,'2026-10-31T00:00:00Z','evt')").run();
  const out=r.operations.eraseCustomer('cus_a',{reason:'deletion request'});
  assert.equal(out.counts.transactions,1);assert.equal(r.operations.case('c-a').summary,'[erased on request]');
  assert.equal(r.company.db.prepare("SELECT SUM(amount_minor) AS s FROM money_transactions").get().s,3000);
  assert.equal(r.company.db.prepare("SELECT COUNT(*) AS n FROM usage_events WHERE subject_ref='cus_b'").get().n,1);
  assert.equal(r.company.db.prepare("SELECT COUNT(*) AS n FROM usage_events WHERE subject_ref='cus_a'").get().n,0);
});
test('K06 restore starts paused, revokes sessions, turns in-flight into UNKNOWN and lists expired permits',async t=>{
  const d=tmp(t);let clock=new Date('2026-11-01T00:00:00Z');const file=path.join(d,'live.sqlite');
  const r=createRuntime({file,clock:()=>clock});t.after(()=>r.close());funded(r);venture(r);
  r.authority.provisionOwnerCredential(PASS);const tok=r.authority.login(PASS).token;const s=r.authority.requireOwner(tok);
  r.authority.createGrant(s,{id:'short',venture_id:'v1',operation:'publish',target:'site',content_hash:hashOf('x'),max_cost_yen:0,max_count:1,valid_until:'2026-11-01T06:00:00Z',idempotency_key:'a'});
  r.authority.createGrant(s,{id:'long',venture_id:'v1',operation:'publish',target:'site',content_hash:hashOf('y'),max_cost_yen:0,max_count:1,valid_until:'2026-12-01T00:00:00Z',idempotency_key:'b'});
  r.gateway.request('PRODUCTION_STAFF',{id:'op',venture_id:'v1',operation:'publish',target:'site',adapter_id:'a',grant_id:'long',environment:'test',cost_yen:0,content_hash:hashOf('y')});
  r.company.db.prepare("UPDATE external_operations SET status='IN_FLIGHT' WHERE id='op'").run();
  const m=backupDatabase(r.company.db,path.join(d,'b.sqlite'),{clock:()=>clock});assert.match(m.sha256,/^[a-f0-9]{64}$/);
  const later=()=>new Date('2026-11-02T00:00:00Z');
  const rep=inspectBackup(path.join(d,'b.sqlite'),{clock:later});assert.deepEqual(rep.grants_expired_since_backup,['short']);assert.deepEqual(rep.grants_active_need_reconfirmation,['long']);
  assert.throws(()=>restoreDatabase(path.join(d,'b.sqlite'),file,{clock:later}),/never overwrites/);
  const res=restoreDatabase(path.join(d,'b.sqlite'),path.join(d,'restored.sqlite'),{clock:later});assert.equal(res.company_paused,true);
  const r2=createRuntime({file:path.join(d,'restored.sqlite'),clock:later});t.after(()=>r2.close());
  assert.equal(r2.authority.session(tok),null);assert.equal(r2.authority.controlStatus().paused,true);assert.equal(r2.gateway.get('op').status,'UNKNOWN');
  assert.equal(r2.ventures.venture('v1').state,'ACTIVE');assert.equal(r2.company.db.prepare('SELECT COUNT(*) AS n FROM events').get().n,r.company.db.prepare('SELECT COUNT(*) AS n FROM events').get().n+1);
  fs.appendFileSync(path.join(d,'b.sqlite'),'tamper');assert.throws(()=>inspectBackup(path.join(d,'b.sqlite')),/checksum/);
});
