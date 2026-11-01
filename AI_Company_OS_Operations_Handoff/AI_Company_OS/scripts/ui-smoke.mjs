// Mobile-viewport browser check of the owner UI against a TEMPORARY synthetic database.
// This is a local browser emulation (Chromium, iPhone-sized viewport), NOT a real phone test.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { createRuntime } from '../src/runtime.mjs';
import { startServer } from '../src/server.mjs';
import { experimentFixture } from '../test/fixtures-research.mjs';
import { funded } from '../test/helpers.mjs';
import { sha } from '../src/authority.mjs';

const require=createRequire(import.meta.url);
const { chromium, devices }=require(process.env.PLAYWRIGHT_PATH??'playwright');
const out=process.argv[2]??path.resolve('../review/p4-ui');fs.mkdirSync(out,{recursive:true});
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'aicos-ui-'));
const rt=createRuntime({file:path.join(dir,'demo.sqlite'),clock:()=>new Date('2026-11-01T00:00:00Z')});
const PASS='demo passphrase for ui smoke';
rt.authority.provisionOwnerCredential(PASS);funded(rt);experimentFixture(rt);
const H=sha('release-v1');
rt.authority.requestDecision('CEO',{id:'perm-1',kind:'PERMISSION',venture_id:null,subject_type:'release',subject_id:'rel-1',subject_version:1,content_hash:H,title:'【デモ】テスト環境への公開',proposal:'release v1 をテスト用ページへ公開',evidence_refs:['experiment:exp1@1'],counterevidence:['表計算で十分という声'],unknowns:['実需要'],
  customer_impact:'テスト環境のみ',rollback:'ページを非公開に戻す',expires_at:'2026-11-03T00:00:00Z',requested_grant:{operation:'publish',target:'test:landing',max_cost_yen:0,max_count:1,valid_until:'2026-11-08T00:00:00Z'}});
const server=await startServer(rt,{port:0,secureCookie:false});const base=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch();const ctx=await browser.newContext({...devices['iPhone 13']});const page=await ctx.newPage();
const results=[];const step=async(name,fn)=>{try{await fn();results.push({name,ok:true});}catch(e){results.push({name,ok:false,error:e.message});}};
await page.goto(base);
await step('login form shown before auth',async()=>{await page.waitForSelector('#pass');});
await step('wrong passphrase rejected',async()=>{await page.fill('#pass','wrong wrong wrong');await page.click('button[type=submit]');await page.waitForFunction(()=>document.querySelector('#loginMsg').textContent.includes('ログインできません'));});
await step('owner login',async()=>{await page.fill('#pass',PASS);await page.click('button[type=submit]');await page.waitForSelector('nav#tabs:not([hidden])');await page.waitForSelector('text=全社の状態');});
await page.screenshot({path:path.join(out,'01-overview.png'),fullPage:true});
await step('unconnected/unknown labels shown',async()=>{const t=await page.textContent('main');if(!t.includes('未接続')||!t.includes('不明'))throw new Error('labels missing');});
await step('no horizontal scroll at phone width',async()=>{const w=await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);if(w>0)throw new Error('overflow '+w);});
await step('opportunity card with sources and counterevidence',async()=>{await page.click('nav button[data-t=opps]');await page.waitForSelector('text=反証');await page.click('[data-o]');await page.waitForSelector('text=原本');});
await page.screenshot({path:path.join(out,'02-opportunity.png'),fullPage:true});
await step('decision card shows version, cost, impact, rollback',async()=>{await page.click('nav button[data-t=decisions]');await page.waitForSelector('text=戻す方法');const t=await page.textContent('main');for(const s of ['対象版','実行先','費用・回数','通知の到着'])if(!t.includes(s))throw new Error('missing '+s);});
await page.screenshot({path:path.join(out,'03-decision.png'),fullPage:true});
await step('double tap on permit applies once (re-auth prompt answered)',async()=>{
  let prompts=0;page.on('dialog',d=>{prompts++;d.accept(d.message().includes('パスフレーズ')?PASS:'テスト環境のみ許可');});
  const btn=page.locator('button[data-a=approve]');await btn.dblclick();await page.waitForSelector('text=APPROVED',{timeout:8000});
  const n=rt.company.db.prepare("SELECT COUNT(*) AS n FROM events WHERE kind='DECISION_APPROVED'").get().n;if(n!==1)throw new Error('approved '+n+' times');
  if(rt.authority.grants().length!==1)throw new Error('grant count '+rt.authority.grants().length);});
await page.screenshot({path:path.join(out,'04-approved.png'),fullPage:true});
await step('offline: mutations disabled and stale banner shown',async()=>{await page.click('nav button[data-t=overview]');await page.waitForSelector('#pause');await ctx.setOffline(true);await page.evaluate(()=>dispatchEvent(new Event('offline')));
  await page.waitForFunction(()=>document.querySelector('#banner').textContent.includes('オフライン'));if(!(await page.locator('#pause').isDisabled()))throw new Error('pause enabled offline');await ctx.setOffline(false);await page.evaluate(()=>dispatchEvent(new Event('online')));});
await page.screenshot({path:path.join(out,'05-offline-recovered.png'),fullPage:true});
await step('company stop shows receipt and worker acknowledgement state',async()=>{rt.authority.workerHeartbeat({worker_id:'w1',lane:'RUN'});await page.click('#pause');await page.waitForSelector('text=確認待ち');});
await page.screenshot({path:path.join(out,'06-paused.png'),fullPage:true});
await step('expired session forces re-login',async()=>{rt.authority.revokeAllSessions('ui-smoke');await page.click('nav button[data-t=money]');await page.waitForSelector('text=セッションが無効です');});
await browser.close();server.close();rt.close();fs.rmSync(dir,{recursive:true,force:true});
const report={mode:'local-chromium-mobile-emulation (iPhone 13 viewport)',real_device:false,data:'synthetic demo database (temporary)',at:new Date().toISOString(),results};
fs.writeFileSync(path.join(out,'ui-smoke.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
if(results.some(r=>!r.ok))process.exitCode=1;
