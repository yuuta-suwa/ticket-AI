// 全会員共通の画面の外枠（スマホ優先）。スクリプトは /app.js のみ（インラインスクリプト禁止のCSP）
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export function renderShell(o: { signInPath: string; signOutPath: string }): string {
  return `<!doctype html>
<html lang="ja"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#14213d">
<title>LIFE STAGE</title>
<style>${CSS}</style>
</head><body>
<div id="app" data-signin="${esc(o.signInPath)}" data-signout="${esc(o.signOutPath)}">
  <header class="top"><b class="brand">LIFE STAGE</b><span id="top-right"></span></header>
  <main id="view" aria-live="polite"><p class="muted pad">読み込み中…</p></main>
  <nav id="tabs" class="tabs" hidden></nav>
</div>
<noscript><p class="pad">このアプリはJavaScriptを有効にしてご利用ください。</p></noscript>
<script src="/app.js" defer></script>
</body></html>`;
}

const CSS = `
:root{--bg:#f6f5f1;--card:#fff;--ink:#141824;--sub:#5f6270;--line:#e3e1da;--navy:#14213d;--gold:#b98f1d;--indigo:#3f4fb5;--ok:#1f7a55;--warn:#a35a00;--err:#b3261e;--chip:#eef0fb}
@media (prefers-color-scheme:dark){:root{--bg:#0f1218;--card:#181c25;--ink:#eceae4;--sub:#a3a6b2;--line:#2a2f3b;--navy:#c9d2ef;--gold:#e0b84a;--indigo:#9aa6f2;--ok:#6fd0a6;--warn:#f0b35a;--err:#ff8a80;--chip:#232a40}}
*{box-sizing:border-box}html,body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.65 system-ui,-apple-system,"Hiragino Sans","Noto Sans JP",sans-serif;-webkit-text-size-adjust:100%}
@media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}
.top{position:sticky;top:0;z-index:5;display:flex;justify-content:space-between;align-items:center;padding:12px 16px;background:var(--navy);color:#fff}
@media (prefers-color-scheme:dark){.top{background:#141a2b}}
.brand{letter-spacing:.16em;font-size:15px}.top a{color:#fff;font-size:13px;opacity:.85}
main{max-width:640px;margin:0 auto;padding:16px 16px calc(96px + env(safe-area-inset-bottom))}
.pad{padding:16px}.muted{color:var(--sub);font-size:14px}.small{font-size:13px}.err{color:var(--err);font-size:14px}.ok{color:var(--ok);font-size:14px}
h1{font-size:20px;margin:4px 0 12px}h2{font-size:15px;margin:0 0 10px;color:var(--sub);font-weight:600}h3{font-size:16px;margin:0 0 6px}
.card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:16px;margin:0 0 14px}
.card.accent{border-top:3px solid var(--gold)}
.big{font-size:19px;font-weight:700;overflow-wrap:anywhere;margin:0 0 4px}
.pre{white-space:pre-wrap;overflow-wrap:anywhere}
label{display:block;font-size:14px;color:var(--sub);margin:12px 0 4px}
input,textarea,select{width:100%;font:inherit;color:inherit;background:var(--card);border:1px solid var(--line);border-radius:10px;padding:11px 12px;min-height:44px}
textarea{min-height:96px;resize:vertical}input[type=checkbox]{width:auto;min-height:0}
button,.btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;min-height:44px;padding:0 16px;border-radius:10px;border:0;background:var(--navy);color:#fff;font:inherit;font-weight:600;text-decoration:none;cursor:pointer}
@media (prefers-color-scheme:dark){button,.btn{color:#0f1218}}
button.sub,.btn.sub{background:transparent;color:var(--navy);border:1px solid var(--line)}
button.gold{background:var(--gold);color:#1a1405}button.danger{background:transparent;color:var(--err);border:1px solid var(--line)}
button:disabled{opacity:.5;cursor:default}
.row{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:12px}.row.end{justify-content:flex-end}
.between{display:flex;justify-content:space-between;align-items:center;gap:8px}
.chip{display:inline-block;font-size:12px;padding:2px 8px;border-radius:999px;background:var(--chip);color:var(--indigo);white-space:nowrap}
.chip.done{background:#e3f4ec;color:var(--ok)}.chip.warn{background:#fff1df;color:var(--warn)}.chip.gray{background:var(--line);color:var(--sub)}.chip.gold{background:#f8efd6;color:#7a5b00}
@media (prefers-color-scheme:dark){.chip.done{background:#173327}.chip.warn{background:#3a2a12}.chip.gold{background:#3a3115;color:var(--gold)}}
.list{list-style:none;margin:0;padding:0}.list>li{border-top:1px solid var(--line);padding:12px 0}.list>li:first-child{border-top:0;padding-top:4px}
.bar{height:8px;background:var(--line);border-radius:999px;overflow:hidden}.bar>i{display:block;height:100%;background:linear-gradient(90deg,var(--indigo),var(--gold))}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:10px}.stat{background:var(--bg);border-radius:10px;padding:10px}.stat b{display:block;font-size:20px}
.steps{counter-reset:s}.step{display:flex;gap:12px;align-items:center;padding:12px 0;border-top:1px solid var(--line);text-decoration:none;color:inherit}
.step:first-child{border-top:0}.num{flex:none;width:34px;height:34px;border-radius:50%;display:grid;place-items:center;font-weight:700;background:var(--chip);color:var(--indigo)}
.num.done{background:var(--gold);color:#1a1405}
.map{position:relative;padding-left:22px}.map:before{content:"";position:absolute;left:8px;top:6px;bottom:6px;width:2px;background:var(--line)}
.node{position:relative}.node:before{content:"";position:absolute;left:-19px;top:20px;width:12px;height:12px;border-radius:50%;background:var(--line);border:2px solid var(--card)}
.node.active:before{background:var(--indigo)}.node.achieved:before{background:var(--gold)}.node.hold:before{background:var(--warn)}
.subitem{border:1px dashed var(--line);border-radius:10px;padding:10px;margin-top:8px}
.tabs{position:fixed;left:0;right:0;bottom:0;z-index:5;display:grid;grid-template-columns:repeat(5,1fr);background:var(--card);border-top:1px solid var(--line);padding-bottom:env(safe-area-inset-bottom)}
.tabs a{display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:56px;font-size:11px;letter-spacing:.04em;color:var(--sub);text-decoration:none;font-weight:600}
.tabs a i{font-style:normal;font-size:18px;line-height:1.1}.tabs a[aria-current=page]{color:var(--navy)}
@media (prefers-color-scheme:dark){.tabs a[aria-current=page]{color:var(--gold)}}
.toast{position:fixed;left:50%;bottom:calc(72px + env(safe-area-inset-bottom));transform:translateX(-50%);background:var(--navy);color:#fff;padding:10px 16px;border-radius:999px;font-size:14px;z-index:9;max-width:90vw}
@media (prefers-color-scheme:dark){.toast{color:#0f1218}}
a{color:var(--indigo)}[hidden]{display:none!important}
.backlink{display:inline-block;margin:0 0 8px;font-size:14px}
`;
