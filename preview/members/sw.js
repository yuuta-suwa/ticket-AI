// 旧プレビュー用：自分を登録解除し、全メンバー版プレビューのキャッシュを消す
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith("ls2-members-")).map(k => caches.delete(k)))).then(() => self.registration.unregister())); });
