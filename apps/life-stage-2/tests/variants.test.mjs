// 2アプリ（統合版 / 全メンバー版）の受入テスト。
// 実行: node apps/life-stage-2/tests/variants.test.mjs   （Playwright と Chromium が必要）
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { build, CORE_MARKERS } from "../build.mjs";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SHOTS = process.env.SHOTS || "";
let fail = 0;
const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fail++; };

// ---- 1. ビルドと配信物の静的検査 ----
const res = build({ quiet: true });
const read = v => res[v].files.map(f => fs.readFileSync(path.join(res[v].dir, f), "utf8")).join("\n");
const A = read("integrated"), B = read("members");
ok(CORE_MARKERS.every(m => !B.includes(m)), "members build contains no core markers/content");
ok(A.includes("homeCore") && A.includes("DAY 1–30"), "integrated build contains the core section");
for (const [n, t] of [["integrated", A], ["members", B]]) {
  ok(!/supabase|signIn|auth\/v1|rest\/v1|service_role|sb_publishable|eyJ[A-Za-z0-9_-]{20,}/i.test(t), `${n}: no auth/DB client, keys or tokens in shipped files`);
  ok(/connect-src 'self'/.test(t), `${n}: CSP allows network only to its own origin`);
}
ok(!fs.existsSync(path.join(res.members.dir, "app.js.map")), "members: no source maps shipped");

// ---- 静的サーバー：/integrated/ と /members/ を同じ origin で配信（GitHub Pages と同じ条件） ----
const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".webmanifest": "application/manifest+json", ".svg": "image/svg+xml", ".json": "application/json" };
const server = http.createServer((req, rsp) => {
  const u = new URL(req.url, "http://x"); let p = path.join(ROOT, "dist", decodeURIComponent(u.pathname));
  if (!p.startsWith(path.join(ROOT, "dist"))) { rsp.writeHead(403).end(); return; }
  if (p.endsWith("/")) p += "index.html";
  fs.readFile(p, (e, buf) => { if (e) { rsp.writeHead(404).end("not found"); return; } rsp.writeHead(200, { "content-type": types[path.extname(p)] || "application/octet-stream" }).end(buf); });
});
await new Promise(r => server.listen(0, r));
const BASE = `http://localhost:${server.address().port}`;
const browser = await chromium.launch();

async function open(ctx, v, q = "") {
  const p = await ctx.newPage(); p.errors = []; p.requests = [];
  p.on("pageerror", e => p.errors.push(e.message)); p.on("dialog", d => d.accept());
  p.on("request", r => p.requests.push(r.url()));
  await p.goto(`${BASE}/${v}/${q}`); return p;
}
const skipIntro = async p => { if (await p.$(".intro .skip")) await p.click(".intro .skip"); };
async function answerFirst(p, text) {
  await p.click('[data-tab="journey"]'); await p.click('[data-act="openStage"][data-arg="s1"]');
  await p.fill('textarea[data-bind="all.answers.s1.0"]', text); await p.waitForTimeout(700);
}

try {
  // ---- 2. 統合版：ログインなしで開始、コアも利用可能 ----
  const ctx = await browser.newContext({ viewport: { width: 360, height: 780 }, acceptDownloads: true });
  let a = await open(ctx, "integrated");
  ok(!(await a.$("#email")) && !(await a.$('input[type="password"]')), "integrated: no login/password form");
  ok(await a.isVisible(".intro"), "integrated: opening shown on first visit");
  ok((await a.textContent(".intro")).includes("この端末・ブラウザに保存されます"), "integrated: first-run storage notice");
  await skipIntro(a);
  ok(await a.isVisible("#courseBar"), "integrated: course switch (all/core) visible");
  await answerFirst(a, "統合版の回答AAA");
  await a.click('[data-act="stepNext"]'); await a.click('[data-act="stepNext"]'); await a.click('[data-act="stepNext"]');
  await a.click('[data-act="approve"]'); await a.waitForTimeout(600);
  await a.click('[data-course="core"]');
  ok((await a.textContent("#app")).includes("DAY 1"), "integrated: core home (DAY x / 90) works");
  await a.click('[data-tab="journey"]'); await a.click('[data-act="coreTab"][data-arg="goal"]'); await a.click('[data-act="addKpi"]');
  await a.fill('[data-bind="core.kpis.0.name"]', "面談数"); await a.fill('[data-bind="core.kpis.0.base"]', "5");
  await a.fill('[data-bind="core.kpis.0.target"]', "20"); await a.fill('[data-bind="core.kpis.0.cur"]', "11");
  ok((await a.textContent("#kpi-0")).includes("40%"), "integrated: KPI progress computed (40%)");
  await a.click('[data-act="coreTab"][data-arg="log"]'); await a.fill("#lg-hyp", "質問が浅い"); await a.click('[data-act="addLog"]'); await a.waitForTimeout(600);
  await a.reload(); await skipIntro(a);
  ok((await a.textContent("#app")).includes("質問が浅い"), "integrated: core log persists after reload");
  await a.click('[data-course="all"]'); await a.click('[data-tab="book"]');
  ok((await a.textContent("#app")).includes("統合版の回答AAA"), "integrated: answer → approve → book persists after reload");
  ok((await a.textContent('[data-act="print"]')).includes("印刷／PDF保存"), "integrated: book export labelled 印刷／PDF保存");
  ok(await a.evaluate(() => document.documentElement.scrollWidth <= 360), "integrated: no horizontal scroll at 360px");
  // バックアップ書き出し
  await a.click('[data-tab="me"]');
  const [dl] = await Promise.all([a.waitForEvent("download"), a.click('[data-act="export"]')]);
  const backupA = JSON.parse(fs.readFileSync(await dl.path(), "utf8"));
  ok(backupA.schemaVersion === 1 && backupA.appVariant === "integrated" && backupA.exportedAt && backupA.workIds?.stages?.length === 7 && backupA.data?.core?.kpis?.length === 1, "integrated: backup has schemaVersion/appVariant/exportedAt/workIds and core");

  // ---- 3. 全メンバー版：コアが一切出ない、切替不可 ----
  let b = await open(ctx, "members", "?course=core&variant=integrated#core");
  await skipIntro(b);
  ok(!(await b.$("#courseBar")) && !(await b.$('[data-course]')), "members: no course switch / core tab");
  const bText = async () => (await b.textContent("body"));
  ok(!/コアメンバー|DAY 1|KPI|90日プログラム/.test(await bText()), "members: no core text, guidance or link on home");
  await b.evaluate(() => localStorage.setItem("life-stage2:members:v1:ui", JSON.stringify({ course: "core", tab: "journey", view: "core:goal", seenIntro: true })));
  await b.reload();
  ok(!/コアメンバー|DAY 1|KPI|実践ログ/.test(await bText()), "members: localStorage/URL tampering cannot open core");
  for (const t of ["home", "journey", "ai", "book", "me"]) { await b.click(`[data-tab="${t}"]`); if (/コアメンバー|DAY 1–30|実践ログ|KPI/.test(await bText())) { ok(false, `members: core text on ${t}`); } }
  ok(true, "members: all 5 tabs free of core content");
  await answerFirst(b, "全メンバー版の回答BBB");
  await b.reload(); await skipIntro(b);
  await b.click('[data-tab="journey"]'); await b.click('[data-act="openStage"][data-arg="s1"]');
  await b.click('[data-act="stepPrev"]').catch(() => {});
  const bVal = await b.$eval('textarea[data-bind="all.answers.s1.0"]', e => e.value).catch(() => "");
  ok(bVal === "全メンバー版の回答BBB", "members: answer persists after reload / resume");
  // A と B が混ざらない（同じ origin・別キー）
  a = await open(ctx, "integrated"); await skipIntro(a);
  await a.click('[data-tab="journey"]'); await a.click('[data-act="openStage"][data-arg="s1"]');
  ok(!(await a.textContent("#app")).includes("BBB"), "integrated and members records do not mix");
  const keys = await a.evaluate(() => Object.keys(localStorage).sort());
  ok(keys.includes("life-stage2:integrated:v1") && keys.includes("life-stage2:members:v1"), "separate storage keys per app");
  ok(b.requests.concat(a.requests).every(u => u.startsWith(BASE)), "no request leaves the app's own origin (no auth/DB calls)");

  // ---- 4. 復元：A→B はコア除外、B→A はAのコアを保持、不正形式は拒否 ----
  const tmp = fs.mkdtempSync(path.join(process.env.TMPDIR || "/tmp", "ls2-"));
  const fA = path.join(tmp, "a.json"); fs.writeFileSync(fA, JSON.stringify(backupA));
  await b.click('[data-tab="me"]'); await b.setInputFiles("#imp", fA); await b.waitForSelector(".dlg");
  ok((await b.textContent(".dlg")).includes("コア記録は、このアプリでは使わないため取り込みません"), "members restore: preview says core records are excluded");
  ok((await b.textContent(".dlg")).includes("置き換え"), "members restore: preview shows impact on existing records");
  await b.click('[data-act="impOk"]'); await b.waitForTimeout(600);
  const bDoc = await b.evaluate(() => JSON.parse(localStorage.getItem("life-stage2:members:v1")));
  ok(bDoc.all.answers.s1["0"] === "統合版の回答AAA" && !("core" in bDoc), "members restore: common records imported, no core stored");
  await b.click('[data-tab="me"]');
  const [dlB] = await Promise.all([b.waitForEvent("download"), b.click('[data-act="export"]')]);
  const backupB = JSON.parse(fs.readFileSync(await dlB.path(), "utf8"));
  ok(backupB.appVariant === "members" && !("core" in backupB.data), "members backup contains no core");
  backupB.data.all.answers.s1["0"] = "Bから戻した回答"; const fB = path.join(tmp, "b.json"); fs.writeFileSync(fB, JSON.stringify(backupB));
  await a.click('[data-tab="me"]'); await a.setInputFiles("#imp", fB); await a.waitForSelector(".dlg");
  ok((await a.textContent(".dlg")).includes("コアの現在の記録はそのまま残ります"), "integrated restore from members: preview says core is kept");
  await a.click('[data-act="impOk"]'); await a.waitForTimeout(600); await a.click('[data-tab="me"]');
  const aDoc = await a.evaluate(() => JSON.parse(localStorage.getItem("life-stage2:integrated:v1")));
  ok(aDoc.all.answers.s1["0"] === "Bから戻した回答" && aDoc.core.kpis.length === 1 && aDoc.core.logs.length === 1, "integrated restore from members: common replaced, core kept");
  for (const [name, body, expect] of [["broken", "{not json", "JSON形式ではありません"], ["future", JSON.stringify({ schemaVersion: 99, data: {} }), "新しい版"], ["foreign", JSON.stringify({ hello: 1 }), "バックアップではありません"]]) {
    const f = path.join(tmp, name + ".json"); fs.writeFileSync(f, body);
    await a.setInputFiles("#imp", f); await a.waitForTimeout(300);
    ok(!(await a.$(".dlg")) && (await a.textContent("#toast")).includes(expect), `restore rejects ${name} file safely`);
  }
  await a.click('[data-tab="me"]');
  const before = await a.evaluate(() => localStorage.getItem("life-stage2:integrated:v1"));
  await a.setInputFiles("#imp", fA); await a.waitForSelector(".dlg"); await a.click('[data-act="impCancel"]');
  ok((await a.evaluate(() => localStorage.getItem("life-stage2:integrated:v1"))) === before, "restore cancel leaves records untouched");

  // ---- 5. 保存できない時：成功表示をせず、入力を失わない ----
  const c2 = await browser.newContext({ viewport: { width: 360, height: 780 } });
  const f2 = await open(c2, "members"); await skipIntro(f2);
  await f2.evaluate(() => { Storage.prototype.setItem = function () { throw new DOMException("full", "QuotaExceededError"); }; });
  await answerFirst(f2, "保存できない入力");
  ok((await f2.textContent("#save")).includes("保存できません"), "storage failure: status shows 保存できません (no false 保存済み)");
  ok((await f2.$eval('textarea[data-bind="all.answers.s1.0"]', e => e.value)) === "保存できない入力", "storage failure: typed input is kept on screen");
  await f2.click('[data-tab="me"]'); await f2.click('[data-tab="journey"]'); await f2.click('[data-act="openStage"][data-arg="s1"]');
  ok((await f2.$eval('textarea[data-bind="all.answers.s1.0"]', e => e.value)) === "保存できない入力", "storage failure: input survives navigation (kept in memory)");

  // ---- 6. 別ブラウザ（新しいプロファイル）には記録が出ない／旧認証URLは処理しない ----
  const c3 = await browser.newContext();
  const fresh = await open(c3, "integrated", "?code=abc123&type=magiclink#access_token=x");
  await skipIntro(fresh);
  ok(!(await fresh.textContent("body")).includes("AAA") && !(await fresh.textContent("body")).includes("BBB"), "new browser profile shows no one's records");
  ok(!fresh.url().includes("code=") && !fresh.url().includes("access_token"), "old auth callback params are stripped, not processed");
  ok(fresh.requests.every(u => u.startsWith(BASE)), "auth callback URL triggers no external request");
  // 削除はこのアプリの記録だけ
  await a.click('[data-tab="home"]'); await a.click('[data-tab="me"]'); await a.click('[data-act="wipe"]'); await a.waitForTimeout(300);
  const left = await a.evaluate(() => Object.keys(localStorage));
  ok(!left.includes("life-stage2:integrated:v1") && left.includes("life-stage2:members:v1"), "wipe deletes only this app's records");

  if (SHOTS) {
    const s = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
    for (const v of ["integrated", "members"]) { const p = await open(s, v); await skipIntro(p); await p.screenshot({ path: path.join(SHOTS, `${v}-home.png`) }); await p.click('[data-tab="me"]'); await p.screenshot({ path: path.join(SHOTS, `${v}-settings.png`) }); }
  }
  const errs = [a, b, f2, fresh].flatMap(p => p.errors);
  ok(errs.length === 0, "no page errors" + (errs.length ? ": " + errs.join(" | ") : ""));
} finally {
  await browser.close(); server.close();
}
console.log(fail ? `${fail} FAILED` : "ALL PASSED"); process.exit(fail ? 1 : 0);
