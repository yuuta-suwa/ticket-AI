"use strict";
/* LIFE STAGE 2.0 ワーク — 共通ソース（build.mjs が VARIANT ごとに配信物を作る。README 参照）
 * ログイン・会員判定・サーバー保存はない。記録はこの端末・ブラウザ内にのみ保存する。
 */
const VARIANT = "members";            // ビルド時に固定（URLや端末設定では切り替わらない）
const BUILD = "ee7b2280eb";
const STORE_KEY = "life-stage2:" + VARIANT + ":v1";
const UI_KEY = STORE_KEY + ":ui";
const SCHEMA = 1;
const MAX_IMPORT = 5 * 1024 * 1024;
const NOTICE = "記録はこの端末・ブラウザに保存されます。端末変更やブラウザデータ削除に備え、バックアップしてください。";
const EXT = {};                           // 統合版だけが中身を登録する拡張点

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

/* ============ 小道具 ============ */
const $ = s => document.querySelector(s);
const ACT = {};
function act(name, fn){ ACT[name] = fn; }
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const uid = () => Math.random().toString(36).slice(2,9) + Date.now().toString(36);
const today = () => { const d = new Date(); return new Date(d - d.getTimezoneOffset()*6e4).toISOString().slice(0,10); };
const isObj = x => !!x && typeof x === "object" && !Array.isArray(x);
const str = x => typeof x === "string" ? x : (typeof x === "number" ? String(x) : "");
function getPath(p){ return p.split(".").reduce((o,k) => o == null ? undefined : o[k], S); }
function setPath(p,v){ const ks = p.split("."); let o = S; ks.slice(0,-1).forEach(k => { if(!isObj(o[k]) && !Array.isArray(o[k])) o[k] = {}; o = o[k]; }); o[ks.at(-1)] = v; }
function toast(m){ const t = $("#toast"); t.textContent = m; t.classList.add("show"); clearTimeout(t._t); t._t = setTimeout(() => t.classList.remove("show"), 3000); }
const prog = (n, m) => `<div class="bar" role="progressbar" aria-valuemin="0" aria-valuemax="${m}" aria-valuenow="${n}"><i style="width:${m ? Math.round(n/m*100) : 0}%"></i></div>`;
function countLine(t){ const n = (t || "").replace(/\s/g, "").length; return `${n}字 ・ 話すと約${Math.round(n/5)}秒（目安：1秒あたり5字）`; }

/* ============ データ（端末内保存） ============ */
const blankAll = () => ({answers:{},step:{},drafts:{},approved:{},practice:{},daily:{},aiNotes:[]});
function sanitizeAll(a){
  if(!isObj(a)) return null;
  const o = blankAll(), ids = new Set(STAGES.map(s => s.id)), sc = new Set(SCENES.map(s => s.id));
  for(const [id, v] of Object.entries(isObj(a.answers) ? a.answers : {})) if(ids.has(id) && isObj(v)){ o.answers[id] = {}; for(const [i, t] of Object.entries(v)) if(/^\d+$/.test(i)) o.answers[id][i] = str(t); }
  for(const [id, v] of Object.entries(isObj(a.step) ? a.step : {})) if(ids.has(id) && Number.isInteger(v) && v >= 0 && v <= 10) o.step[id] = v;
  for(const [id, v] of Object.entries(isObj(a.drafts) ? a.drafts : {})) if(ids.has(id) && typeof v === "string") o.drafts[id] = v;
  for(const [id, v] of Object.entries(isObj(a.approved) ? a.approved : {})) if(ids.has(id) && v) o.approved[id] = {at: str(v.at) || new Date().toISOString()};
  for(const [id, v] of Object.entries(isObj(a.practice) ? a.practice : {})) if(sc.has(id) && isObj(v)){ o.practice[id] = {}; for(const k of ["who","core","words","reaction","next"]) if(v[k] != null) o.practice[id][k] = str(v[k]); }
  for(const [d, v] of Object.entries(isObj(a.daily) ? a.daily : {})) if(/^\d{4}-\d{2}-\d{2}$/.test(d)) o.daily[d] = str(v);
  if(Array.isArray(a.aiNotes)) o.aiNotes = a.aiNotes.filter(isObj).map(n => ({id: str(n.id) || uid(), at: str(n.at) || new Date().toISOString(), label: str(n.label), text: str(n.text)})).filter(n => n.text);
  return o;
}
const blankState = () => { const s = {profile:{name:""}, all:blankAll()}; if(EXT.blank) EXT.blank(s); return s; };
let S, UI, STORAGE_OK = true, LOAD_PROBLEM = "";

function readStore(){
  let raw = null;
  try{ raw = localStorage.getItem(STORE_KEY); }catch(e){ STORAGE_OK = false; return null; }
  if(raw == null) return null;
  try{ return JSON.parse(raw); }
  catch(e){ // 壊れた記録は消さずに退避して知らせる
    try{ localStorage.setItem(STORE_KEY + ":broken:" + Date.now(), raw); }catch(_){}
    LOAD_PROBLEM = "保存されていた記録を読み込めませんでした（元のデータは端末内に退避しました）。";
    return null;
  }
}
function loadState(){
  const d = readStore(), s = blankState();
  if(isObj(d) && d.schemaVersion === SCHEMA){
    s.profile.name = str(isObj(d.profile) ? d.profile.name : "");
    s.all = sanitizeAll(d.all) || blankAll();
    if(EXT.load) EXT.load(s, d);
  }
  return s;
}
function probeStorage(){ try{ const k = STORE_KEY + ":probe"; localStorage.setItem(k, "1"); localStorage.removeItem(k); return true; }catch(e){ return false; } }
function readUI(){ try{ return JSON.parse(localStorage.getItem(UI_KEY) || "null") || {}; }catch(e){ return {}; } }
function saveUI(){ try{ localStorage.setItem(UI_KEY, JSON.stringify(UI)); }catch(e){} }

let saveT, DIRTY = false;
function setSave(st){ const el = $("#save"); el.className = "save " + (st === "ok" ? "" : st);
  el.querySelector("span").textContent = {ok:"保存済み", saving:"保存中…", error:"保存できません・タップで再試行"}[st]; }
function save(now){ DIRTY = true; setSave("saving"); clearTimeout(saveT); saveT = setTimeout(flush, now ? 0 : 500); }
function flush(){
  const doc = {schemaVersion:SCHEMA, appVariant:VARIANT, savedAt:new Date().toISOString(), profile:S.profile, all:S.all};
  if(EXT.toDoc) EXT.toDoc(doc);
  try{
    const json = JSON.stringify(doc);
    localStorage.setItem(STORE_KEY, json);
    if(localStorage.getItem(STORE_KEY) !== json) throw new Error("verify");
    DIRTY = false; STORAGE_OK = true; setSave("ok");
  }catch(e){
    STORAGE_OK = false; setSave("error");   // 入力はメモリ上に残る。成功表示はしない
    toast("この端末に保存できませんでした。設定からバックアップを書き出してください");
  }
}
$("#save").addEventListener("click", () => { if($("#save").classList.contains("error")) save(true); });
window.addEventListener("beforeunload", e => { if(DIRTY){ flush(); if(DIRTY){ e.preventDefault(); e.returnValue = ""; } } });

/* ============ 計算 ============ */
const stageDone = id => !!S.all.approved[id];
const doneCount = () => STAGES.filter(s => stageDone(s.id)).length;
const nextStage = () => STAGES.find(s => !stageDone(s.id));

/* ============ ルーティング・描画 ============ */
document.addEventListener("click", e => { const el = e.target.closest("[data-act]"); if(!el || el.disabled) return; e.preventDefault(); const f = ACT[el.dataset.act]; if(f) f(el.dataset.arg, el); });
function go(tab, view = null){ UI.tab = tab; UI.view = view; saveUI(); render(); window.scrollTo({top:0}); $("#app").focus({preventScroll:true}); }
document.querySelectorAll("nav.bottom button").forEach(b => b.onclick = () => go(b.dataset.tab));

function render(){
  if(!EXT.views) UI.course = "all";
  if(EXT.beforeRender) EXT.beforeRender();
  document.querySelectorAll("nav.bottom button").forEach(b => { if(b.dataset.tab === UI.tab) b.setAttribute("aria-current","page"); else b.removeAttribute("aria-current"); });
  const views = Object.assign({home:homeAll, journey:journeyAll, ai:viewAI, book:viewBook, me:viewMe}, EXT.views ? EXT.views() : {});
  const banners = (LOAD_PROBLEM ? `<p class="banner err">${esc(LOAD_PROBLEM)}</p>` : "") +
    (!STORAGE_OK ? `<p class="banner err">この端末では記録を保存できない状態です（プライベートモード・容量不足など）。入力は画面を閉じるまで残ります。設定からバックアップを書き出してください。</p>` : "");
  $("#app").innerHTML = `<div class="view">${banners}${(views[UI.tab] || homeAll)()}</div>`;
  bindInputs();
  if(UI.tab === "ai") bindAI();
}
function bindInputs(){
  document.querySelectorAll("[data-bind]").forEach(el => {
    const p = el.dataset.bind, v = getPath(p);
    if(el.type === "checkbox") el.checked = !!v; else el.value = v ?? "";
    el.addEventListener("input", () => { setPath(p, el.type === "checkbox" ? el.checked : el.value); save(); if(el.dataset.live) liveUpdate(el.dataset.live); });
    if(el.dataset.rerender != null) el.addEventListener("change", () => render());
  });
}
function liveUpdate(w){
  if(EXT.live && EXT.live(w)) return;
  if(w === "count"){ const ta = $("#draft"), c = $("#cnt"); if(ta && c) c.textContent = countLine(ta.value); }
}
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
    : `<h2 style="margin-top:10px">7ステージ完了</h2><p class="muted">ブックからMY LIFE STORYを印刷／PDF保存できます。対話練習は何度でも。</p>
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
  ${EXT.homeCards ? EXT.homeCards() : ""}`;
}
act("openStage", id => go("journey", "stage:" + id));
act("openPractice", id => go("journey", "practice:" + id));

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
  if(S.all.drafts[id] == null){ S.all.drafts[id] = s.compose(s.qs.map((_,i) => ans[i] || "")); save(); }
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
  <p class="small muted" style="margin-top:12px">※ 記録はこの端末内だけに保存され、誰かに送信・公開されることはありません。</p>`;
}
act("stepNext", id => { S.all.step[id] = (S.all.step[id] || 0) + 1; save(); render(); window.scrollTo({top:0}); });
act("stepPrev", id => { const N = STAGES.find(s => s.id === id).qs.length; S.all.step[id] = Math.max(0, Math.min((S.all.step[id] || 0) - 1, N - 1)); save(); render(); });
act("recompose", id => { if(!confirm("回答から下書きを作り直します。編集中の下書きは上書きされます。")) return; delete S.all.drafts[id]; save(); render(); });
act("approve", id => { if(!(S.all.drafts[id] || "").trim()){ toast("下書きが空です"); return; } S.all.approved[id] = {at: new Date().toISOString()}; save(true); render();
  toast(doneCount() === 7 ? "7ステージ完了。おめでとうございます！" : "承認しました。ブックに収録されました"); });
act("unapprove", id => { delete S.all.approved[id]; save(); render(); });

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

/* ============ AI：依頼文をコピーして各自のAIに貼る（外部送信なし） ============ */
const AIS = {mode:null, arg:"", prompt:null, result:""};
const AI_MODES = {all: [["stage","ステージの回答・成果物を見てもらう"],["story","90秒ストーリーを磨く"],["practice","対話練習のフィードバック"],["plan","7ステージ全体と90日行動案"]]};
const RULES = `次の4つの見出しで、日本語で簡潔に回答してください。
【事実】記録から読み取れること（記録にない数値や出来事は作らない）
【仮説】改善のための仮説（断定しない・2〜3個）
【未確認】判断に必要だが記録にない点と、私に確認したい質問
【次の行動】明日からできる具体的な一歩を1〜3個`;
function buildPrompt(mode, arg){
  if(EXT.prompt){ const r = EXT.prompt(mode, arg); if(r) return r; }
  const a = S.all;
  const st = id => { const s = STAGES.find(x => x.id === id); const ans = a.answers[id] || {};
    return `■ ${s.en}（${s.ja}）\n` + s.qs.map((q,i) => `Q. ${q.q}\nA. ${ans[i] || "（未記入）"}`).join("\n") + (a.drafts[id] ? `\n［成果物］\n${a.drafts[id]}` : ""); };
  if(mode === "story"){ const t = a.drafts.s2 || STAGES[1].compose(STAGES[1].qs.map((_,i) => (a.answers.s2 || {})[i] || ""));
    return `以下は私の「90秒ストーリー」（自己紹介の物語）の下書きです。話すと約${Math.round(t.replace(/\s/g,"").length/5)}秒です。事実・感情・学び・未来のつながりが伝わるか、聞き手の心に残るかの観点で助言し、最後に90秒（約450字）以内の改善例を1つ示してください。\n${RULES}\n\n---\n${t}`; }
  if(mode === "practice"){ const s = SCENES.find(x => x.id === arg) || SCENES[0], p = a.practice[s.id] || {};
    return `「${s.t}」の場面で、伝え方・聴き方を練習しました。相手が受け取りやすい言い方になっているか助言し、言い換え例を1つ示してください。\n${RULES}\n\n---\n相手と場面：${p.who || "（未記入）"}\n一番伝えたいこと：${p.core || "（未記入）"}\n実際に話す言葉：${p.words || "（未記入）"}\n相手の反応：${p.reaction || "（未記入）"}\n次に改善すること：${p.next || "（未記入）"}`; }
  if(mode === "plan") return `以下は7ステージのワーク記録です。理想・現在地・差・手段・環境・90日行動案のつながりに矛盾や抜けがないか確認し、90日行動案を実行しやすくする助言をください。\n${RULES}\n\n---\n` + STAGES.map(s => st(s.id)).join("\n\n");
  return `私は自己成長プログラム「LIFE STAGE 2.0」で、人生の価値を相手に伝える練習をしています。以下のワークの回答について、伝わりやすさと深め方を助言してください。\n${RULES}\n\n---\n${st(arg || "s1")}`;
}
function viewAI(){
  const pg = UI.course, modes = AI_MODES[pg] || AI_MODES.all;
  if(!modes.some(m => m[0] === AIS.mode)){ AIS.mode = modes[0][0]; AIS.prompt = null; }
  const needArg = AIS.mode === "stage" || AIS.mode === "practice";
  if(AIS.mode === "stage" && !STAGES.some(s => s.id === AIS.arg)) AIS.arg = "s1";
  if(AIS.mode === "practice" && !SCENES.some(s => s.id === AIS.arg)) AIS.arg = "p1";
  if(AIS.prompt == null) AIS.prompt = buildPrompt(AIS.mode, AIS.arg);
  const notes = S[pg].aiNotes || [];
  return `<p class="eyebrow">AI Assist · ${esc(EXT.aiLabel ? EXT.aiLabel() : "伝え方コーチ")}</p>
  <h1>${EXT.aiTitle ? EXT.aiTitle() : "伝わる言葉を、AIと磨く"}</h1>
  <div class="card"><h3>1. 相談する内容</h3>
    <select id="aiMode" aria-label="相談する内容">${modes.map(([k,l]) => `<option value="${k}" ${k === AIS.mode ? "selected" : ""}>${l}</option>`).join("")}</select>
    ${needArg ? `<select id="aiArg" style="margin-top:8px" aria-label="対象">${(AIS.mode === "stage" ? STAGES.map(s => [s.id, s.en + "｜" + s.ja]) : SCENES.map(s => [s.id, s.t])).map(([k,l]) => `<option value="${k}" ${k === AIS.arg ? "selected" : ""}>${esc(l)}</option>`).join("")}</select>` : ""}
  </div>
  <div class="card"><h3>2. AIへの依頼文</h3>
    <p class="small muted">あなたの記録から依頼文を作りました。必要なら編集し、コピーしてお使いのAI（ChatGPT・Claude・Gemini など）に貼り付けてください。このアプリから自動で送信されることはありません。</p>
    <textarea id="aiPrompt" style="min-height:220px;font-size:14px"></textarea>
    <div class="hint">送る前に、氏名・会社名・連絡先など個人が特定できる情報は消すか伏せ字にしてください。</div>
    <div class="row wrapx"><button class="btn ghost sm" data-act="aiReset">記録から作り直す</button><span class="spacer"></span>
      <button class="btn sm" data-act="aiCopy">依頼文をコピー</button></div>
  </div>
  <div class="card"><h3>3. AIの回答を記録</h3>
    <p class="small muted">AIの回答を貼り付け、採用する部分だけ残して保存しましょう。採用するかはあなたが決めます。</p>
    <textarea id="aiResult" style="min-height:160px" placeholder="ここにAIの回答を貼り付け"></textarea>
    <div class="row" style="margin-top:10px"><span class="spacer"></span><button class="btn sm" data-act="aiSaveNote">メモとして保存</button></div>
  </div>
  ${notes.length ? `<p class="eyebrow" style="margin-top:20px">Saved Notes</p>` + notes.slice().reverse().map(n => `<div class="log"><div class="row"><b>${esc(n.at.slice(0,10))}</b><span class="badge gold">${esc(n.label)}</span><span class="spacer"></span><button class="btn ghost sm" data-act="aiDelNote" data-arg="${esc(n.id)}">削除</button></div><dl><dd style="grid-column:1/-1">${esc(n.text)}</dd></dl></div>`).join("") : ""}`;
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
act("aiSaveNote", () => {
  const t = ($("#aiResult").value || "").trim(); if(!t){ toast("回答を貼り付けてください"); return; }
  const pg = UI.course, label = ((AI_MODES[pg] || AI_MODES.all).find(m => m[0] === AIS.mode) || ["",""])[1];
  (S[pg].aiNotes = S[pg].aiNotes || []).push({id:uid(), at:new Date().toISOString(), label, text:t});
  AIS.result = ""; save(true); render(); toast("保存しました");
});
act("aiDelNote", id => { if(!confirm("このメモを削除しますか？")) return; const pg = UI.course; S[pg].aiNotes = S[pg].aiNotes.filter(n => n.id !== id); save(); render(); });

/* ============ ブック ============ */
function viewBook(){
  if(EXT.book){ const r = EXT.book(); if(r) return r; }
  const name = S.profile.name || "あなた", ap = STAGES.filter(s => stageDone(s.id));
  return `<p class="eyebrow">Book · My Life Story</p><h1>${esc(name)}の MY LIFE STORY</h1>
  <p class="muted small">承認したステージの成果物が、ここに一冊として積み上がります。</p>${prog(ap.length,7)}
  <div class="row noprint" style="margin-top:12px"><span class="small muted">${ap.length} / 7 章</span><span class="spacer"></span><button class="btn sm" data-act="print" ${ap.length ? "" : "disabled"}>印刷／PDF保存</button></div>
  ${ap.length ? ap.map(s => `<div class="book-page"><p class="eyebrow">Chapter ${STAGES.indexOf(s)+1} · ${esc(s.en)}</p><h2>${esc(s.out)}</h2><p>${esc(S.all.drafts[s.id])}</p></div>`).join("")
    : `<div class="card empty">まだ章がありません。<br>ジャーニーでステージを進め、成果物を承認してください。<br><br><button class="btn sm" data-act="tab" data-arg="journey">ジャーニーへ</button></div>`}
  ${ap.length === 7 ? `<div class="card hero"><p class="eyebrow">Final</p><h2>7つの章がそろいました。</h2><p class="muted">あなたの物語は、伝えた相手の中でも続いていきます。発表や共有は任意です。</p></div>` : ""}`;
}
act("print", () => window.print());

/* ============ 設定：バックアップ・復元・削除 ============ */
function viewMe(){
  return `<p class="eyebrow">Settings</p><h1>設定</h1>
  <div class="card"><label class="f" style="margin-top:0" for="nm">表示名（任意・この端末だけ）</label><input type="text" id="nm" data-bind="profile.name" placeholder="例：はなこ"></div>
  <div class="card"><h3>記録の保存について</h3>
    <p class="small muted">${NOTICE}</p>
    <p class="small muted">ログインはありません。別の端末とは自動で同期されません。同じ端末・同じブラウザを使う人とは記録が共有されます。</p>
    <div class="row wrapx" style="margin-top:8px">
      <button class="btn sm" data-act="export">バックアップを書き出す</button>
      <label class="btn ghost sm" style="cursor:pointer">バックアップから復元<input type="file" accept="application/json,.json" id="imp" hidden></label>
    </div></div>
  <div class="card"><h3>このアプリの記録を削除</h3>
    <p class="small muted">この端末に保存された${esc(APP_LABEL)}の記録だけを削除します。元に戻せないため、先にバックアップをおすすめします。</p>
    <button class="btn ghost sm" style="color:var(--err);border-color:rgba(229,140,140,.4)" data-act="wipe">記録を削除する</button></div>
  <div class="card"><button class="btn ghost sm" data-act="replayIntro">オープニングを再生</button></div>
  <p class="small muted">${esc(APP_LABEL)} ・ build ${esc(BUILD)}</p>`;
}
const APP_LABEL = VARIANT === "integrated" ? "LIFE STAGE 2.0 統合版" : "LIFE STAGE 2.0 全メンバー版";
act("export", () => {
  flush();
  const data = {profile:S.profile, all:S.all}; if(EXT.toDoc) EXT.toDoc(data);
  const doc = {app:"LIFE STAGE 2.0", schemaVersion:SCHEMA, appVariant:VARIANT, exportedAt:new Date().toISOString(),
    workIds:{stages:STAGES.map(s => s.id), scenes:SCENES.map(s => s.id), ...(EXT.workIds ? EXT.workIds() : {})}, data};
  const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([JSON.stringify(doc,null,2)], {type:"application/json"}));
  a.download = `lifestage2-${VARIANT}-${today()}.json`; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  toast("バックアップを書き出しました");
});
function countAll(a){ return {stages: STAGES.filter(s => a.approved[s.id]).length, answered: Object.values(a.answers).reduce((n,o) => n + Object.values(o).filter(t => t.trim()).length, 0), practice: Object.keys(a.practice).length, notes: a.aiNotes.length}; }
const countText = c => `承認済みステージ ${c.stages}件・回答 ${c.answered}件・対話練習 ${c.practice}件・AIメモ ${c.notes}件`;
function parseBackup(text){
  let d; try{ d = JSON.parse(text); }catch(e){ throw new Error("JSON形式ではありません"); }
  if(!isObj(d)) throw new Error("バックアップの形式ではありません");
  let src, from;
  if(d.schemaVersion != null){
    if(typeof d.schemaVersion !== "number" || d.schemaVersion > SCHEMA) throw new Error("このアプリより新しい版のバックアップのため読み込めません");
    if(d.schemaVersion < 1 || !isObj(d.data)) throw new Error("バックアップの形式ではありません");
    src = d.data; from = d.appVariant === "integrated" ? "統合版" : d.appVariant === "members" ? "全メンバー版" : "不明なアプリ";
  }else if((d.v === 2 || d.v === 1) && isObj(d.all)){ src = d; from = "旧版（ログイン版）"; }
  else throw new Error("LIFE STAGE 2.0 のバックアップではありません");
  const all = sanitizeAll(src.all); if(!all) throw new Error("全メンバー向けの記録が見つかりません");
  const res = {from, all, name: str(isObj(src.profile) ? src.profile.name : ""), extra:null, excluded:false};
  if(src.core != null){ if(EXT.parse) res.extra = EXT.parse(src.core); else res.excluded = true; }
  return res;
}
function dialog(html){
  const d = document.createElement("div"); d.className = "dlg"; d.setAttribute("role","dialog"); d.setAttribute("aria-modal","true");
  d.innerHTML = `<div class="card">${html}</div>`; document.body.appendChild(d); (d.querySelector("button") || d).focus(); return d;
}
let PENDING = null;
document.addEventListener("change", e => {
  if(e.target.id !== "imp") return; const f = e.target.files[0]; e.target.value = ""; if(!f) return;
  if(f.size > MAX_IMPORT){ toast("ファイルが大きすぎます（5MBまで）"); return; }
  f.text().then(t => {
    const r = parseBackup(t); PENDING = r;
    const cur = countAll(S.all), inc = countAll(r.all);
    dialog(`<h2>バックアップから復元</h2>
      <p class="small muted">読み込むファイル：${esc(r.from)}${r.name ? "（" + esc(r.name) + "）" : ""}</p>
      <div class="log"><dl><dt>取り込む内容</dt><dd>${countText(inc)}</dd><dt>現在の記録</dt><dd>${countText(cur)}</dd>${EXT.previewRows ? EXT.previewRows(r) : ""}</dl></div>
      <p class="small">全メンバー向けの現在の記録は、読み込む内容で<b>置き換え</b>られます。${EXT.previewNote ? EXT.previewNote(r) : ""}</p>
      ${r.excluded ? `<p class="small" style="color:var(--warn)">このファイルに含まれるコア記録は、このアプリでは使わないため取り込みません。</p>` : ""}
      <div class="row" style="margin-top:12px"><button class="btn ghost sm" data-act="impCancel">キャンセル</button><span class="spacer"></span><button class="btn sm" data-act="impOk">置き換えて復元</button></div>`);
  }).catch(err => toast("読み込めません：" + err.message));
});
act("impCancel", () => { PENDING = null; document.querySelector(".dlg")?.remove(); });
act("impOk", () => {
  const r = PENDING; if(!r) return; PENDING = null; document.querySelector(".dlg")?.remove();
  S.all = r.all; if(r.name) S.profile.name = r.name; if(EXT.apply) EXT.apply(r);
  AIS.prompt = null; save(true); go("home");
  toast(r.excluded ? "復元しました（コア記録は除外しました）" : "復元しました");
});
act("wipe", () => {
  if(!confirm(`この端末の${APP_LABEL}の記録をすべて削除します。元に戻せません。よろしいですか？`)) return;
  try{ localStorage.removeItem(STORE_KEY); localStorage.removeItem(UI_KEY); }catch(e){}
  S = blankState(); UI = {course:"all", tab:"home", view:null, seenIntro:true}; DIRTY = false; saveUI(); render(); setSave("ok"); toast("削除しました");
});
act("replayIntro", () => showIntro());

/* ============ オープニング ============ */
function showIntro(){
  const d = document.createElement("div"); d.className = "intro"; d.setAttribute("role","dialog"); d.setAttribute("aria-label","オープニング");
  d.innerHTML = `<div class="glow"></div><button class="skip">スキップ</button><div class="in">
    <div class="logo">LIFE STAGE</div><p class="eyebrow" style="margin-bottom:22px">Stage 2.0 · Express &amp; Connect</p>
    <h1 style="font-size:22px">あなたの人生には、<br>誰かに伝える価値がある。</h1>
    <p class="muted">伝える。聴く。関係を育てる。<br>30日・7つのステージへ。</p>
    <button class="btn" style="margin-top:18px;min-width:200px">はじめる</button>
    <p class="small muted" style="margin-top:18px">${NOTICE}</p></div>`;
  const close = () => { d.remove(); UI.seenIntro = true; saveUI(); $("#app").focus({preventScroll:true}); };
  d.querySelector(".skip").onclick = close; d.querySelector(".in .btn").onclick = close;
  document.body.appendChild(d); d.querySelector(".in .btn").focus();
}


/* ============ 起動 ============ */
// 旧ログイン版のメールリンク等で付いた認証パラメータは処理せず、URLから取り除く
if(/[?&#](code|token|token_hash|type|error|error_description|access_token|refresh_token)=/.test(location.search + location.hash)) history.replaceState(null, "", location.pathname);
STORAGE_OK = probeStorage();
S = loadState();
UI = Object.assign({course:"all", tab:"home", view:null, seenIntro:false}, readUI());
if(!["home","journey","ai","book","me"].includes(UI.tab)) UI.tab = "home";
if(UI.course !== "all" && !EXT.views) UI.course = "all";
render(); setSave(STORAGE_OK ? "ok" : "error");
if(!UI.seenIntro) showIntro();
if("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("sw.js").catch(() => {});
