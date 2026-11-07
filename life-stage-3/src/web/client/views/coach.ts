import { action, api, card, chip, errorText, fmtDate, h, toast } from '../dom.ts';

const reload = () => window.dispatchEvent(new HashChangeEvent('hashchange'));

export async function coachView() {
  const notes = await api<any[]>('/api/coach/notes');
  const theme = h('select', null, h('option', { value: 'weekly' }, '週次の振り返り'), h('option', { value: 'daily' }, '今日の優先順位'), h('option', { value: 'purpose' }, '人生目標の深掘り'));
  const time = h('input', { maxlength: 100, placeholder: '例：平日1時間、土曜3時間' });
  const prompt = h('textarea', { rows: 12, maxlength: 6000 });
  const msg = h('p');
  const make = h('button', { type: 'button' }, '相談文を作る');
  action(make, msg, async () => {
    const r = await api(`/api/coach/prompt?theme=${encodeURIComponent(theme.value)}&time=${encodeURIComponent(time.value)}`);
    prompt.value = r.prompt;
    return '相談文を作りました。送る前に内容を確認・編集してください。';
  });
  const copy = h('button', { type: 'button', class: 'sub' }, 'コピー');
  copy.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(prompt.value); toast('コピーしました'); }
    catch { prompt.select(); toast('選択しました。コピーしてください'); }
  });
  const open = h('a', { class: 'btn sub', href: 'https://chatgpt.com/', target: '_blank', rel: 'noopener noreferrer' }, 'ChatGPTを開く');
  const answer = h('textarea', { rows: 8, maxlength: 8000, placeholder: 'ChatGPTの回答をここに貼り付けます' });
  const save = h('button', { type: 'button' }, '提案として保存'), msg2 = h('p');
  action(save, msg2, async () => { await api('/api/coach/notes', { method: 'POST', body: { theme: theme.value, body: answer.value } }); answer.value = ''; toast('下書きとして保存しました'); reload(); });

  const noteItem = (n: any) => {
    const m = h('p');
    const acts = h('div', { class: 'row' });
    for (const [st, label] of [['adopted', '採用する'], ['discarded', '採用しない']] as const) {
      if (n.status === st) continue;
      const b = h('button', { type: 'button', class: 'sub' }, label);
      action(b, m, async () => { await api(`/api/coach/notes/${n.id}/status`, { method: 'POST', body: { status: st } }); reload(); });
      acts.append(b);
    }
    return h('li', null, h('div', { class: 'between' }, h('b', null, n.themeLabel), chip(n.status === 'adopted' ? '採用' : n.status === 'discarded' ? '不採用' : '下書き', n.status === 'adopted' ? 'done' : 'gray')),
      h('p', { class: 'pre small' }, n.body), h('span', { class: 'muted small' }, fmtDate(n.createdAt)), acts, m);
  };
  void errorText;
  return [h('a', { href: '#/home', class: 'backlink' }, '← HOME'), h('h1', null, 'AI LIFE COACH'),
    card(h('p', { class: 'muted', style: 'margin:0' }, 'このアプリはAIを呼び出しません。相談文を作ってご自身のChatGPT（無料版でも可）に貼り付け、回答をここに保存します。保存した回答は「提案」で、あなたのデータは自動では変わりません。')),
    card(h('h2', null, '1. 相談文を作る'), h('label', null, 'テーマ'), theme, h('label', null, '次週に使える時間'), time, h('div', { class: 'row' }, make), msg,
      h('label', null, '相談文（メール・電話番号・金額などは自動で伏せています。送る前に確認してください）'), prompt, h('div', { class: 'row' }, copy, open)),
    card(h('h2', null, '2. 回答を保存する'), answer, h('div', { class: 'row' }, save), msg2),
    card(h('h2', null, '保存した提案'), notes.length ? h('ul', { class: 'list' }, ...notes.map(noteItem)) : h('p', { class: 'muted' }, 'まだありません。'))];
}
