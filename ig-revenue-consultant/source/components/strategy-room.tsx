"use client";
import {useMemo,useState} from "react";
import {ArrowRight,ChevronRight,FileText,ShieldCheck,Sparkles,MessageCircle,Lightbulb,UserRound,Gem,Coins,AlertTriangle,Pencil,CheckCircle2,CircleDashed,HelpCircle,RotateCw} from "lucide-react";
import {useWorkspace} from "./workspace-context";
import {Button,Status} from "./ui";
import {Onboarding} from "./onboarding";
import {money,totals} from "@/lib/domain";
import {today,now} from "@/lib/model";
import type {Canvas,Report,ReportV2} from "@/lib/model";
import {consultPeriod,periodTotals,rulesReportV2,staleness,knowledgeLabel,nextDecisionLabel,reviewQueue,briefGaps,actionKindLabel,originKey} from "@/lib/consult";

export const canvasMeta:{key:"audience"|"value"|"reward";n:string;english:string;title:string;lead:string;icon:typeof UserRound}[]=[
 {key:"audience",n:"01",english:"AUDIENCE INSIGHT",title:"視聴者の課題",lead:"あなたのフォロワーが、どんな悩みや欲求を持っているか。",icon:UserRound},
 {key:"value",n:"02",english:"VALUE DESIGN",title:"価値の届け方",lead:"その課題に、どんな価値をどの形（投稿・企画・素材など）で届けるか。",icon:Gem},
 {key:"reward",n:"03",english:"REWARD LOGIC",title:"報酬が生まれる条件",lead:"誰が、どんな条件で対価を払うか。信頼が報酬につながる仕組み。",icon:Coins},
];
export const canvasStatus={hypothesis:{label:"まだ仮説です",tone:"copper",icon:CircleDashed},needs_check:{label:"要確認",tone:"ice",icon:HelpCircle},confirmed:{label:"確認済み",tone:"ok",icon:CheckCircle2}} as const;
export const modeLabel=(r?:Report)=>!r?"保存前のルール診断":r.mode==="model"?"生成AI（Claude API）の提案":r.mode==="import"?"外部AIから取り込んだ提案":"ルール診断（生成AIではありません）";

export function StrategyRoom(){
 const {state,signature,demo,readOnly}=useWorkspace();
 const fresh=state.brief.completedAt===""&&!state.sources.length&&!state.ledger.length&&!state.evidence.length&&!state.reports.length;
 const [onboarding,setOnboarding]=useState(fresh);
 if(onboarding&&!readOnly||onboarding&&demo)return <Onboarding onDone={()=>setOnboarding(false)}/>;
 return <Brief key={signature} onReopen={()=>setOnboarding(true)}/>;
}

function Brief({onReopen}:{onReopen:()=>void}){
 const {state,signature,busy,runAI,adopt,open,setView,consult}=useWorkspace();
 const latest=[...state.reports].reverse().find(r=>r.v2);
 const freshness=staleness(latest,signature);
 const period=consultPeriod(state,today());
 const preview=useMemo(()=>rulesReportV2(state,{topic:"diagnose",request:"",revision:0,signature:"0".repeat(64),createdAt:now(),period}),[state,period]);
 const report:ReportV2=latest?.v2&&freshness==="current"?latest.v2:latest?.v2&&freshness==="stale"?latest.v2:preview;
 const action=report.actions.find(a=>a.id===report.recommendedActionId)||report.actions[0];
 const adoptedId=latest&&action?state.experiments.find(e=>e.origin===originKey(latest.id,action.id))?.id:undefined;
 const t=periodTotals(state,period);const all=totals(state);
 const queue=reviewQueue(state,today());const reviewContents=state.contents.filter(c=>c.status==="review");const unverified=state.sources.filter(s=>s.eligibility!=="verified");
 const focusKey=(["audience","value","reward"] as const).find(k=>state.canvas[k].status!=="confirmed")||"reward";
 async function diagnoseThenAdopt(){const r=await runAI("rules","analysis","",false,undefined,{topic:"diagnose"});if(r?.v2?.recommendedActionId){const id=await adopt(r.id,r.v2.recommendedActionId);if(id)open({type:"experiment",id});}}
 async function adoptLatest(){if(!latest||!action)return;const id=await adopt(latest.id,action.id);if(id)open({type:"experiment",id});}
 const primary=state.profile.paused?<Button className="advisor-cta" onClick={()=>setView("settings")}>再開の条件を確認する<ArrowRight size={18} aria-hidden="true"/></Button>
  :freshness==="stale"?<Button className="advisor-cta" disabled={busy} onClick={()=>void runAI("rules","analysis","",false,undefined,{topic:"diagnose"})}><RotateCw size={18} aria-hidden="true"/>最新の記録で診断し直す</Button>
  :adoptedId?<Button className="advisor-cta" onClick={()=>open({type:"experiment",id:adoptedId})}>作成した施策を開く<ArrowRight size={18} aria-hidden="true"/></Button>
  :freshness==="current"?<Button className="advisor-cta" disabled={busy||!action} onClick={()=>void adoptLatest()}>この施策を下書きにする<ArrowRight size={18} aria-hidden="true"/></Button>
  :<Button className="advisor-cta" disabled={busy||!action} onClick={()=>void diagnoseThenAdopt()}>診断を保存して下書きにする<ArrowRight size={18} aria-hidden="true"/></Button>;
 const basis=latest&&freshness!=="unknown"?`${new Date(latest.createdAt).toLocaleDateString("ja-JP",{timeZone:"Asia/Tokyo"})} 時点の記録に基づく`:"現在の登録データから算出（まだ保存していません）";
 const refs=report.evidenceRefs.slice(0,4);
 return <div className="room">
  <section className="room-hero" aria-labelledby="room-title">
   <p className="eyebrow">あなたの戦略ブリーフ</p>
   <h1 id="room-title" tabIndex={-1} className="display">今日、変えるのは<wbr/>このひとつ。</h1>
   {action?<div className="focus-action"><span className="focus-kind">{actionKindLabel[action.kind]}</span><h2>{action.title}</h2><p>{action.whyThisFirst}</p><dl className="focus-meta"><div><dt>変えること</dt><dd>{action.change}</dd></div><div><dt>観察する指標</dt><dd>{action.mainMetric}</dd></div><div><dt>期限・上限</dt><dd>{action.deadline?`${action.deadline}まで`:"期限は未設定"} ・ {action.costLimitJPY===null?"費用上限は未設定":action.costLimitJPY===0?"費用をかけない":`費用 ${money(action.costLimitJPY)}まで`} ・ {action.timeLimitMinutes===null?"時間上限は未設定":`${Math.round(action.timeLimitMinutes/60*10)/10}時間まで`}</dd></div></dl></div>:<p className="lead">いまは施策を作るための情報が足りません。下の戦略キャンバスから始めましょう。</p>}
   {freshness==="stale"&&<div className="stale-note" role="status"><AlertTriangle size={18} aria-hidden="true"/><div><strong>前回の提案のあとに、記録が更新されています。</strong><p>{latest&&new Date(latest.createdAt).toLocaleString("ja-JP",{timeZone:"Asia/Tokyo"})} の提案は、現在の実績を反映していません。前回の判断は履歴に残したまま、最新の記録で診断し直せます。</p>{action&&latest&&<button className="text-btn" disabled={busy} onClick={()=>void adoptLatest()}>前回の提案のまま下書きにする<ChevronRight size={15} aria-hidden="true"/></button>}</div></div>}
  </section>

  <aside className="advisor" aria-labelledby="advisor-title">
   <div className="advisor-head"><div><h2 id="advisor-title">AIの視点</h2><p>{modeLabel(freshness==="unknown"?undefined:latest)}</p></div><Sparkles size={22} aria-hidden="true" className="copper-text"/></div>
   <p className="advisor-summary">{report.summary}</p>
   <div className="advisor-tags"><Status tone={report.diagnosis.knowledgeState==="supported"?"ok":report.diagnosis.knowledgeState==="tentative"?"ice":"copper"}>{knowledgeLabel[report.diagnosis.knowledgeState]}</Status><Status tone="muted">次の判断：{nextDecisionLabel[report.nextDecision]}</Status></div>
   <small className="advisor-basis">{basis}</small>
   <div className="advisor-links"><button onClick={()=>consult("","analysis","diagnose")}><MessageCircle size={19} aria-hidden="true"/>相談室で理由を深める<ChevronRight size={17} aria-hidden="true"/></button><button onClick={()=>consult("自社商品を販売せずに、少ないフォロワーでも検証できる収益構造を比べてください。","strategy","strategy")}><Lightbulb size={19} aria-hidden="true"/>販売以外の仕組みを探す<ChevronRight size={17} aria-hidden="true"/></button></div>
   {primary}
  </aside>

  <section className="canvas" aria-labelledby="canvas-title">
   <div className="section-title"><h2 id="canvas-title">戦略キャンバス</h2><p>戦略上の仮説です。因果関係を証明したものではありません。確認済みにするには、確認済みの根拠が必要です。</p></div>
   <ol className="canvas-flow">{canvasMeta.map((m,i)=><CanvasCard key={m.key} meta={m} node={state.canvas[m.key]} focus={focusKey===m.key} last={i===canvasMeta.length-1}/>)}</ol>
  </section>

  <section className="evidence-band" aria-labelledby="evidence-title">
   <div className="section-title"><h2 id="evidence-title">根拠と未確認点</h2><p>事実に基づいた判断のために、出典や条件を確認しましょう。</p></div>
   <div className="evidence-columns">
    <div><h3>この判断の根拠</h3>{refs.length?<ul className="ref-list">{refs.map(r=><li key={r.refId}><Status tone={r.verification==="verified"?"ok":r.verification==="self_reported"?"muted":"copper"}>{r.verification==="verified"?"確認済み":r.verification==="self_reported"?"本人の記録":"未確認"}</Status><span>{r.label}</span></li>)}</ul>:<p className="muted">まだ根拠として示せる記録がありません。</p>}</div>
    <div><h3>まだ分からないこと</h3>{report.understoodContext.unknowns.length?<ul className="unknown-list">{report.understoodContext.unknowns.slice(0,4).map(u=><li key={u}>{u}</li>)}</ul>:<p className="muted">大きな未確認点は見つかっていません。</p>}</div>
   </div>
   <div className="band-actions"><button className="band-action" onClick={()=>open({type:"evidence"})}><FileText size={20} aria-hidden="true"/><span><strong>出典を追加</strong><small>参考にした情報の出典を記録し、根拠を明確にします。</small></span><ChevronRight size={18} aria-hidden="true"/></button><button className="band-action" onClick={()=>setView("sources")}><ShieldCheck size={20} aria-hidden="true"/><span><strong>利用条件を確認</strong><small>報酬の資格・契約・支払条件を確認します。{unverified.length?`未確認 ${unverified.length}件`:""}</small></span><ChevronRight size={18} aria-hidden="true"/></button></div>
  </section>

  <section className="ledger-strip" aria-labelledby="summary-title">
   <h2 id="summary-title" className="visually-hidden">実績と保留の要約</h2>
   <div className="strip-item"><span>対象期間</span><strong>{period.start.replaceAll("-","/")} – {period.end.slice(5).replace("-","/")}</strong><small>{state.brief.periodStart?"初回ヒアリングで設定":"当月（期間は設定で変更）"}</small></div>
   <div className="strip-item"><span>記録ベースの利益</span><strong className={t.profit<0?"negative":""}>{money(t.profit)}</strong><small>{t.count?`確定報酬 ${t.count}件から`:"確定報酬の記録なし"}{state.ledger.some(e=>e.kind==="earning")&&!state.ledger.some(e=>e.kind==="cost"&&e.category==="labor")?" ・工数未記録":""}</small></div>
   <div className="strip-item"><span>承認待ち</span><strong>{money(t.pending)}</strong><small>利益には含めていません</small></div>
   <div className="strip-item queue"><span>次に確認すること</span><ul>{queue.length>0&&<li><button onClick={()=>setView("experiments")}>判定時期の施策 {queue.length}件</button></li>}{reviewContents.length>0&&<li><button onClick={()=>setView("content")}>承認待ちの投稿 {reviewContents.length}件</button></li>}{unverified.length>0&&<li><button onClick={()=>setView("sources")}>条件未確認の収益源 {unverified.length}件</button></li>}{briefGaps(state).length>0&&<li><button onClick={onReopen}>あなたについての未整理 {briefGaps(state).length}項目</button></li>}{!queue.length&&!reviewContents.length&&!unverified.length&&!briefGaps(state).length&&<li className="muted">保留中の確認はありません</li>}</ul></div>
  </section>
  {all.count===0&&state.ledger.length===0&&<p className="room-footnote"><ShieldCheck size={15} aria-hidden="true"/>収益の数字は、あなたが記録した確定報酬・費用だけから計算します。架空の成果や予測は表示しません。</p>}
 </div>;
}

function CanvasCard({meta,node,focus,last}:{meta:typeof canvasMeta[number];node:Canvas["audience"];focus:boolean;last:boolean}){
 const {open,state}=useWorkspace();const st=canvasStatus[node.status];const linked=state.evidence.filter(e=>node.evidenceIds.includes(e.id));
 return <li className={`canvas-card ${focus?"focus":""}`}>
  <div className="canvas-index"><span className="canvas-n">{meta.n}</span><span className="canvas-en">{meta.english}</span>{focus&&<span className="canvas-now">いま確かめるところ</span>}</div>
  <h3>{meta.title}</h3>
  <p className={node.text?"canvas-text":"canvas-text is-empty"}>{node.text||meta.lead}</p>
  <div className={`canvas-status tone-${st.tone}`}><st.icon size={22} aria-hidden="true"/><div><strong>{st.label}</strong><small>{node.status==="confirmed"?`確認済みの根拠 ${linked.filter(e=>e.verified).length}件`:node.text?linked.length?`根拠 ${linked.length}件（未確認を含む）`:"根拠はまだ紐付いていません":"まだ記入されていません"}</small></div></div>
  <button className="canvas-edit" onClick={()=>open({type:"canvas",kind:meta.key})} aria-label={`${meta.title}を編集`}><Pencil size={16} aria-hidden="true"/>編集</button>
  {!last&&<span className="canvas-arrow" aria-hidden="true"><ArrowRight size={22}/></span>}
 </li>;
}
