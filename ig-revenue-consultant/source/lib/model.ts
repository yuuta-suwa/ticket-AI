import { z } from "zod";

const line = z.string().trim().max(500);
const paragraph = z.string().trim().max(12000);
const identifier = z.string().min(1).max(100);
const date = z.string().max(40);
const calendarDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "日付はYYYY-MM-DD形式で入力してください。").refine(value=>{const d=new Date(value+"T00:00:00Z");return !Number.isNaN(d.getTime())&&d.toISOString().slice(0,10)===value;}, "実在する日付を入力してください。");
export const sourceKinds = ["gifts", "badges", "sponsor", "lead", "affiliate", "creative", "license", "website_ads", "platform", "subscription", "research", "product"] as const;
export const kindInfo: Record<string, {label:string; payer:string; description:string; metric:string; conditions:string; color:string}> = {
  gifts:{label:"ギフト",payer:"視聴者",description:"コンテンツへの応援を収益に",metric:"支援者・継続視聴",conditions:"日本導入の発表あり。最新の利用資格と受取条件を確認。",color:"pink"},
  badges:{label:"ライブ支援",payer:"ライブ視聴者",description:"配信への支援を受け取る",metric:"支援額・配信時間",conditions:"ライブとバッジの利用資格を個別に確認。",color:"pink"},
  sponsor:{label:"スポンサー",payer:"企業・ブランド",description:"特定の視聴者へ届く価値に対価",metric:"掲載履行・契約更新",conditions:"広告主との合意、広告表示、掲載条件が必要。",color:"purple"},
  lead:{label:"無料登録・送客",payer:"企業・広告ネットワーク",description:"購入以外の承認成果から報酬",metric:"承認成果・否認理由",conditions:"案件ごとに成果・否認・個人情報の取扱条件を確認。",color:"blue"},
  affiliate:{label:"紹介料",payer:"企業・広告ネットワーク",description:"他社商品の成果に応じた報酬",metric:"承認報酬・取消し",conditions:"提携・リンク・投稿方法の許可を確認。発生と確定を区別。",color:"orange"},
  creative:{label:"広告素材制作",payer:"企業",description:"使われるクリエイティブを制作",metric:"採用・再発注・制作時間",conditions:"素材の権利、実体験の真偽、修正範囲、契約が必要。",color:"purple"},
  license:{label:"コンテンツ利用料",payer:"企業・媒体",description:"素材の利用期間・用途に対価",metric:"利用更新・権利の有効期限",conditions:"利用権・地域・期間・独占・AI素材の許可を確認。",color:"purple"},
  website_ads:{label:"サイト広告",payer:"広告事業者",description:"無料の実用サイトで広告収入",metric:"有効アクセス・確定収益",conditions:"独自サイトの審査が必要。Instagram内の報酬とは別。",color:"blue"},
  platform:{label:"媒体の報酬",payer:"各プラットフォーム",description:"資格を満たしたコンテンツの報酬",metric:"適格視聴・確定報酬",conditions:"媒体・国・招待・期間・独自性を確認。未確認の報酬は計画に入れない。",color:"blue"},
  subscription:{label:"会費",payer:"継続会員",description:"限定コンテンツや参加への会費",metric:"継続率・提供負担",conditions:"機能資格と継続的な提供責任。サービス販売に近い構造。",color:"pink"},
  research:{label:"検証企画の協賛",payer:"企業",description:"意思決定に役立つ検証へ協賛",metric:"企画採用・再契約",conditions:"検証候補。需要と価格は未実証。独立した評価との区別が必要。",color:"orange"},
  product:{label:"自社商品",payer:"顧客",description:"課題を解決する完成物や支援",metric:"提供完了・顧客成果",conditions:"販売・提供・返品条件と原価を確認。",color:"green"},
};
export const sourceSchema = z.object({
 id:identifier,name:line.min(1),kind:z.enum(sourceKinds),payer:line,mechanism:paragraph,
 status:z.enum(["exploring","active","paused"]),eligibility:z.enum(["unverified","verified","unavailable"]),
 termsUrl:z.string().max(2000),verifiedAt:date,conditions:paragraph,createdAt:date,
});
export const evidenceSchema=z.object({id:identifier,title:line.min(1),url:z.string().max(2000),observation:paragraph,problem:line,verified:z.boolean(),createdAt:date});
export const experimentSchema=z.object({id:identifier,title:line.min(1),sourceId:line,hypothesis:paragraph,change:paragraph,metric:line,target:line,minSample:z.number().int().min(0).max(10000000),budget:z.number().int().min(0).max(100000000),start:date,end:date,stopCondition:paragraph,status:z.enum(["draft","running","observing","completed","paused"]),result:paragraph,createdAt:date,
 origin:z.string().max(300).default(""),reportId:z.string().max(100).default(""),prediction:paragraph.default(""),timeLimitMinutes:z.number().int().min(0).max(1000000).nullable().default(null),
 verdict:z.enum(["","continue","modify","stop","extend"]).default(""),verdictReason:paragraph.default(""),verdictAt:date.default(""),nextCheck:paragraph.default("")});
export const contentSchema=z.object({id:identifier,title:line.min(1),sourceId:line,experimentId:line,format:z.enum(["reel","carousel","story","feed"]),hook:paragraph,caption:paragraph,script:paragraph,cta:line,assetUrl:z.string().max(2000),evidenceIds:z.array(identifier).max(40),factsChecked:z.boolean(),rightsChecked:z.boolean(),adDisclosure:z.boolean(),adRequired:z.boolean(),status:z.enum(["draft","review","approved","posted"]),approvalHash:z.string().max(100),approvedAt:date,publishedUrl:z.string().max(2000),createdAt:date});
export const ledgerSchema=z.object({id:identifier,sourceId:identifier,externalId:line,kind:z.enum(["earning","cost","adjustment"]),status:z.enum(["estimated","pending","confirmed","paid","rejected"]),amount:z.number().int().min(0).max(100000000),fee:z.number().int().min(0).max(100000000),date:calendarDate,title:line.min(1),referenceId:line,category:line,minutes:z.number().int().min(0).max(1000000),note:paragraph,createdAt:date});
export const metricSchema=z.object({id:identifier,contentId:identifier,date:calendarDate,views:z.number().int().min(0).max(1e10).nullable(),reach:z.number().int().min(0).max(1e10).nullable(),qualifiedViews:z.number().int().min(0).max(1e10).nullable(),clicks:z.number().int().min(0).max(1e10).nullable(),actions:z.number().int().min(0).max(1e10).nullable(),note:line});
export const reportResultSchema=z.object({
 summary:paragraph,bottleneck:paragraph,facts:z.array(z.object({claim:paragraph,evidenceId:line})).max(20),hypotheses:z.array(paragraph).max(8),
 nextExperiment:z.object({title:line,hypothesis:paragraph,change:paragraph,metric:line,stopCondition:paragraph}),
 revenueOptions:z.array(z.object({kind:z.enum(sourceKinds),reason:paragraph,risk:paragraph})).max(4),
 contentProposal:z.object({title:line,hook:paragraph,caption:paragraph,script:paragraph,cta:line,format:z.enum(["reel","carousel","story","feed"])}).nullable(),
 cautions:z.array(paragraph).max(10),
});
const longText=z.string().trim().min(1).max(6000);
const refId=z.string().min(1).max(100);
const optionalDate=z.union([calendarDate,z.null()]);
/** Report v2 (docs/consulting-report-v2.schema.json). The shape is validated here; facts and refs are re-checked in lib/consult.ts. */
export const reportV2Schema=z.object({
 schemaVersion:z.literal(2),mode:z.enum(["rules","model","import"]),
 snapshot:z.object({workspaceRevision:z.number().int().min(0),period:z.object({start:calendarDate,end:calendarDate}).strict(),dataSignature:z.string().regex(/^[a-f0-9]{64}$/),createdAt:z.string().max(40)}).strict(),
 summary:longText,
 understoodContext:z.object({goal:longText,constraints:z.array(longText).max(12),unknowns:z.array(longText).max(12)}).strict(),
 diagnosis:z.object({bottleneck:longText,knowledgeState:z.enum(["insufficient","tentative","supported"]),limitations:z.array(longText).max(12)}).strict(),
 evidenceRefs:z.array(z.object({refId:z.string().min(1).max(300),kind:z.enum(["ledger","metric","evidence","source","experiment","web","brief"]),recordId:z.string().min(1).max(300),label:z.string().min(1).max(300),verification:z.enum(["verified","self_reported","unverified"])}).strict()).max(40),
 facts:z.array(z.object({claim:longText,evidenceRefs:z.array(refId).min(1).max(30)}).strict()).max(20),
 hypotheses:z.array(z.object({statement:longText,basisRefs:z.array(refId).max(30),alternativeExplanation:longText}).strict()).max(5),
 strategyOptions:z.array(z.object({id:z.string().min(1).max(300),kind:z.enum(sourceKinds),payer:longText,value:longText,reason:longText,prerequisites:z.array(longText).min(1).max(12),risks:z.array(longText).min(1).max(8),decision:z.enum(["candidate","hold","reject"]),evidenceRefs:z.array(refId).max(30)}).strict()).max(4),
 actions:z.array(z.object({id:z.string().min(1).max(300),title:z.string().trim().min(1).max(300),kind:z.enum(["research","observe","content_draft","revenue_test","cost_review"]),sourceId:z.string().min(1).max(300).nullable(),hypothesis:longText,change:longText,mainMetric:longText,judgementRule:longText,deadline:optionalDate,costLimitJPY:z.number().int().min(0).max(100000000).nullable(),timeLimitMinutes:z.number().int().min(0).max(1000000).nullable(),stopCondition:longText,whyThisFirst:longText,evidenceRefs:z.array(refId).max(30),requiresHumanApproval:z.literal(true)}).strict()).max(3),
 recommendedActionId:z.string().min(1).max(300).nullable(),
 nextDecision:z.enum(["prepare","continue","change","stop","observe"]),
 cautions:z.array(longText).max(12),
 executionPerformed:z.literal(false),
}).strict();
export type ReportV2=z.infer<typeof reportV2Schema>;
export const consultTopics=["diagnose","strategy","content","review"] as const;
export const reportSchema=z.object({id:identifier,mode:z.enum(["rules","model","import"]),task:z.enum(["analysis","strategy","content"]),createdAt:date,result:reportResultSchema,sources:z.array(z.object({title:line,url:z.string().max(2000)})).max(30),tokens:z.number().int().min(0),model:line,feedback:z.enum(["none","useful","revise"]),
 v2:reportV2Schema.optional(),sessionId:z.string().max(100).default(""),request:z.string().max(2000).default("")});
export const profileSchema=z.object({brandName:line,handle:line,theme:line,audience:line,values:paragraph,weeklyHours:z.number().min(0).max(168),hourlyRate:z.number().int().min(0).max(100000),budget:z.number().int().min(0).max(100000000),targetProfit:z.number().int().min(0).max(100000000),paused:z.boolean(),aiEnabled:z.boolean(),autoAnalyze:z.boolean().default(false),dailyAILimit:z.number().int().min(0).max(20),model:line,monthlyTokenLimit:z.number().int().min(0).max(50000000).default(0)});
const dateOrEmpty=z.union([calendarDate,z.literal("")]);
const consent=z.enum(["yes","no","undecided"]);
/** 初回ヒアリングで整理した「理解」。すべて本人の申告として扱い、確認済みの根拠とは区別する。 */
export const briefSchema=z.object({
 goal:paragraph,periodStart:dateOrEmpty,periodEnd:dateOrEmpty,targetRevenue:z.number().int().min(0).max(100000000),
 strengths:paragraph,assets:paragraph,capacity:paragraph,audienceProblem:paragraph,valueIdea:paragraph,
 avoid:paragraph,face:consent,voice:consent,dataNote:paragraph,step:z.number().int().min(0).max(5),completedAt:date,
}).refine(b=>!b.periodStart||!b.periodEnd||b.periodStart<=b.periodEnd,{message:"対象期間の開始日は終了日以前にしてください。"});
export const canvasStatuses=["hypothesis","needs_check","confirmed"] as const;
const canvasNode=z.object({text:paragraph,status:z.enum(canvasStatuses),evidenceIds:z.array(identifier).max(20)});
export const canvasSchema=z.object({audience:canvasNode,value:canvasNode,reward:canvasNode,updatedAt:date});
export const turnSchema=z.object({id:identifier,role:z.enum(["user","advisor"]),content:z.string().trim().max(6000),reportId:z.string().max(100),createdAt:date});
export const sessionSchema=z.object({id:identifier,topic:z.enum(consultTopics),title:line,createdAt:date,turns:z.array(turnSchema).max(60)});
export const decisionSchema=z.object({id:identifier,reportId:identifier,actionId:z.string().min(1).max(300),choice:z.enum(["adopted","rejected","deferred"]),reason:paragraph,experimentId:z.string().max(100),createdAt:date});
export function emptyBrief(){return {goal:"",periodStart:"",periodEnd:"",targetRevenue:0,strengths:"",assets:"",capacity:"",audienceProblem:"",valueIdea:"",avoid:"",face:"undecided" as const,voice:"undecided" as const,dataNote:"",step:0,completedAt:""};}
export function emptyCanvas(){const node=()=>({text:"",status:"hypothesis" as const,evidenceIds:[] as string[]});return {audience:node(),value:node(),reward:node(),updatedAt:""};}
/** v1（schemaVersion:1）の保存データ・バックアップを読み、新しい項目を既定値で補う。既存の記録は変更しない。 */
export const stateSchema=z.object({schemaVersion:z.union([z.literal(1),z.literal(2)]).transform(()=>2 as const),profile:profileSchema,sources:z.array(sourceSchema).max(100),evidence:z.array(evidenceSchema).max(300),experiments:z.array(experimentSchema).max(200),contents:z.array(contentSchema).max(400),ledger:z.array(ledgerSchema).max(1500),metrics:z.array(metricSchema).max(1000),reports:z.array(reportSchema).max(60),
 brief:briefSchema.default(emptyBrief),canvas:canvasSchema.default(emptyCanvas),sessions:z.array(sessionSchema).max(30).default([]),decisions:z.array(decisionSchema).max(300).default([])});
export type State=z.infer<typeof stateSchema>;
export type RevenueSource=z.infer<typeof sourceSchema>;
export type Evidence=z.infer<typeof evidenceSchema>;
export type Experiment=z.infer<typeof experimentSchema>;
export type Content=z.infer<typeof contentSchema>;
export type Ledger=z.infer<typeof ledgerSchema>;
export type Metric=z.infer<typeof metricSchema>;
export type Report=z.infer<typeof reportSchema>;
export type ReportResult=z.infer<typeof reportResultSchema>;
export type Brief=z.infer<typeof briefSchema>;
export type Canvas=z.infer<typeof canvasSchema>;
export type Session=z.infer<typeof sessionSchema>;
export type Turn=z.infer<typeof turnSchema>;
export type Decision=z.infer<typeof decisionSchema>;
export type ConsultTopic=typeof consultTopics[number];
export function emptyState():State {return {schemaVersion:2,profile:{brandName:"My Instagram Studio",handle:"",theme:"",audience:"",values:"事実と仮説を分け、視聴者に役立つ価値を届ける。",weeklyHours:5,hourlyRate:2000,budget:0,targetProfit:0,paused:false,aiEnabled:false,autoAnalyze:false,dailyAILimit:0,model:"",monthlyTokenLimit:0},sources:[],evidence:[],experiments:[],contents:[],ledger:[],metrics:[],reports:[],brief:emptyBrief(),canvas:emptyCanvas(),sessions:[],decisions:[]};}
export function newId(){
 if(typeof crypto.randomUUID==="function")return crypto.randomUUID();
 const b=crypto.getRandomValues(new Uint8Array(16));b[6]=(b[6]&15)|64;b[8]=(b[8]&63)|128;
 const h=Array.from(b,x=>x.toString(16).padStart(2,"0")).join("");return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;
}
export const now=()=>new Date().toISOString();
export const today=()=>new Intl.DateTimeFormat("sv-SE",{timeZone:"Asia/Tokyo"}).format(new Date());
