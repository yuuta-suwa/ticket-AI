import { action, api, card, chip, fmtDate, h, inlineConfirm, inlineForm, statusChip, toast } from '../dom.ts';

const reload = () => window.dispatchEvent(new HashChangeEvent('hashchange'));
const range = (label: string, init: number, help: string) => {
  const sel = h('select', null, ...[0, 1, 2, 3, 4, 5].map((n) => h('option', { value: String(n), selected: n === init }, String(n))));
  return { el: h('div', null, h('label', null, label), sel, h('span', { class: 'muted small' }, help)), get: () => Number(sel.value) };
};

function missionForm(init: any, stages: any[], onSave: (b: any) => Promise<void>, label: string) {
  const title = h('input', { maxlength: 120, value: init.title ?? '' });
  const detail = h('textarea', { maxlength: 2000 }); detail.value = init.detail ?? '';
  const stage = h('select', null, h('option', { value: '' }, '（ステージなし）'), ...stages.map((s) => h('option', { value: s.id, selected: s.id === init.stageId }, s.title)));
  const due = h('input', { type: 'date', value: init.dueOn ?? '' });
  const c = range('目標への寄与（0〜5）', init.contribution ?? 3, '大きいほど優先');
  const e = range('所要時間の負担（0〜5）', init.effort ?? 2, '大きいほど優先度が下がる');
  const k = range('KPIの不足度（0〜5）', init.kpiGap ?? 0, 'KPIが足りないほど大きく');
  const vm = h('select', null, h('option', { value: 'self', selected: init.verifyMode !== 'reviewer' }, '自己確認（自分で完了にできる）'),
    h('option', { value: 'reviewer', selected: init.verifyMode === 'reviewer' }, '確認が必要（運営・責任者が確認）'));
  const btn = h('button', { type: 'button' }, label), msg = h('p');
  action(btn, msg, () => onSave({ title: title.value, detail: detail.value, stageId: stage.value, dueOn: due.value,
    contribution: c.get(), effort: e.get(), kpiGap: k.get(), verifyMode: vm.value }));
  return h('div', null, h('label', null, 'ミッション *'), title, h('label', null, '内容'), detail, h('label', null, 'LIFE MAPのステージ'), stage,
    h('label', null, '期限'), due, c.el, e.el, k.el, h('label', null, '確認の方法'), vm, h('div', { class: 'row' }, btn), msg);
}

function item(m: any, stages: any[]) {
  const box = h('div');
  const msg = h('p');
  const acts = h('div', { class: 'row' });
  const slot = h('div');
  const send = async (act: string, note: string) => {
    const r = await api(`/api/missions/${m.id}/action`, { method: 'POST', body: { action: act, note } });
    toast(r.xp ? `記録しました +${r.xp} XP` : '記録しました');
    reload();
  };
  const doAction = (label: string, act: string, needNote: string | null, cls = 'sub') => {
    const b = h('button', { type: 'button', class: cls }, label);
    if (needNote === null) action(b, msg, () => send(act, ''));
    else b.addEventListener('click', () => inlineForm(slot, { label: needNote, required: act !== 'complete_self', submitLabel: label, onSubmit: (t) => send(act, t) }));
    acts.append(b);
  };
  if (m.status === 'not_started') doAction('開始する', 'start', null, '');
  if (m.status === 'in_progress') doAction('実施を記録', 'log', '何をしたか記録してください', '');
  if (m.verifyMode === 'self' && ['not_started', 'in_progress'].includes(m.status)) doAction('完了にする', 'complete_self', '完了の記録（任意）');
  if (m.verifyMode === 'reviewer' && m.status === 'in_progress') doAction('確認を依頼', 'submit', '証拠・結果を入力してください（確認者が見ます）');
  if (m.status === 'returned') doAction('やり直す', 'restart', null, '');
  if (['not_started', 'in_progress', 'returned'].includes(m.status)) {
    const t = h('button', { type: 'button', class: m.today ? 'gold' : 'sub' }, m.today ? '今日やる ✓' : '今日やる');
    action(t, msg, async () => { await api(`/api/missions/${m.id}/today`, { method: 'POST', body: { on: !m.today } }); reload(); });
    acts.append(t);
    const ed = h('button', { type: 'button', class: 'sub' }, '編集');
    ed.addEventListener('click', () => box.replaceChildren(missionForm(m, stages, async (b) => { await api(`/api/missions/${m.id}`, { method: 'PUT', body: b }); reload(); }, '保存')));
    acts.append(ed);
  }
  const logsBtn = h('button', { type: 'button', class: 'sub' }, '記録を見る');
  const logs = h('div');
  logsBtn.addEventListener('click', async () => {
    const list = await api<any[]>(`/api/missions/${m.id}/logs`);
    logs.replaceChildren(list.length ? h('ul', { class: 'list small' }, ...list.map((l) => h('li', null, h('b', null, LOG[l.action] ?? l.action), l.byMe ? '' : '（確認者）', ' ', h('span', { class: 'muted' }, fmtDate(l.createdAt)), l.note ? h('div', { class: 'pre' }, l.note) : null))) : h('p', { class: 'muted small' }, '記録はまだありません。'));
  });
  acts.append(logsBtn);
  if (m.status !== 'submitted') {
    const arch = h('button', { type: 'button', class: 'danger' }, '非表示');
    arch.addEventListener('click', () => inlineConfirm(slot, { text: 'このミッションを非表示にしますか？（記録は残ります）', okLabel: '非表示にする', danger: true,
      onOk: async () => { await api(`/api/missions/${m.id}`, { method: 'DELETE' }); reload(); } }));
    acts.append(arch);
  }
  const stage = stages.find((s) => s.id === m.stageId);
  box.append(h('div', null, h('div', { class: 'between' }, h('h3', null, m.title), statusChip(m.status)),
    m.detail ? h('p', { class: 'pre small' }, m.detail) : null,
    h('div', { class: 'row', style: 'margin-top:4px' }, m.dueOn ? chip(`期限 ${m.dueOn}`, m.overdue ? 'warn' : '') : null, stage ? chip(stage.title, 'gold') : null,
      chip(m.verifyMode === 'reviewer' ? '確認が必要' : '自己確認', 'gray'), m.today ? chip('今日やる', 'gold') : null),
    m.status === 'returned' && m.returnReason ? h('p', { class: 'err' }, `差戻しの理由：${m.returnReason}`) : null,
    m.status === 'submitted' ? h('p', { class: 'muted small' }, '確認者の確認を待っています。') : null,
    acts, slot, msg, logs));
  return card(box);
}
const LOG: Record<string, string> = { start: '開始', log: '実施記録', submit: '確認依頼', complete_self: '完了（自己確認）', restart: 'やり直し', verified: '確認済み', returned: '差戻し' };

export async function missionsView(all: boolean) {
  const [missions, stages] = await Promise.all([api<any[]>(`/api/missions${all ? '?all=1' : ''}`), api<any[]>('/api/stages')]);
  const add = card(h('h2', null, 'ミッションを追加'),
    missionForm({}, stages, async (b) => { await api('/api/missions', { method: 'POST', body: b }); toast('追加しました'); reload(); }, '追加する'));
  return [h('a', { href: '#/home', class: 'backlink' }, '← HOME'), h('h1', null, 'DAILY MISSION'),
    card(h('p', { class: 'muted', style: 'margin:0' }, '状態は「未着手 → 進行中 → 確認待ち → 確認済み／差戻し」。実施を記録すると活動記録としてXPが付きます（1日の上限あり・同じミッションは1日1回）。'),
      h('div', { class: 'row' }, h('a', { class: 'btn sub', href: all ? '#/missions' : '#/missions/all' }, all ? '進行中だけ表示' : '確認済みも表示'))),
    ...(missions.length ? missions.map((m) => item(m, stages)) : [card(h('p', { class: 'muted' }, 'ミッションはまだありません。'))]), add];
}
