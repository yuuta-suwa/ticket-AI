// 全会員共通のHOME画面（スマホ優先）。利用者データは必ず textContent で描画しXSSを防ぐ。
export function renderHomePage(o: { signInPath: string; signOutPath: string }): string {
  const cfg = JSON.stringify(o).replace(/</g, '\\u003c');
  return `<!doctype html>
<html lang="ja"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>LIFE STAGE</title>
<style>
:root{--bg:#f6f5f2;--card:#fff;--ink:#1d1d1f;--sub:#6b6b70;--line:#e4e2dc;--acc:#1f5f4a;--err:#b3261e}
@media (prefers-color-scheme:dark){:root{--bg:#121313;--card:#1c1d1d;--ink:#ecebe8;--sub:#a3a3a6;--line:#2d2f2f;--acc:#6fc3a3;--err:#ff8a80}}
*{box-sizing:border-box}html,body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.6 system-ui,-apple-system,"Hiragino Sans","Noto Sans JP",sans-serif}
header{position:sticky;top:0;background:var(--bg);border-bottom:1px solid var(--line);padding:12px 16px;display:flex;justify-content:space-between;align-items:center;z-index:1}
header b{letter-spacing:.12em}main{max-width:560px;margin:0 auto;padding:16px 16px calc(32px + env(safe-area-inset-bottom))}
.card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:16px;margin:0 0 14px}
h2{font-size:15px;margin:0 0 10px;color:var(--sub);font-weight:600}
label{display:block;font-size:14px;color:var(--sub);margin:10px 0 4px}
input,textarea{width:100%;font:inherit;color:inherit;background:transparent;border:1px solid var(--line);border-radius:10px;padding:12px}
textarea{min-height:110px;resize:vertical}
button,.btn{display:inline-flex;align-items:center;justify-content:center;min-height:44px;padding:0 18px;border-radius:10px;border:0;background:var(--acc);color:#fff;font:inherit;font-weight:600;text-decoration:none;cursor:pointer}
@media (prefers-color-scheme:dark){button,.btn{color:#0b1f18}}
button.ghost{background:transparent;color:var(--acc);border:1px solid var(--line)}
.row{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:12px}
.muted{color:var(--sub);font-size:14px}.err{color:var(--err);font-size:14px;min-height:1em}
.goal-title{font-size:20px;font-weight:700;margin:0 0 4px;overflow-wrap:anywhere}.goal-detail{white-space:pre-wrap;overflow-wrap:anywhere;margin:0}
.thumbs{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:10px}.thumbs img{width:100%;aspect-ratio:1;object-fit:cover;border-radius:8px;border:1px solid var(--line)}
.pending-item{border-top:1px solid var(--line);padding:10px 0}.pending-item:first-child{border-top:0}
[hidden]{display:none!important}
</style></head><body>
<header><b>LIFE STAGE</b><a id="signout" class="muted" hidden>サインアウト</a></header>
<main>
  <p id="loading" class="muted">読み込み中…</p>

  <section id="v-signin" class="card" hidden>
    <h2>ようこそ</h2>
    <p>会員の方はChatGPTアカウントでサインインしてください。</p>
    <div class="row"><a id="signin" class="btn">Sign in with ChatGPT</a></div>
  </section>

  <section id="v-pending" class="card" hidden>
    <h2>承認待ち</h2>
    <p>会員登録を受け付けました。運営の承認後にご利用いただけます。</p>
    <p class="muted" id="pending-email"></p>
  </section>

  <section id="v-rejected" class="card" hidden>
    <h2>ご利用いただけません</h2>
    <p>このアカウントは利用が承認されていません。運営までお問い合わせください。</p>
  </section>

  <div id="v-home" hidden>
    <p id="greet" class="muted"></p>
    <section class="card">
      <h2>人生目標</h2>
      <div id="goal-view"><p class="goal-title" id="goal-title"></p><p class="goal-detail" id="goal-detail"></p><p class="muted" id="goal-updated"></p></div>
      <p id="goal-empty" class="muted" hidden>まだ目標がありません。最初の目標を書いてみましょう。</p>
      <form id="goal-form">
        <label for="g-title">目標（120字まで）</label><input id="g-title" maxlength="120" required>
        <label for="g-detail">詳しく（任意・2000字まで）</label><textarea id="g-detail" maxlength="2000"></textarea>
        <div class="row"><button type="submit">保存する</button><span id="goal-msg" class="muted"></span></div>
        <p id="goal-err" class="err"></p>
      </form>
    </section>
    <section class="card">
      <h2>テスト画像（R2保存確認）</h2>
      <p class="muted">PNG / JPEG / WebP、1MBまで。本人だけが閲覧できます。</p>
      <div class="row"><input id="img-file" type="file" accept="image/png,image/jpeg,image/webp"></div>
      <p id="img-err" class="err"></p>
      <div id="thumbs" class="thumbs"></div>
    </section>
    <section id="v-admin" class="card" hidden>
      <h2>管理：承認待ちの会員</h2>
      <div id="pending-list"></div>
      <p id="admin-empty" class="muted" hidden>承認待ちはありません。</p>
    </section>
    <section id="v-backup" class="card" hidden>
      <h2>管理：バックアップ</h2>
      <p class="muted">全会員のデータを含みます。暗号化した保管場所に保存し、Gitやチャットには貼らないでください。</p>
      <div class="row"><a class="btn" href="/api/admin/backup" download>バックアップをダウンロード</a></div>
      <label for="restore-file">復元（データが空のサイトでのみ実行できます）</label>
      <input id="restore-file" type="file" accept="application/json,.json">
      <p id="restore-msg" class="err"></p>
    </section>
  </div>
</main>
<script>
(function(){
const CFG=${cfg};
const $=(id)=>document.getElementById(id);
const show=(id,on)=>{$(id).hidden=!on};
const ERR={invalid_input:'入力内容を確認してください。',not_approved:'承認後に利用できます。',forbidden:'権限がありません。',not_found:'見つかりません。',unauthenticated:'サインインしてください。'};
async function api(path,opt){
  const r=await fetch(path,Object.assign({credentials:'same-origin'},opt||{}));
  const ct=r.headers.get('content-type')||'';
  const body=ct.includes('application/json')?await r.json():null;
  if(!r.ok){const e=new Error((body&&body.error)||'error');e.code=(body&&body.error)||'internal';throw e}
  return body;
}
const msg=(e)=>ERR[e.code]||'通信に失敗しました。時間をおいて再度お試しください。';
$('signin').href=CFG.signInPath;$('signout').href=CFG.signOutPath;

function renderGoal(g){
  show('goal-view',!!g);show('goal-empty',!g);
  if(g){$('goal-title').textContent=g.title;$('goal-detail').textContent=g.detail;$('goal-updated').textContent='最終更新 '+new Date(g.updatedAt).toLocaleString('ja-JP');
    $('g-title').value=g.title;$('g-detail').value=g.detail;}
}
async function loadImages(){
  const {images}=await api('/api/images');const box=$('thumbs');box.textContent='';
  for(const im of images){const img=document.createElement('img');img.alt='テスト画像';img.loading='lazy';img.src='/api/images/'+encodeURIComponent(im.id);box.appendChild(img)}
}
async function loadAdmin(){
  const {members}=await api('/api/admin/pending');const box=$('pending-list');box.textContent='';
  show('admin-empty',members.length===0);
  for(const m of members){
    const div=document.createElement('div');div.className='pending-item';
    const p=document.createElement('div');p.textContent=(m.displayName?m.displayName+' / ':'')+m.email;div.appendChild(p);
    const row=document.createElement('div');row.className='row';
    for(const [d,label,cls] of [['approved','承認',''],['rejected','否認','ghost']]){
      const b=document.createElement('button');b.type='button';b.textContent=label;if(cls)b.className=cls;
      b.onclick=async()=>{b.disabled=true;try{await api('/api/admin/members/'+encodeURIComponent(m.id)+'/decision',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({decision:d})});await loadAdmin()}catch(e){alert(msg(e));b.disabled=false}};
      row.appendChild(b)}
    div.appendChild(row);box.appendChild(div)}
}
$('goal-form').addEventListener('submit',async(ev)=>{
  ev.preventDefault();$('goal-err').textContent='';$('goal-msg').textContent='保存中…';
  try{const {goal}=await api('/api/goal',{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({title:$('g-title').value,detail:$('g-detail').value})});
    renderGoal(goal);$('goal-msg').textContent='保存しました';}
  catch(e){$('goal-msg').textContent='';$('goal-err').textContent=msg(e)}
});
$('img-file').addEventListener('change',async(ev)=>{
  const f=ev.target.files&&ev.target.files[0];$('img-err').textContent='';if(!f)return;
  if(f.size>1048576){$('img-err').textContent='1MBまでの画像を選んでください。';return}
  try{await api('/api/images',{method:'POST',headers:{'content-type':f.type},body:f});await loadImages()}
  catch(e){$('img-err').textContent=msg(e)}finally{ev.target.value=''}
});
$('restore-file').addEventListener('change',async(ev)=>{
  const f=ev.target.files&&ev.target.files[0];$('restore-msg').textContent='';if(!f)return;
  if(!confirm('このサイトにバックアップを復元します。よろしいですか？'))return;
  try{const r=await api('/api/admin/restore',{method:'POST',headers:{'content-type':'application/json'},body:await f.text()});
    $('restore-msg').textContent='復元しました（会員'+r.restored.members+'件・目標'+r.restored.goals+'件・画像'+r.restored.files+'件）。再読み込みしてください。'}
  catch(e){$('restore-msg').textContent=e.code==='forbidden'?'データが入っているサイトには復元できません。':msg(e)}finally{ev.target.value=''}
});
async function boot(){
  try{
    const me=await api('/api/me');show('loading',false);
    if(!me.signedIn){show('v-signin',true);return}
    show('signout',true);const m=me.member;
    if(m.status==='pending'){$('pending-email').textContent=m.email;show('v-pending',true);return}
    if(m.status!=='approved'){show('v-rejected',true);return}
    $('greet').textContent=(m.displayName||m.email)+' さん';show('v-home',true);
    const {goal}=await api('/api/goal');renderGoal(goal);
    await loadImages();
    if(m.role==='admin'){show('v-admin',true);show('v-backup',true);await loadAdmin()}
  }catch(e){$('loading').textContent=msg(e);show('loading',true)}
}
boot();
})();
</script></body></html>`;
}
