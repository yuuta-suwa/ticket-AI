// LIFE STAGE 2.0 全メンバー版 用 Service Worker（画面ファイルのみキャッシュ。記録は端末内ストレージにあり、ここでは扱わない）
const PREFIX = "ls2-members-";
const CACHE = PREFIX + "ee7b2280eb";
const ASSETS = ["./", "index.html", "app.js", "manifest.webmanifest", "icon.svg"];
// 同じ origin 上の別アプリ（全メンバー版・旧版・プレビュー）には関与しない
const SCOPE = new URL(self.registration.scope).pathname;
const OTHER_APPS = ["members/", "legacy/", "preview/"].map(p => SCOPE + p);
self.addEventListener("install", e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS))); self.skipWaiting(); });
self.addEventListener("activate", e => {
  // 自分の古いキャッシュと旧ログイン版のルート用画面キャッシュ(ls2-vN)だけを削除する（記録は消えない）
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => (k.startsWith(PREFIX) && k !== CACHE) || /^ls2-v\d+$/.test(k)).map(k => caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener("fetch", e => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET" || u.origin !== location.origin) return;
  if (!u.pathname.startsWith(SCOPE) || OTHER_APPS.some(p => u.pathname.startsWith(p))) return;
  e.respondWith(fetch(e.request).then(r => { if (r.ok) { const cp = r.clone(); caches.open(CACHE).then(c => c.put(e.request, cp)); } return r; })
    .catch(() => caches.match(e.request, { ignoreSearch: true })));
});
