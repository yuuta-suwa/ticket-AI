import assert from 'node:assert/strict';
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
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

await import('./gen-client.mjs'); // 画面のバンドルを先に生成
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

// Preserve the authored migrations; add only Sites' Drizzle packaging metadata.
// 0001_gate0 must stay byte-identical to what was already deployed (Sites tracks applied migrations).
// Migrations must not contain semicolons inside SQL literals, comments or triggers.
const migrationFiles = (await readdir(at('migrations/'))).filter((f) => /^\d{4}_[a-z0-9_]+\.sql$/.test(f)).sort();
assert.ok(migrationFiles.length >= 1 && migrationFiles[0] === '0001_gate0.sql', 'Migrations must start with 0001_gate0.sql');
const entries = [];
for (const [idx, file] of migrationFiles.entries()) {
  const tag = file.replace(/\.sql$/, '');
  const sql = await readFile(at(`migrations/${file}`), 'utf8');
  const statements = sql.trim().split(/;\s*(?:\r?\n|$)/).map((part) => part.trim()).filter(Boolean);
  if (tag === '0001_gate0') assert.equal(statements.length, 10, 'Do not change an applied migration.');
  assert.ok(statements.length > 0, `${file} has no statements`);
  await writeFile(at(`dist/.openai/drizzle/${tag}.sql`),
    `${statements.map((statement) => `${statement};`).join('\n--> statement-breakpoint\n')}\n`);
  entries.push({ idx, version: '6', when: Date.parse('2026-11-06T00:00:00Z') + idx * 86_400_000, tag, breakpoints: true });
}
await writeFile(at('dist/.openai/drizzle/meta/_journal.json'), `${JSON.stringify({
  version: '7',
  dialect: 'sqlite',
  entries,
}, null, 2)}\n`);

const workerSource = await readFile(at('dist/server/index.js'), 'utf8');
const worker = await import(`data:text/javascript;base64,${Buffer.from(workerSource).toString('base64')}`);
assert.equal(typeof worker.default?.fetch, 'function');
console.log(`Built Sites Worker and packaged ${migrationFiles.length} migration(s). No deployment was performed.`);
