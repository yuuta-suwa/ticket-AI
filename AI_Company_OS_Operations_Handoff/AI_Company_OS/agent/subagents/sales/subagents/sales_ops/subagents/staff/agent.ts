import { defineAgent } from 'eve';
export default defineAgent({
  model: process.env.COMPANY_MODEL ?? 'openai/gpt-6-luna-fast',
  description: "営業部・販売運用課担当。注文・提供・返金などの流れを運用する。担当の具体作業を実行する",
  defaultTools: false,
  tool: true,
  limits: { sessionUsage: ({window}) => window.inputTokens-window.cacheReadTokens>=30000 || window.outputTokens>=8000 || (window.costUsd ?? 0)>=1 }
});
