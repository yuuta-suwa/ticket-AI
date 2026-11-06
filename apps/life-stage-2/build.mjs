// LIFE STAGE 2.0 ビルド：共通ソース(src/)から 2 つの独立アプリを dist/ に出力する。
//   node build.mjs            → dist/integrated/（統合版）と dist/members/（全メンバー版）
// 依存パッケージなし（Node 18+）。
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(ROOT, "src");
const DIST = path.join(ROOT, "dist");
const VARIANTS = {
  integrated: { core: true, title: "LIFE STAGE 2.0", name: "LIFE STAGE 2.0 統合版", short: "LIFE STAGE", id: "life-stage2-integrated",
    description: "LIFE STAGE 2.0 ワーク（全メンバー向け＋コアメンバー向け）", cache: "ls2-integrated-" },
  members: { core: false, title: "LIFE STAGE 2.0 全メンバー版", name: "LIFE STAGE 2.0 全メンバー版", short: "LIFE STAGE 全", id: "life-stage2-members",
    description: "LIFE STAGE 2.0 ワーク（全メンバー向け）", cache: "ls2-members-" },
};
// 全メンバー版に含まれてはいけない文字列（コア教材・コア画面の目印）
export const CORE_MARKERS = ["@core-", "DAY 1–30", "現状診断", "模擬指導", "実践ログ", "個人KPI", "コアメンバー向け", "CORE 90 DAYS", "homeCore", "journeyCore", "PHASES", "blankCore", "kpiCalc", "data-course"];

const JS_BLOCK = /^[ \t]*\/\/@core-begin[\s\S]*?^[ \t]*\/\/@core-end[ \t]*\n?/gm;
const HTML_BLOCK = /^[ \t]*<!--@core-begin-->[\s\S]*?^[ \t]*<!--@core-end-->[ \t]*\n?/gm;
const MARK_LINE = /^[ \t]*(\/\/@core-(begin|end)|<!--@core-(begin|end)-->)[ \t]*\n/gm;

function transform(text, v, conf, build) {
  let out = conf.core ? text.replace(MARK_LINE, "") : text.replace(JS_BLOCK, "").replace(HTML_BLOCK, "");
  return out.replaceAll("__VARIANT__", v).replaceAll("__BUILD__", build).replaceAll("__TITLE__", conf.title)
    .replaceAll("__DESCRIPTION__", conf.description).replaceAll("__APPNAME__", conf.name).replaceAll("__CACHE_PREFIX__", conf.cache);
}

export function build({ quiet = false } = {}) {
  const files = ["index.html", "app.js", "sw.js", "icon.svg"];
  const src = Object.fromEntries(files.map(f => [f, fs.readFileSync(path.join(SRC, f), "utf8")]));
  const hash = crypto.createHash("sha256").update(files.map(f => src[f]).join("\0")).digest("hex").slice(0, 10);
  const results = {};
  for (const [v, conf] of Object.entries(VARIANTS)) {
    const out = path.join(DIST, v);
    fs.rmSync(out, { recursive: true, force: true });
    fs.mkdirSync(out, { recursive: true });
    for (const f of files) fs.writeFileSync(path.join(out, f), f === "icon.svg" ? src[f] : transform(src[f], v, conf, hash));
    fs.writeFileSync(path.join(out, "manifest.webmanifest"), JSON.stringify({
      id: conf.id, name: conf.name, short_name: conf.short, start_url: "./", scope: "./", display: "standalone",
      background_color: "#101A2E", theme_color: "#101A2E", lang: "ja",
      icons: [{ src: "icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any maskable" }],
    }, null, 2));
    // 検査：全メンバー版にコアの目印が残っていないこと／統合版にコアがあること
    const all = fs.readdirSync(out).map(f => fs.readFileSync(path.join(out, f), "utf8")).join("\n");
    const found = CORE_MARKERS.filter(m => all.includes(m));
    if (!conf.core && found.length) throw new Error(`members build contains core markers: ${found.join(", ")}`);
    if (conf.core && !all.includes("homeCore")) throw new Error("integrated build is missing the core section");
    if (/__[A-Z_]+__/.test(all)) throw new Error(`${v}: unreplaced placeholder`);
    results[v] = { dir: out, files: fs.readdirSync(out), build: hash };
    if (!quiet) console.log(`built ${v} → ${path.relative(ROOT, out)} (${results[v].files.join(", ")}) build=${hash}`);
  }
  return results;
}
if (process.argv[1] === fileURLToPath(import.meta.url)) build();
