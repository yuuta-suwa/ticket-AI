import { defineAgent } from 'eve';
export default defineAgent({
  model: process.env.COMPANY_MODEL ?? 'openai/gpt-6-luna-fast',
  description: "経営企画部・新規事業課長。新しい事業候補を比較し小さく検証する",
  defaultTools: false,
  tool: true,
  limits: { sessionUsage: ({window}) => window.inputTokens-window.cacheReadTokens>=30000 || window.outputTokens>=8000 || (window.costUsd ?? 0)>=1 }
});
