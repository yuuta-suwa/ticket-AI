import { analyzeIfChanged } from "@/lib/analysis";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { emptyState, stateSchema } from "@/lib/model";
import { normalizeApproval, validateRelations } from "@/lib/domain";
import { response,errorResponse,user,sameOrigin,jsonBody,loadWorkspace,saveWorkspace,AppError } from "@/lib/server";
export const dynamic="force-dynamic";
export async function GET(){try{const u=await getChatGPTUser();if(!u)return response({state:emptyState(),revision:0,readOnly:true,user:null});const w=await loadWorkspace(u.userId);return response({...w,readOnly:false,user:{name:u.displayName}});}catch(e){return errorResponse(e);}}
export async function PUT(req:Request){try{sameOrigin(req);const u=await user();const body=await jsonBody(req);const revision=Number(body.revision);if(!Number.isInteger(revision)||revision<0)throw new AppError("保存バージョンを確認してください。");const previous=await loadWorkspace(u.userId);if(previous.revision!==revision)throw new AppError("別の画面で更新されました。バックアップ後に読み直してください。",409,"REVISION_CONFLICT");const state=await normalizeApproval(stateSchema.parse(body.state),previous.state);const errors=validateRelations(state);if(errors.length)throw new AppError(errors.join(" "));const saved=await saveWorkspace(u.userId,state,revision);return response(await analyzeIfChanged(u.userId,saved,previous.state));}catch(e){return errorResponse(e);}}
