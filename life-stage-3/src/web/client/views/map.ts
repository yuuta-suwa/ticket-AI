import { action, api, card, chip, h, statusChip, toast } from '../dom.ts';

const NEXT: Record<string, { to: string; label: string }[]> = {
  locked: [{ to: 'active', label: '挑戦を始める' }], active: [{ to: 'achieved', label: '達成を記録' }, { to: 'hold', label: '保留にする' }, { to: 'locked', label: '未解放に戻す' }],
  hold: [{ to: 'active', label: '再開する' }], achieved: [],
};

function stageForm(init: any, onSave: (body: any) => Promise<void>, label: string) {
  const title = h('input', { maxlength: 80, value: init.title ?? '' });
  const cond = h('textarea', { maxlength: 1000 }); cond.value = init.conditionText ?? '';
  const due = h('input', { type: 'date', value: init.dueOn ?? '' });
  const nextC = h('textarea', { maxlength: 1000 }); nextC.value = init.nextChallenge ?? '';
  const btn = h('button', { type: 'button' }, label), msg = h('p');
  action(btn, msg, async () => { await onSave({ title: title.value, conditionText: cond.value, dueOn: due.value, nextChallenge: nextC.value }); });
  return h('div', null, h('label', null, 'ステージ名 *'), title, h('label', null, '達成条件'), cond, h('label', null, '期限'), due,
    h('label', null, '次の挑戦'), nextC, h('div', { class: 'row' }, btn), msg);
}

export async function mapView() {
  const stages = await api<any[]>('/api/stages');
  const reload = () => window.dispatchEvent(new HashChangeEvent('hashchange'));
  const out: Node[] = [h('a', { href: '#/goal', class: 'backlink' }, '← MY GOAL'), h('h1', null, 'LIFE MAP'),
    card(h('p', { class: 'muted', style: 'margin:0' }, '人生目標から逆算したステージを、あなたに合わせて自由に設定できます。達成したステージの記録は上書きされません。'))];
  const map = h('div', { class: 'map' });
  stages.forEach((s, i) => {
    const body = h('div');
    const actions = h('div', { class: 'row' });
    const msg = h('p');
    for (const n of NEXT[s.status] ?? []) {
      const b = h('button', { type: 'button', class: n.to === 'achieved' ? 'gold' : 'sub' }, n.label);
      action(b, msg, async () => {
        let note = '';
        if (n.to === 'achieved') {
          note = window.prompt('達成の証拠・記録を入力してください（例：結果、日付、確認した資料）') ?? '';
          if (!note.trim()) return '証拠を入力すると達成を記録できます';
        }
        await api(`/api/stages/${s.id}/status`, { method: 'POST', body: { status: n.to, note } });
        if (n.to === 'achieved') toast('ステージ達成。次の章へ進みましょう');
        reload();
      });
      actions.append(b);
    }
    if (s.status !== 'achieved') {
      const edit = h('button', { type: 'button', class: 'sub' }, '編集');
      edit.addEventListener('click', () => body.replaceChildren(stageForm(s, async (b) => { await api(`/api/stages/${s.id}`, { method: 'PUT', body: b }); reload(); }, '保存')));
      actions.append(edit);
    }
    for (const dir of ['up', 'down'] as const) {
      if ((dir === 'up' && i === 0) || (dir === 'down' && i === stages.length - 1)) continue;
      const b = h('button', { type: 'button', class: 'sub', 'aria-label': dir === 'up' ? '上へ移動' : '下へ移動' }, dir === 'up' ? '↑' : '↓');
      action(b, msg, async () => { await api(`/api/stages/${s.id}/move`, { method: 'POST', body: { dir } }); reload(); });
      actions.append(b);
    }
    const arch = h('button', { type: 'button', class: 'danger' }, '非表示');
    action(arch, msg, async () => { if (!window.confirm('このステージを非表示にしますか？（記録は残ります）')) return; await api(`/api/stages/${s.id}`, { method: 'DELETE' }); reload(); });
    actions.append(arch);
    body.append(h('div', null,
      h('div', { class: 'between' }, h('h3', null, `${i + 1}. ${s.title}`), statusChip(s.status)),
      s.conditionText ? h('p', { class: 'pre small' }, `達成条件：${s.conditionText}`) : h('p', { class: 'muted small' }, '達成条件が未設定です（達成の記録には必要です）'),
      h('div', { class: 'row', style: 'margin-top:4px' }, s.dueOn ? chip(`期限 ${s.dueOn}`) : null, chip(`ミッション ${s.missionDone}/${s.missionTotal}`, 'gray')),
      s.evidenceNote && s.status === 'achieved' ? h('p', { class: 'pre small' }, `証拠：${s.evidenceNote}`) : null,
      s.nextChallenge ? h('p', { class: 'pre small muted' }, `次の挑戦：${s.nextChallenge}`) : null, actions, msg));
    map.append(h('div', { class: `node ${s.status}` }, card(body)));
  });
  if (stages.length) out.push(map); else out.push(card(h('p', { class: 'muted' }, 'まだステージがありません。最初のステージを作りましょう。')));
  out.push(card(h('h2', null, 'ステージを追加'), stageForm({}, async (b) => { await api('/api/stages', { method: 'POST', body: b }); toast('ステージを追加しました'); reload(); }, '追加する')));
  return out;
}
