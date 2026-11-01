"use client";
import {useEffect,useRef,useState} from "react";
import {toast} from "sonner";
import {Plus,Copy,Upload,Sparkles,ClipboardCheck,MessageSquareText,BookOpen,RotateCw} from "lucide-react";
import {useWorkspace} from "./workspace-context";
import {Button,Status,Textarea,copyText} from "./ui";
import {ReportView} from "./report-view";
import {canvasMeta,canvasStatus} from "./strategy-room";
import {consultTopics,newId,today} from "@/lib/model";
import type {ConsultTopic} from "@/lib/model";
import {buildConsultPrompt,consultPeriod,topicInfo} from "@/lib/consult";
import {money} from "@/lib/domain";

/** 相談室：テーマ → 相談 → 構造化された提案 → 採用/保留/不採用。会話と判断はセッションとして保存する。 */
export function ConsultRoom(){
 const {state,busy,runAI,connections,consultRequest,consultTopic,open,setView,demo,readOnly}=useWorkspace();
 const sessions=[...state.sessions].reverse();
 const [sessionId,setSessionId]=useState<string>(consultRequest?"":sessions[0]?.id||"");
 const session=state.sessions.find(s=>s.id===sessionId);
 const [topic,setTopic]=useState<ConsultTopic>(session?.topic||consultTopic);
 const [request,setRequest]=useState(consultRequest);
 const [importing,setImporting]=useState(false);const [json,setJson]=useState("");const [web,setWeb]=useState(false);
 const [legacy,setLegacy]=useState("");
 const threadEnd=useRef<HTMLDivElement>(null);
 const connected=connections.connections?.some(c=>c.provider==="claude");
 const p=state.profile;
 const apiReady=Boolean(connected&&p.aiEnabled&&p.dailyAILimit>0&&p.monthlyTokenLimit>0&&!p.paused&&!demo);
 const apiBlocked=!connected?"Claude APIは未接続です":!p.aiEnabled?"有料実行は無効です":p.dailyAILimit<1?"1日の実行上限が0です":p.monthlyTokenLimit<1?"月間トークン上限が未設定です":p.paused?"運用停止中です":demo?"デモでは実行しません":"";
 const legacyReports=state.reports.filter(r=>!r.sessionId).slice().reverse();
 const shownLegacy=legacyReports.find(r=>r.id===legacy);
 useEffect(()=>{threadEnd.current?.scrollIntoView({block:"end"});},[session?.turns.length]);
 function startNew(t:ConsultTopic=topic){setSessionId("");setLegacy("");setTopic(t);setRequest("");setImporting(false);}
 async function send(mode:"rules"|"model"|"import"){
  const id=sessionId||newId();
  const r=await runAI(mode,topicInfo[topic].task,request,mode==="model"&&web,mode==="import"?json:undefined,{topic,sessionId:id});
  if(r){setSessionId(id);setRequest("");if(mode==="import"){setJson("");setImporting(false);}}
 }
 async function copyPrompt(){try{await copyText(buildConsultPrompt(state,topic,request,consultPeriod(state,today())));toast.success("登録データ付きの相談プロンプトをコピーしました。ChatGPTやClaudeに貼り付け、返ってきたJSONを取り込めます。");}catch(e){toast.error(String(e));}}
 const lastAdvisor=session?.turns.filter(t=>t.role==="advisor").at(-1);
 const known=[state.brief.goal&&`目的：${state.brief.goal}`,state.brief.strengths&&`強み：${state.brief.strengths}`,(state.profile.audience||state.brief.audienceProblem)&&`相手と課題：${[state.profile.audience,state.brief.audienceProblem].filter(Boolean).join("／")}`,state.profile.weeklyHours?`使える時間：週${state.profile.weeklyHours}時間`:"",state.profile.budget?`費用の上限目安：${money(state.profile.budget)}`:""].filter(Boolean) as string[];
 return <div className="consult">
  <header className="page-head"><p className="eyebrow">相談室</p><h1 tabIndex={-1} className="display-sm">何を、一緒に決めましょうか。</h1><p className="lead">結論 → 根拠 → 仮説 → 施策 → 反証 → 次の判断の順で整理します。採用した施策は、そのまま下書きになります。</p></header>
  <div className="consult-grid">
   <aside className="sessions" aria-label="相談の履歴">
    <Button variant="secondary" className="full" onClick={()=>startNew()}><Plus size={17} aria-hidden="true"/>新しい相談</Button>
    {sessions.length>0?<ul>{sessions.map(s=><li key={s.id}><button className={s.id===sessionId?"active":""} aria-current={s.id===sessionId?"true":undefined} onClick={()=>{setSessionId(s.id);setLegacy("");setTopic(s.topic);}}><strong>{s.title}</strong><small>{topicInfo[s.topic].label} ・ {new Date(s.createdAt).toLocaleDateString("ja-JP",{timeZone:"Asia/Tokyo"})} ・ {s.turns.filter(t=>t.role==="advisor").length}回</small></button></li>)}</ul>:<p className="small-note">まだ相談の記録はありません。</p>}
    {legacyReports.length>0&&<details className="legacy-list"><summary>以前のレポート（{legacyReports.length}件）</summary><ul>{legacyReports.map(r=><li key={r.id}><button className={r.id===legacy?"active":""} onClick={()=>{setLegacy(r.id);setSessionId("");}}><strong>{r.result.nextExperiment.title}</strong><small>{new Date(r.createdAt).toLocaleDateString("ja-JP",{timeZone:"Asia/Tokyo"})} ・ {r.mode==="rules"?"ルール診断":r.mode==="import"?"取り込み":"生成AI"}</small></button></li>)}</ul></details>}
   </aside>

   <section className="thread" aria-label="相談の内容">
    {shownLegacy?<ReportView report={shownLegacy}/>:<>
    {!session&&<div className="topic-picker"><h2>相談のテーマ</h2><div className="topic-grid" role="radiogroup" aria-label="相談のテーマ">{consultTopics.map(t=><button key={t} role="radio" aria-checked={topic===t} className={topic===t?"active":""} onClick={()=>setTopic(t)}><strong>{topicInfo[t].label}</strong><span>{topicInfo[t].lead}</span></button>)}</div>
     <div className="known"><h3>すでに伺っていること</h3>{known.length?<ul>{known.map(k=><li key={k}>{k}</li>)}</ul>:<p className="muted">まだ伺っていません。戦略ルームの「あなたについての未整理」から短く整理できます。</p>}<small>ここにある内容は、もう一度お聞きしません。</small></div></div>}
    {session&&<div className="session-head"><Status tone="ice">{topicInfo[session.topic].label}</Status><h2>{session.title}</h2></div>}
    {session&&<ol className="turns">{session.turns.map(t=>{const report=t.reportId?state.reports.find(r=>r.id===t.reportId):undefined;return <li key={t.id} className={`turn is-${t.role}`}>{t.role==="user"?<div className="turn-user"><span className="turn-who">あなた</span><p className="preserve">{t.content}</p></div>:report?<div className="turn-advisor"><span className="turn-who">コンサルタント</span><ReportView report={report} primary={t.id===lastAdvisor?.id}/></div>:<div className="turn-advisor"><span className="turn-who">コンサルタント</span><p>{t.content}</p><small className="muted">このレポートは保存上限により整理されました。</small></div>}</li>;})}</ol>}
    <div ref={threadEnd}/>
    <form className="composer" onSubmit={e=>{e.preventDefault();void send(apiReady?"model":"rules");}} aria-busy={busy}>
     <label className="visually-hidden" htmlFor="consult-input">相談内容</label>
     <Textarea id="consult-input" rows={3} value={request} onChange={e=>setRequest(e.target.value)} maxLength={2000} placeholder={topicInfo[topic].placeholder}/>
     <div className="composer-meta"><small>{request.length}/2000</small>{apiReady&&<label className="check-row compact"><input type="checkbox" checked={web} onChange={e=>setWeb(e.target.checked)}/><span>Web検索を含める（最大3回・追加料金あり）</span></label>}</div>
     <div className="composer-actions">
      <Button type="submit" disabled={busy||(readOnly&&!demo)}>{busy?<><RotateCw size={17} className="spin" aria-hidden="true"/>整理しています…</>:apiReady?<><Sparkles size={17} aria-hidden="true"/>AIに相談する（Claude API・有料）</>:<><ClipboardCheck size={17} aria-hidden="true"/>登録データで診断する（無料）</>}</Button>
      {apiReady&&<button type="button" className="text-btn" disabled={busy} onClick={()=>void send("rules")}>無料のルール診断にする</button>}
      <button type="button" className="text-btn" onClick={()=>void copyPrompt()}><Copy size={15} aria-hidden="true"/>プロンプトをコピー</button>
      <button type="button" className="text-btn" aria-expanded={importing} onClick={()=>setImporting(!importing)}><Upload size={15} aria-hidden="true"/>外部AIの結果を取り込む</button>
     </div>
     <p className="mode-note" role="note">{apiReady?"API実行では、必要な登録データをClaudeへ送信します。提案は根拠と金額を検証してから保存します。投稿・送信・契約は行いません。":<>いまは<strong>ルール診断</strong>で整理します（生成AIではなく、自由文は解釈しません）。{apiBlocked}。文脈に沿った助言は、プロンプトをコピーして外部AIに相談し、結果のJSONを取り込めます。{!demo&&<button type="button" className="text-btn" onClick={()=>setView("settings")}>API設定へ</button>}</>}</p>
     {importing&&<div className="import-box"><label className="field"><span>外部AIが返したJSON</span><Textarea rows={6} value={json} onChange={e=>setJson(e.target.value)} placeholder='{"schemaVersion":2,"summary":"…"}'/></label><small>参照IDのない事実、記録と一致しない金額は除外して保存します。</small><Button variant="secondary" disabled={busy||!json.trim()} onClick={()=>void send("import")}>検証して取り込む</Button></div>}
    </form>
    </>}
   </section>

   <aside className="note" aria-labelledby="note-title">
    <h2 id="note-title"><BookOpen size={18} aria-hidden="true"/>戦略ノート</h2>
    <ol className="note-canvas">{canvasMeta.map(m=>{const n=state.canvas[m.key];const st=canvasStatus[n.status];return <li key={m.key}><span className="canvas-n">{m.n}</span><div><strong>{m.title}</strong><p>{n.text||"未記入"}</p><Status tone={st.tone==="copper"?"copper":st.tone==="ice"?"ice":"ok"}>{st.label}</Status></div></li>;})}</ol>
    <button className="text-btn" onClick={()=>open({type:"canvas",kind:"audience"})}>キャンバスを編集</button>
    <h3>最近の判断</h3>{state.decisions.length?<ul className="decision-list">{state.decisions.slice(-4).reverse().map(d=>{const a=state.reports.find(r=>r.id===d.reportId)?.v2?.actions.find(x=>x.id===d.actionId);return <li key={d.id}><Status tone={d.choice==="adopted"?"ok":"muted"}>{d.choice==="adopted"?"採用":d.choice==="deferred"?"保留":"選ばない"}</Status><span>{a?.title||"（整理済みの提案）"}</span><small>{d.reason}</small></li>;})}</ul>:<p className="small-note">採用・保留・選ばなかった判断と理由がここに残ります。</p>}
    <button className="text-btn" onClick={()=>setView("research")}><MessageSquareText size={15} aria-hidden="true"/>根拠ノートを開く</button>
   </aside>
  </div>
 </div>;
}
