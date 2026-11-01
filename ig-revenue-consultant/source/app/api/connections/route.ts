import { z } from "zod";
import { response,errorResponse,user,sameOrigin,jsonBody,connectionStatus,setConnection,db,AppError } from "@/lib/server";
export const dynamic="force-dynamic";
export async function GET(){try{const u=await user();return response(await connectionStatus(u.userId));}catch(e){return errorResponse(e);}}
export async function POST(req:Request){try{sameOrigin(req);const u=await user();const body=await jsonBody(req,5000);
 if(body.provider==="claude"){
  const key=z.string().trim().min(10).max(1000).parse(body.key);
  const r=await fetch("https://api.anthropic.com/v1/models?limit=50",{headers:{"x-api-key":key,"anthropic-version":"2023-06-01"},signal:AbortSignal.timeout(20000)});
  if(!r.ok)throw new AppError(r.status===401?"APIキーを確認してください。":"モデル一覧を取得できません。提供元の接続状態を確認してください。",r.status===401?400:502,"PROVIDER_ERROR");
  const data=await r.json() as {data?:{id:string;display_name:string}[]};const models=(data.data||[]).map(m=>({id:m.id,name:m.display_name||m.id})).slice(0,50);if(!models.length)throw new AppError("利用可能なモデルがありません。",400);
  await setConnection(u.userId,"claude",{key},{models,connectedAt:new Date().toISOString()});
 } else if(body.provider==="instagram") {
  const token=z.string().trim().min(10).max(3000).parse(body.token);
  const url=new URL("https://graph.instagram.com/me");url.searchParams.set("fields","user_id,username");url.searchParams.set("access_token",token);
  const r=await fetch(url,{signal:AbortSignal.timeout(20000)});if(!r.ok)throw new AppError("Instagramのプロアカウント用トークンと権限を確認してください。",400,"INSTAGRAM_AUTH_FAILED");
  const data=await r.json() as {id?:string;user_id?:string;username?:string};const id=String(data.user_id||data.id||"");if(!/^\d+$/.test(id)||!data.username)throw new AppError("Instagramのアカウント情報を確認できませんでした。");
  await setConnection(u.userId,"instagram",{token},{id,username:data.username,capabilities:["profile"],connectedAt:new Date().toISOString()});
 } else throw new AppError("接続先を確認してください。");
 return response(await connectionStatus(u.userId));
 }catch(e){return errorResponse(e);}}
export async function DELETE(req:Request){try{sameOrigin(req);const u=await user();const body=await jsonBody(req,2000);if(!["claude","instagram"].includes(body.provider))throw new AppError("接続先を確認してください。");await db().prepare("DELETE FROM revenue_connections WHERE owner_id=? AND provider=?").bind(u.userId,body.provider).run();return response(await connectionStatus(u.userId));}catch(e){return errorResponse(e);}}
