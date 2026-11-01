import {analysisInput,runAnalysis} from "@/lib/analysis";
import {response,errorResponse,user,sameOrigin,jsonBody} from "@/lib/server";
export const dynamic="force-dynamic";
export async function POST(req:Request){try{sameOrigin(req);const u=await user();const body=analysisInput.parse(await jsonBody(req,100000));return response(await runAnalysis(u.userId,body));}catch(e){return errorResponse(e);}}
