// 目的達成10ステップ（名称・順序は仕様で固定。変更は正式な版改定が必要）
import { DomainError } from './errors.ts';
import { isDate } from './time.ts';
import { asObject, cleanText } from './text.ts';

export type FieldType = 'text' | 'textarea' | 'date' | 'select' | 'list';
export interface FieldDef {
  key: string;
  label: string;
  type: FieldType;
  required?: boolean;
  max?: number;
  options?: { value: string; label: string }[];
  itemFields?: FieldDef[];
  maxItems?: number;
  hint?: string;
}
export interface StepDef { no: number; name: string; phase: 'plan' | 'loop' | 'achieve'; summary: string; fields: FieldDef[] }

const ta = (key: string, label: string, required = false, hint?: string): FieldDef => ({ key, label, type: 'textarea', required, max: 2000, hint });
const tx = (key: string, label: string, required = false, hint?: string): FieldDef => ({ key, label, type: 'text', required, max: 200, hint });

export const STEPS: readonly StepDef[] = [
  { no: 1, name: '目的', phase: 'plan', summary: '何のために生きるのか、人生の目的を言葉にする', fields: [
    ta('purpose', '人生の目的', true, '例：家族と仲間が誇れる生き方をし、挑戦する人を支える'),
    ta('values', '大切にしている価値観', true), ta('reason', 'その目的を選ぶ理由', true)] },
  { no: 2, name: '目標', phase: 'plan', summary: '目的に近づくための、達成基準のある目標を決める', fields: [
    tx('goal', '目標', true),
    { key: 'kind', label: '目標の種類', type: 'select', required: true, options: [{ value: 'quantitative', label: '数値目標' }, { value: 'qualitative', label: '定性目標' }] },
    tx('metric', '測る指標（数値目標の場合）'), tx('target_value', '目標値（数値目標の場合）'),
    ta('criteria', '達成したと言える基準', true)] },
  { no: 3, name: '期限', phase: 'plan', summary: '最終期限と中間期限を決める', fields: [
    { key: 'final_due', label: '最終期限', type: 'date', required: true },
    { key: 'milestones', label: '中間期限', type: 'list', maxItems: 12, itemFields: [tx('title', '内容', true), { key: 'due', label: '期限', type: 'date', required: true }] }] },
  { no: 4, name: '逆算', phase: 'plan', summary: '期限から逆算して、月ごと・週ごとの計画にする', fields: [
    ta('monthly_plan', '月ごとの計画', true), ta('weekly_plan', '週ごとの計画', true), ta('dependencies', '前提・順番が決まっていること')] },
  { no: 5, name: 'KPI', phase: 'plan', summary: '進み具合を測る指標を決める', fields: [
    { key: 'kpis', label: 'KPI', type: 'list', required: true, maxItems: 8, itemFields: [
      tx('name', '指標名', true),
      { key: 'kind', label: '種類', type: 'select', required: true, options: [{ value: 'leading', label: '先行指標（行動量）' }, { value: 'lagging', label: '結果指標（成果）' }] },
      tx('target', '目標値', true), tx('unit', '単位')] }] },
  { no: 6, name: '役割', phase: 'plan', summary: '誰が何を担うのかを明確にする', fields: [
    ta('self_role', '自分の役割と責任', true), ta('collaborators', '協力者とお願いすること'), tx('responsible', '最終責任者', true)] },
  { no: 7, name: '行動', phase: 'loop', summary: 'ミッションとして実行し、記録と証拠を残す', fields: [
    ta('action_policy', '行動の方針（何を、どのくらいの頻度で）', true), ta('notes', 'メモ')] },
  { no: 8, name: '計測', phase: 'loop', summary: '実績と推移を記録し、達成率を追う', fields: [
    ta('measurement', '計測の方法とタイミング', true),
    { key: 'records', label: '実績の記録（自己申告）', type: 'list', maxItems: 50, itemFields: [
      tx('kpi', '指標名', true), tx('actual', '実績値', true), { key: 'date', label: '記録日', type: 'date', required: true }, tx('source', '根拠・出典')] }] },
  { no: 9, name: '改善', phase: 'loop', summary: '課題・仮説・改善策を決めて再計画する', fields: [
    ta('issues', '課題', true), ta('hypothesis', '原因の仮説', true), ta('actions', '改善策', true), ta('replan', '再計画')] },
  { no: 10, name: '達成', phase: 'achieve', summary: '達成を検証し、振り返って次の目標を決める', fields: [
    ta('verification', '達成の検証（基準と結果）', true), ta('reflection', '振り返り', true), ta('next_goal', '次の目標', true)] },
];

export const PLAN_STEPS = [1, 2, 3, 4, 5, 6];

export function stepDef(no: number): StepDef {
  const s = STEPS.find((x) => x.no === no);
  if (!s) throw new DomainError('not_found');
  return s;
}

type Content = Record<string, unknown>;

function parseField(f: FieldDef, v: unknown): unknown {
  switch (f.type) {
    case 'text': case 'textarea': return cleanText(v, f.max ?? 2000, f.key);
    case 'date': {
      const s = cleanText(v, 10, f.key);
      if (s && !isDate(s)) throw new DomainError('invalid_input', `${f.key} invalid date`);
      return s;
    }
    case 'select': {
      const s = cleanText(v, 50, f.key);
      if (s && !f.options!.some((o) => o.value === s)) throw new DomainError('invalid_input', `${f.key} invalid option`);
      return s;
    }
    case 'list': {
      if (v === undefined || v === null) return [];
      if (!Array.isArray(v) || v.length > (f.maxItems ?? 20)) throw new DomainError('invalid_input', `${f.key} invalid list`);
      return v.map((item) => {
        const o = asObject(item);
        const out: Content = {};
        for (const sf of f.itemFields!) out[sf.key] = parseField(sf, o[sf.key]);
        return out;
      }).filter((o) => Object.values(o).some((x) => x !== ''));
    }
  }
}

/** 定義にある項目だけを受け取り、形式を検証する（不明な項目は捨てる） */
export function parseStepContent(no: number, raw: unknown): Content {
  const def = stepDef(no);
  const o = asObject(raw);
  const out: Content = {};
  for (const f of def.fields) out[f.key] = parseField(f, o[f.key]);
  return out;
}

const empty = (v: unknown) => v === '' || v === undefined || (Array.isArray(v) && v.length === 0);

/** 完了にするための条件。満たさない項目名の一覧を返す（空なら完了可） */
export function missingForComplete(no: number, c: Content): string[] {
  const def = stepDef(no);
  const missing: string[] = [];
  for (const f of def.fields) {
    if (f.required && empty(c[f.key])) missing.push(f.label);
    if (f.type === 'list' && Array.isArray(c[f.key])) {
      for (const item of c[f.key] as Content[])
        for (const sf of f.itemFields!) if (sf.required && empty(item[sf.key])) { missing.push(`${f.label}の${sf.label}`); break; }
    }
  }
  if (no === 2 && c.kind === 'quantitative' && (empty(c.metric) || empty(c.target_value))) missing.push('数値目標の指標と目標値');
  if (no === 3 && typeof c.final_due === 'string' && c.final_due) {
    for (const m of (c.milestones as Content[]) ?? [])
      if (typeof m.due === 'string' && m.due > c.final_due) { missing.push('中間期限が最終期限より後になっています'); break; }
  }
  return [...new Set(missing)];
}

export interface StepVersion {
  id: string; ownerId: string; cycle: number; stepNo: number; version: number;
  status: 'draft' | 'completed'; content: Content; createdAt: string;
}
