import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { ensureSafe, safeWrite } from './company.mjs';

// Reusable knowledge with scope, classification, sources and expiry, plus a ONE-WAY Obsidian export.
// Notes are an output. Editing a note never changes funds, permits or business records (K03).
const check=(ok,message)=>{if(!ok)throw new Error(message);};
const filled=(v,max=12000)=>typeof v==='string'&&v.trim().length>0&&v.length<=max;
const sha=v=>createHash('sha256').update(typeof v==='string'?v:JSON.stringify(v)).digest('hex');
const EXPORTABLE_CLASSES=['public','internal'];

export class KnowledgeBase {
  constructor(company,{clock=()=>new Date(),research=null}={}){
    this.company=company;this.db=company.db;this.clock=clock;this.research=research;
    this.db.exec(`CREATE TABLE IF NOT EXISTS knowledge_items(id TEXT NOT NULL,revision INTEGER NOT NULL,body TEXT NOT NULL,status TEXT NOT NULL,created_by TEXT NOT NULL,approved_by TEXT,created_at TEXT NOT NULL,PRIMARY KEY(id,revision));
      CREATE TABLE IF NOT EXISTS knowledge_exports(relative_path TEXT PRIMARY KEY,content_hash TEXT NOT NULL,exported_at TEXT NOT NULL);`);
    if(research){research.reverifyHooks=[...(research.reverifyHooks??[]),({observation_ids})=>this.flagForRecheck(observation_ids)];}
  }
  now(){return this.clock().toISOString();}
  propose(actor,input){
    this.company.employee(actor);
    check(filled(input.id,200)&&filled(input.title,300)&&filled(input.conclusion,4000)&&filled(input.conditions,2000)&&filled(input.not_applicable,2000),'Title, conclusion, conditions and non-applicable range required');
    check(Array.isArray(input.source_refs)&&input.source_refs.length>0&&input.source_refs.every(s=>filled(s,300)),'Source references required');
    check(/^(company|venture:.+|customer:.+)$/.test(input.scope??''),'Scope must be company, venture:<id> or customer:<ref>');
    check(['public','internal','restricted','customer_confidential'].includes(input.classification),'Classification required');
    check(['HYPOTHESIS','OBSERVED_IN_EXPERIMENT','APPROVED_LESSON'].includes(input.verification??'HYPOTHESIS')&&input.verification!=='APPROVED_LESSON','Lessons are approved separately, not self-declared');
    check(filled(input.review_after,64)&&Number.isFinite(Date.parse(input.review_after)),'Review date required (no permanent truths)');
    if(input.scope.startsWith('customer:'))check(input.classification==='customer_confidential','Customer-scoped knowledge must be customer_confidential');
    const last=this.db.prepare('SELECT * FROM knowledge_items WHERE id=? ORDER BY revision DESC LIMIT 1').get(input.id);
    const body={title:input.title,conclusion:input.conclusion,conditions:input.conditions,counterevidence:input.counterevidence??[],not_applicable:input.not_applicable,source_refs:input.source_refs,
      scope:input.scope,classification:input.classification,verification:input.verification??'HYPOTHESIS',review_after:new Date(input.review_after).toISOString()};
    if(last&&last.body===JSON.stringify(body))return this.get(input.id);
    const revision=(last?.revision??0)+1;
    this.db.prepare("INSERT INTO knowledge_items VALUES(?,?,?,'PROPOSED',?,NULL,?)").run(input.id,revision,JSON.stringify(body),actor,this.now());
    this.company.event(actor,'KNOWLEDGE_PROPOSED',input.id,{revision});return this.get(input.id);
  }
  approve(actor,id){
    check(['KNOWLEDGE_CHIEF','INFORMATION_DIRECTOR','AUDITOR'].includes(actor),'Only knowledge management or the auditor approves reusable knowledge');
    const k=this.get(id);check(k.created_by!==actor,'Self-approval forbidden');check(k.status==='PROPOSED','Not awaiting approval');
    const body={...k.body,verification:k.body.verification==='OBSERVED_IN_EXPERIMENT'?'APPROVED_LESSON':k.body.verification};
    this.db.prepare("UPDATE knowledge_items SET status='ACTIVE',approved_by=?,body=? WHERE id=? AND revision=?").run(actor,JSON.stringify(body),id,k.revision);
    this.company.event(actor,'KNOWLEDGE_APPROVED',id,{revision:k.revision});return this.get(id);
  }
  get(id){const r=this.db.prepare('SELECT * FROM knowledge_items WHERE id=? ORDER BY revision DESC LIMIT 1').get(id);check(r,'Unknown knowledge');
    const body=JSON.parse(r.body);const expired=r.status==='ACTIVE'&&Date.parse(body.review_after)<=this.clock().getTime();return {...r,body,status:expired?'NEEDS_RECHECK':r.status,expired};}
  all(){return this.db.prepare('SELECT id FROM knowledge_items GROUP BY id ORDER BY id').all().map(r=>this.get(r.id));}
  flagForRecheck(observation_ids){
    const ids=new Set(observation_ids),flagged=[];
    for(const k of this.all())if(k.body.source_refs.some(s=>ids.has(s))&&k.status!=='NEEDS_RECHECK'){this.db.prepare("UPDATE knowledge_items SET status='NEEDS_RECHECK' WHERE id=? AND revision=?").run(k.id,k.revision);flagged.push('knowledge:'+k.id);}
    return flagged;
  }
  /** Policy check for export (K01). Returns the reason it may not leave the company record. */
  exportBlock(k){
    if(!k.body.scope.match(/^(company|venture:)/))return 'customer-scoped';
    if(!EXPORTABLE_CLASSES.includes(k.body.classification))return 'classification-'+k.body.classification;
    if(k.status!=='ACTIVE')return 'status-'+k.status;
    return null;
  }
  /** One-way export. Manual edits are preserved; a candidate is written to 90_Conflicts instead (K02). */
  exportVault(directory,{research=this.research}={}){
    const root=path.resolve(directory);fs.mkdirSync(root,{recursive:true});check(!fs.lstatSync(root).isSymbolicLink(),'Vault root cannot be a symlink');
    const rows=[];
    const write=(rel,content)=>{
      ensureSafe(root,rel);const target=path.join(root,rel),hash=sha(content);
      const expected=this.db.prepare('SELECT content_hash FROM knowledge_exports WHERE relative_path=?').get(rel)?.content_hash;
      if(fs.existsSync(target)){
        const current=sha(fs.readFileSync(target,'utf8'));
        if(current===hash){rows.push({path:rel,status:'unchanged'});return;}
        if(!expected||current!==expected){const c=`90_Conflicts/${sha(rel).slice(0,12)}-${hash.slice(0,12)}.md`;safeWrite(root,c,`# 更新候補：${rel}\n\n手動編集を保護したため元ノートは変更していません。\n\n${content}`);rows.push({path:rel,status:'conflict',candidate:c});return;}
      }
      safeWrite(root,rel,content);this.db.prepare('INSERT OR REPLACE INTO knowledge_exports VALUES(?,?,?)').run(rel,hash,this.now());rows.push({path:rel,status:'written'});
    };
    const fm=o=>'---\n'+Object.entries(o).map(([k,v])=>`${k}: ${JSON.stringify(v)}`).join('\n')+'\n---\n';
    const skipped=[];
    for(const k of this.all()){
      const block=this.exportBlock(k);if(block){skipped.push({id:k.id,reason:block});continue;}
      write(`60_Lessons/${k.id}.md`,fm({id:k.id,type:'knowledge',revision:k.revision,source_refs:k.body.source_refs,verification:k.body.verification,scope:k.body.scope,classification:k.body.classification,review_after:k.body.review_after,updated_at:k.created_at})+
        `# ${k.body.title}\n\n## 結論\n${k.body.conclusion}\n\n## 条件\n${k.body.conditions}\n\n## 反証\n${k.body.counterevidence.map(c=>'- '+c).join('\n')||'- 記録なし'}\n\n## 使えない範囲\n${k.body.not_applicable}\n\n> このノートは出力です。編集しても資金・許可・業務記録は変わりません。\n`);
    }
    if(research){
      for(const o of research.opportunities()){
        const ev=research.evaluateCandidate(o.id,o.revision);
        write(`30_Research/${o.id}.md`,fm({id:o.id,type:'opportunity',revision:o.revision,source_refs:o.body.evidence.observation_ids,verification:'AI_HYPOTHESIS_WITH_PUBLIC_OBSERVATIONS',classification:'internal',updated_at:o.created_at})+
          `# 機会：${o.body.build.minimum_offer}\n\n- 対象：${o.body.target.country}/${o.body.target.language}・${o.body.target.user}（支払者：${o.body.target.payer}）\n- 価値：${o.body.value.problem_or_desire}\n- 代替：${o.body.value.alternative}\n- 判定：${ev.recommendation}\n- 阻害：${ev.blockers.join('、')||'なし'}\n- 不足：${ev.gaps.join('、')||'なし'}\n- 独立した元情報：${ev.evidence.independent_origin_groups}（生の観測 ${ev.evidence.raw_observations}、検索抜粋のみ ${ev.evidence.snippet_only}）\n\n## 反証\n${o.body.counterevidence.map(c=>'- '+c.text).join('\n')}\n`);
      }
    }
    write('README.md','# AI会社・知識保管庫（出力専用）\n\nこの保管庫は会社OSの業務正本から一方向に出力されます。ノートの編集で予算・許可・業務記録は変わりません。指示は管理画面から本人認証のうえ行ってください。\n');
    return {root,files:rows.length,conflicts:rows.filter(r=>r.status==='conflict').length,skipped,results:rows};
  }
}
