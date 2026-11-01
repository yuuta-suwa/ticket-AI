import { env } from "cloudflare:workers";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { emptyState, stateSchema, now } from "./model.ts";
import type { State } from "./model.ts";

export class AppError extends Error {status:number;code:string;constructor(message:string,status=400,code="INVALID_INPUT"){super(message);this.status=status;this.code=code;}}
export function db(){if(!env.DB)throw new AppError("保存基盤に接続できません。時間をおいて再試行してください。",503,"DATABASE_UNAVAILABLE");return env.DB;}
export function response(data:unknown,status=200){return Response.json(data,{status,headers:{"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"}});}
export function errorResponse(e:unknown){if(e instanceof AppError)return response({error:e.message,code:e.code},e.status);if(e instanceof Error&&e.name==="ZodError")return response({error:"入力形式を確認してください。必須項目・数値・文字数が正しくありません。",code:"VALIDATION_ERROR"},400);return response({error:"処理を完了できませんでした。内容を保存したまま、再試行してください。",code:"INTERNAL_ERROR"},500);}
export async function user(){const u=await getChatGPTUser();if(!u)throw new AppError("保存・接続にはChatGPTでのログインが必要です。",401,"SIGN_IN_REQUIRED");return u;}
export function sameOrigin(req:Request){const origin=req.headers.get("origin");const expected=new URL(req.url).origin;if(origin!==expected)throw new AppError("このページから操作し直してください。",403,"ORIGIN_MISMATCH");}
export async function jsonBody(req:Request,max=1600000){if(Number(req.headers.get("content-length")||0)>max)throw new AppError("データが大きすぎます。",413);const text=await req.text();if(text.length>max)throw new AppError("データが大きすぎます。",413);try{return JSON.parse(text);}catch{throw new AppError("JSON形式を確認してください。");}}
export async function loadWorkspace(ownerId:string){const row=await db().prepare("SELECT state,revision FROM revenue_workspaces WHERE owner_id = ?").bind(ownerId).first<{state:string;revision:number}>();if(!row)return {state:emptyState(),revision:0};return {state:stateSchema.parse(JSON.parse(row.state)),revision:row.revision};}
export async function saveWorkspace(ownerId:string,state:State,revision:number,action="workspace.updated"){
 const nextRevision=revision+1;const at=now();let result;
 if(revision===0){result=await db().prepare("INSERT INTO revenue_workspaces(owner_id,revision,state,updated_at) VALUES(?,?,?,?) ON CONFLICT(owner_id) DO NOTHING").bind(ownerId,nextRevision,JSON.stringify(state),at).run();}
 else {result=await db().prepare("UPDATE revenue_workspaces SET state=?,revision=?,updated_at=? WHERE owner_id=? AND revision=?").bind(JSON.stringify(state),nextRevision,at,ownerId,revision).run();}
 if(result.meta.changes!==1)throw new AppError("別の画面で更新されました。現在の入力をバックアップしてから最新データを読み直してください。",409,"REVISION_CONFLICT");
 await db().prepare("INSERT INTO revenue_audit_log(id,owner_id,action,created_at) VALUES(?,?,?,?)").bind(crypto.randomUUID(),ownerId,action,at).run();
 return {state,revision:nextRevision,savedAt:at};
}
const encoder=new TextEncoder();
function b64(bytes:Uint8Array){let out="";for(const n of bytes)out+=String.fromCharCode(n);return btoa(out);}
function bytes(value:string){return Uint8Array.from(atob(value),x=>x.charCodeAt(0));}
export function encryptionReady(){return Boolean(env.CREDENTIAL_ENCRYPTION_KEY);}
async function encryptionKey(){if(!env.CREDENTIAL_ENCRYPTION_KEY)throw new AppError("接続情報の保護設定がまだ有効ではありません。",503,"ENCRYPTION_NOT_CONFIGURED");return crypto.subtle.importKey("raw",bytes(env.CREDENTIAL_ENCRYPTION_KEY),"AES-GCM",false,["encrypt","decrypt"]);}
export async function encrypt(value:unknown,ownerId:string,provider:string){const iv=crypto.getRandomValues(new Uint8Array(12));const result=await crypto.subtle.encrypt({name:"AES-GCM",iv,additionalData:encoder.encode(`${ownerId}:${provider}`)},await encryptionKey(),encoder.encode(JSON.stringify(value)));return `${b64(iv)}.${b64(new Uint8Array(result))}`;}
export async function decrypt<T>(value:string,ownerId:string,provider:string):Promise<T>{try{const [iv,cipher]=value.split(".");const result=await crypto.subtle.decrypt({name:"AES-GCM",iv:bytes(iv),additionalData:encoder.encode(`${ownerId}:${provider}`)},await encryptionKey(),bytes(cipher));return JSON.parse(new TextDecoder().decode(result));}catch{throw new AppError("接続情報を読み込めません。設定画面から接続し直してください。",503,"CONNECTION_INVALID");}}
export async function setConnection(ownerId:string,provider:string,secrets:unknown,metadata:unknown){const encrypted=await encrypt(secrets,ownerId,provider);await db().prepare("INSERT INTO revenue_connections(owner_id,provider,encrypted,metadata,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(owner_id,provider) DO UPDATE SET encrypted=excluded.encrypted,metadata=excluded.metadata,updated_at=excluded.updated_at").bind(ownerId,provider,encrypted,JSON.stringify(metadata),now()).run();}
export async function getConnection<T>(ownerId:string,provider:string){const row=await db().prepare("SELECT encrypted,metadata,updated_at FROM revenue_connections WHERE owner_id=? AND provider=?").bind(ownerId,provider).first<{encrypted:string;metadata:string;updated_at:string}>();if(!row)return null;return {secrets:await decrypt<T>(row.encrypted,ownerId,provider),metadata:JSON.parse(row.metadata),updatedAt:row.updated_at};}
export async function connectionStatus(ownerId:string){const rows=await db().prepare("SELECT provider,metadata,updated_at FROM revenue_connections WHERE owner_id=?").bind(ownerId).all<{provider:string;metadata:string;updated_at:string}>();return {encryptionReady:encryptionReady(),connections:rows.results.map(row=>({provider:row.provider,metadata:JSON.parse(row.metadata),updatedAt:row.updated_at}))};}
export async function reserveAICall(ownerId:string,limit:number){const day=new Intl.DateTimeFormat("sv-SE",{timeZone:"Asia/Tokyo"}).format(new Date());const r=await db().prepare("INSERT INTO revenue_ai_usage(owner_id,day,calls) VALUES(?,?,1) ON CONFLICT(owner_id,day) DO UPDATE SET calls=calls+1 WHERE calls < ? RETURNING calls").bind(ownerId,day,limit).first<{calls:number}>();if(!r)throw new AppError("本日のAI実行上限に達しました。設定した上限を確認してください。",429,"DAILY_LIMIT");return r.calls;}

/** 日本時間の当月に記録したAIトークン数。月間上限の事前確認に使う（1回の実行で上限を超えることはあり得る）。 */
export async function monthTokens(ownerId:string){const month=new Intl.DateTimeFormat("sv-SE",{timeZone:"Asia/Tokyo"}).format(new Date()).slice(0,7);const r=await db().prepare("SELECT COALESCE(SUM(tokens),0) AS used FROM revenue_ai_usage WHERE owner_id=? AND day LIKE ?").bind(ownerId,month+"-%").first<{used:number}>();return Number(r?.used||0);}
export async function assertTokenBudget(ownerId:string,limit:number){if(limit<1)throw new AppError("月間のAIトークン上限を設定してください。上限が0のあいだは有料実行を行いません。",400,"TOKEN_LIMIT_UNSET");const used=await monthTokens(ownerId);if(used>=limit)throw new AppError(`今月のAIトークン上限（${limit.toLocaleString("ja-JP")}）に達しました。設定で上限を確認してください。`,429,"MONTHLY_TOKEN_LIMIT");return used;}
export async function recordTokens(ownerId:string,tokens:number){const day=new Intl.DateTimeFormat("sv-SE",{timeZone:"Asia/Tokyo"}).format(new Date());await db().prepare("UPDATE revenue_ai_usage SET tokens=tokens+? WHERE owner_id=? AND day=?").bind(Math.max(0,Math.round(tokens)),ownerId,day).run();}
