import { action, api, bar, card, chip, draft, fmtDate, h, statusChip, toast } from '../dom.ts';

interface Field { key: string; label: string; type: string; required?: boolean; max?: number; options?: { value: string; label: string }[]; itemFields?: Field[]; maxItems?: number; hint?: string }
interface Step { no: number; name: string; phase: string; summary: string; fields: Field[]; status: string; version: number; content: Record<string, any>; updatedAt: string | null }

const PHASE: Record<string, string> = { plan: '計画（ステップ1〜6）', loop: '実践の反復（ステップ7〜9）', achieve: '達成（ステップ10）' };

export async function goalView() {
  const { cycle, steps } = await api<{ cycle: number; steps: Step[] }>('/api/steps');
  const done = steps.filter((s) => s.status === 'completed').length;
  const out: Node[] = [h('h1', null, 'MY GOAL'),
    card(h('div', { class: 'between' }, h('h2', null, `目的達成10ステップ（第${cycle}サイクル）`), chip(`${done}/10`)), bar(done / 10),
      h('p', { class: 'muted small' }, 'ステップ1〜6で計画し、7〜9を繰り返し、10で達成を確かめます。途中保存でき、保存するたびに版として記録されます。'),
      h('div', { class: 'row' }, h('a', { class: 'btn sub', href: '#/map' }, 'LIFE MAP'), h('a', { class: 'btn sub', href: '#/missions' }, 'ミッション')))];
  for (const phase of ['plan', 'loop', 'achieve']) {
    out.push(card(h('h2', null, PHASE[phase]!), h('div', { class: 'steps' }, ...steps.filter((s) => s.phase === phase).map((s) =>
      h('a', { class: 'step', href: `#/step/${s.no}` }, h('span', { class: `num ${s.status === 'completed' ? 'done' : ''}` }, String(s.no).padStart(2, '0')),
        h('span', { style: 'flex:1;min-width:0' }, h('b', null, s.name), h('div', { class: 'muted small' }, s.summary)), statusChip(s.status))))));
  }
  if (steps[9]?.status === 'completed') {
    const btn = h('button', { type: 'button', class: 'gold' }, '次の目標で新しいサイクルを始める'), msg = h('p');
    action(btn, msg, async () => { const r = await api('/api/steps/next-cycle', { method: 'POST', body: {} }); toast(`第${r.cycle}サイクルを始めました`); location.hash = '#/step/1'; });
    out.push(card(h('h2', null, '達成おめでとうございます'), h('p', null, 'これまでの記録はそのまま残ります。次の目標に向けて、新しいサイクルを始めましょう。'), btn, msg));
  }
  return out;
}

type Getter = () => unknown;

function fieldInput(f: Field, value: unknown, onChange: () => void): { el: HTMLElement; get: Getter } {
  const id = `f-${f.key}-${Math.random().toString(36).slice(2, 7)}`;
  const lab = h('label', { for: id }, f.label, f.required ? h('span', { class: 'err' }, ' *') : null);
  if (f.type === 'list') {
    const box = h('div');
    const rows: Getter[] = [];
    const add = (item: Record<string, unknown> = {}) => {
      if (rows.length >= (f.maxItems ?? 20)) return;
      const getters: [string, Getter][] = [];
      const wrap = h('div', { class: 'subitem' });
      for (const sf of f.itemFields!) { const x = fieldInput(sf, item[sf.key], onChange); getters.push([sf.key, x.get]); wrap.append(x.el); }
      const get = () => Object.fromEntries(getters.map(([k, g]) => [k, g()]));
      const rm = h('button', { type: 'button', class: 'danger' }, '削除');
      rm.addEventListener('click', () => { rows.splice(rows.indexOf(get), 1); wrap.remove(); onChange(); });
      wrap.append(h('div', { class: 'row end' }, rm));
      rows.push(get); box.append(wrap);
    };
    for (const item of (Array.isArray(value) ? value : []) as Record<string, unknown>[]) add(item);
    const addBtn = h('button', { type: 'button', class: 'sub' }, `＋ ${f.label}を追加`);
    addBtn.addEventListener('click', () => { add(); onChange(); });
    return { el: h('div', null, h('label', null, f.label, f.required ? h('span', { class: 'err' }, ' *') : null), box, h('div', { class: 'row' }, addBtn)), get: () => rows.map((g) => g()) };
  }
  let input: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
  if (f.type === 'textarea') input = h('textarea', { id, maxlength: f.max ?? 2000, placeholder: f.hint ?? '' });
  else if (f.type === 'select') input = h('select', { id }, h('option', { value: '' }, '選択してください'), ...f.options!.map((o) => h('option', { value: o.value }, o.label)));
  else input = h('input', { id, type: f.type === 'date' ? 'date' : 'text', maxlength: f.max ?? 200, placeholder: f.hint ?? '' });
  input.value = typeof value === 'string' ? value : '';
  input.addEventListener('input', onChange);
  return { el: h('div', null, lab, input), get: () => input.value };
}

export async function stepEditor(no: number) {
  if (!(no >= 1 && no <= 10)) { location.hash = '#/goal'; return []; }
  const { steps } = await api<{ steps: Step[] }>('/api/steps');
  const s = steps.find((x) => x.no === no)!;
  const key = `step:${no}`;
  let content = s.content;
  const saved = draft.get(key);
  let restored = false;
  if (saved) { try { const d = JSON.parse(saved); if (d.base === s.version) { content = d.content; restored = true; } else draft.clear(key); } catch { draft.clear(key); } }
  const form = h('form');
  const getters: [string, Getter][] = [];
  const onChange = () => draft.set(key, JSON.stringify({ base: s.version, content: Object.fromEntries(getters.map(([k, g]) => [k, g()])) }));
  for (const f of s.fields) { const x = fieldInput(f, content[f.key], onChange); getters.push([f.key, x.get]); form.append(x.el); }
  const collect = () => Object.fromEntries(getters.map(([k, g]) => [k, g()]));
  const msg = h('p');
  const saveBtn = h('button', { type: 'button', class: 'sub' }, '下書き保存');
  const doneBtn = h('button', { type: 'button' }, s.status === 'completed' ? '更新して完了のままにする' : 'このステップを完了にする');
  let badge: HTMLElement = statusChip(s.status);
  const verLine = h('p', { class: 'muted small' }, s.version ? `現在の版：${s.version}（${fmtDate(s.updatedAt)}）` : 'まだ保存されていません。');
  const submit = (complete: boolean) => async () => {
    const r = await api(`/api/steps/${no}`, { method: 'PUT', body: { content: collect(), complete } });
    draft.clear(key);
    if (r.saved) { const nb = statusChip(complete ? 'completed' : 'draft'); badge.replaceWith(nb); badge = nb; verLine.textContent = `現在の版：${r.version}`; }
    if (r.xp) toast(`+${r.xp} XP 計画が完成しました`);
    if (complete) { toast(`ステップ${no}を完了しました`); location.hash = no < 10 ? `#/step/${no + 1}` : '#/goal'; return; }
    return r.saved ? `保存しました（版 ${r.version}）` : '変更はありません';
  };
  action(saveBtn, msg, submit(false));
  action(doneBtn, msg, submit(true));
  form.addEventListener('submit', (e) => e.preventDefault());
  const histBox = h('div');
  const histBtn = h('button', { type: 'button', class: 'sub' }, '保存の履歴');
  histBtn.addEventListener('click', async () => {
    const list = await api<any[]>(`/api/steps/${no}/history`);
    histBox.replaceChildren(list.length ? h('ul', { class: 'list' }, ...list.map((v) => h('li', null, h('div', { class: 'between' }, h('b', null, `版 ${v.version}`), statusChip(v.status)), h('span', { class: 'muted small' }, fmtDate(v.createdAt))))) : h('p', { class: 'muted' }, '履歴はまだありません。'));
  });
  const prev = no > 1 ? h('a', { class: 'btn sub', href: `#/step/${no - 1}` }, '← 前へ') : null;
  const next = no < 10 ? h('a', { class: 'btn sub', href: `#/step/${no + 1}` }, '次へ →') : null;
  return [h('a', { href: '#/goal', class: 'backlink' }, '← MY GOAL'),
    h('h1', null, `ステップ${String(no).padStart(2, '0')}　${s.name}`),
    card(h('div', { class: 'between' }, h('p', { class: 'muted', style: 'margin:0' }, s.summary), badge),
      restored ? h('p', { class: 'muted small' }, '前回の入力途中の内容を復元しました。') : null,
      no === 7 ? h('p', { class: 'muted small' }, '具体的な行動は「ミッション」に登録して、記録と証拠を残します。') : null,
      no === 8 ? h('p', { class: 'muted small' }, 'ここでの実績は自己申告です。報酬などの確定値には使われません。') : null,
      form, h('div', { class: 'row' }, saveBtn, doneBtn), msg, verLine),
    card(h('div', { class: 'row', style: 'margin:0' }, prev, next, histBtn), histBox)];
}
