import { defineAgent } from 'eve';
export default defineAgent({
  model: process.env.COMPANY_MODEL ?? 'openai/gpt-6-luna-fast',
  description: "経営企画部・事業戦略課長。目的、対象顧客、価値、検証条件を定義する",
  defaultTools: false,
  tool: true,
  limits: { sessionUsage: ({window}) => window.inputTokens-window.cacheReadTokens>=30000 || window.outputTokens>=8000 || (window.costUsd ?? 0)>=1 }
});
