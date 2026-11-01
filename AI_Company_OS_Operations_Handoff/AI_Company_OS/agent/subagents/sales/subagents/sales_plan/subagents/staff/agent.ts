import { defineAgent } from 'eve';
export default defineAgent({
  model: process.env.COMPANY_MODEL ?? 'openai/gpt-6-luna-fast',
  description: "営業部・営業企画課担当。顧客に伝える価値と販売手順を設計する。担当の具体作業を実行する",
  defaultTools: false,
  tool: true,
  limits: { sessionUsage: ({window}) => window.inputTokens-window.cacheReadTokens>=30000 || window.outputTokens>=8000 || (window.costUsd ?? 0)>=1 }
});
