import { ledgerSchema, newId, now } from "./model.ts";
import type { Ledger } from "./model.ts";
export function parseCSV(input:string):string[][] {
 const rows:string[][]=[];let row:string[]=[],value="",quoted=false;const s=input.replace(/^\uFEFF/,"");
 for(let i=0;i<s.length;i++){const c=s[i];if(c==='"'){if(quoted&&s[i+1]==='"'){value+='"';i++;}else quoted=!quoted;}
 else if(c===","&&!quoted){row.push(value);value="";}else if((c==="\n"||c==="\r")&&!quoted){if(c==="\r"&&s[i+1]==="\n")i++;row.push(value);if(row.some(x=>x.trim()))rows.push(row);row=[];value="";}else value+=c;}
 if(quoted)throw new Error("CSVの引用符が閉じられていません。");row.push(value);if(row.some(x=>x.trim()))rows.push(row);return rows;
}
export function importLedgerCSV(input:string,existing:Ledger[],sourceIds:Set<string>){
 const rows=parseCSV(input);if(rows.length<2)throw new Error("見出しと明細を入力してください。");const header=rows[0].map(x=>x.trim());const required=["source_id","external_id","kind","status","amount","date","title"];for(const h of required)if(!header.includes(h))throw new Error(`必須列 ${h} がありません。`);
 if(rows.length>1001)throw new Error("1回に取り込める明細は1,000件までです。");const added:Ledger[]=[];let skipped=0;const seen=new Set(existing.filter(x=>x.externalId).map(x=>`${x.sourceId}:${x.kind}:${x.externalId}`));
 for(let i=1;i<rows.length;i++){const o=Object.fromEntries(header.map((h,j)=>[h,rows[i][j]||""]));if(!o.external_id.trim())throw new Error(`${i+1}行目：外部明細IDが必要です。`);if(!o.amount.trim()||!/^\d+$/.test(o.amount.trim()))throw new Error(`${i+1}行目：金額は0以上の整数で指定してください。`);if(!sourceIds.has(o.source_id))throw new Error(`${i+1}行目：収益源IDを確認してください。`);
  const e=ledgerSchema.parse({id:newId(),sourceId:o.source_id,externalId:o.external_id,kind:o.kind,status:o.status,amount:Number(o.amount),fee:Number(o.fee||0),date:o.date,title:o.title,referenceId:o.reference_id||"",category:o.category||"",minutes:Number(o.minutes||0),note:o.note||"",createdAt:now()});
  const key=`${e.sourceId}:${e.kind}:${e.externalId}`;if(seen.has(key)){skipped++;continue;}seen.add(key);added.push(e);
 }
 return {added,skipped};
}
export const csvHeader="source_id,external_id,kind,status,amount,fee,date,title,reference_id,category,minutes,note";
export function ledgerCSV(items:Ledger[]){const quote=(s:unknown)=>`"${String(s??"").replaceAll('"','""')}"`;return "\uFEFF"+csvHeader+"\n"+items.map(e=>[e.sourceId,e.externalId,e.kind,e.status,e.amount,e.fee,e.date,e.title,e.referenceId,e.category,e.minutes,e.note].map(quote).join(",")).join("\n");}
