import { action, api, card, chip, fmtDate, h, inlineConfirm, inlineForm, toast } from '../dom.ts';

const reload = () => window.dispatchEvent(new HashChangeEvent('hashchange'));
const SECTIONS: [string, string][] = [['members', '会員承認'], ['missions', 'ミッション確認'], ['xp', 'XPルール'], ['audit', '監査ログ'], ['backup', 'バックアップ']];

async function members() {
  const { members } = await api<any>('/api/admin/pending');
  return card(h('h2', null, '承認待ちの会員'), members.length ? h('ul', { class: 'list' }, ...members.map((m: any) => {
    const msg = h('p'); const row = h('div', { class: 'row' });
    for (const [st, label, cls] of [['active', '承認', ''], ['cancelled', '否認', 'danger']]) {
      const b = h('button', { type: 'button', class: cls }, label);
      action(b, msg, async () => { await api(`/api/admin/members/${m.id}/status`, { method: 'POST', body: { status: st } }); toast(`${label}しました`); reload(); });
      row.append(b);
    }
    return h('li', null, h('b', null, m.displayName || m.email), h('div', { class: 'muted small' }, `${m.email}・${fmtDate(m.createdAt)}`), row, msg);
  })) : h('p', { class: 'muted' }, '承認待ちはありません。'));
}

async function missions() {
  const list = await api<any[]>('/api/admin/missions');
  return card(h('h2', null, '確認待ちのミッション'), h('p', { class: 'muted small' }, '確認者に見えるのは、ミッションの題名・内容・証拠と提出者だけです。'),
    list.length ? h('ul', { class: 'list' }, ...list.map((m) => {
      const msg = h('p');
      const slot = h('div');
      const ok = h('button', { type: 'button' }, '確認済みにする');
      const ng = h('button', { type: 'button', class: 'danger' }, '差し戻す');
      action(ok, msg, async () => { await api(`/api/admin/missions/${m.id}/review`, { method: 'POST', body: { decision: 'verified' } }); reload(); });
      ng.addEventListener('click', () => inlineForm(slot, { label: '差し戻す理由', required: true, submitLabel: '差し戻す',
        onSubmit: async (reason) => { await api(`/api/admin/missions/${m.id}/review`, { method: 'POST', body: { decision: 'returned', reason } }); reload(); } }));
      return h('li', null, h('b', null, m.title), h('div', { class: 'muted small' }, `${m.owner.displayName || m.owner.email}・${fmtDate(m.updatedAt)}`),
        m.detail ? h('p', { class: 'pre small' }, m.detail) : null, h('p', { class: 'pre small' }, `証拠：${m.evidenceNote}`), h('div', { class: 'row' }, ok, ng), slot, msg);
    })) : h('p', { class: 'muted' }, '確認待ちはありません。'));
}

async function xp() {
  const d = await api<any>('/api/admin/xp-rules');
  const inputs: Record<string, HTMLInputElement> = {};
  const rows = d.keys.map((k: string) => { inputs[k] = h('input', { type: 'number', min: 0, max: 1000, value: String(d.rules.points[k]) }); return h('div', null, h('label', null, d.labels[k]), inputs[k]); });
  const cap = h('input', { type: 'number', min: 0, max: 50, value: String(d.rules.activityDailyCap) });
  const th = h('input', { value: d.rules.levelThresholds.join(',') });
  const reason = h('input', { maxlength: 500, placeholder: '例：活動記録の上限を見直すため' });
  const btn = h('button', { type: 'button' }, '新しい版として保存'), msg = h('p');
  action(btn, msg, async () => {
    const rules = { points: Object.fromEntries(Object.entries(inputs).map(([k, i]) => [k, Number(i.value)])), activityDailyCap: Number(cap.value),
      levelThresholds: th.value.split(',').map((x) => Number(x.trim())) };
    const r = await api('/api/admin/xp-rules', { method: 'PUT', body: { rules, reason: reason.value } });
    toast(`版 ${r.version} を保存しました`); reload();
  });
  return [card(h('div', { class: 'between' }, h('h2', null, 'XPルール'), chip(`現在の版 ${d.version}${d.version === 0 ? '（初期値）' : ''}`)),
    h('p', { class: 'muted small' }, '変更は新しい版として記録されます。過去に付与したXPは再計算されません。XPは報酬・認定に直接換算しません。'),
    ...rows, h('label', null, '活動記録の1日の上限（件）'), cap, h('label', null, 'レベルの境目（XP、カンマ区切り・0から増加）'), th,
    h('label', null, '変更理由 *'), reason, h('div', { class: 'row' }, btn), msg),
  card(h('h2', null, '変更履歴'), d.history.length ? h('ul', { class: 'list' }, ...d.history.map((x: any) => h('li', null, h('b', null, `版 ${x.version}`), ` ${x.reason}`, h('div', { class: 'muted small' }, fmtDate(x.createdAt))))) : h('p', { class: 'muted' }, 'まだ変更はありません。'))];
}

async function audit() {
  const list = await api<any[]>('/api/admin/audit');
  return card(h('h2', null, '監査ログ（直近100件）'), list.length ? h('ul', { class: 'list small' }, ...list.map((a) => h('li', null,
    h('b', null, a.action), ` ${a.targetType}`, h('div', { class: 'muted' }, fmtDate(a.createdAt)), a.reason ? h('div', null, `理由：${a.reason}`) : null,
    h('div', { class: 'muted pre' }, `${JSON.stringify(a.before)} → ${JSON.stringify(a.after)}`)))) : h('p', { class: 'muted' }, 'まだありません。'));
}

async function backup() {
  const file = h('input', { type: 'file', accept: 'application/json,.json' });
  const msg = h('p');
  const slot = h('div');
  file.addEventListener('change', () => {
    const f = file.files?.[0]; if (!f) return;
    inlineConfirm(slot, { text: `「${f.name}」をこのサイトに復元します。データが空のサイトでのみ実行できます。よろしいですか？`, okLabel: '復元する', danger: true,
      onCancel: () => { file.value = ''; },
      onOk: async () => {
        try { const r = await api('/api/admin/restore', { method: 'POST', raw: await f.text(), type: 'application/json' }); msg.className = 'ok'; msg.textContent = `復元しました（会員${r.restored.users}件）。再読み込みしてください。`; }
        catch (e: any) { msg.className = 'err'; msg.textContent = e?.code === 'forbidden' ? 'データが入っているサイトには復元できません。' : '復元できませんでした。'; }
        finally { file.value = ''; }
      } });
  });
  return card(h('h2', null, 'バックアップ'), h('p', { class: 'muted small' }, '全会員のデータを含みます。暗号化した保管場所に保存し、Gitやチャットには貼らないでください。Deployの前に毎回取得します。'),
    h('div', { class: 'row' }, h('a', { class: 'btn', href: '/api/admin/backup', download: '' }, 'バックアップをダウンロード')),
    h('label', null, '復元（データが空のサイトでのみ実行できます）'), file, slot, msg);
}

export async function adminView(section: string) {
  const nav = h('div', { class: 'row', style: 'margin-top:0' }, ...SECTIONS.map(([k, label]) => h('a', { class: `btn ${k === section ? '' : 'sub'}`, href: `#/admin/${k}` }, label)));
  const fn = ({ members, missions, xp, audit, backup } as Record<string, () => Promise<Node | Node[]>>)[section] ?? members;
  const body = await fn();
  return [h('a', { href: '#/mypage', class: 'backlink' }, '← MY PAGE'), h('h1', null, 'MANAGEMENT'), nav, ...(Array.isArray(body) ? body : [body])];
}
