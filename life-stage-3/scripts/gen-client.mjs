// 画面のTypeScriptを1ファイルにまとめ、Workerから配信できる文字列モジュールを生成する
import { mkdir, writeFile } from 'node:fs/promises';
import { build } from 'esbuild';

const root = new URL('../', import.meta.url);
const result = await build({
  absWorkingDir: new URL('.', root).pathname,
  entryPoints: ['src/web/client/main.ts'],
  bundle: true, write: false, format: 'iife', target: 'es2020', minify: true, legalComments: 'none',
});
const js = result.outputFiles[0].text;
await mkdir(new URL('src/web/generated/', root), { recursive: true });
await writeFile(new URL('src/web/generated/client-bundle.ts', root),
  `// 自動生成ファイル（scripts/gen-client.mjs）。直接編集しない\nexport const CLIENT_JS: string = ${JSON.stringify(js)};\n`);
console.log(`client bundle: ${(js.length / 1024).toFixed(1)} KiB`);
