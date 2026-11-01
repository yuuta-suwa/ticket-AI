import { analyzeIfChanged } from "@/lib/analysis";
import { response,errorResponse,user,sameOrigin,jsonBody,loadWorkspace,saveWorkspace,getConnection,setConnection,db,AppError } from "@/lib/server";
import { fingerprint, approvalErrors } from "@/lib/domain";
import { now,today } from "@/lib/model";
import type { Content } from "@/lib/model";
export const dynamic="force-dynamic";
type IG={token:string};
type GraphResult={id?:string;permalink?:string;status_code?:string};
type IGPost={id:string;caption?:string;media_type?:string;permalink?:string;timestamp?:string};
type Insight={name:string;values?:{value:number}[];total_value?:{value:number}};
type Operation={id:string;status:string;container_id:string|null;media_id:string|null;message:string};
async function graph<T=GraphResult>(token:string,path:string,params:Record<string,string>,method="GET"){
 if(!/^\/?[a-zA-Z0-9_\/]+$/.test(path))throw new AppError("Instagramの操作を確認してください。");
 const url=new URL(`https://graph.instagram.com/${path.replace(/^\//,"")}`);const form=new URLSearchParams({...params,access_token:token});let r:Response;
 if(method==="GET"){url.search=form.toString();r=await fetch(url,{signal:AbortSignal.timeout(20000)});}else r=await fetch(url,{method:"POST",body:form,signal:AbortSignal.timeout(20000)});
 if(!r.ok)throw new AppError("Instagram APIで処理できませんでした。権限・トークン・素材形式・利用制限を確認してください。",502,"INSTAGRAM_API_ERROR");
 return r.json() as Promise<T>;
}
export async function POST(req:Request){let opId="";try{sameOrigin(req);const u=await user();const body=await jsonBody(req,5000);const w=await loadWorkspace(u.userId);if(w.revision!==body.revision)throw new AppError("最新データを読み直してください。",409,"REVISION_CONFLICT");const conn=await getConnection<IG>(u.userId,"instagram");if(!conn)throw new AppError("Instagramが未接続です。接続設定からプロアカウント用トークンを登録してください。",400,"INSTAGRAM_NOT_CONNECTED");
 if(body.action==="sync"){
  const previous=structuredClone(w.state);
  const data=await graph<{data?:IGPost[]}>(conn.secrets.token,`${conn.metadata.id}/media`,{fields:"id,caption,media_type,permalink,timestamp,media_url",limit:"12"});const posts=Array.isArray(data.data)?data.data:[];let updated=0;const issues:string[]=[];
  const observations=await Promise.allSettled(posts.map(async(p)=>{const insights=await graph<{data?:Insight[]}>(conn.secrets.token,`${p.id}/insights`,{metric:"views,reach"});return {id:String(p.id),insights};}));
  posts.forEach((p,index)=>{const id=`ig_${p.id}`;let content=w.state.contents.find(x=>x.id===id);if(!content){content={id,title:String(p.caption||"Instagram投稿").slice(0,100),sourceId:"",experimentId:"",format:p.media_type==="VIDEO"?"reel":"feed",hook:"",caption:String(p.caption||""),script:"",cta:"",assetUrl:"",evidenceIds:[],factsChecked:false,rightsChecked:false,adDisclosure:false,adRequired:false,status:"posted",approvalHash:"",approvedAt:"",publishedUrl:String(p.permalink||""),createdAt:String(p.timestamp||now())} as Content;w.state.contents.push(content);}
   const observed=observations[index];if(observed.status!=="fulfilled"){issues.push(`${p.id}: インサイト未取得`);return;}
   const entries=observed.value.insights.data||[];const read=(name:string)=>{const m=entries.find(x=>x.name===name);const v=m?.values?.[0]?.value??m?.total_value?.value;return typeof v==="number"?v:null;};const views=read("views");if(views===null)issues.push(`${p.id}: 再生数未取得`);if(views===null&&read("reach")===null)return;
   const metric={id:`${id}_${today()}`,contentId:id,date:today(),views,reach:read("reach"),qualifiedViews:null,clicks:null,actions:null,note:"Instagram公式API。クリック・成果はこの取込みでは未取得。"};const pos=w.state.metrics.findIndex(x=>x.id===metric.id);if(pos>=0)w.state.metrics[pos]=metric;else w.state.metrics.push(metric);updated++;
  });
  w.state.contents=w.state.contents.slice(-400);w.state.metrics=w.state.metrics.slice(-1000);await setConnection(u.userId,"instagram",conn.secrets,{...conn.metadata,lastSyncedAt:now(),capabilities:["profile","media",...(updated?["insights"]:[])]});
  const saved=await saveWorkspace(u.userId,w.state,w.revision,"instagram.synced");return response({...await analyzeIfChanged(u.userId,saved,previous),sync:{posts:posts.length,metrics:updated,issues}});
 }
 if(body.action!=="publish")throw new AppError("操作を確認してください。");
 if(w.state.profile.paused)throw new AppError("運用停止中です。");const c=w.state.contents.find(x=>x.id===body.id);if(!c)throw new AppError("投稿が見つかりません。",404);
 if(c.status==="posted")return response({...w,message:"公開済みです。再送していません。"});
 if(c.status!=="approved"||!c.approvalHash||c.approvalHash!==await fingerprint(c))throw new AppError("完成した内容を承認してください。");const guard=approvalErrors(c,w.state);if(guard.length)throw new AppError(guard.join(" "));
 const source=w.state.sources.find(s=>s.id===c.sourceId);if(!source||source.eligibility!=="verified"||source.status!=="active")throw new AppError("関連する収益源の条件を確認し、運用中にしてください。");
 if(!["feed","reel"].includes(c.format))throw new AppError("この版のAPI公開は画像フィードとリールに対応します。他の形式は手動投稿してください。");
 let asset:URL;try{asset=new URL(c.assetUrl);}catch{throw new AppError("公開する画像・動画のHTTPS URLを入力してください。");}if(asset.protocol!=="https:")throw new AppError("素材にはHTTPS URLを指定してください。");
 opId=`${u.userId}:${c.id}:${c.approvalHash}`;
 const inserted=await db().prepare("INSERT INTO revenue_external_operations(id,owner_id,content_id,status,created_at) VALUES(?,?,?,'creating',?) ON CONFLICT(id) DO NOTHING").bind(opId,u.userId,c.id,now()).run();
 let op=await db().prepare("SELECT id,status,container_id,media_id,message FROM revenue_external_operations WHERE id=? AND owner_id=?").bind(opId,u.userId).first<Operation>();if(!op)throw new AppError("公開処理を記録できませんでした。",503);
 if(op.status==="published"){c.status="posted";const permalink=await graph(conn.secrets.token,String(op.media_id),{fields:"permalink"});c.publishedUrl=permalink.permalink||"";return response({...await saveWorkspace(u.userId,w.state,w.revision,"instagram.publish_reconciled"),message:"前回の公開結果を照合しました。再送していません。"});}
 if(["unknown","failed","publishing"].includes(op.status))throw new AppError("前回の公開結果の確認が必要です。Instagramで確認し、二重投稿を避けてください。",409,"PUBLISH_RECONCILIATION_REQUIRED");
 if(inserted.meta.changes===1){
  const p:Record<string,string>={caption:c.caption};if(c.format==="reel"){p.media_type="REELS";p.video_url=asset.href;}else p.image_url=asset.href;
  const container=await graph(conn.secrets.token,`${conn.metadata.id}/media`,p,"POST");if(!container.id)throw new AppError("Instagramの公開準備を確認できませんでした。",502);
  await db().prepare("UPDATE revenue_external_operations SET container_id=?,status='processing' WHERE id=? AND owner_id=?").bind(String(container.id),opId,u.userId).run();op={...op,status:"processing",container_id:String(container.id)};
 }
 if(!op.container_id)return response({...w,publish:{status:"processing",message:"公開準備中です。少し待ってから状態を確認してください。"}},202);
 const status=await graph(conn.secrets.token,op.container_id!,{fields:"status_code"});if(status.status_code!=="FINISHED"){
  if(["ERROR","EXPIRED"].includes(status.status_code||"")){await db().prepare("UPDATE revenue_external_operations SET status='failed',message=? WHERE id=? AND owner_id=?").bind(String(status.status_code),opId,u.userId).run();opId="";throw new AppError("Instagramの素材処理で問題が起きました。形式と利用条件を確認してください。",502);}
  return response({...w,publish:{status:"processing",message:"Instagramで素材を処理中です。少し待って、同じ投稿の公開ボタンで状態を確認してください。"}},202);
 }
 const claimed=await db().prepare("UPDATE revenue_external_operations SET status='publishing' WHERE id=? AND owner_id=? AND status='processing'").bind(opId,u.userId).run();if(claimed.meta.changes!==1)throw new AppError("公開処理が進行中です。再送していません。",409,"PUBLISH_IN_PROGRESS");
 const published=await graph(conn.secrets.token,`${conn.metadata.id}/media_publish`,{creation_id:op.container_id},"POST");if(!published.id)throw new AppError("公開結果を確認できませんでした。",502);
 await db().prepare("UPDATE revenue_external_operations SET status='published',media_id=? WHERE id=? AND owner_id=?").bind(String(published.id),opId,u.userId).run();opId="";c.status="posted";
 try{const p=await graph(conn.secrets.token,String(published.id),{fields:"permalink"});c.publishedUrl=p.permalink||"";}catch{/* The confirmed media ID is retained for reconciliation. */}
 return response({...await saveWorkspace(u.userId,w.state,w.revision,"instagram.published"),message:"Instagram APIから公開完了を確認しました。"});
 }catch(e){if(opId)try{await db().prepare("UPDATE revenue_external_operations SET status='unknown' WHERE id=? AND status IN ('creating','publishing')").bind(opId).run();}catch{}return errorResponse(e);}}
