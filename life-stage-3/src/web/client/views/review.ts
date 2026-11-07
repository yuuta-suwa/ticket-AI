import { action, api, card, chip, draft, fmtDate, h, toast } from '../dom.ts';

export async function reviewView() {
  const cur = await api<any>('/api/reviews/current');
  const list = await api<any[]>('/api/reviews');
  const key = `review:${cur.weekKey}`;
  let init = cur;
  const saved = draft.get(key);
  if (saved && !cur.submittedAt) { try { init = { ...cur, ...JSON.parse(saved) }; } catch { draft.clear(key); } }
  const f = (k: string, label: string, req = false) => { const t = h('textarea', { maxlength: 2000 }); t.value = init[k] ?? ''; t.addEventListener('input', keep); return { k, el: h('div', null, h('label', null, label, req ? h('span', { class: 'err' }, ' *') : null), t), t }; };
  function keep() { draft.set(key, JSON.stringify(Object.fromEntries(fields.map((x) => [x.k, x.t.value])))); }
  const fields = [f('wentWell', 'うまくいったこと', true), f('blockers', '困ったこと・障害'), f('improvements', '改善すること'), f('nextActions', '来週の行動', true)];
  const body = () => Object.fromEntries(fields.map((x) => [x.k, x.t.value]));
  const msg = h('p');
  const saveBtn = h('button', { type: 'button', class: 'sub' }, '下書き保存');
  const subBtn = h('button', { type: 'button' }, cur.submittedAt ? '更新する' : '提出する');
  const send = (submit: boolean) => async () => {
    const r = await api(`/api/reviews/${cur.weekKey}`, { method: 'PUT', body: { ...body(), submit } });
    draft.clear(key);
    if (r.xp) toast(`+${r.xp} XP 振り返りを提出しました`);
    return submit ? '提出しました' : '保存しました';
  };
  action(saveBtn, msg, send(false)); action(subBtn, msg, send(true));
  return [h('a', { href: '#/home', class: 'backlink' }, '← HOME'), h('h1', null, '週次レビュー'),
    card(h('div', { class: 'between' }, h('h2', null, `今週（${cur.weekKey}）`), cur.submittedAt ? chip('提出済み', 'done') : chip('未提出', 'gray')),
      h('p', { class: 'muted small' }, '未達成の週も、事実と次の改善を書けば十分です。'),
      ...fields.map((x) => x.el), h('div', { class: 'row' }, saveBtn, subBtn), msg),
    card(h('h2', null, 'これまでのレビュー'), list.length ? h('ul', { class: 'list' }, ...list.map((r) => h('li', null,
      h('div', { class: 'between' }, h('b', null, r.weekKey), r.submittedAt ? chip('提出済み', 'done') : chip('下書き', 'gray')),
      r.wentWell ? h('p', { class: 'pre small' }, r.wentWell) : null, h('span', { class: 'muted small' }, fmtDate(r.updatedAt))))) : h('p', { class: 'muted' }, 'まだありません。'))];
}
