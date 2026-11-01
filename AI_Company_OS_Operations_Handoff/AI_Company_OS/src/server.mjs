import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './company.mjs';

// Owner management API + mobile UI. Owner identity comes ONLY from the server-side session cookie.
// Body fields such as "owner", "actor" or "employee_id" are ignored. The local owner CLIs are NOT exposed here.
const UI=path.join(ROOT,'ui/index.html');
const MAX_BODY=256*1024;

export function createOwnerServer(rt,{allowedOrigins=[],secureCookie=true,cookieName='aicos_owner'}={}){
  const {authority}=rt;
  const send=(res,status,body,headers={})=>{
    const data=typeof body==='string'?body:JSON.stringify(body);
    res.writeHead(status,{'content-type':typeof body==='string'?'text/html; charset=utf-8':'application/json; charset=utf-8','cache-control':'no-store',
      'x-content-type-options':'nosniff','x-frame-options':'DENY','referrer-policy':'no-referrer',
      'content-security-policy':"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'",...headers});
    res.end(data);
  };
  const cookies=req=>Object.fromEntries((req.headers.cookie??'').split(';').map(c=>c.trim().split('=')).filter(p=>p.length===2));
  const readBody=req=>new Promise((resolve,reject)=>{let size=0;const chunks=[];
    req.on('data',c=>{size+=c.length;if(size>MAX_BODY){reject(Object.assign(new Error('Body too large'),{code:'TOO_LARGE'}));req.destroy();}else chunks.push(c);});
    req.on('end',()=>resolve(Buffer.concat(chunks).toString('utf8')));req.on('error',reject);});
  const json=raw=>{if(!raw)return {};try{const v=JSON.parse(raw);return v&&typeof v==='object'?v:{};}catch{throw Object.assign(new Error('Invalid JSON'),{code:'BAD_REQUEST'});}};
  const originOk=req=>{const o=req.headers.origin;if(!o)return false;if(allowedOrigins.includes(o))return true;
    try{return new URL(o).host===req.headers.host;}catch{return false;}};
  const STATUS={UNAUTHENTICATED:401,FORBIDDEN:403,REAUTH_REQUIRED:401,NOT_FOUND:404,CONFLICT:409,STALE:409,LOCKED:429,TOO_LARGE:413,BAD_REQUEST:400,BLOCKED:409,REJECTED:422};
  const cookie=(token,maxAge)=>`${cookieName}=${token}; Path=/; HttpOnly; SameSite=Strict${secureCookie?'; Secure':''}; Max-Age=${maxAge}`;

  const owner=(req,{mutation=false,reauth=false}={})=>authority.requireOwner(cookies(req)[cookieName],{csrf:req.headers['x-csrf-token']??null,mutation,reauth});
  const routes=[
    ['GET',/^\/$/,async(req,res)=>send(res,200,fs.readFileSync(UI,'utf8'))],
    ['GET',/^\/healthz$/,async(req,res)=>send(res,200,{ok:true,owner_credential_configured:authority.credentialConfigured()})],
    ['POST',/^\/v1\/owner\/login$/,async(req,res,b)=>{
      if(!originOk(req))return send(res,403,{error:'Origin not allowed'});
      const s=authority.login(b.passphrase,{client:req.headers['user-agent']??'unknown'});
      send(res,200,{csrf:s.csrf,expires_at:s.expires_at},{'set-cookie':cookie(s.token,Math.floor(authority.sessionTtlMs/1000))});
    }],
    ['POST',/^\/v1\/owner\/logout$/,async(req,res)=>{owner(req,{mutation:true});authority.logout(cookies(req)[cookieName]);send(res,200,{logged_out:true},{'set-cookie':cookie('x',0)});}],
    ['POST',/^\/v1\/owner\/reauth$/,async(req,res,b)=>{owner(req,{mutation:true});send(res,200,authority.reauthenticate(cookies(req)[cookieName],b.passphrase));}],
    ['GET',/^\/v1\/owner\/overview$/,async(req,res)=>{owner(req);send(res,200,rt.overview());}],
    ['GET',/^\/v1\/owner\/ventures$/,async(req,res)=>{owner(req);send(res,200,rt.ventures.status());}],
    ['GET',/^\/v1\/owner\/ventures\/([^/]+)$/,async(req,res,b,m)=>{owner(req);const id=decodeURIComponent(m[1]);
      send(res,200,{venture:rt.ventures.venture(id),funding:rt.ventures.funding(id),cases:rt.operations.cases(id),support:rt.operations.supportOverdue(id)});}],
    ['GET',/^\/v1\/owner\/opportunities$/,async(req,res)=>{owner(req);send(res,200,rt.research.opportunities().map(o=>({...o,evaluation:rt.research.evaluateCandidate(o.id,o.revision)})));}],
    ['GET',/^\/v1\/owner\/opportunities\/([^/]+)$/,async(req,res,b,m)=>{owner(req);const o=rt.research.opportunity(decodeURIComponent(m[1]));
      send(res,200,{opportunity:o,evaluation:rt.research.evaluateCandidate(o.id,o.revision),assessments:rt.research.assessments(o.id,o.revision),
        evidence:o.body.evidence.observation_ids.map(id=>rt.research.observation(id))});}],
    ['GET',/^\/v1\/owner\/experiments\/([^/]+)\/lineage$/,async(req,res,b,m)=>{owner(req);send(res,200,rt.lineage(decodeURIComponent(m[1])));}],
    ['GET',/^\/v1\/owner\/research\/([^/]+)$/,async(req,res,b,m)=>{owner(req);const id=decodeURIComponent(m[1]);send(res,200,{run:rt.research.run(id),attempts:rt.research.attempts(id)});}],
    ['GET',/^\/v1\/owner\/tasks$/,async(req,res)=>{owner(req);send(res,200,{tasks:rt.company.status('CEO').tasks,scorecard:rt.company.scorecard('CEO')});}],
    ['GET',/^\/v1\/owner\/tasks\/([^/]+)$/,async(req,res,b,m)=>{owner(req);const id=decodeURIComponent(m[1]);send(res,200,{...rt.company.taskContext('CEO',id),directives:authority.directives(id)});}],
    ['POST',/^\/v1\/owner\/tasks\/([^/]+)\/directives$/,async(req,res,b,m)=>{const s=owner(req,{mutation:true});send(res,200,authority.addDirective(s,{task_id:decodeURIComponent(m[1]),text:b.text,priority:b.priority,idempotency_key:b.idempotency_key}));}],
    ['GET',/^\/v1\/owner\/decisions$/,async(req,res)=>{owner(req);send(res,200,authority.decisions());}],
    ['POST',/^\/v1\/owner\/decisions\/([^/]+)\/(approve|reject)$/,async(req,res,b,m)=>{const s=owner(req,{mutation:true,reauth:m[2]==='approve'&&authority.decision(decodeURIComponent(m[1])).kind==='PERMISSION'});
      send(res,200,authority.decide(s,{id:decodeURIComponent(m[1]),decision:m[2],entity_version:b.entity_version,content_hash:b.content_hash,reason:b.reason,idempotency_key:b.idempotency_key}));}],
    ['GET',/^\/v1\/owner\/grants$/,async(req,res)=>{owner(req);send(res,200,authority.grants());}],
    ['POST',/^\/v1\/owner\/grants$/,async(req,res,b)=>{const s=owner(req,{mutation:true,reauth:true});
      send(res,200,authority.createGrant(s,{id:b.id,venture_id:b.venture_id,operation:b.operation,target:b.target,content_hash:b.content_hash,scope:b.scope,max_cost_yen:b.max_cost_yen,max_count:b.max_count,valid_until:b.valid_until,idempotency_key:b.idempotency_key}));}],
    ['POST',/^\/v1\/owner\/grants\/([^/]+)\/revoke$/,async(req,res,b,m)=>{const s=owner(req,{mutation:true});send(res,200,authority.revokeGrant(s,{id:decodeURIComponent(m[1]),reason:b.reason,idempotency_key:b.idempotency_key}));}],
    ['GET',/^\/v1\/owner\/control$/,async(req,res)=>{owner(req);send(res,200,authority.controlStatus({unstoppable:rt.gateway.list().filter(o=>['IN_FLIGHT','UNKNOWN'].includes(o.status)).map(o=>({id:o.id,status:o.status,operation:o.operation}))}));}],
    ['POST',/^\/v1\/owner\/control\/pause$/,async(req,res,b)=>{const s=owner(req,{mutation:true});send(res,202,authority.requestPause(s,{reason:b.reason,idempotency_key:b.idempotency_key}));}],
    ['POST',/^\/v1\/owner\/control\/resume$/,async(req,res,b)=>{const s=owner(req,{mutation:true,reauth:true});send(res,200,authority.resume(s,{idempotency_key:b.idempotency_key}));}],
    ['GET',/^\/v1\/owner\/connections$/,async(req,res)=>{owner(req);send(res,200,{sources:rt.research.connections(),providers:rt.company.db.prepare('SELECT provider,account_id,environment,venture_id FROM provider_accounts').all(),
      note:'Secret values are never returned. Credential presence is a configuration check, not proof of a working connection.'});}],
    ['GET',/^\/v1\/owner\/health$/,async(req,res)=>{owner(req);send(res,200,{growth_readiness:rt.ventures.growthReadiness(),jobs:rt.queue.capacity(),workers:authority.controlStatus().workers});}],
    ['GET',/^\/v1\/owner\/knowledge$/,async(req,res)=>{owner(req);send(res,200,rt.knowledge.all());}],
    ['GET',/^\/v1\/owner\/cases$/,async(req,res)=>{owner(req);send(res,200,rt.operations.cases());}],
    ['POST',/^\/hooks\/([a-z0-9_-]+)$/,async(req,res,b,m,raw)=>{
      // Provider webhooks do not use the owner session; they are verified by signature/account/environment.
      send(res,200,rt.operations.receive(m[1],raw,req.headers));
    }],
  ];
  return async function handler(req,res){
    try{
      const url=new URL(req.url,'http://local');
      const route=routes.find(([method,re])=>method===req.method&&re.test(url.pathname));
      if(!route)return send(res,404,{error:'Not found'});
      const raw=req.method==='POST'?await readBody(req):'';
      const body=route[1].source.startsWith('^\\/hooks')?{}:json(raw);
      if(req.method==='POST'&&!url.pathname.startsWith('/hooks/')&&url.pathname!=='/v1/owner/login'&&!originOk(req))return send(res,403,{error:'Origin not allowed'});
      await route[2](req,res,body,url.pathname.match(route[1]),raw);
    }catch(e){
      const status=STATUS[e.code]??(/Unknown /.test(e.message)?404:400);
      if(!res.headersSent)send(res,status,{error:status===401&&e.code==='UNAUTHENTICATED'?'Owner authentication required':e.message,code:e.code??'ERROR'});
    }
  };
}

export function startServer(rt,{port=8787,host='127.0.0.1',...options}={}){
  const server=http.createServer(createOwnerServer(rt,options));
  return new Promise(resolve=>server.listen(port,host,()=>resolve(server)));
}
