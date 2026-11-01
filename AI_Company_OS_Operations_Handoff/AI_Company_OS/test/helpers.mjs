import http from 'node:http';
import { createRuntime } from '../src/runtime.mjs';
import { createOwnerServer } from '../src/server.mjs';
import { sha } from '../src/authority.mjs';

export const PASS='correct horse battery staple';
export function rt(t,{at='2026-11-01T00:00:00Z',env={},jobs}={}){
  let clock=new Date(at);const r=createRuntime({file:':memory:',clock:()=>clock,env,jobs});t.after(()=>r.close());
  r.set=s=>{clock=new Date(s);};r.advance=ms=>{clock=new Date(clock.getTime()+ms);};return r;
}
export async function server(t,r,options={}){
  const s=http.createServer(createOwnerServer(r,{secureCookie:false,...options}));await new Promise(res=>s.listen(0,'127.0.0.1',res));
  t.after(()=>new Promise(res=>s.close(res)));const base=`http://127.0.0.1:${s.address().port}`;
  const client={base,cookie:null,csrf:null,
    async call(method,path,body,{origin=base,headers={}}={}){
      const res=await fetch(base+path,{method,headers:{'content-type':'application/json',...(origin?{origin}:{}),...(this.cookie?{cookie:this.cookie}:{}),...(this.csrf?{'x-csrf-token':this.csrf}:{}),...headers},body:body===undefined?undefined:JSON.stringify(body)});
      const sc=res.headers.get('set-cookie');if(sc)this.cookie=sc.split(';')[0];
      return {status:res.status,body:await res.json().catch(()=>null),headers:res.headers};
    },
    async login(pass=PASS){const r=await this.call('POST','/v1/owner/login',{passphrase:pass});if(r.status===200)this.csrf=r.body.csrf;return r;},
  };
  return client;
}
export function funded(r,overrides={}){
  r.ventures.configurePolicy({enabled:true,gross_spend_limit_yen:20000,per_venture_limit_yen:8000,active_venture_limit:1,allowed_kinds:['compute','hosting','tools','ads','research'],
    operating_grant_limit_yen:6000,allow_isolated_run:false,expires_at:'2026-12-31T00:00:00Z',source_ref:'test:owner-policy',...overrides});
}
export function venture(r,id='v1',{activate=true,budget=5000}={}){
  r.ventures.propose({id,title:'合成事業',hypothesis:'仮説',customer_problem:'課題',success_metric:'指標',failure_rule:'撤退条件',budget_yen:budget,learning_deadline:'2026-12-15T00:00:00Z',evidence_refs:[]});
  if(activate)r.ventures.activate(id);return id;
}
export const hashOf=sha;
