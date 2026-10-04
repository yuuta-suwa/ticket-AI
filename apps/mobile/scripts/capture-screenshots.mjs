// Renders the demo-data web export in Chromium at App Store 6.7" size (1290x2796) to produce store-screenshot CANDIDATES.
// Usage: EXPO_PUBLIC_DEMO_MODE=true EXPO_PUBLIC_APP_ENV=preview npx expo export --platform web --output-dir dist-demo
//        node scripts/capture-screenshots.mjs dist-demo ../../store-assets/screenshots
import { createServer } from 'node:http';
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { createRequire } from 'node:module';

const dist = resolve(process.argv[2] ?? 'dist-demo'); const out = resolve(process.argv[3] ?? '../../store-assets/screenshots');
const require = createRequire(import.meta.url);
let chromium; for (const p of ['playwright', 'playwright-core', '/opt/node-tools/node_modules/playwright']) { try { ({ chromium } = require(p)); break; } catch { /* try next */ } }
if (!chromium) throw new Error('playwright not found: npm i -D playwright-core');
mkdirSync(out, { recursive: true });
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.ico': 'image/x-icon', '.ttf': 'font/ttf', '.css': 'text/css' };
const server = createServer((req, res) => {
  const p = join(dist, decodeURIComponent((req.url ?? '/').split('?')[0]));
  const file = existsSync(p) && !p.endsWith('/') && extname(p) ? p : join(dist, 'index.html');
  res.writeHead(200, { 'Content-Type': MIME[extname(file)] ?? 'application/octet-stream' }); res.end(readFileSync(file));
}).listen(0);
const port = server.address().port;

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? undefined, args: ['--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 430, height: 932 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, colorScheme: 'light' });
const page = await ctx.newPage();
const shot = async (name) => { await page.waitForTimeout(500); await page.screenshot({ path: join(out, `${name}.png`) }); console.log('captured', name); };

await page.goto(`http://localhost:${port}/`);
await page.getByPlaceholder('Email address').fill('reviewer@example.com');
await page.getByText('Email me a sign-in code').click();
await page.getByPlaceholder('6-digit code').fill('000000');
await page.getByText('Verify and continue').click();
await page.getByText('Find your next deal').waitFor({ timeout: 30000 });
await page.getByText('Latest deals').first().waitFor({ timeout: 30000 });
await shot('01-home');
// Extreme deal detail
const extreme = page.getByText('EXTREME DEAL').first();
await page.getByLabel(/EXTREME|BUY|WAIT|WATCH/).first().click().catch(() => {});
await page.getByText(/Why (BUY|WAIT|WATCH)\?/).waitFor({ timeout: 20000 });
await shot('03-extreme-deal');
await page.getByText('Price forecast').scrollIntoViewIfNeeded(); await shot('04-price-forecast');
await page.getByText('Check latest price').scrollIntoViewIfNeeded(); await shot('05-buy-now-revalidate');
await page.getByText('Check latest price').click(); await page.getByText(/Continue to the seller/).waitFor({ timeout: 20000 }); await shot('05b-buy-now-confirmed');
await page.getByText('Add to watchlist').click(); await page.waitForTimeout(400);
await page.goBack().catch(() => {});
await page.getByText('SEARCH', { exact: true }).click(); await page.getByText('Search flights').first().waitFor();
await shot('02-search');
await page.getByText('Search', { exact: true }).last().click().catch(() => {}); await page.getByText(/\d+ results/).waitFor({ timeout: 20000 }); await shot('02b-search-results');
await page.getByText('WATCH', { exact: true }).first().click(); await page.getByText('Watchlist').first().waitFor(); await shot('06-watchlist');
await browser.close(); server.close(); void extreme;
