import { spawnSync } from 'node:child_process';
if(process.env.COMPANY_LLM_ENABLED!=='1') {
  console.error('LLM接続は停止中です。無料の動作確認は npm run demo。モデル利用条件と費用を確認後、COMPANY_LLM_ENABLED=1 を設定してください。');
  process.exit(1);
}
const result=spawnSync(process.execPath,['node_modules/eve/bin/eve.js','dev','--no-default-extensions'],{stdio:'inherit'});
process.exit(result.status ?? 1);
