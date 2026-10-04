import { describe, expect, it } from 'vitest';
import { execSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './harness';

const tracked = execSync('git ls-files --cached --others --exclude-standard', { cwd: ROOT, encoding: 'utf8' }).split('\n').filter(Boolean)
  .filter((f) => existsSync(join(ROOT, f)));
const text = (f: string) => readFileSync(join(ROOT, f), 'utf8');
const code = tracked.filter((f) => /\.(ts|tsx|js|jsx|mjs|cjs|json)$/.test(f) && !f.includes('pnpm-lock') && !f.startsWith('tests/'));
const clientCode = code.filter((f) => (f.startsWith('apps/mobile/') && !f.includes('scripts/')) || f.startsWith('packages/') );
const SERVER_ONLY = ['SUPABASE_SERVICE_ROLE_KEY', 'OPENAI_API_KEY', 'DUFFEL_API_KEY', 'SKYSCANNER_API_KEY', 'REVENUECAT_WEBHOOK_AUTH', 'REVENUECAT_SECRET_API_KEY', 'EXPO_ACCESS_TOKEN', 'CRON_SECRET'];

describe('secret exposure', () => {
  it('server-only variable names never appear in client bundles (mobile app, shared packages)', () => {
    const hits = clientCode.flatMap((f) => SERVER_ONLY.filter((s) => text(f).includes(s)).map((s) => `${f}: ${s}`));
    expect(hits).toEqual([]);
  });
  it('server-only variable names are not read in web client components', () => {
    const web = code.filter((f) => f.startsWith('apps/web/') && !f.includes('/server/') && !/\/route\.ts$/.test(f));
    const hits = web.flatMap((f) => (/^['"]use client['"]/m.test(text(f)) ? SERVER_ONLY.filter((s) => text(f).includes(s)).map((s) => `${f}: ${s}`) : []));
    expect(hits).toEqual([]);
  });
  it('no public env var carries a secret-looking name', () => {
    const hits = tracked.filter((f) => !f.endsWith('.lock') && !f.includes('pnpm-lock')).flatMap((f) => (text(f).match(/(?:EXPO_PUBLIC|NEXT_PUBLIC)_[A-Z0-9_]*(?:SECRET|SERVICE_ROLE|PRIVATE|WEBHOOK|PASSWORD)[A-Z0-9_]*/g) ?? []).map((m) => `${f}: ${m}`)).filter((h) => !h.startsWith('tests/'));
    expect(hits).toEqual([]);
  });
  it('no committed credentials (key/JWT/private-key patterns)', () => {
    const patterns = [/sk-[A-Za-z0-9]{32,}/, /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/, /-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/, /AKIA[0-9A-Z]{16}/, /appl_[A-Za-z0-9]{20,}/, /goog_[A-Za-z0-9]{20,}/];
    const hits = tracked.filter((f) => !/\.(png|lock|mjs)$/.test(f) && !f.includes('pnpm-lock') && !f.startsWith('tests/')).flatMap((f) => patterns.filter((p) => p.test(text(f))).map((p) => `${f}: ${p}`));
    expect(hits).toEqual([]);
  });
  it('.env files and signing material are not tracked; .env.example holds names only', () => {
    expect(tracked.filter((f) => /(^|\/)\.env(\.|$)/.test(f) && !f.endsWith('.env.example'))).toEqual([]);
    expect(tracked.filter((f) => /\.(p8|p12|jks|keystore)$|google-service-account/.test(f))).toEqual([]);
    for (const line of text('.env.example').split('\n').filter((l) => /^[A-Z_]+=/.test(l))) expect(line.split('=')[1]).toMatch(/^(mock)?$/);
  });
});

describe('product rules', () => {
  const mobile = code.filter((f) => f.startsWith('apps/mobile/') && /\.(ts|tsx)$/.test(f));
  it('no hard-coded subscription prices in app code', () => {
    const hits = mobile.filter((f) => /[$¥€£]\s?\d+[.,]\d{2}/.test(text(f)) && !f.includes('fake'));
    expect(hits).toEqual([]);
  });
  it('no hard-coded premium user / admin email', () => {
    const hits = [...mobile, ...code.filter((f) => f.startsWith('supabase/') || f.startsWith('apps/web/'))].filter((f) => /['"][\w.+-]+@(gmail|yahoo|outlook|icloud)\.[a-z]+['"]/i.test(text(f)));
    expect(hits).toEqual([]);
  });
  it('authorisation never reads user_metadata / app_metadata (comments excluded)', () => {
    const strip = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/.*$/gm, '').replace(/--.*$/gm, '');
    const hits = code.concat(tracked.filter((f) => f.endsWith('.sql'))).filter((f) => /user_metadata|raw_user_meta_data|app_metadata/.test(strip(text(f))));
    expect(hits).toEqual([]);
  });
  it('production EAS profile cannot enable demo mode; demo flag is blocked in production at runtime', () => {
    const eas = JSON.parse(text('apps/mobile/eas.json'));
    expect(eas.build.production.env?.EXPO_PUBLIC_DEMO_MODE).toBeUndefined();
    expect(eas.build.base.env.EXPO_PUBLIC_APP_ENV).toBe('production');
    expect(text('apps/mobile/src/lib/env.ts')).toMatch(/demoMode:.*&&\s*appEnv !== 'production'/);
  });
  it('privacy-first permissions: location/camera/mic/contacts/photos blocked, no ATT prompt', () => {
    const cfg = text('apps/mobile/app.config.js');
    for (const p of ['ACCESS_FINE_LOCATION', 'CAMERA', 'RECORD_AUDIO', 'READ_CONTACTS', 'READ_MEDIA_IMAGES', 'AD_ID']) expect(cfg).toContain(p);
    expect(cfg).toMatch(/NSPrivacyTracking: false/); expect(cfg).toMatch(/userTrackingPermission: false/);
    expect(cfg).not.toMatch(/NSUserTrackingUsageDescription|NSLocation|NSCamera|NSMicrophone|NSContacts|NSPhotoLibrary/);
  });
  it('ads are always requested non-personalised', () => { expect(text('apps/mobile/src/ui/AdSlot.tsx')).toContain('requestNonPersonalizedAdsOnly: true'); });
  it('permissions are requested on demand, not at launch', () => {
    const root = text('apps/mobile/app/_layout.tsx') + text('apps/mobile/src/providers/AppProvider.tsx');
    expect(root).not.toMatch(/requestPermissionsAsync|enablePush\(/);
  });
  it('tokens are stored in SecureStore, never AsyncStorage', () => {
    expect(text('apps/mobile/src/lib/supabase.ts')).toContain('storage: secureStorage');
    expect(text('apps/mobile/src/lib/storage.ts')).toMatch(/Non-sensitive cache/);
  });
  it('LLM is not used for prediction: forecast/decision/anomaly modules import no AI client', () => {
    for (const f of ['forecast', 'decision', 'anomaly']) expect(text(`packages/core/src/${f}.ts`)).not.toMatch(/openai|anthropic|fetch\(/i);
  });
  it('store identity lives in exactly one place', () => {
    const ids = code.filter((f) => /ai\.dealhunter\.app/.test(text(f)));
    expect(ids).toEqual(['packages/config/identity.cjs']);
  });
});
