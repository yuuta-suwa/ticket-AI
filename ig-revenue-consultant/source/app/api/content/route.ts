import { fingerprint, approvalErrors, validateRelations } from "@/lib/domain";
import { now } from "@/lib/model";
import { response,errorResponse,user,sameOrigin,jsonBody,loadWorkspace,saveWorkspace,AppError } from "@/lib/server";
export const dynamic="force-dynamic";
export async function POST(req:Request){try{sameOrigin(req);const u=await user();const body=await jsonBody(req,5000);const w=await loadWorkspace(u.userId);if(w.revision!==body.revision)throw new AppError("最新データを読み直してください。",409,"REVISION_CONFLICT");const c=w.state.contents.find(x=>x.id===body.id);if(!c)throw new AppError("投稿が見つかりません。",404);if(w.state.profile.paused)throw new AppError("運用停止中です。設定を確認してください。");
 if(body.action==="approve"){const errors=approvalErrors(c,w.state);if(errors.length)throw new AppError(errors.join(" "));if(c.status==="posted")throw new AppError("公開済みの投稿です。");c.status="approved";c.approvalHash=await fingerprint(c);c.approvedAt=now();}
 else if(body.action==="mark_posted"){const checks=approvalErrors(c,w.state);if(checks.length)throw new AppError(checks.join(" "));if(c.status!=="approved"||c.approvalHash!==await fingerprint(c))throw new AppError("内容を確認して再承認してください。");let url:URL;try{url=new URL(body.url);}catch{throw new AppError("公開したInstagramのURLを入力してください。");}if(url.protocol!=="https:"||!["instagram.com","www.instagram.com"].includes(url.hostname)||!/^\/(p|reel|reels|stories)\/[^/]+/.test(url.pathname))throw new AppError("InstagramのHTTPS URLを入力してください。");c.status="posted";c.publishedUrl=url.href;}
 else throw new AppError("操作を確認してください。");
 const errors=validateRelations(w.state);if(errors.length)throw new AppError(errors.join(" "));return response(await saveWorkspace(u.userId,w.state,w.revision,`content.${body.action}`));
 }catch(e){return errorResponse(e);}}
