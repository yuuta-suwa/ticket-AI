"use client";
import {useState} from "react";
import {toast} from "sonner";
import {useWorkspace} from "./workspace-context";
import {Button,Dialog,Field,Textarea,Select} from "./ui";
import {now} from "@/lib/model";
import type {Canvas} from "@/lib/model";
import {canvasMeta} from "./strategy-room";

/** 戦略キャンバスの1要素を編集する。確認済みには確認済みの根拠が必要（domain.validateRelationsで強制）。 */
export function CanvasEditor({kind}:{kind:string}){
 const {state,save,close,busy,open}=useWorkspace();
 const meta=canvasMeta.find(m=>m.key===kind)||canvasMeta[0];
 const [node,setNode]=useState<Canvas["audience"]>(structuredClone(state.canvas[meta.key]));
 const verifiedLinked=state.evidence.some(e=>e.verified&&node.evidenceIds.includes(e.id));
 async function submit(e:React.FormEvent){e.preventDefault();if(node.status==="confirmed"&&!verifiedLinked){toast.error("確認済みにするには、確認済みの根拠を1件以上選んでください。");return;}const ok=await save(s=>{s.canvas[meta.key]=node;s.canvas.updatedAt=now();});if(ok){toast.success("戦略キャンバスを更新しました。");close();}}
 return <Dialog title={`${meta.n} ${meta.title}`} description={meta.lead} onClose={close}><form className="editor-form" onSubmit={submit}>
  <Field label="いまの考え"><Textarea rows={4} value={node.text} onChange={e=>setNode({...node,text:e.target.value})} maxLength={12000} placeholder="仮説で構いません。分かっていることと、推測を分けて書きます。"/></Field>
  <Field label="確かさ"><Select value={node.status} onChange={e=>setNode({...node,status:e.target.value as typeof node.status})}><option value="hypothesis">まだ仮説</option><option value="needs_check">要確認（確かめる段取りがある）</option><option value="confirmed">確認済み（確認済みの根拠がある）</option></Select></Field>
  <fieldset className="field"><legend>根拠として紐付ける資料</legend>{state.evidence.length?state.evidence.map(e=><label className="check-row" key={e.id}><input type="checkbox" checked={node.evidenceIds.includes(e.id)} onChange={ev=>setNode({...node,evidenceIds:ev.target.checked?[...node.evidenceIds,e.id]:node.evidenceIds.filter(id=>id!==e.id)})}/><span>{e.title}<small>{e.verified?"確認済みの資料":"未確認の資料（確認済みの根拠にはなりません）"}</small></span></label>):<p className="small-note">まだ資料がありません。<button type="button" className="text-btn" onClick={()=>open({type:"evidence"})}>資料を追加する</button></p>}</fieldset>
  <div className="modal-footer"><span className="spacer"/><Button type="button" variant="secondary" onClick={close}>閉じる</Button><Button type="submit" disabled={busy}>保存する</Button></div>
 </form></Dialog>;
}
