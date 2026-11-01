import { defineAgent } from 'eve';
export default defineAgent({
  model: process.env.COMPANY_MODEL ?? 'openai/gpt-6-luna-fast',
  description: "財務管理部・予算管理課担当。利用可能な予算と予約中費用を確認する。担当の具体作業を実行する",
  defaultTools: false,
  tool: true,
  limits: { sessionUsage: ({window}) => window.inputTokens-window.cacheReadTokens>=30000 || window.outputTokens>=8000 || (window.costUsd ?? 0)>=1 }
});
