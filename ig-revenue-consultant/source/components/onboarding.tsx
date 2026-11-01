"use client";
import {useState} from "react";
import {ArrowLeft,ArrowRight,Check} from "lucide-react";
import {useWorkspace} from "./workspace-context";
import {Button,Field,Input,Textarea,Select} from "./ui";
import {now} from "@/lib/model";
import type {Brief,State} from "@/lib/model";
import {briefGaps} from "@/lib/consult";
import {money} from "@/lib/domain";

type Draft={brief:Brief;audience:string;targetProfit:number;weeklyHours:number;budget:number};
const steps=[
 {title:"何を目指すか",lead:"売上と手取りは分けて考えます。決めきれなければ空欄のままで構いません。"},
 {title:"何ができるか",lead:"実績・経験・素材・提供できる量。あなたの申告として保存し、確認済みの根拠とは区別します。"},
 {title:"誰へ届けたいか",lead:"対象者と、その人の課題。ここが戦略キャンバスの出発点になります。"},
 {title:"どこまで実行できるか",lead:"使える時間・費用・避けたい方法。提案はこの範囲を超えないようにします。"},
 {title:"どこまで分かるか",lead:"既存の実績や接続の状況。後回しでも大丈夫です。分からないことは推定で埋めません。"},
];

/** 初回ヒアリング：5段階。各段階で保存し、中断しても再開できる。既存のプロフィールを初期値にする。 */
export function Onboarding({onDone}:{onDone:()=>void}){
 const {state,save,busy}=useWorkspace();
 const [step,setStep]=useState(Math.min(state.brief.step,4));
 const [d,setD]=useState<Draft>({brief:structuredClone(state.brief),audience:state.profile.audience,targetProfit:state.profile.targetProfit,weeklyHours:state.profile.weeklyHours,budget:state.profile.budget});
 const b=(patch:Partial<Brief>)=>setD(x=>({...x,brief:{...x.brief,...patch}}));
 const apply=(s:State,nextStep:number,finish=false)=>{s.brief={...d.brief,step:nextStep,completedAt:finish?now():s.brief.completedAt};s.profile.audience=d.audience.slice(0,500);s.profile.targetProfit=d.targetProfit;s.profile.weeklyHours=d.weeklyHours;s.profile.budget=d.budget;
  if(finish){if(!s.canvas.audience.text&&(d.brief.audienceProblem||d.audience))s.canvas.audience={...s.canvas.audience,text:[d.audience,d.brief.audienceProblem].filter(Boolean).join("：").slice(0,12000)};if(!s.canvas.value.text&&d.brief.valueIdea)s.canvas.value={...s.canvas.value,text:d.brief.valueIdea};s.canvas.updatedAt=now();}};
 async function go(next:number){const ok=await save(s=>apply(s,Math.max(next,0)));if(ok)setStep(next);}
 async function finish(){const ok=await save(s=>apply(s,5,true));if(ok)onDone();}
 async function later(){const ok=await save(s=>apply(s,step,true));if(ok)onDone();}
 const preview={...state,brief:d.brief,profile:{...state.profile,audience:d.audience,targetProfit:d.targetProfit}} as State;
 const gaps=briefGaps(preview);
 const understood=[d.brief.goal&&`目指すこと：${d.brief.goal}`,d.targetProfit?`手取りの目標：${money(d.targetProfit)}`:"",d.brief.strengths&&`強み：${d.brief.strengths}`,d.audience&&`届けたい相手：${d.audience}`,d.brief.audienceProblem&&`その人の課題：${d.brief.audienceProblem}`,d.weeklyHours?`使える時間：週${d.weeklyHours}時間`:"",d.brief.face==="no"?"顔は出さない":""].filter(Boolean) as string[];
 return <div className="onboarding">
  <header className="onboarding-head"><p className="eyebrow">はじめに ・ 5つの短い質問</p><h1 tabIndex={-1} className="display">あなたのことを、<wbr/>まず理解させてください。</h1><p className="lead">フォロワーが少なくても、対象と価値を絞れば検証は始められます。分かる範囲で答えてください。</p></header>
  <ol className="stepper" aria-label="ヒアリングの進み具合">{steps.map((s,i)=><li key={s.title} className={i===step?"current":i<step?"done":""} aria-current={i===step?"step":undefined}><span className="step-n">{i<step?<Check size={14} aria-hidden="true"/>:i+1}</span><span className="step-label">{s.title}</span></li>)}</ol>
  <div className="onboarding-body">
   <form className="onboarding-form" onSubmit={e=>{e.preventDefault();void (step<4?go(step+1):finish());}}>
    <h2>{step+1}. {steps[step].title}</h2><p className="muted">{steps[step].lead}</p>
    {step===0&&<><Field label="Instagramで目指すこと" hint="例：自社商品を作らずに、協賛で月の手取りを作れるか確かめたい"><Textarea rows={3} value={d.brief.goal} onChange={e=>b({goal:e.target.value})} maxLength={2000}/></Field><div className="form-two"><Field label="対象期間の開始"><Input type="date" value={d.brief.periodStart} onChange={e=>b({periodStart:e.target.value})}/></Field><Field label="対象期間の終了"><Input type="date" value={d.brief.periodEnd} min={d.brief.periodStart||undefined} onChange={e=>b({periodEnd:e.target.value})}/></Field><Field label="売上の目標（円・任意）" hint="入金前の総額。利益とは別です。"><Input type="number" min="0" inputMode="numeric" value={d.brief.targetRevenue||""} onChange={e=>b({targetRevenue:Number(e.target.value)||0})}/></Field><Field label="手取りの目標（円・任意）" hint="費用・手数料を引いた記録ベースの利益。"><Input type="number" min="0" inputMode="numeric" value={d.targetProfit||""} onChange={e=>setD({...d,targetProfit:Number(e.target.value)||0})}/></Field></div></>}
    {step===1&&<><Field label="強み・実績・経験" hint="本人の申告として保存します。"><Textarea rows={3} value={d.brief.strengths} onChange={e=>b({strengths:e.target.value})}/></Field><Field label="使える素材" hint="例：作業画面の録画、検証メモ、撮影できる場所"><Textarea rows={2} value={d.brief.assets} onChange={e=>b({assets:e.target.value})}/></Field><Field label="提供できる量" hint="例：月2本の検証企画まで"><Input value={d.brief.capacity} onChange={e=>b({capacity:e.target.value})} maxLength={500}/></Field></>}
    {step===2&&<><Field label="届けたい相手"><Input value={d.audience} onChange={e=>setD({...d,audience:e.target.value})} placeholder="例：ひとりで事業を運営する人" maxLength={500}/></Field><Field label="その人が抱えている課題"><Textarea rows={3} value={d.brief.audienceProblem} onChange={e=>b({audienceProblem:e.target.value})} placeholder="例：繰り返し作業の手順づくりに時間を取られている"/></Field><Field label="届けられそうな価値（仮説で構いません）"><Textarea rows={2} value={d.brief.valueIdea} onChange={e=>b({valueIdea:e.target.value})} placeholder="例：実際に試した手順を、そのまま使える形で見せる"/></Field></>}
    {step===3&&<><div className="form-two"><Field label="週に使える時間"><Input type="number" min="0" max="168" step="0.5" value={d.weeklyHours} onChange={e=>setD({...d,weeklyHours:Number(e.target.value)||0})}/></Field><Field label="運用費の上限目安（円）" hint="0なら費用をかけない前提で考えます。"><Input type="number" min="0" inputMode="numeric" value={d.budget} onChange={e=>setD({...d,budget:Number(e.target.value)||0})}/></Field><Field label="顔を出す"><Select value={d.brief.face} onChange={e=>b({face:e.target.value as Brief["face"]})}><option value="undecided">未定</option><option value="yes">出してよい</option><option value="no">出さない</option></Select></Field><Field label="声を出す"><Select value={d.brief.voice} onChange={e=>b({voice:e.target.value as Brief["voice"]})}><option value="undecided">未定</option><option value="yes">出してよい</option><option value="no">出さない</option></Select></Field></div><Field label="避けたい方法・表現"><Textarea rows={2} value={d.brief.avoid} onChange={e=>b({avoid:e.target.value})} placeholder="例：無差別なDM、誇大な成果表現"/></Field></>}
    {step===4&&<><Field label="いま手元にある実績・データ" hint="例：Instagramは未接続、報酬の記録はまだない"><Textarea rows={3} value={d.brief.dataNote} onChange={e=>b({dataNote:e.target.value})}/></Field><p className="small-note">実績の記録・Instagramの接続・調査資料は、あとから収益戦略や設定で追加できます。</p></>}
    <div className="onboarding-actions">{step>0&&<Button type="button" variant="ghost" disabled={busy} onClick={()=>void go(step-1)}><ArrowLeft size={17} aria-hidden="true"/>戻る</Button>}<span className="spacer"/><button type="button" className="text-btn" disabled={busy} onClick={()=>void later()}>あとで整理する</button><Button type="submit" disabled={busy}>{step<4?<>保存して次へ<ArrowRight size={17} aria-hidden="true"/></>:<>整理して戦略ルームへ<ArrowRight size={17} aria-hidden="true"/></>}</Button></div>
   </form>
   <aside className="understood" aria-labelledby="understood-title"><h2 id="understood-title">いま分かっていること</h2>{understood.length?<ul>{understood.map(u=><li key={u}>{u}</li>)}</ul>:<p className="muted">まだ何も伺っていません。分かる範囲で構いません。</p>}<h3>次に必要な情報</h3>{gaps.length?<ul className="unknown-list">{gaps.map(g=><li key={g}>{g}</li>)}</ul>:<p className="muted">最初の診断に必要な情報はそろいました。</p>}<p className="small-note">ここに書いた内容は、あなた自身の申告として扱います。確認済みの根拠とは区別して表示します。</p></aside>
  </div>
 </div>;
}
