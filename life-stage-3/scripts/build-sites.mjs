import assert from 'node:assert/strict';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = fileURLToPath(new URL('../', import.meta.url));
const at = (path) => new URL(path, new URL('../', import.meta.url));
const manifestText = await readFile(at('.openai/hosting.json'), 'utf8');
const manifest = JSON.parse(manifestText);
assert.ok(manifest.project_id, 'Sites must assign project_id before building.');
assert.equal(manifest.d1, 'DB');
assert.equal(manifest.r2, 'FILES');
assert.equal(manifest.static, undefined, 'This is a Worker application.');

await rm(at('dist/'), { recursive: true, force: true });
await mkdir(at('dist/server/'), { recursive: true });
await mkdir(at('dist/.openai/drizzle/meta/'), { recursive: true });

const result = await build({
  absWorkingDir: root,
  entryPoints: ['src/adapters/sites/worker.ts'],
  outfile: 'dist/server/index.js',
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  metafile: true,
  logLevel: 'info',
});
assert.ok(Object.values(result.metafile.outputs).every((output) => output.imports.length === 0),
  'The Worker must not depend on unresolved runtime imports.');
await writeFile(at('dist/.openai/hosting.json'), manifestText);

// Preserve the authored migration; add only Sites' Drizzle packaging metadata.
// Its current schema contains no semicolons inside SQL literals or triggers.
const sql = await readFile(at('migrations/0001_gate0.sql'), 'utf8');
const statements = sql.trim().split(/;\s*(?:\r?\n|$)/).map((part) => part.trim()).filter(Boolean);
assert.equal(statements.length, 10, 'Review the migration packaging when the schema changes.');
await writeFile(at('dist/.openai/drizzle/0001_gate0.sql'),
  `${statements.map((statement) => `${statement};`).join('\n--> statement-breakpoint\n')}\n`);
await writeFile(at('dist/.openai/drizzle/meta/_journal.json'), `${JSON.stringify({
  version: '7',
  dialect: 'sqlite',
  entries: [{ idx: 0, version: '6', when: Date.parse('2026-11-06T00:00:00Z'), tag: '0001_gate0', breakpoints: true }],
}, null, 2)}\n`);

const workerSource = await readFile(at('dist/server/index.js'), 'utf8');
const worker = await import(`data:text/javascript;base64,${Buffer.from(workerSource).toString('base64')}`);
assert.equal(typeof worker.default?.fetch, 'function');
console.log('Built Sites Worker and packaged Gate-0 migration. No deployment was performed.');
