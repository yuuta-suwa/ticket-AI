// AI LIFE COACH：AI APIを呼ばない。相談文は本人が確認・編集してから自分のChatGPTに貼る
import { DomainError } from './errors.ts';
import { cleanText } from './text.ts';

export const COACH_THEMES = {
  purpose: '人生目標の深掘り',
  daily: '今日の優先順位',
  weekly: '週次の振り返り',
} as const;
export type CoachTheme = keyof typeof COACH_THEMES;
export const isCoachTheme = (v: unknown): v is CoachTheme => typeof v === 'string' && v in COACH_THEMES;

/** 個人を特定しうる情報・金額を伏せる（本人が最終確認する前提の既定フィルタ） */
export function redact(s: string): string {
  return s
    .replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, '［メール］')
    .replace(/https?:\/\/\S+/g, '［URL］')
    .replace(/0\d{1,4}[-(]?\d{1,4}[-)]?\d{3,4}/g, '［電話番号］')
    .replace(/[¥￥]\s?[\d,，]+|[\d,，.]+\s?(万円|円|万)/g, '［金額］');
}

export interface CoachFacts { goalSummary: string; kpis: string; completedActions: string; blockers: string; timeBudget: string }

export function buildPrompt(theme: CoachTheme, f: CoachFacts): string {
  const head = 'あなたは自己実現・行動改善のコーチです。次の情報だけをもとに、日本語で助言してください。\n観測事実と推測・仮説を区別し、収入や達成を保証しないでください。';
  const facts = [
    '現状の事実:',
    `- 人生の目的（抽象化済み）：${redact(f.goalSummary) || '（未記入）'}`,
    `- 今週のKPI（本人が送信を許可した集計値のみ）：${redact(f.kpis) || '（未記入）'}`,
    `- 達成した行動：${redact(f.completedActions) || '（なし）'}`,
    `- 困っていること：${redact(f.blockers) || '（未記入）'}`,
    `- 次週の利用可能時間：${redact(f.timeBudget) || '（未記入）'}`,
  ].join('\n');
  const focus: Record<CoachTheme, string> = {
    purpose: '特に、人生の目的を深める問いと、目的に沿った目標の候補を示してください。',
    daily: '特に、今日取り組むべき行動を優先順位つきで示してください。',
    weekly: '特に、今週の振り返りと来週の改善を示してください。',
  };
  const out = '出力：\n1. 観測事実の要約（3行以内）\n2. 未達原因の仮説（最大3つ、理由つき）\n3. 今後7日間の行動（最大3つ、所要時間と優先順位）\n4. 本人に確認すべき質問（1つ）\n本人の承認なしにアプリ内のデータを変更したと想定しないでください。';
  return `${head}\n${focus[theme]}\n${facts}\n${out}`;
}

/** 取り込むAIの回答は「外部のテキスト」。プレーンテキストとして保存し、実行しない */
export function sanitizeImport(raw: unknown): string {
  const s = cleanText(raw, 8000, 'body');
  if (!s) throw new DomainError('invalid_input', 'body is required');
  return s;
}

export interface CoachNote { id: string; ownerId: string; theme: CoachTheme; body: string; status: 'draft' | 'adopted' | 'discarded'; createdAt: string; updatedAt: string }
