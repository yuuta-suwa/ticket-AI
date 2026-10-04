// Bundles the pure domain logic (packages/core + config + types) into a single ESM file for Deno Edge Functions,
// so the SAME engines run on server and in the app. Output is generated (gitignored).
import { build } from 'esbuild';
await build({
  entryPoints: ['packages/core/src/index.ts'],
  outfile: 'supabase/functions/_shared/core.mjs',
  bundle: true, format: 'esm', platform: 'neutral', target: 'es2022', mainFields: ['module', 'main'],
});
console.log('built supabase/functions/_shared/core.mjs');
