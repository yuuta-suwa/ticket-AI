// Generates original DEAL HUNTER AI brand assets (no third-party/airline marks) with zero dependencies.
// node scripts/generate-assets.mjs
import { deflateSync, crc32 } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';

function png(w, h, px) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 4 + 1)] = 0; px.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4); }
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc32(td) >>> 0); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
const NAVY = [11, 18, 32], DEEP = [20, 33, 61], TEAL = [25, 211, 162], WHITE = [245, 248, 255];

/** Brand mark: target ring + downward "price drop" chevron. Coordinates normalised to the mark box (0..1). */
function markCoverage(u, v) {
  const dx = u - 0.5, dy = v - 0.5, r = Math.hypot(dx, dy);
  const ring = r < 0.5 && r > 0.4 ? 1 : 0;
  // downward arrow: stem + chevron head whose arms rise outward from the tip
  const tip = 0.2;
  const head = dy > tip - 0.24 && dy < tip + 0.035 && Math.abs(Math.abs(dx) - (tip - dy)) < 0.048;
  const stem = Math.abs(dx) < 0.045 && dy > -0.26 && dy < tip ? 1 : 0;
  const inChevron = head;
  const tick = r < 0.5 && r > 0.4 && Math.abs(dy) < 0.02 && dx < 0 ? 0 : 1; // small gap on the left of the ring
  return { ring: ring && tick, glyph: inChevron || stem };
}
function render(w, h, { bg, markBox, markColors, transparentBg = false }) {
  const px = Buffer.alloc(w * h * 4);
  const SS = 2;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let r = 0, g = 0, b = 0, a = 0;
    for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
      const fx = x + (sx + 0.5) / SS, fy = y + (sy + 0.5) / SS;
      let col = transparentBg ? [0, 0, 0] : mix(DEEP, NAVY, Math.min(1, (fx / w + fy / h) / 2)); let al = transparentBg ? 0 : 1;
      if (bg === 'flat') { col = NAVY; al = 1; }
      const u = (fx - markBox.x) / markBox.s, v = (fy - markBox.y) / markBox.s;
      if (u >= 0 && u <= 1 && v >= 0 && v <= 1) {
        const m = markCoverage(u, v);
        if (m.ring) { col = markColors.ring; al = 1; }
        if (m.glyph) { col = markColors.glyph; al = 1; }
      }
      r += col[0]; g += col[1]; b += col[2]; a += al;
    }
    const i = (y * w + x) * 4, n = SS * SS;
    px[i] = r / n; px[i + 1] = g / n; px[i + 2] = b / n; px[i + 3] = Math.round((a / n) * 255);
  }
  return png(w, h, px);
}
const out = (p, buf) => { mkdirSync(p.split('/').slice(0, -1).join('/'), { recursive: true }); writeFileSync(p, buf); console.log('wrote', p, buf.length); };
const colors = { ring: TEAL, glyph: WHITE };
const S = 1024;
const icon = render(S, S, { markBox: { x: S * 0.17, y: S * 0.17, s: S * 0.66 }, markColors: colors });
out('apps/mobile/assets/icon.png', icon);
out('store-assets/common/app-icon-1024.png', icon);
out('apps/mobile/assets/adaptive-icon.png', render(S, S, { transparentBg: true, markBox: { x: S * 0.22, y: S * 0.22, s: S * 0.56 }, markColors: colors }));
out('apps/mobile/assets/splash-icon.png', render(S, S, { transparentBg: true, markBox: { x: S * 0.2, y: S * 0.2, s: S * 0.6 }, markColors: colors }));
out('apps/mobile/assets/notification-icon.png', render(96, 96, { transparentBg: true, markBox: { x: 8, y: 8, s: 80 }, markColors: { ring: WHITE, glyph: WHITE } }));
out('apps/web/public/favicon.png', render(64, 64, { markBox: { x: 6, y: 6, s: 52 }, markColors: colors }));
out('store-assets/android/feature-graphic-1024x500.png', render(1024, 500, { markBox: { x: 1024 / 2 - 190, y: 60, s: 380 }, markColors: colors }));
