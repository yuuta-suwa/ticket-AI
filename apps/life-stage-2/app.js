"use strict";
/* LIFE STAGE 2.0 ワーク
 * - ログイン（Supabase Auth・メールリンク）後、サーバーのロールが core/admin の人にだけコアメンバータブを表示
 * - コアのデータはDBのRLSでもコアメンバー以外は読み書き不可（画面を改造しても取得できない）
 * - AI：依頼文をコピーして自端末のAIへ貼り付け（基本）／サーバー接続のシステムAI（設定時のみ）
 */
const CFG = Object.assign({ supabaseUrl: "", supabaseAnonKey: "", aiEnabled: false }, window.LS_CONFIG || {});
const ONLINE = !!(CFG.supabaseUrl && CFG.supabaseAnonKey);
const sb = ONLINE && window.supabase
  ? window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseAnonKey, { auth: { persistSession: true, detectSessionInUrl: true, flowType: "pkce" } })
  : null;

/* ============ 教材定義（全メンバー 7ステージ） ============ */
const STAGES = [
 {id:"s1",en:"MY LIFE VALUE",ja:"人生の価値を言葉にする",out:"価値カード",
  lead:"あなたがこれまで大切にしてきたものは、誰かに伝えた瞬間に「価値」になります。",
  qs:[{q:"人生で大切にしてきた価値観を3つ挙げてください。",ex:"例：誠実さ／挑戦／家族との時間"},
      {q:"その価値観が生まれた具体的な経験は？",ex:"いつ・どこで・誰と・何があったかを1つ。"},
      {q:"その価値観は、これまで誰の役に立ちましたか？",ex:"例：後輩が悩んだ時、最後まで話を聴いたことで…"}],
  compose:a=>`大切にしている価値観：${a[0]||"—"}\n\nその原点：${a[1]||"—"}\n\n誰かの役に立った場面：${a[2]||"—"}`},
 {id:"s2",en:"TELL YOUR STORY",ja:"90秒で自分を伝える",out:"MY LIFE STORY",
  lead:"事実だけでなく、その時の気持ちと学びを入れると、相手の心に残るストーリーになります。",
  qs:[{q:"人生の転機になった出来事は？",ex:"事実を短く。"},
      {q:"その時、何を感じましたか？",ex:"悔しかった／怖かった／うれしかった など、感情の言葉で。"},
      {q:"そこから何を学びましたか？",ex:"今も行動の基準になっていること。"},
      {q:"その学びは、今のあなたと未来にどうつながっていますか？",ex:"「だから今、私は〜しています」の形で。"}],
  compose:a=>`${a[0]||""}\nその時、${a[1]||""}\nそこから学んだのは、${a[2]||""}\nだから今、${a[3]||""}`},
 {id:"s3",en:"OUR VISION",ja:"相手の話を聴き、共通点を見つける",out:"OUR VISION メモ",
  lead:"伝える力と同じくらい大切なのが聴く力。相手の物語を要約し、違いも尊重します。",
  qs:[{q:"相手（仲間・家族・同僚）に聞いてみたい質問を3つ書いてください。",ex:"例：一番うれしかった仕事は？ 5年後どうなっていたい？"},
      {q:"実際に聴いた相手の話を、2〜3文で要約してください。",ex:"相手の言葉をなるべくそのまま使う。"},
      {q:"あなたと相手の共通点と違いは？",ex:"共通点：… ／ 違い：…"}],
  compose:a=>`聴いた質問：${a[0]||"—"}\n\n相手の話の要約：${a[1]||"—"}\n\n共通点と違い：${a[2]||"—"}`},
 {id:"s4",en:"VISION GAP",ja:"未来と現在地の距離を測る",out:"ビジョンギャップ",
  lead:"理想と現在地を並べると、次にやるべきことが見えてきます。",
  qs:[{q:"3年後、どんな自分・どんな関係・どんな毎日でいたいですか？",ex:"仕事・お金・健康・家族・仲間・学び など。"},
      {q:"今の現在地は？（事実で）",ex:"数字や具体的な状況で書くと差が見えやすい。"},
      {q:"理想と現在地の一番大きな差は何ですか？",ex:"差を一言で表すと？"}],
  compose:a=>`3年後の理想：${a[0]||"—"}\n\n現在地：${a[1]||"—"}\n\n一番大きな差：${a[2]||"—"}`},
 {id:"s5",en:"FIND THE WAY",ja:"手段を比べて選ぶ",out:"選んだ手段と理由",
  lead:"差を埋める方法は一つではありません。3案を比べ、自分で選んだ理由を残します。",
  qs:[{q:"差を埋める手段を3つ挙げてください。",ex:"案A／案B／案C"},
      {q:"それぞれの良い点・難しい点は？",ex:"時間・お金・必要な人・続けやすさで比べる。"},
      {q:"どの手段を選びますか？ その理由は？",ex:"「〜だから、私は案◯を選ぶ」"}],
  compose:a=>`手段の候補：${a[0]||"—"}\n\n比較：${a[1]||"—"}\n\n選んだ手段と理由：${a[2]||"—"}`},
 {id:"s6",en:"THE POWER OF ENVIRONMENT",ja:"環境と関係を育てる",out:"環境デザイン",
  lead:"人は環境の影響を受けます。誰と、どこで、どんな時間を過ごすかを設計します。",
  qs:[{q:"今の環境（人・場所・習慣）は、あなたにどんな影響を与えていますか？",ex:"良い影響と、変えたい影響の両方。"},
      {q:"理想に近づくために、どんな環境に身を置きたいですか？",ex:"例：週1回、目標を話せる仲間と会う。"},
      {q:"これから関係を育てたい人は誰ですか？ そのために何をしますか？",ex:"名前（イニシャル可）と具体的な行動。"}],
  compose:a=>`今の環境の影響：${a[0]||"—"}\n\n身を置きたい環境：${a[1]||"—"}\n\n関係を育てたい人と行動：${a[2]||"—"}`},
 {id:"s7",en:"THE NEXT CHAPTER",ja:"90日の行動案をつくる",out:"90日行動案",
  lead:"ここまでの気づきを、明日からの行動に変えます。最初の一歩は小さくて大丈夫。",
  qs:[{q:"最初の30日でやることは？",ex:"週に何回・何を、まで具体的に。"},
      {q:"60日目・90日目にはどうなっていたいですか？",ex:"60日：… ／ 90日：…"},
      {q:"明日やる最初の一歩と、この計画を伝える相手は？",ex:"一歩：… ／ 伝える相手：…"}],
  compose:a=>`1〜30日：${a[0]||"—"}\n\n60日・90日の姿：${a[1]||"—"}\n\n最初の一歩と伝える相手：${a[2]||"—"}`},
];
const SCENES = [
 {id:"p1",t:"友人への自己紹介",tip:"結論→エピソード→今の想い、の順で。60〜90秒を目安に。"},
 {id:"p2",t:"家族への相談",tip:"「決めたこと」ではなく「考えていること」から共有し、相手の意見を最後まで聴く。"},
 {id:"p3",t:"職場での報告",tip:"結論・事実・次の行動の3点で。感想は最後に一言。"},
 {id:"p4",t:"顧客への説明",tip:"相手の困りごとを先に確認し、相手の言葉で言い換えてから提案する。"},
 {id:"p5",t:"異なる意見の調整",tip:"相手の意見を要約して確認→共通の目的を言葉にする→違いを一つずつ扱う。"},
];
const PHASES = [
 {id:"ph1",d:"DAY 1–30",t:"現状診断・90日目標・個人KPI",items:["現状の数字を記録する","90日目標を1つ決める","目標につながる個人KPIを設定する"]},
 {id:"ph2",d:"DAY 31–60",t:"課題仮説・演習・改善",items:["KPIが伸びない原因の仮説を立てる","ロープレ・現場で試す","結果とメンター修正を記録する"]},
 {id:"ph3",d:"DAY 61–90",t:"再現性・模擬指導",items:["成果が出た条件を言語化する","他者に教えられる手順にまとめる","模擬指導を行い振り返る"]},
];

/* ============ 状態 ============ */
const blankAll = () => ({answers:{},step:{},drafts:{},approved:{},practice:{},daily:{},aiNotes:[]});
const blankCore = () => ({start:"",goal:"",kpis:[],logs:[],reviews:{},checks:{},aiNotes:[]});
const blankOf = p => p === "core" ? blankCore() : blankAll();
const UKEY = "ls2.ui", LKEY = "ls2.local";
let UI = Object.assign({course:"all",tab:"home",view:null,seenIntro:false}, readJSON(UKEY));
let S = {all:blankAll(), core:blankCore(), profile:{name:""}};
let USER = null, ROLE = "member", EMAIL = "", VER = {all:0, core:0};
const DIRTY = new Set();
const isCore = () => ROLE === "core" || ROLE === "admin";
const aiServer = () => !!(sb && USER && CFG.aiEnabled);

function readJSON(k){ try{ return JSON.parse(localStorage.getItem(k) || "null") || {}; }catch(e){ return {}; } }
function writeJSON(k,v){ try{ localStorage.setItem(k, JSON.stringify(v)); return true; }catch(e){ return false; } }
const cacheKey = () => "ls2.cache." + (USER ? USER.id : "");

const $ = s => document.querySelector(s);
const ACT = {};
function act(name, fn){ ACT[name] = fn; }
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const uid = () => Math.random().toString(36).slice(2,9) + Date.now().toString(36);
const today = () => { const d = new Date(); return new Date(d - d.getTimezoneOffset()*6e4).toISOString().slice(0,10); };
function getPath(p){ return p.split(".").reduce((o,k) => o == null ? undefined : o[k], S); }
function setPath(p,v){ const ks = p.split("."); let o = S; ks.slice(0,-1).forEach(k => { if(o[k] == null || typeof o[k] !== "object") o[k] = {}; o = o[k]; }); o[ks.at(-1)] = v; }
function toast(m){ const t = $("#toast"); t.textContent = m; t.classList.add("show"); clearTimeout(t._t); t._t = setTimeout(() => t.classList.remove("show"), 2600); }

/* ============ 保存 ============ */
let saveT, saving = false;
function setSave(st){ const el = $("#save"); el.className = "save " + (st === "ok" ? "" : st);
  el.querySelector("span").textContent = {ok:"保存済み",saving:"保存中…",error:"未保存・タップで再試行",conflict:"競合・タップで再試行"}[st]; }
function saveUI(){ writeJSON(UKEY, UI); }
function save(prog, now){
  if(prog) DIRTY.add(prog);
  setSave("saving"); clearTimeout(saveT);
  saveT = setTimeout(flush, now ? 0 : (ONLINE ? 1200 : 400));
}
async function flush(){
  if(!ONLINE){ setSave(writeJSON(LKEY, S) ? "ok" : "error"); DIRTY.clear(); return; }
  writeJSON(cacheKey(), {S, VER, dirty:[...DIRTY]});      // 通信断でも端末内に保持
  if(saving){ saveT = setTimeout(flush, 800); return; }
  saving = true;
  try{
    for(const p of [...DIRTY]){ await pushRemote(p); DIRTY.delete(p); }
    writeJSON(cacheKey(), {S, VER, dirty:[]});
    setSave("ok");
  }catch(e){ console.error(e); setSave("error"); }
  finally{ saving = false; }
}
$("#save").addEventListener("click", () => { if(/error|conflict/.test($("#save").className)) save(null, true); });
window.addEventListener("online", () => { if(DIRTY.size) save(null, true); });
window.addEventListener("beforeunload", e => { if(DIRTY.size && ONLINE){ e.preventDefault(); e.returnValue = ""; } });

async function pushRemote(p){
  if(p === "profile"){
    const { error } = await sb.from("ls_profiles").update({display_name: S.profile.name}).eq("user_id", USER.id);
    if(error) throw error; return;
  }
  if(p === "core" && !isCore()) return;
  const { data, error } = await sb.from("ls_work").update({data: S[p], version: VER[p] + 1})
    .eq("user_id", USER.id).eq("program", p).eq("version", VER[p]).select("version");
  if(error) throw error;
  if(data.length){ VER[p] = data[0].version; return; }
  // 版が合わない＝別端末で更新された。黙って消さずに本人に選ばせる
  const { data: row, error: e2 } = await sb.from("ls_work").select("data,version").eq("user_id", USER.id).eq("program", p).maybeSingle();
  if(e2) throw e2;
  if(!row){ await insertRow(p); return; }
  if(confirm("別の端末で新しい内容が保存されています。\n\n［OK］別の端末の内容を読み込む（この端末の未保存分は破棄）\n［キャンセル］この端末の内容で上書きする")){
    S[p] = Object.assign(blankOf(p), row.data); VER[p] = row.version; render();
  }else{ VER[p] = row.version; await pushRemote(p); }
}
async function insertRow(p){
  const { data, error } = await sb.from("ls_work").insert({user_id: USER.id, program: p, data: S[p], version: 1}).select("version").single();
  if(error) throw error; VER[p] = data.version;
}

/* ============ 起動・認証 ============ */
async function boot(){
  if(!ONLINE){
    const d = readJSON(LKEY), old = readJSON("lifestage2.v1");
    const src = d.all ? d : old.all ? old : {};
    S.all = Object.assign(blankAll(), src.all || {}); S.profile = Object.assign({name:""}, src.profile || {});
    ROLE = "member"; return start();
  }
  if(!sb){ $("#app").innerHTML = `<div class="card">通信ライブラリを読み込めませんでした。再読み込みしてください。</div>`; return; }
  const { data: { session } } = await sb.auth.getSession();
  if(!session){ return renderLogin(); }
  USER = session.user; EMAIL = USER.email || "";
  try{ await loadRemote(); }catch(e){ console.error(e); $("#app").innerHTML = `<div class="card"><h2>データを読み込めませんでした</h2><p class="muted">通信状態を確認して再読み込みしてください。</p><button class="btn" data-act="reload">再読み込み</button></div>`; return; }
  start();
}
async function loadRemote(){
  const { data: prof, error } = await sb.from("ls_profiles").select("role,display_name,email").eq("user_id", USER.id).maybeSingle();
  if(error) throw error;
  ROLE = prof?.role || "member"; S.profile.name = prof?.display_name || "";
  const { data: rows, error: e2 } = await sb.from("ls_work").select("program,data,version").eq("user_id", USER.id);
  if(e2) throw e2;
  for(const p of isCore() ? ["all","core"] : ["all"]){
    const r = rows.find(x => x.program === p);
    if(r){ S[p] = Object.assign(blankOf(p), r.data); VER[p] = r.version; }
    else { S[p] = blankOf(p); if(p === "core") S.core.start = today(); await insertRow(p); }
  }
  if(!isCore()) S.core = blankCore();
  // 前回保存できなかった端末内の変更を復元して再送
  const c = readJSON(cacheKey());
  if(c.dirty && c.dirty.length){
    for(const p of c.dirty){ if(p === "core" && !isCore()) continue; if(c.S && c.S[p]){ S[p] = c.S[p]; if(c.VER && c.VER[p]) VER[p] = c.VER[p]; DIRTY.add(p); } }
    if(DIRTY.size){ toast("前回保存できなかった変更を送信します"); save(null, true); }
  }
}
function start(){
  if(!isCore()) UI.course = "all";
  $("#nav").hidden = false; $("#courseBar").hidden = !isCore();
  render(); setSave("ok");
  if(!UI.seenIntro) showIntro();
}
function renderLogin(sent){
  $("#nav").hidden = true; $("#courseBar").hidden = true;
  $("#app").innerHTML = `<div class="view auth">
    <div class="logo">LIFE STAGE</div><p class="eyebrow" style="margin-bottom:24px">Stage 2.0 · Members</p>
    ${sent ? `<div class="card"><h2>メールを送信しました</h2><p class="muted">${esc(sent)} に届いたリンクを、この端末で開くとログインできます。</p><button class="btn ghost sm" data-act="relogin">メールアドレスを入力し直す</button></div>`
    : `<div class="card" style="text-align:left"><h2>ログイン</h2><p class="small muted">登録済みのメールアドレスに、ログイン用リンクを送ります（パスワード不要）。</p>
      <label class="f" for="email">メールアドレス</label><input type="email" id="email" autocomplete="email" inputmode="email" placeholder="you@example.com" style="width:100%;background:#0E1728;border:1px solid var(--line);border-radius:12px;padding:12px 14px;min-height:48px;font-size:16px">
      <button class="btn block" style="margin-top:14px" data-act="login">ログインリンクを送る</button>
      <p class="small" id="loginErr" style="color:var(--err);min-height:1.5em;margin:8px 0 0"></p></div>`}
    <p class="small muted">コアメンバー向けワークは、運営がコアメンバーとして登録したアカウントにだけ表示されます。</p></div>`;
}
act("login", async () => {
  const email = ($("#email").value || "").trim();
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){ $("#loginErr").textContent = "メールアドレスの形式を確認してください"; return; }
  const btn = document.querySelector('[data-act="login"]'); btn.disabled = true; btn.textContent = "送信中…";
  const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: location.origin + location.pathname, shouldCreateUser: CFG.allowSignup !== false } });
  if(error){ btn.disabled = false; btn.textContent = "ログインリンクを送る"; $("#loginErr").textContent = error.status === 429 ? "送信回数の上限です。しばらく待って再度お試しください" : "送信できませんでした：" + error.message; return; }
  renderLogin(email);
});
act("relogin", () => renderLogin());
act("reload", () => location.reload());
act("logout", async () => {
  if(DIRTY.size && !confirm("未保存の変更があります。ログアウトすると破棄されます。よろしいですか？")) return;
  try{ localStorage.removeItem(cacheKey()); }catch(e){}
  await sb.auth.signOut(); location.reload();
});
if(sb) sb.auth.onAuthStateChange((ev) => { if(ev === "SIGNED_IN" && !USER) boot(); if(ev === "SIGNED_OUT" && USER) location.reload(); });

/* ============ 計算 ============ */
const stageDone = id => !!S.all.approved[id];
const doneCount = () => STAGES.filter(s => stageDone(s.id)).length;
const nextStage = () => STAGES.find(s => !stageDone(s.id));
function coreDay(){ if(!S.core.start) return 0; const d = Math.floor((new Date(today()) - new Date(S.core.start)) / 864e5) + 1; return Math.max(1, d); }
function corePhase(){ const d = coreDay(); return d <= 30 ? 0 : d <= 60 ? 1 : 2; }
function kpiCalc(k){ const b = +k.base || 0, t = parseFloat(k.target), c = +k.cur || 0;
  if(!isFinite(t) || t === b) return {rate:null, gap:null};
  return {rate: Math.max(0, Math.min(999, Math.round(((c - b) / (t - b)) * 100))), gap: +(t - c).toFixed(2)}; }
function paceText(k){ const c = kpiCalc(k); if(c.gap == null || !S.core.start) return "—"; if(c.gap <= 0) return "達成";
  return String(+(c.gap / Math.max(1, 90 - coreDay() + 1)).toFixed(2)); }
function kpiCells(k){ const c = kpiCalc(k);
  return `<div><b>${c.gap == null ? "—" : esc(c.gap)}</b><span>目標までの差</span></div><div><b>${c.rate == null ? "—" : c.rate + "%"}</b><span>進捗率</span></div><div><b>${paceText(k)}</b><span>残り1日あたり</span></div>`; }
function countLine(t){ const n = (t || "").replace(/\s/g, "").length; return `${n}字 ・ 話すと約${Math.round(n/5)}秒（目安：1秒あたり5字）`; }

/* ============ ルーティング・描画 ============ */
document.addEventListener("click", e => { const el = e.target.closest("[data-act]"); if(!el || el.disabled) return; e.preventDefault(); const f = ACT[el.dataset.act]; if(f) f(el.dataset.arg, el); });
document.addEventListener("keydown", e => { if(e.key === "Enter" && e.target.id === "email") ACT.login(); });
function go(tab, view = null){ UI.tab = tab; UI.view = view; saveUI(); render(); window.scrollTo({top:0}); $("#app").focus({preventScroll:true}); }
document.querySelectorAll("nav.bottom button").forEach(b => b.onclick = () => go(b.dataset.tab));
document.querySelectorAll(".course button").forEach(b => b.onclick = () => { if(b.dataset.course === "core" && !isCore()) return; UI.course = b.dataset.course; AIS.prompt = null; AIS.result = ""; go(UI.tab); });

function render(){
  if(UI.course === "core" && !isCore()) UI.course = "all";
  document.querySelectorAll(".course button").forEach(b => b.setAttribute("aria-selected", b.dataset.course === UI.course));
  document.querySelectorAll("nav.bottom button").forEach(b => { if(b.dataset.tab === UI.tab) b.setAttribute("aria-current","page"); else b.removeAttribute("aria-current"); });
  const core = UI.course === "core";
  const h = ({home: core ? homeCore : homeAll, journey: core ? journeyCore : journeyAll, ai: viewAI, book: viewBook, me: viewMe}[UI.tab] || homeAll)();
  $("#app").innerHTML = `<div class="view">${!ONLINE && UI.tab === "home" ? `<p class="mode">ローカル試用モード：記録はこの端末のみに保存されます（ログイン未設定）。</p>` : ""}${h}</div>`;
  bindInputs();
  if(UI.tab === "ai") bindAI();
  if(UI.tab === "me" && ROLE === "admin") loadAdmin();
}
function bindInputs(){
  document.querySelectorAll("[data-bind]").forEach(el => {
    const p = el.dataset.bind, prog = p.split(".")[0], v = getPath(p);
    if(el.type === "checkbox") el.checked = !!v; else el.value = v ?? "";
    el.addEventListener("input", () => { setPath(p, el.type === "checkbox" ? el.checked : el.value); save(prog); if(el.dataset.live) liveUpdate(el.dataset.live); });
    if(el.dataset.rerender != null) el.addEventListener("change", () => render());
  });
}
function liveUpdate(w){
  if(w.startsWith("kpi:")){ const i = +w.slice(4), el = $("#kpi-" + i); if(el && S.core.kpis[i]) el.innerHTML = kpiCells(S.core.kpis[i]); return; }
  if(w === "count"){ const ta = $("#draft"), c = $("#cnt"); if(ta && c) c.textContent = countLine(ta.value); }
}
const prog = (n, m) => `<div class="bar" role="progressbar" aria-valuemin="0" aria-valuemax="${m}" aria-valuenow="${n}"><i style="width:${m ? Math.round(n/m*100) : 0}%"></i></div>`;
act("tab", t => go(t));

/* ============ 全メンバー ============ */
function homeAll(){
  const n = doneCount(), nx = nextStage(), name = S.profile.name, dk = today();
  return `
  <p class="eyebrow">Express &amp; Connect</p>
  <h1>${name ? esc(name) + "さん、" : ""}今日の一歩から。</h1>
  <p class="muted">人生の価値を相手に伝え、聴き、関係を育てる30日。</p>
  <div class="card hero">
    <div class="row"><span class="badge gold">次のステージ</span><span class="spacer"></span><span class="small muted">${n} / 7 完了</span></div>
    ${nx ? `<h2 style="margin-top:10px">${esc(nx.en)}</h2><p class="muted">${esc(nx.ja)}</p>
      <button class="btn block" data-act="openStage" data-arg="${nx.id}">${S.all.step[nx.id] ? "続きから再開" : "このステージを始める"}</button>`
    : `<h2 style="margin-top:10px">7ステージ完了</h2><p class="muted">ブックからMY LIFE STORYを出力できます。対話練習は何度でも。</p>
      <button class="btn block" data-act="tab" data-arg="book">ブックを開く</button>`}
    <div style="margin-top:14px">${prog(n,7)}</div>
  </div>
  <div class="card">
    <div class="row"><h3>3分でできる一歩</h3><span class="spacer"></span>${S.all.daily[dk] ? '<span class="badge ok">今日は実践済み</span>' : ""}</div>
    <p class="small muted">今日、誰かに「伝えた」「聴いた」ことを1行で記録しましょう。</p>
    <input type="text" data-bind="all.daily.${dk}" placeholder="例：同僚の話を最後まで遮らずに聴いた">
  </div>
  <div class="card"><h3>対話練習シナリオ</h3><p class="small muted">日常の5つの場面で、伝え方・聴き方を練習します。</p>
    <button class="btn ghost block sm" data-act="openPractice" data-arg="p1">練習を始める</button></div>
  ${isCore() ? `<div class="card"><h3>コアメンバー向けワーク</h3><p class="small muted">上部の「コアメンバー」タブから90日プログラムを開けます。</p><button class="btn ghost block sm" data-act="toCore">コアメンバーワークへ</button></div>` : ""}`;
}
act("openStage", id => go("journey", "stage:" + id));
act("openPractice", id => go("journey", "practice:" + id));
act("toCore", () => { if(!isCore()) return; UI.course = "core"; go("home"); });

function journeyAll(){
  const v = UI.view || "";
  if(v.startsWith("stage:")) return stageView(v.slice(6));
  if(v.startsWith("practice:")) return practiceView(v.slice(9));
  return `
  <p class="eyebrow">Journey · 7 Stages</p><h1>あなたの物語を、伝わる言葉に。</h1>${prog(doneCount(),7)}
  <ul class="list" style="margin-top:8px">
  ${STAGES.map((s,i) => `<li><button class="item" data-act="openStage" data-arg="${s.id}">
    <span class="num">${String(i+1).padStart(2,"0")}</span><span class="t"><b>${esc(s.en)}</b><span>${esc(s.ja)}</span></span>
    ${stageDone(s.id) ? '<span class="badge ok">承認済み</span>' : S.all.step[s.id] ? '<span class="badge gold">途中</span>' : '<span class="badge">未着手</span>'}
  </button></li>`).join("")}</ul>
  <hr class="s"><p class="eyebrow">Practice</p><h2>対話練習シナリオ</h2>
  <ul class="list">${SCENES.map(p => `<li><button class="item" data-act="openPractice" data-arg="${p.id}"><span class="t"><span>${esc(p.t)}</span></span>${(S.all.practice[p.id]||{}).next ? '<span class="badge ok">記録あり</span>' : ''}</button></li>`).join("")}</ul>`;
}
function stageView(id){
  const s = STAGES.find(x => x.id === id); if(!s){ UI.view = null; return journeyAll(); }
  const idx = STAGES.indexOf(s), N = s.qs.length, step = Math.min(S.all.step[id] || 0, N), ans = S.all.answers[id] || {};
  const head = `<button class="btn ghost sm" data-act="tab" data-arg="journey">← ジャーニー</button>
    <p class="eyebrow" style="margin-top:14px">Stage ${String(idx+1).padStart(2,"0")} · ${esc(s.en)}</p><h1>${esc(s.ja)}</h1>
    <div class="steps">${Array.from({length:N+1}, (_,i) => `<i class="${i <= step ? "on" : ""}"></i>`).join("")}</div>`;
  if(step < N){
    const q = s.qs[step];
    return head + `${step === 0 ? `<p class="muted">${esc(s.lead)}</p>` : ""}
    <div class="card"><p class="small muted">質問 ${step+1} / ${N}</p><h2>${esc(q.q)}</h2><div class="hint">${esc(q.ex)}</div>
      <textarea aria-label="${esc(q.q)}" data-bind="all.answers.${id}.${step}" placeholder="思いつくままに書いてOK。あとで直せます。"></textarea>
      <div class="row" style="margin-top:12px">
        <button class="btn ghost sm" data-act="stepPrev" data-arg="${id}" ${step === 0 ? "disabled" : ""}>戻る</button><span class="spacer"></span>
        <button class="btn ghost sm" data-act="askAI" data-arg="stage:${id}">AIに相談</button>
        <button class="btn sm" data-act="stepNext" data-arg="${id}">${step === N-1 ? "成果物を確認" : "次へ"}</button></div>
      <p class="small muted" style="margin:10px 0 0">空欄でも次に進めます（スキップ）。入力は自動保存されます。</p></div>`;
  }
  if(S.all.drafts[id] == null){ S.all.drafts[id] = s.compose(s.qs.map((_,i) => ans[i] || "")); save("all"); }
  const done = stageDone(id);
  return head + `<div class="card hero">
    <div class="row"><span class="badge gold">${esc(s.out)}</span><span class="spacer"></span>${done ? '<span class="badge ok">承認済み</span>' : '<span class="badge">下書き</span>'}</div>
    <p class="small muted" style="margin-top:10px">あなたの回答から下書きを作りました。自分の言葉に整えて、承認するとブックに収録されます。</p>
    <textarea id="draft" style="min-height:220px" data-bind="all.drafts.${id}" data-live="count"></textarea>
    <p class="small muted" id="cnt">${countLine(S.all.drafts[id])}</p>
    <div class="row wrapx" style="margin-top:6px">
      <button class="btn ghost sm" data-act="stepPrev" data-arg="${id}">回答に戻る</button>
      <button class="btn ghost sm" data-act="recompose" data-arg="${id}">回答から作り直す</button>
      <button class="btn ghost sm" data-act="askAI" data-arg="stage:${id}">AIに相談</button><span class="spacer"></span>
      ${done ? `<button class="btn ghost sm" data-act="unapprove" data-arg="${id}">承認を取り消す</button>` : `<button class="btn sm" data-act="approve" data-arg="${id}">承認してブックへ</button>`}</div></div>
  ${done && STAGES[idx+1] ? `<button class="btn block" data-act="openStage" data-arg="${STAGES[idx+1].id}">次のステージ：${esc(STAGES[idx+1].en)}</button>` : ""}
  <p class="small muted" style="margin-top:12px">※ 承認した内容が自動で他メンバーに公開・投稿されることはありません。</p>`;
}
act("stepNext", id => { S.all.step[id] = (S.all.step[id] || 0) + 1; save("all"); render(); window.scrollTo({top:0}); });
act("stepPrev", id => { const N = STAGES.find(s => s.id === id).qs.length; S.all.step[id] = Math.max(0, Math.min((S.all.step[id] || 0) - 1, N - 1)); save("all"); render(); });
act("recompose", id => { if(!confirm("回答から下書きを作り直します。編集中の下書きは上書きされます。")) return; delete S.all.drafts[id]; save("all"); render(); });
act("approve", id => { if(!(S.all.drafts[id] || "").trim()){ toast("下書きが空です"); return; } S.all.approved[id] = {at: new Date().toISOString()}; save("all", true); render();
  toast(doneCount() === 7 ? "7ステージ完了。おめでとうございます！" : "承認しました。ブックに収録されました"); });
act("unapprove", id => { delete S.all.approved[id]; save("all"); render(); });

function practiceView(id){
  const p = SCENES.find(x => x.id === id) || SCENES[0], b = `all.practice.${p.id}`;
  return `<button class="btn ghost sm" data-act="tab" data-arg="journey">← ジャーニー</button>
  <p class="eyebrow" style="margin-top:14px">Dialogue Practice</p><h1>${esc(p.t)}</h1>
  <div class="tabs" role="tablist">${SCENES.map(x => `<button role="tab" aria-selected="${x.id === p.id}" data-act="openPractice" data-arg="${x.id}">${esc(x.t)}</button>`).join("")}</div>
  <div class="hint">${esc(p.tip)}</div>
  <div class="card">
    <label class="f">相手と場面</label><input type="text" data-bind="${b}.who" placeholder="例：学生時代の友人、カフェで">
    <label class="f">一番伝えたいこと（1文）</label><input type="text" data-bind="${b}.core">
    <label class="f">実際に話す言葉</label><textarea data-bind="${b}.words"></textarea>
    <label class="f">相手の反応・返ってきた言葉</label><textarea style="min-height:90px" data-bind="${b}.reaction"></textarea>
    <label class="f">次に改善すること</label><input type="text" data-bind="${b}.next">
    <div class="row" style="margin-top:12px"><span class="spacer"></span><button class="btn ghost sm" data-act="askAI" data-arg="practice:${p.id}">AIにフィードバックを依頼</button></div>
  </div>`;
}

/* ============ コアメンバー（isCore() の時だけ描画される。データはRLSでも保護） ============ */
function homeCore(){
  const d = coreDay(), ph = PHASES[corePhase()], k = S.core.kpis[0];
  return `<p class="eyebrow">Core · 90 Days</p>
  <h1>DAY ${Math.min(d,90)} <span class="muted" style="font-size:16px">/ 90</span></h1>${prog(Math.min(d,90),90)}
  <div class="card hero"><span class="badge gold">${esc(ph.d)}</span><h2 style="margin-top:10px">${esc(ph.t)}</h2>
    ${ph.items.map((t,i) => `<label class="row" style="min-height:44px;cursor:pointer"><input type="checkbox" style="width:20px;height:20px;accent-color:var(--gold)" data-bind="core.checks.${ph.id}.${i}"> <span>${esc(t)}</span></label>`).join("")}</div>
  <div class="card"><div class="row"><h3>90日目標</h3><span class="spacer"></span><button class="btn ghost sm" data-act="coreTab" data-arg="goal">編集</button></div>
    <p class="${S.core.goal ? "" : "muted"}">${S.core.goal ? esc(S.core.goal) : "まだ設定されていません。"}</p>
    ${k ? `<hr class="s"><h3>${esc(k.name || "KPI")}</h3><div class="kpi">${kpiCells(k)}</div>` : ""}</div>
  <div class="grid two"><button class="btn ghost" data-act="coreTab" data-arg="log">実践を記録</button><button class="btn ghost" data-act="coreTab" data-arg="review">レビューを書く</button></div>`;
}
act("coreTab", t => go("journey", "core:" + t));
function journeyCore(){
  const t = (UI.view || "core:program").replace("core:", "");
  const tabs = [["program","プログラム"],["goal","目標・KPI"],["log","実践ログ"],["review","レビュー"]];
  const body = {program:coreProgram, goal:coreGoal, log:coreLog, review:coreReview}[t] || coreProgram;
  return `<p class="eyebrow">Core · Journey</p><h1>個人成果を、再現できる力に。</h1>
  <div class="tabs" role="tablist">${tabs.map(([k,l]) => `<button role="tab" aria-selected="${k === t}" data-act="coreTab" data-arg="${k}">${l}</button>`).join("")}</div>${body()}`;
}
function coreProgram(){
  const cur = corePhase();
  return `<div class="card"><label class="f" style="margin-top:0">プログラム開始日</label><input type="date" data-bind="core.start" data-rerender>
    <p class="small muted" style="margin:6px 0 0">開始日を変えると現在のDAYが再計算されます。</p></div>
  ${PHASES.map((p,i) => { const c = S.core.checks[p.id] || {}, n = p.items.filter((_,j) => c[j]).length;
    return `<div class="card ${i === cur ? "hero" : ""}"><div class="row"><span class="badge ${i === cur ? "gold" : ""}">${esc(p.d)}</span><span class="spacer"></span><span class="small muted">${n}/${p.items.length}</span></div>
    <h2 style="margin-top:8px">${esc(p.t)}</h2>${p.items.map((t,j) => `<label class="row" style="min-height:40px;cursor:pointer"><input type="checkbox" style="width:20px;height:20px;accent-color:var(--gold)" data-bind="core.checks.${p.id}.${j}"><span>${esc(t)}</span></label>`).join("")}</div>`; }).join("")}
  <p class="small muted">案件配分・組織損益・報酬精算は本アプリの対象外です。</p>`;
}
function coreGoal(){
  return `<div class="card"><label class="f" style="margin-top:0">90日目標</label>
    <textarea style="min-height:90px" data-bind="core.goal" placeholder="例：90日で新規面談を月20件に増やし、成約率を安定させる"></textarea></div>
  ${S.core.kpis.map((k,i) => `<div class="card">
    <div class="row"><span class="badge gold">KPI ${i+1}</span><span class="spacer"></span><button class="btn ghost sm" data-act="delKpi" data-arg="${k.id}">削除</button></div>
    <label class="f">指標名</label><input type="text" data-bind="core.kpis.${i}.name" data-live="kpi:${i}" placeholder="例：新規面談数（月）">
    <div class="grid two"><div><label class="f">単位</label><input type="text" data-bind="core.kpis.${i}.unit" placeholder="件"></div>
    <div><label class="f">開始時の値</label><input type="number" inputmode="decimal" data-bind="core.kpis.${i}.base" data-live="kpi:${i}"></div>
    <div><label class="f">目標値</label><input type="number" inputmode="decimal" data-bind="core.kpis.${i}.target" data-live="kpi:${i}"></div>
    <div><label class="f">現在値</label><input type="number" inputmode="decimal" data-bind="core.kpis.${i}.cur" data-live="kpi:${i}"></div></div>
    <div class="kpi" id="kpi-${i}">${kpiCells(k)}</div>
    <p class="small muted" style="margin:8px 0 0">差・進捗率は入力値からプログラムで計算します（AIは数値を作りません）。</p></div>`).join("")}
  <button class="btn ghost block" data-act="addKpi">＋ KPIを追加</button>`;
}
act("addKpi", () => { S.core.kpis.push({id:uid(),name:"",unit:"",base:"",target:"",cur:""}); save("core"); render(); });
act("delKpi", id => { if(!confirm("このKPIを削除しますか？")) return; S.core.kpis = S.core.kpis.filter(k => k.id !== id); save("core"); render(); });
function coreLog(){
  const opts = S.core.kpis.map(k => `<option value="${esc(k.id)}">${esc(k.name || "(名称未設定)")}</option>`).join("");
  return `<div class="card"><h2>新しい実践を記録</h2><p class="small muted">KPI → 原因仮説 → 演習・実践 → 結果 → メンター修正 → 次の行動</p>
    <label class="f">日付</label><input type="date" id="lg-date" value="${today()}">
    <label class="f">対象KPI</label><select id="lg-kpi"><option value="">（なし）</option>${opts}</select>
    <label class="f">原因の仮説</label><textarea style="min-height:80px" id="lg-hyp"></textarea>
    <label class="f">演習・現場での実践</label><textarea style="min-height:80px" id="lg-act"></textarea>
    <label class="f">結果（事実・数字）</label><textarea style="min-height:80px" id="lg-res"></textarea>
    <label class="f">メンターの見解</label>
    <div class="seg" id="lg-mt">${["同意","一部修正","異議"].map(x => `<button type="button" aria-pressed="false" data-act="mt" data-arg="${x}">${x}</button>`).join("")}</div>
    <textarea style="min-height:70px;margin-top:8px" id="lg-men" placeholder="理由・根拠（面談後に記入）"></textarea>
    <label class="f">次の行動</label><input type="text" id="lg-next">
    <button class="btn block" style="margin-top:14px" data-act="addLog">記録する</button></div>
  ${S.core.logs.length ? S.core.logs.slice().reverse().map(l => { const k = S.core.kpis.find(x => x.id === l.kpi); return `<div class="log">
    <div class="row"><b>${esc(l.date)}</b>${k ? `<span class="badge gold">${esc(k.name)}</span>` : ""}${l.mt ? `<span class="badge">${esc(l.mt)}</span>` : ""}<span class="spacer"></span><button class="btn ghost sm" data-act="delLog" data-arg="${l.id}">削除</button></div>
    <dl>${[["仮説",l.hyp],["実践",l.act],["結果",l.res],["メンター",l.men],["次の行動",l.next]].filter(x => x[1]).map(([a,b]) => `<dt>${a}</dt><dd>${esc(b)}</dd>`).join("")}</dl></div>`; }).join("") : '<p class="empty">まだ記録がありません。</p>'}`;
}
act("mt", (v, el) => { const on = el.getAttribute("aria-pressed") !== "true"; document.querySelectorAll("#lg-mt button").forEach(b => b.setAttribute("aria-pressed", b === el && on)); });
act("addLog", () => { const g = id => ($("#" + id).value || "").trim(), mt = document.querySelector('#lg-mt [aria-pressed="true"]');
  const l = {id:uid(), date:g("lg-date") || today(), kpi:g("lg-kpi"), hyp:g("lg-hyp"), act:g("lg-act"), res:g("lg-res"), mt: mt ? mt.dataset.arg : "", men:g("lg-men"), next:g("lg-next")};
  if(!l.hyp && !l.act && !l.res){ toast("仮説・実践・結果のいずれかを入力してください"); return; }
  S.core.logs.push(l); save("core", true); render(); toast("記録しました"); });
act("delLog", id => { if(!confirm("この記録を削除しますか？")) return; S.core.logs = S.core.logs.filter(l => l.id !== id); save("core"); render(); });
function coreReview(){
  return PHASES.map(p => `<div class="card"><span class="badge gold">${esc(p.d)}</span><h2 style="margin-top:8px">${esc(p.t)} のレビュー</h2>
    <label class="f">できたこと・成果</label><textarea style="min-height:80px" data-bind="core.reviews.${p.id}.good"></textarea>
    <label class="f">成果が出た条件（再現性）</label><textarea style="min-height:80px" data-bind="core.reviews.${p.id}.cond"></textarea>
    <label class="f">次のフェーズで変えること</label><textarea style="min-height:80px" data-bind="core.reviews.${p.id}.change"></textarea>
    ${p.id === "ph3" ? `<label class="f">模擬指導の振り返り（教えた相手の反応・改善点）</label><textarea style="min-height:80px" data-bind="core.reviews.ph3.teach"></textarea>` : ""}</div>`).join("");
}

/* ============ AI：依頼文コピー（基本）＋システムAI（設定時） ============ */
const AIS = {mode:null, arg:"", prompt:null, result:""};
const AI_MODES = {
  all: [["stage","ステージの回答・成果物を見てもらう"],["story","90秒ストーリーを磨く"],["practice","対話練習のフィードバック"],["plan","7ステージ全体と90日行動案"]],
  core: [["kpi","KPIの分析と次の一手"],["logs","実践ログの振り返り"],["review","フェーズレビューと再現性"]],
};
const RULES = `次の4つの見出しで、日本語で簡潔に回答してください。
【事実】記録から読み取れること（記録にない数値や出来事は作らない）
【仮説】改善のための仮説（断定しない・2〜3個）
【未確認】判断に必要だが記録にない点と、私に確認したい質問
【次の行動】明日からできる具体的な一歩を1〜3個`;
function buildPrompt(mode, arg){
  const a = S.all, c = S.core;
  const st = id => { const s = STAGES.find(x => x.id === id); const ans = a.answers[id] || {};
    return `■ ${s.en}（${s.ja}）\n` + s.qs.map((q,i) => `Q. ${q.q}\nA. ${ans[i] || "（未記入）"}`).join("\n") + (a.drafts[id] ? `\n［成果物］\n${a.drafts[id]}` : ""); };
  if(mode === "stage") return `私は自己成長プログラム「LIFE STAGE 2.0」で、人生の価値を相手に伝える練習をしています。以下のワークの回答について、伝わりやすさと深め方を助言してください。\n${RULES}\n\n---\n${st(arg || "s1")}`;
  if(mode === "story"){ const t = a.drafts.s2 || STAGES[1].compose(STAGES[1].qs.map((_,i) => (a.answers.s2 || {})[i] || ""));
    return `以下は私の「90秒ストーリー」（自己紹介の物語）の下書きです。話すと約${Math.round(t.replace(/\s/g,"").length/5)}秒です。事実・感情・学び・未来のつながりが伝わるか、聞き手の心に残るかの観点で助言し、最後に90秒（約450字）以内の改善例を1つ示してください。\n${RULES}\n\n---\n${t}`; }
  if(mode === "practice"){ const s = SCENES.find(x => x.id === arg) || SCENES[0], p = a.practice[s.id] || {};
    return `「${s.t}」の場面で、伝え方・聴き方を練習しました。相手が受け取りやすい言い方になっているか助言し、言い換え例を1つ示してください。\n${RULES}\n\n---\n相手と場面：${p.who || "（未記入）"}\n一番伝えたいこと：${p.core || "（未記入）"}\n実際に話す言葉：${p.words || "（未記入）"}\n相手の反応：${p.reaction || "（未記入）"}\n次に改善すること：${p.next || "（未記入）"}`; }
  if(mode === "plan") return `以下は7ステージのワーク記録です。理想・現在地・差・手段・環境・90日行動案のつながりに矛盾や抜けがないか確認し、90日行動案を実行しやすくする助言をください。\n${RULES}\n\n---\n` + STAGES.map(s => st(s.id)).join("\n\n");
  const kp = c.kpis.map(k => { const x = kpiCalc(k); return `・${k.name || "(名称未設定)"}：開始${k.base || 0}／現在${k.cur || 0}／目標${k.target || "未設定"}${k.unit || ""}${x.rate != null ? `（進捗率${x.rate}%、目標まで差${x.gap}）` : ""}`; }).join("\n") || "（KPI未登録）";
  const head = `私はLIFE STAGE 2.0コアメンバーとして90日プログラム（現在 DAY ${Math.min(coreDay(),90)}/90）に取り組んでいます。\n90日目標：${c.goal || "（未設定）"}\nKPI：\n${kp}`;
  if(mode === "kpi") return `${head}\n\nKPIの進み具合から、成果を出すための原因仮説と、次の1週間で試す行動を助言してください。数値の差や率は上に記載した値のみを使ってください。\n${RULES}`;
  if(mode === "logs") return `${head}\n\n直近の実践ログです（仮説→実践→結果→メンター見解→次の行動）。うまくいった条件といかなかった条件の違い、次に検証すべき仮説を助言してください。\n${RULES}\n\n---\n` +
    (c.logs.slice(-10).map(l => `[${l.date}] 仮説:${l.hyp || "-"} / 実践:${l.act || "-"} / 結果:${l.res || "-"} / メンター(${l.mt || "-"}):${l.men || "-"} / 次:${l.next || "-"}`).join("\n") || "（記録なし）");
  return `${head}\n\nフェーズごとのレビューです。成果を再現できる手順と、他の人に教える時のポイントにまとめる助言をください。\n${RULES}\n\n---\n` +
    PHASES.map(p => { const r = c.reviews[p.id] || {}; return `■ ${p.d} ${p.t}\n成果：${r.good || "-"}\n再現条件：${r.cond || "-"}\n次に変えること：${r.change || "-"}${r.teach ? `\n模擬指導：${r.teach}` : ""}`; }).join("\n\n");
}
function viewAI(){
  const pg = UI.course, modes = AI_MODES[pg];
  if(!modes.some(m => m[0] === AIS.mode)){ AIS.mode = modes[0][0]; AIS.prompt = null; }
  const needArg = AIS.mode === "stage" || AIS.mode === "practice";
  if(AIS.mode === "stage" && !STAGES.some(s => s.id === AIS.arg)) AIS.arg = "s1";
  if(AIS.mode === "practice" && !SCENES.some(s => s.id === AIS.arg)) AIS.arg = "p1";
  if(AIS.prompt == null) AIS.prompt = buildPrompt(AIS.mode, AIS.arg);
  const notes = S[pg].aiNotes || [];
  return `<p class="eyebrow">AI Assist · ${pg === "all" ? "伝え方コーチ" : "成果コーチ"}</p>
  <h1>${pg === "all" ? "伝わる言葉を、AIと磨く" : "記録から、次の一手を考える"}</h1>
  <div class="card"><h3>1. 相談する内容</h3>
    <select id="aiMode" aria-label="相談する内容">${modes.map(([k,l]) => `<option value="${k}" ${k === AIS.mode ? "selected" : ""}>${l}</option>`).join("")}</select>
    ${needArg ? `<select id="aiArg" style="margin-top:8px" aria-label="対象">${(AIS.mode === "stage" ? STAGES.map(s => [s.id, s.en + "｜" + s.ja]) : SCENES.map(s => [s.id, s.t])).map(([k,l]) => `<option value="${k}" ${k === AIS.arg ? "selected" : ""}>${esc(l)}</option>`).join("")}</select>` : ""}
  </div>
  <div class="card"><h3>2. AIへの依頼文</h3>
    <p class="small muted">あなたの記録から依頼文を作りました。必要なら編集し、コピーしてお使いのAI（ChatGPT・Claude・Gemini など）に貼り付けてください。</p>
    <textarea id="aiPrompt" style="min-height:220px;font-size:14px"></textarea>
    <div class="hint">送る前に、氏名・会社名・連絡先など個人が特定できる情報は消すか伏せ字にしてください。</div>
    <div class="row wrapx"><button class="btn ghost sm" data-act="aiReset">記録から作り直す</button><span class="spacer"></span>
      <button class="btn sm" data-act="aiCopy">依頼文をコピー</button></div>
    ${aiServer() ? `<hr class="s"><p class="small muted">または、アプリに接続されたシステムAIで分析できます（1日の回数に上限あり）。</p>
      <button class="btn ghost block" data-act="aiRun">システムAIで分析する</button>` : ""}
  </div>
  <div class="card"><h3>3. AIの回答を記録</h3>
    <p class="small muted">AIの回答を貼り付け、採用する部分だけ残して保存しましょう。採用するかはあなたが決めます。</p>
    <textarea id="aiResult" style="min-height:160px" placeholder="ここにAIの回答を貼り付け"></textarea>
    <div class="row" style="margin-top:10px"><span class="spacer"></span><button class="btn sm" data-act="aiSaveNote">メモとして保存</button></div>
  </div>
  ${notes.length ? `<p class="eyebrow" style="margin-top:20px">Saved Notes</p>` + notes.slice().reverse().map(n => `<div class="log"><div class="row"><b>${esc(n.at.slice(0,10))}</b><span class="badge gold">${esc(n.label)}</span><span class="spacer"></span><button class="btn ghost sm" data-act="aiDelNote" data-arg="${n.id}">削除</button></div><dl><dd style="grid-column:1/-1">${esc(n.text)}</dd></dl></div>`).join("") : ""}`;
}
function bindAI(){
  const pr = $("#aiPrompt"), rs = $("#aiResult");
  pr.value = AIS.prompt; rs.value = AIS.result;
  pr.addEventListener("input", () => AIS.prompt = pr.value);
  rs.addEventListener("input", () => AIS.result = rs.value);
  $("#aiMode").addEventListener("change", e => { AIS.mode = e.target.value; AIS.prompt = null; render(); });
  const ag = $("#aiArg"); if(ag) ag.addEventListener("change", e => { AIS.arg = e.target.value; AIS.prompt = null; render(); });
}
act("askAI", arg => { const [m, a] = arg.split(":"); UI.course = "all"; AIS.mode = m; AIS.arg = a; AIS.prompt = null; AIS.result = ""; go("ai"); });
act("aiReset", () => { AIS.prompt = null; render(); });
act("aiCopy", async () => {
  const t = $("#aiPrompt").value;
  try{ await navigator.clipboard.writeText(t); toast("コピーしました。お使いのAIに貼り付けてください"); }
  catch(e){ const ta = $("#aiPrompt"); ta.focus(); ta.select(); const ok = document.execCommand && document.execCommand("copy"); toast(ok ? "コピーしました" : "選択状態にしました。長押しでコピーしてください"); }
});
act("aiRun", async (_, el) => {
  el.disabled = true; el.textContent = "分析中…（10〜30秒）";
  try{
    const { data, error } = await sb.functions.invoke("ls-ai", { body: { program: UI.course, prompt: $("#aiPrompt").value } });
    if(error){ let m = "AI分析に失敗しました"; try{ m = (await error.context.json()).error || m; }catch(e){} throw new Error(m); }
    AIS.result = data.text || ""; render(); toast("分析しました。内容を確認して保存してください");
  }catch(e){ el.disabled = false; el.textContent = "システムAIで分析する"; toast(e.message + "。依頼文をコピーして自端末のAIもご利用いただけます"); }
});
act("aiSaveNote", () => {
  const t = ($("#aiResult").value || "").trim(); if(!t){ toast("回答を貼り付けてください"); return; }
  const pg = UI.course, label = (AI_MODES[pg].find(m => m[0] === AIS.mode) || ["",""])[1];
  (S[pg].aiNotes = S[pg].aiNotes || []).push({id:uid(), at:new Date().toISOString(), label, text:t});
  AIS.result = ""; save(pg, true); render(); toast("保存しました");
});
act("aiDelNote", id => { if(!confirm("このメモを削除しますか？")) return; const pg = UI.course; S[pg].aiNotes = S[pg].aiNotes.filter(n => n.id !== id); save(pg); render(); });

/* ============ ブック ============ */
function viewBook(){
  const name = S.profile.name || "あなた";
  if(UI.course === "core"){
    return `<p class="eyebrow">Book · Core Review</p><h1>90日の成長記録</h1>
    <div class="row noprint"><span class="spacer"></span><button class="btn sm" data-act="print">PDFで保存・印刷</button></div>
    <div class="book-page"><p class="eyebrow">90 Days Goal</p><h2>${esc(name)}の90日目標</h2><p>${esc(S.core.goal || "未設定")}</p>
    ${S.core.kpis.map(k => { const c = kpiCalc(k); return `<p><b>${esc(k.name)}</b>：開始 ${esc(k.base || 0)} → 現在 ${esc(k.cur || 0)} / 目標 ${esc(k.target || "—")} ${esc(k.unit || "")}${c.rate != null ? `（進捗 ${c.rate}%）` : ""}</p>`; }).join("")}</div>
    ${PHASES.map(p => { const r = S.core.reviews[p.id] || {}; if(!r.good && !r.cond && !r.change && !r.teach) return "";
      return `<div class="book-page"><p class="eyebrow">${esc(p.d)}</p><h2>${esc(p.t)}</h2>${r.good ? `<p><b>成果</b>\n${esc(r.good)}</p>` : ""}${r.cond ? `<p><b>再現条件</b>\n${esc(r.cond)}</p>` : ""}${r.change ? `<p><b>次に変えること</b>\n${esc(r.change)}</p>` : ""}${r.teach ? `<p><b>模擬指導</b>\n${esc(r.teach)}</p>` : ""}</div>`; }).join("")}
    <p class="small muted noprint">実践ログ ${S.core.logs.length} 件はジャーニー › 実践ログで確認できます。</p>`;
  }
  const ap = STAGES.filter(s => stageDone(s.id));
  return `<p class="eyebrow">Book · My Life Story</p><h1>${esc(name)}の MY LIFE STORY</h1>
  <p class="muted small">承認したステージの成果物が、ここに一冊として積み上がります。</p>${prog(ap.length,7)}
  <div class="row noprint" style="margin-top:12px"><span class="small muted">${ap.length} / 7 章</span><span class="spacer"></span><button class="btn sm" data-act="print" ${ap.length ? "" : "disabled"}>PDFで保存・印刷</button></div>
  ${ap.length ? ap.map(s => `<div class="book-page"><p class="eyebrow">Chapter ${STAGES.indexOf(s)+1} · ${esc(s.en)}</p><h2>${esc(s.out)}</h2><p>${esc(S.all.drafts[s.id])}</p></div>`).join("")
    : `<div class="card empty">まだ章がありません。<br>ジャーニーでステージを進め、成果物を承認してください。<br><br><button class="btn sm" data-act="tab" data-arg="journey">ジャーニーへ</button></div>`}
  ${ap.length === 7 ? `<div class="card hero"><p class="eyebrow">Final</p><h2>7つの章がそろいました。</h2><p class="muted">あなたの物語は、伝えた相手の中でも続いていきます。発表や共有は任意です。</p></div>` : ""}`;
}
act("print", () => window.print());

/* ============ マイページ ============ */
const ROLE_JA = {member:"全メンバー", core:"コアメンバー", admin:"管理者"};
function viewMe(){
  return `<p class="eyebrow">My Page</p><h1>マイページ</h1>
  <div class="card"><label class="f" style="margin-top:0">表示名</label><input type="text" data-bind="profile.name" placeholder="例：山田 花子">
    ${ONLINE ? `<p class="small muted" style="margin:10px 0 0">${esc(EMAIL)} ・ <span class="badge gold">${ROLE_JA[ROLE] || ROLE}</span></p>` : ""}</div>
  ${ONLINE ? `<div class="card"><h3>アカウント</h3><p class="small muted">記録はアカウントに保存され、別の端末でも同じメールアドレスでログインすると続きから使えます。</p>
    <button class="btn ghost sm" data-act="logout">ログアウト</button></div>`
  : `<div class="card"><h3>ローカル試用モード</h3><p class="small muted">ログインが未設定のため、記録はこの端末のブラウザ内にのみ保存されます。コアメンバー向けワークはログイン設定後に利用できます。</p></div>`}
  ${ROLE === "admin" ? `<div class="card"><h3>管理：メンバーのロール</h3>
    <p class="small muted">メンバーが一度ログインした後、メールアドレスでロールを変更できます。コアメンバーにするとコアタブが表示されます。</p>
    <input type="email" id="adEmail" placeholder="member@example.com" style="margin-top:6px">
    <div class="row" style="margin-top:8px"><select id="adRole"><option value="core">コアメンバー</option><option value="member">全メンバー</option><option value="admin">管理者</option></select>
    <button class="btn sm" data-act="setRole">変更</button></div>
    <div id="adminList" class="small" style="margin-top:12px"><p class="muted">読み込み中…</p></div></div>` : ""}
  <div class="card"><h3>データ</h3>
    <div class="row wrapx"><button class="btn ghost sm" data-act="export">記録を書き出し（JSON）</button>
    ${ONLINE ? "" : `<label class="btn ghost sm" style="cursor:pointer">読み込み<input type="file" accept="application/json" id="imp" hidden></label>`}
    <button class="btn ghost sm" data-act="replayIntro">オープニングを再生</button></div>
    ${ONLINE ? `<p class="small muted" style="margin:10px 0 0">退会・データ削除は運営窓口へご依頼ください。</p>` : `<hr class="s"><button class="btn ghost sm" style="color:var(--err);border-color:rgba(229,140,140,.4)" data-act="wipe">この端末の全データを削除</button>`}</div>
  <p class="small muted">LIFE STAGE 2.0 ワーク v1.0</p>`;
}
async function loadAdmin(){
  const box = $("#adminList"); if(!box) return;
  const { data, error } = await sb.from("ls_profiles").select("email,display_name,role,created_at").order("created_at");
  if(!$("#adminList")) return;
  box.innerHTML = error ? `<p style="color:var(--err)">読み込めませんでした</p>` :
    data.map(p => `<div class="row" style="border-top:1px solid var(--line);padding:8px 0"><span style="flex:1;min-width:0;overflow-wrap:anywhere">${esc(p.display_name || "—")}<br><span class="muted">${esc(p.email)}</span></span><span class="badge ${p.role === "member" ? "" : "gold"}">${ROLE_JA[p.role] || p.role}</span></div>`).join("");
}
act("setRole", async () => {
  const email = ($("#adEmail").value || "").trim(), role = $("#adRole").value; if(!email) return;
  const { error } = await sb.rpc("ls_set_role", { target_email: email, new_role: role });
  if(error) toast(/not found/.test(error.message) ? "そのメールのユーザーが見つかりません（先に1度ログインが必要）" : "変更できませんでした");
  else { toast(`${email} を${ROLE_JA[role]}にしました`); loadAdmin(); }
});
act("export", () => { const data = {v:2, exportedAt:new Date().toISOString(), profile:S.profile, all:S.all, core:isCore() ? S.core : undefined};
  const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([JSON.stringify(data,null,2)], {type:"application/json"})); a.download = `lifestage2-${today()}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); });
act("wipe", () => { if(!confirm("この端末の全データを削除します。元に戻せません。よろしいですか？")) return; localStorage.removeItem(LKEY); localStorage.removeItem("lifestage2.v1"); S.all = blankAll(); S.profile = {name:""}; save(); go("home"); toast("削除しました"); });
act("replayIntro", () => showIntro());
document.addEventListener("change", e => { if(e.target.id !== "imp") return; const f = e.target.files[0]; if(!f) return;
  f.text().then(t => { const d = JSON.parse(t); if(!d.all) throw 0; if(!confirm("現在のデータを読み込んだ内容で置き換えます。よろしいですか？")) return;
    S.all = Object.assign(blankAll(), d.all); S.profile = Object.assign({name:""}, d.profile || {}); save("all", true); go("home"); toast("読み込みました"); }).catch(() => toast("読み込めないファイルです")); });

/* ============ オープニング ============ */
function showIntro(){
  const d = document.createElement("div"); d.className = "intro"; d.setAttribute("role","dialog"); d.setAttribute("aria-label","オープニング");
  d.innerHTML = `<div class="glow"></div><button class="skip">スキップ</button><div class="in">
    <div class="logo">LIFE STAGE</div><p class="eyebrow" style="margin-bottom:22px">Stage 2.0 · Express &amp; Connect</p>
    <h1 style="font-size:22px">あなたの人生には、<br>誰かに伝える価値がある。</h1>
    <p class="muted">伝える。聴く。関係を育てる。<br>30日・7つのステージへ。</p>
    <button class="btn" style="margin-top:18px;min-width:200px">はじめる</button></div>`;
  const close = () => { d.remove(); UI.seenIntro = true; saveUI(); $("#app").focus(); };
  d.querySelector(".skip").onclick = close; d.querySelector(".in .btn").onclick = close;
  document.body.appendChild(d); d.querySelector(".in .btn").focus();
}

boot();
if("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("sw.js").catch(() => {});
