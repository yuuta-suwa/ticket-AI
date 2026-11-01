"use client";
import {useState,useEffect,useRef} from "react";
import {Toaster,toast} from "sonner";
import {Compass,MessagesSquare,Layers,FlaskConical,Settings,Cloud,CloudOff,Pause,RotateCw,LogIn,ArrowRight,Eye,EyeOff} from "lucide-react";
import {Workspace} from "./workspace-context";
import Link from "next/link";
import type {View,Modal,Connections,ActionResult,WorkspaceResponse,AIMode,ConsultOptions} from "./workspace-context";
import {download} from "./ui";
import {emptyState,stateSchema,newId,now,today} from "@/lib/model";
import type {State,Report,ConsultTopic} from "@/lib/model";
import {validateRelations} from "@/lib/domain";
import {adoptAction,appendTurns,consultPeriod,dataSignature,rulesReportV2,v1FromV2} from "@/lib/consult";
import {demoState} from "@/lib/demo";
import {SourcesView,ResearchView,ExperimentsView,ContentView,LedgerView,SettingsView} from "./views";
import {StrategyRoom} from "./strategy-room";
import {ConsultRoom} from "./consult-room";
import {Editor} from "./editors";

type NavItem={id:View;label:string;icon:typeof Compass;views:View[]};
const nav:NavItem[]=[
 {id:"overview",label:"戦略ルーム",icon:Compass,views:["overview"]},
 {id:"ai",label:"相談室",icon:MessagesSquare,views:["ai"]},
 {id:"sources",label:"収益戦略",icon:Layers,views:["sources","research","ledger"]},
 {id:"experiments",label:"投稿と検証",icon:FlaskConical,views:["experiments","content"]},
 {id:"settings",label:"設定",icon:Settings,views:["settings"]},
];
const allViews:View[]=nav.flatMap(n=>n.views);
const taskTopic={analysis:"diagnose",strategy:"strategy",content:"content"} as const;

export default function Studio(){
 const [state,setState]=useState<State>(emptyState);const [revision,setRevision]=useState(0);const [consultRequest,setConsultRequest]=useState("");const [consultTask,setConsultTask]=useState<"analysis"|"strategy"|"content">("analysis");const [consultTopic,setConsultTopic]=useState<ConsultTopic>("diagnose");const [view,setViewState]=useState<View>("overview");const [modal,setModal]=useState<Modal|null>(null);const [busy,setBusy]=useState(false);const busyRef=useRef(false);const pendingState=useRef<State|null>(null);const [loaded,setLoaded]=useState(false);const [readOnly,setReadOnly]=useState(false);const [userName,setUserName]=useState("");const [connections,setConnections]=useState<Connections>({connections:[],encryptionReady:false});const [demo,setDemo]=useState(false);const [realState,setRealState]=useState<State|null>(null);const [lastSaved,setLastSaved]=useState("");const [error,setError]=useState("");const [signature,setSignature]=useState("");
 // 連続した操作（診断→採用など）が古い描画時点のstate/revisionを使わないよう、最新値を参照で持つ。
 const stateRef=useRef(state);const revisionRef=useRef(revision);
 const commit=(next:State,rev?:number)=>{stateRef.current=next;setState(next);if(rev!==undefined){revisionRef.current=rev;setRevision(rev);}};
 useEffect(()=>{let live=true;void dataSignature(state).then(s=>{if(live)setSignature(s);});return()=>{live=false;};},[state]);
 const setView=(v:View)=>{setViewState(v);const u=new URL(location.href);u.searchParams.set("view",v);history.replaceState(null,"",u.pathname+u.search);window.scrollTo({top:0});requestAnimationFrame(()=>document.querySelector<HTMLElement>("main h1")?.focus({preventScroll:true}));};
 async function reload(){try{const r=await fetch("/api/workspace",{cache:"no-store"});const d=await r.json() as WorkspaceResponse;if(!r.ok)throw new Error(d.error||"読み込めませんでした。");commit(stateSchema.parse(d.state),d.revision);setReadOnly(d.readOnly);if(d.user?.name)setUserName(d.user.name);setError("");if(!d.readOnly){const cr=await fetch("/api/connections",{cache:"no-store"});const cd=await cr.json() as Connections;if(cr.ok)setConnections(cd);}}catch(e){setError(e instanceof Error?e.message:"読み込めませんでした。通信状態を確認して、読み直してください。");}finally{setLoaded(true);}}
 useEffect(()=>{const initialize=async()=>{const v=new URLSearchParams(location.search).get("view");if(allViews.includes(v as View))setViewState(v as View);await reload();};void initialize();},[]);
 async function save(fn:(s:State)=>void){if(busyRef.current)return false;if(readOnly&&!demo){toast.error("保存にはログインが必要です。");return false;}const next=structuredClone(stateRef.current);try{fn(next);stateSchema.parse(next);const issues=validateRelations(next);if(issues.length)throw new Error(issues.join(" "));}catch(e){toast.error(e instanceof Error&&e.name!=="ZodError"?e.message:"入力を確認してください。必須項目・日付・文字数が正しくありません。");return false;}if(demo){commit(next);toast.success("デモ上で変更しました。実績には保存されません。");return true;}pendingState.current=next;busyRef.current=true;setBusy(true);try{const r=await fetch("/api/workspace",{method:"PUT",headers:{"content-type":"application/json"},body:JSON.stringify({state:next,revision:revisionRef.current})});const d=await r.json() as WorkspaceResponse;if(!r.ok)throw new Error(d.error||"保存できませんでした。");commit(stateSchema.parse(d.state),d.revision);setLastSaved(d.savedAt||now());if(d.autoAnalysis)toast[d.autoAnalysis.status==="failed"?"warning":"success"](d.autoAnalysis.message);pendingState.current=null;setError("");return true;}catch(e){const message=e instanceof Error?e.message:"保存できませんでした。";setError(message);toast.error(message);return false;}finally{setBusy(false);busyRef.current=false;}}
 async function action(path:string,body:Record<string,unknown>){if(busyRef.current)return null;if(readOnly&&!demo){toast.error("ログインしてください。");return null;}if(demo){toast.info("デモでは外部接続・公開・AI実行は行いません。");return null;}busyRef.current=true;setBusy(true);try{const r=await fetch(path,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({...body,revision:revisionRef.current})});const d=await r.json() as ActionResult;if(!r.ok)throw new Error(d.error||"実行できませんでした。");if(d.state){commit(stateSchema.parse(d.state),d.revision??revisionRef.current);setLastSaved(d.savedAt||now());}if(d.message)toast.success(d.message);if(d.autoAnalysis)toast[d.autoAnalysis.status==="failed"?"warning":"success"](d.autoAnalysis.message);if(d.publish?.message)toast.info(d.publish.message);if(d.sync)toast.success(`直近${d.sync.posts}投稿・${d.sync.metrics}件の指標を取得${d.sync.issues.length?"（一部未取得）":""}`);return d;}catch(e){toast.error(e instanceof Error?e.message:"実行できませんでした。");return null;}finally{busyRef.current=false;setBusy(false);}}
 async function runAI(mode:AIMode,task:"analysis"|"strategy"|"content",request:string,webSearch:boolean,result?:string,options:ConsultOptions={}):Promise<Report|null>{
  const topic=options.topic||taskTopic[task];
  if(demo){
   if(mode!=="rules"){toast.info("外部AIの取り込みとAPI実行は、自分のワークスペースで利用できます。");return null;}
   const base=stateRef.current;const createdAt=now();const sig=await dataSignature(base);const v2=rulesReportV2(base,{topic,request,revision:revisionRef.current,signature:sig,createdAt,period:consultPeriod(base,today())});
   const report:Report={id:newId(),mode:"rules",task,createdAt,result:v1FromV2(v2),sources:[],tokens:0,model:"診断ルール v2",feedback:"none",v2,sessionId:options.sessionId||"",request};
   const next=structuredClone(base);next.reports=[...next.reports.slice(-59),report];if(options.sessionId)appendTurns(next,options.sessionId,topic,request,report.id,report.result.summary,createdAt,newId);commit(next);toast.success("デモ上で診断しました。実績には保存されません。");return report;
  }
  const d=await action("/api/ai",{mode,task,request,webSearch,result,topic,sessionId:options.sessionId});
  if(d?.report){toast.success(mode==="rules"?"登録データの診断を保存しました。":mode==="import"?"取り込んだ提案を検証して保存しました。":"AIの提案を検証して保存しました。");return d.report;}
  return null;
 }
 async function adopt(reportId:string,actionId:string){
  try{const probe=adoptAction(structuredClone(stateRef.current),reportId,actionId,{experimentId:"probe",decisionId:"probe",now:now(),today:today()});if(!probe.created){toast.info("同じ提案から作った進行中の施策があります。重複して作成しません。");return probe.experimentId;}}catch(e){toast.error(e instanceof Error?e.message:"採用できませんでした。");return null;}
  let id:string|null=null;
  const ok=await save(s=>{id=adoptAction(s,reportId,actionId,{experimentId:newId(),decisionId:newId(),now:now(),today:today()}).experimentId;});
  if(ok&&!demo)toast.success("施策の下書きを作りました。予測と期限を確認してください。");
  return ok?id:null;
 }
 function toggleDemo(){if(busyRef.current)return;if(!demo){setRealState(stateRef.current);commit(stateSchema.parse(demoState()));setDemo(true);setView("overview");}else{if(realState)commit(realState);setDemo(false);setRealState(null);}setModal(null);}
 const consult=(request:string,task:"analysis"|"strategy"|"content"="analysis",topic?:ConsultTopic)=>{setConsultRequest(request);setConsultTask(task);setConsultTopic(topic||taskTopic[task]);setView("ai");};
 const active=nav.find(n=>n.views.includes(view))!;
 const dateLabel=today().replaceAll("-",".");
 return <Workspace.Provider value={{state,revision,busy,readOnly,demo,view,userName,connections,signature,consultRequest,consultTask,consultTopic,consult,setView,open:setModal,close:()=>setModal(null),save,action,setConnections,reload,runAI,adopt}}><Toaster position="bottom-right" theme="dark" closeButton toastOptions={{className:"atelier-toast"}}/>
  <a className="skip-link" href="#main-content">本文へ移動</a>
  <div className="app-shell">
  <aside className="rail" aria-label="主要メニュー"><Link href="/?view=overview" className="rail-brand" aria-label="IG Revenue Consultant 戦略ルームへ"><span className="brand-mark" aria-hidden="true"><Compass size={22}/></span><span className="brand-name">IG REVENUE<br/>CONSULTANT</span></Link><nav>{nav.map(n=><button key={n.id} onClick={()=>setView(n.id)} className={active.id===n.id?"active":""} aria-current={active.id===n.id?"page":undefined}><n.icon size={22} aria-hidden="true"/><span>{n.label}</span>{n.id==="experiments"&&state.contents.some(c=>c.status==="review")&&<span className="nav-count" aria-label={`承認待ち${state.contents.filter(c=>c.status==="review").length}件`}>{state.contents.filter(c=>c.status==="review").length}</span>}</button>)}</nav></aside>
  <div className="app-main"><header className="topbar"><div className="topbar-context"><span className="topbar-room">INSTAGRAM STRATEGY ROOM</span><span className="topbar-divider" aria-hidden="true"/><span className="topbar-date">{dateLabel}</span></div><div className="top-actions"><span className={`save-state ${error?"error":""}`} role="status">{busy?<><RotateCw size={15} className="spin" aria-hidden="true"/>処理中</>:demo?<><Eye size={15} aria-hidden="true"/>デモ表示</>:readOnly?<><CloudOff size={15} aria-hidden="true"/>未ログイン</>:error?<><CloudOff size={15} aria-hidden="true"/>未保存あり</>:<><Cloud size={15} aria-hidden="true"/>{lastSaved?"保存済み":"クラウド保存"}</>}</span><button className="btn ghost small" onClick={toggleDemo} aria-pressed={demo}>{demo?<><EyeOff size={16} aria-hidden="true"/>デモを終了</>:<><Eye size={16} aria-hidden="true"/>デモを見る</>}</button>{userName&&<span className="top-avatar" title={userName} aria-hidden="true">{userName.slice(0,1)}</span>}</div></header>
   {demo&&<div className="mode-banner demo" role="note"><strong>デモ表示</strong><span>架空の人物・金額・観察です。変更は実績に保存されません。</span><button onClick={toggleDemo}>自分のデータへ戻る<ArrowRight size={15} aria-hidden="true"/></button></div>}
   {readOnly&&!demo&&<div className="mode-banner neutral"><span>プレビュー表示中です。保存・相談の記録にはログインが必要です。</span><a href="/signin-with-chatgpt?return_to=%2F" target="_top"><LogIn size={15} aria-hidden="true"/>ログイン</a></div>}
   {error&&<div className="mode-banner error" role="alert"><span>{error}</span><button onClick={()=>download("ig-consultant-unsaved-backup.json",JSON.stringify({schemaVersion:2,state:pendingState.current||state,demo},null,2))}>未保存の入力を書き出す</button><button onClick={()=>void reload()}>最新を読み直す</button></div>}
   {state.profile.paused&&<div className="mode-banner paused"><Pause size={16} aria-hidden="true"/><span>運用停止中。有料のAI実行・新しい施策の開始・Instagram公開を止めています。</span><button onClick={()=>setView("settings")}>再開の設定へ</button></div>}
   <main className="content-wrap" id="main-content">{!loaded?<div className="loading" role="status"><RotateCw className="spin" aria-hidden="true"/><p>あなたのワークスペースを読み込んでいます</p></div>:view==="overview"?<StrategyRoom/>:view==="ai"?<ConsultRoom key={demo?"demo":"real"}/>:view==="sources"?<SourcesView/>:view==="research"?<ResearchView/>:view==="ledger"?<LedgerView/>:view==="experiments"?<ExperimentsView/>:view==="content"?<ContentView/>:<SettingsView key={JSON.stringify(state.profile)+JSON.stringify(state.brief)}/>}</main>
  </div>
  <nav className="tabbar" aria-label="主要メニュー">{nav.map(n=><button key={n.id} onClick={()=>setView(n.id)} className={active.id===n.id?"active":""} aria-current={active.id===n.id?"page":undefined}><n.icon size={21} aria-hidden="true"/><span>{n.label}</span></button>)}</nav>
  </div>{modal&&<Editor key={`${modal.type}-${modal.id||"new"}-${modal.kind||""}-${modal.provider||""}`} modal={modal}/>}</Workspace.Provider>;
}
