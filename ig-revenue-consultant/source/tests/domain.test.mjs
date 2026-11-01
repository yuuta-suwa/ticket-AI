import {test} from 'node:test';
import assert from 'node:assert/strict';
import {emptyState,stateSchema,ledgerSchema,metricSchema,reportResultSchema} from '../lib/model.ts';
import {totals,validateRelations,normalizeApproval,fingerprint,approvalErrors,ruleReport,observationSignature} from '../lib/domain.ts';
import {importLedgerCSV,parseCSV,ledgerCSV} from '../lib/csv.ts';

const date='2026-10-31';
function source(id='s'){return {id,name:'試験用の協賛',kind:'sponsor',payer:'試験企業',mechanism:'試験',status:'active',eligibility:'verified',termsUrl:'',verifiedAt:date,conditions:'試験用の確認済み条件',createdAt:date};}
function entry(id,amount,extra={}){return {id,sourceId:'s',externalId:id,kind:'earning',status:'paid',amount,fee:0,date,title:id,referenceId:'',category:'',minutes:0,note:'架空の試験条件',createdAt:date,...extra};}
function content(){return {id:'c',title:'試験投稿',sourceId:'s',experimentId:'',format:'feed',hook:'冒頭',caption:'確認した本文',script:'',cta:'',assetUrl:'https://example.com/image.jpg',evidenceIds:[],factsChecked:true,rightsChecked:true,adDisclosure:true,adRequired:true,status:'review',approvalHash:'',approvedAt:'',publishedUrl:'',createdAt:date};}
function fixture(){const s=emptyState();s.sources=[source()];return s;}

test('固定の金額照合：返金と戻らない手数料・全原価を控除して24,300円',()=>{
 const s=fixture();s.ledger=[...['a','b','c'].map(id=>entry(id,30000,{fee:900})),entry('refund',30000,{kind:'adjustment',referenceId:'c'}),...[[10000,'production'],[10000,'ads'],[2000,'ai'],[3000,'infrastructure'],[8000,'labor']].map(([amount,category],i)=>entry('cost'+i,amount,{kind:'cost',category,minutes:category==='labor'?240:0}))];
 assert.deepEqual(validateRelations(stateSchema.parse(s)),[]);
 const t=totals(s);assert.equal(t.revenue,60000);assert.equal(t.fees,2700);assert.equal(t.costs,33000);assert.equal(t.profit,24300);assert.equal(t.cash,24300);assert.equal(t.minutes,240);
});
test('見積り・承認待ち・否認を利益に含めない。確定未入金と現金を区別する',()=>{
 const s=fixture();s.ledger=[entry('estimate',90000,{status:'estimated'}),entry('pending',50000,{status:'pending',fee:1000}),entry('rejected',40000,{status:'rejected'}),entry('confirmed',10000,{status:'confirmed',fee:500})];
 const t=totals(s);assert.equal(t.revenue,10000);assert.equal(t.profit,9500);assert.equal(t.cash,0);assert.equal(t.pending,49000);assert.equal(t.estimated,90000);assert.equal(t.receivable,9500);
});
test('返金後も記録した原価を残し、過大な減額や手数料を拒否する',()=>{
 const s=fixture();s.ledger=[entry('a',10000),entry('cost',2000,{kind:'cost'}),entry('refund',10000,{kind:'adjustment',referenceId:'a'})];assert.equal(totals(s).profit,-2000);s.ledger[2].amount=10001;assert.match(validateRelations(s).join(),/元報酬を超える/);s.ledger[0].fee=10001;assert.match(validateRelations(s).join(),/手数料/);
});
test('CSVの再取り込みは金額を増やさず、既存の承認状態を上書きしない',()=>{
 const s=fixture();s.ledger=[entry('a',10000)];const csv=ledgerCSV(s.ledger);const imported=importLedgerCSV(csv,s.ledger,new Set(['s']));assert.equal(imported.added.length,0);assert.equal(imported.skipped,1);assert.equal(totals(s).revenue,10000);
 const first=importLedgerCSV(csv,[],new Set(['s']));const second=importLedgerCSV(csv,first.added,new Set(['s']));assert.equal(second.skipped,1);assert.equal(first.added[0].status,'paid');
});
test('CSVの引用符・改行を解析し、不正な引用符・未登録の収益源を拒否する',()=>{
 assert.deepEqual(parseCSV('\uFEFFa,b\r\n"two, words","line\n""quote"""'),[['a','b'],['two, words','line\n"quote"']]);
 assert.throws(()=>parseCSV('a,b\n"open,x'),/引用符/);
 assert.throws(()=>importLedgerCSV(ledgerCSV([entry('a',1)]),[],new Set()),/収益源ID/);
});
test('同じ明細ID・孤立した参照・未確認収益源の運用開始を拒否する',()=>{
 const s=fixture();s.ledger=[entry('a',1),entry('b',1,{externalId:'a'})];assert.match(validateRelations(s).join(),/重複/);s.ledger[1].sourceId='missing';assert.match(validateRelations(s).join(),/収益源が見つかりません/);s.sources[0].eligibility='unverified';assert.match(validateRelations(s).join(),/契約条件/);
});
test('通常の保存や復元から投稿の承認・公開を偽装できない',async()=>{
 const before=fixture();const next=structuredClone(before);next.contents=[{...content(),status:'posted',approvalHash:'forged',publishedUrl:'https://www.instagram.com/p/fake/'}];await normalizeApproval(next,before);assert.equal(next.contents[0].status,'review');assert.equal(next.contents[0].approvalHash,'');assert.equal(next.contents[0].publishedUrl,'');
});
test('承認後の本文・素材・権利確認の変更で承認が失効する',async()=>{
 const before=fixture();const c=content();c.status='approved';c.approvalHash=await fingerprint(c);c.approvedAt=date;before.contents=[c];
 for(const mutation of [x=>x.caption+='変更',x=>x.assetUrl+='?new=1',x=>x.rightsChecked=false]){const next=structuredClone(before);mutation(next.contents[0]);await normalizeApproval(next,before);assert.equal(next.contents[0].status,'review');assert.equal(next.contents[0].approvalHash,'');}
 const unchanged=structuredClone(before);await normalizeApproval(unchanged,before);assert.equal(unchanged.contents[0].approvalHash,c.approvalHash);
});
test('根拠や収益条件の変更で再承認し、公開済みの記録を編集・削除できない',async()=>{
 const before=fixture();const c=content();c.status='approved';c.approvalHash=await fingerprint(c);before.contents=[c];
 const changed=structuredClone(before);changed.sources[0].conditions='変更された利用条件';await normalizeApproval(changed,before);assert.equal(changed.contents[0].status,'review');
 before.contents[0].status='posted';before.contents[0].publishedUrl='https://www.instagram.com/p/test/';
 const edited=structuredClone(before);edited.contents[0].caption='履歴の書き換え';await normalizeApproval(edited,before);assert.equal(edited.contents[0].caption,c.caption);
 const removed=structuredClone(before);removed.contents=[];await normalizeApproval(removed,before);assert.equal(removed.contents.length,1);assert.equal(removed.contents[0].status,'posted');
});
test('事実・権利・広告表示・資料の確認が欠ければ承認できない',()=>{
 const s=fixture(),c=content();c.factsChecked=false;c.rightsChecked=false;c.adDisclosure=false;c.evidenceIds=['unverified'];assert.equal(approvalErrors(c,s).length,4);
});
test('実在しない日付と負数を拒否し、未取得の指標はnullで保存する',()=>{
 assert.equal(ledgerSchema.safeParse(entry('a',1,{date:'2026-02-30'})).success,false);assert.equal(ledgerSchema.safeParse(entry('a',-1)).success,false);
 const m=metricSchema.parse({id:'m',contentId:'c',date,views:0,reach:null,qualifiedViews:null,clicks:null,actions:null,note:'未取得'});assert.equal(m.actions,null);assert.equal(m.views,0);
});
test('一件の収益を成功と一般化せず、停止中の新規実験を拒否する',()=>{
 const s=fixture();s.evidence=[{id:'ev',title:'試験資料',url:'',observation:'試験観察',problem:'課題',verified:true,createdAt:date}];s.ledger=[entry('a',10000)];assert.match(ruleReport(s).summary,/再現性は未判定/);
 s.profile.paused=true;s.experiments=[{id:'e',sourceId:'s',title:'実験',hypothesis:'仮説',change:'変更',metric:'主指標',target:'',minSample:0,budget:0,start:date,end:'',stopCondition:'停止',status:'running',result:'',createdAt:date}];assert.match(validateRelations(s).join(),/停止中/);
});
test('自動分析は報酬・観測値・実験結果の変更を検知し、レポート追加では再発火しない',()=>{
 const before=fixture(),next=structuredClone(before);const sig=observationSignature(before);next.reports.push({result:'試験のみ'});assert.equal(observationSignature(next),sig);next.ledger.push(entry('a',1));assert.notEqual(observationSignature(next),sig);
});
test('不完全なAI出力を受け入れず、実データは架空実績なしで開始する',()=>{
 assert.equal(reportResultSchema.safeParse({summary:'売上が増えた'}).success,false);const s=emptyState();assert.equal(s.ledger.length,0);assert.equal(s.profile.aiEnabled,false);assert.equal(s.profile.autoAnalyze,false);assert.equal(totals(s).profit,0);
});
