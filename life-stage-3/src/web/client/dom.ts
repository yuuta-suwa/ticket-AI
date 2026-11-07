// 画面の共通部品。利用者データは必ず textContent / value で入れる（innerHTML は使わない＝XSS対策）
type Child = Node | string | number | null | undefined | false;
type Attrs = Record<string, unknown> & { class?: string; on?: Record<string, (e: Event) => void> };

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs | null = null, ...kids: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (attrs) for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'on') for (const [ev, fn] of Object.entries(v as Record<string, (e: Event) => void>)) el.addEventListener(ev, fn);
    else if (k === 'class') el.className = String(v);
    else if (k in el && ['value', 'checked', 'disabled', 'hidden', 'type', 'selected', 'href', 'rows'].includes(k)) (el as unknown as Record<string, unknown>)[k] = v;
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of kids) if (c !== null && c !== undefined && c !== false) el.append(typeof c === 'number' ? String(c) : c);
  return el;
}

export class ApiError extends Error {
  code: string; details: string[];
  constructor(code: string, details: string[] = []) { super(code); this.code = code; this.details = details; }
}

export async function api<T = any>(path: string, opt: { method?: string; body?: unknown; raw?: BodyInit; type?: string } = {}): Promise<T> {
  const init: RequestInit = { method: opt.method ?? 'GET', credentials: 'same-origin', headers: {} };
  if (opt.body !== undefined) { init.body = JSON.stringify(opt.body); (init.headers as Record<string, string>)['content-type'] = 'application/json'; }
  if (opt.raw !== undefined) { init.body = opt.raw; (init.headers as Record<string, string>)['content-type'] = opt.type ?? 'application/octet-stream'; }
  let res: Response;
  try { res = await fetch(path, init); } catch { throw new ApiError('network'); }
  const ct = res.headers.get('content-type') ?? '';
  const data = ct.includes('application/json') ? await res.json().catch(() => null) : null;
  if (!res.ok) throw new ApiError((data && data.error) || 'internal', (data && data.details) || []);
  return data as T;
}

const MSG: Record<string, string> = {
  invalid_input: '入力内容を確認してください。', not_approved: '承認後にご利用いただけます。', forbidden: 'この操作の権限がありません。',
  not_found: '見つかりませんでした。', unauthenticated: 'サインインしてください。', conflict: 'すでに処理されています。',
  network: '通信できませんでした。電波の良い場所で再試行してください。', internal: 'エラーが発生しました。時間をおいて再試行してください。',
};
export function errorText(e: unknown): string {
  if (e instanceof ApiError) return [MSG[e.code] ?? MSG.internal, ...e.details].join(' ');
  return MSG.internal!;
}

let toastTimer = 0;
export function toast(text: string) {
  document.querySelector('.toast')?.remove();
  const t = h('div', { class: 'toast', role: 'status' }, text);
  document.body.append(t);
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => t.remove(), 2600);
}

/** ボタン実行中は二重送信を防ぎ、結果をボタンの近くに表示する */
export function action(btn: HTMLButtonElement, msgEl: HTMLElement, fn: () => Promise<string | void>) {
  btn.addEventListener('click', async (ev) => {
    ev.preventDefault();
    if (btn.disabled) return;
    btn.disabled = true; msgEl.className = 'muted small'; msgEl.textContent = '処理中…';
    try { const ok = await fn(); msgEl.className = 'ok'; msgEl.textContent = ok ?? ''; }
    catch (e) { msgEl.className = 'err'; msgEl.textContent = errorText(e); }
    finally { btn.disabled = false; }
  });
}

export const card = (...kids: Child[]) => h('section', { class: 'card' }, ...kids);
export const chip = (text: string, kind = '') => h('span', { class: `chip ${kind}` }, text);
export const fmtDate = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString('ja-JP', { dateStyle: 'medium', timeStyle: 'short' }) : '');
export const bar = (ratio: number) => h('div', { class: 'bar', role: 'progressbar', 'aria-valuenow': Math.round(ratio * 100), 'aria-valuemin': 0, 'aria-valuemax': 100 },
  (() => { const i = h('i'); i.style.width = `${Math.max(0, Math.min(1, ratio)) * 100}%`; return i; })());

/** 読み込み中 → 成功 / 失敗（再試行）を共通で扱う */
export async function load(view: HTMLElement, fn: () => Promise<Node | Node[]>) {
  view.replaceChildren(h('p', { class: 'muted pad' }, '読み込み中…'));
  try {
    const out = await fn();
    view.replaceChildren(...(Array.isArray(out) ? out : [out]));
  } catch (e) {
    const retry = h('button', { class: 'sub', type: 'button' }, '再試行');
    retry.addEventListener('click', () => load(view, fn));
    view.replaceChildren(card(h('p', { class: 'err' }, errorText(e)), h('div', { class: 'row' }, retry)));
  }
}

/** 入力途中の文章を端末に一時保存（送信失敗時に失わない）。保存できない環境でも動作は止めない */
export const draft = {
  get(key: string): string | null { try { return localStorage.getItem(`ls3:${key}`); } catch { return null; } },
  set(key: string, v: string) { try { localStorage.setItem(`ls3:${key}`, v); } catch { /* noop */ } },
  clear(key: string) { try { localStorage.removeItem(`ls3:${key}`); } catch { /* noop */ } },
};

export const STATUS_LABEL: Record<string, string> = {
  not_started: '未着手', in_progress: '進行中', submitted: '確認待ち', verified: '確認済み', returned: '差戻し',
  locked: '未解放', active: '挑戦中', achieved: '達成', hold: '保留', empty: '未入力', draft: '下書き', completed: '完了',
};
export const statusChip = (s: string) => chip(STATUS_LABEL[s] ?? s,
  ({ verified: 'done', completed: 'done', achieved: 'gold', returned: 'warn', hold: 'warn', submitted: '', in_progress: '', draft: 'gray', empty: 'gray', locked: 'gray', not_started: 'gray' } as Record<string, string>)[s] ?? '');

/**
 * 画面内の入力欄（window.prompt の代わり）。アプリ内ブラウザ等ではダイアログが使えないため、
 * 押したボタンの近く（slot）に入力欄・送信・キャンセルを出す
 */
export function inlineForm(slot: HTMLElement, o: { label: string; placeholder?: string; required: boolean; submitLabel: string; onSubmit: (text: string) => Promise<string | void> }) {
  const ta = h('textarea', { maxlength: 2000, placeholder: o.placeholder ?? '', 'aria-label': o.label });
  const send = h('button', { type: 'button' }, o.submitLabel);
  const cancel = h('button', { type: 'button', class: 'sub' }, 'キャンセル');
  const msg = h('p');
  action(send, msg, async () => {
    const text = ta.value.trim();
    if (o.required && !text) throw new ApiError('invalid_input', [`${o.label}を入力してください`]);
    const r = await o.onSubmit(text);
    slot.replaceChildren();
    return r;
  });
  cancel.addEventListener('click', () => slot.replaceChildren());
  slot.replaceChildren(h('div', { class: 'subitem' }, h('label', null, o.label, o.required ? h('span', { class: 'err' }, ' *') : null), ta, h('div', { class: 'row' }, send, cancel), msg));
  ta.focus();
}

/** 画面内の確認（window.confirm の代わり） */
export function inlineConfirm(slot: HTMLElement, o: { text: string; okLabel: string; danger?: boolean; onOk: () => Promise<string | void>; onCancel?: () => void }) {
  const ok = h('button', { type: 'button', class: o.danger ? 'danger' : '' }, o.okLabel);
  const cancel = h('button', { type: 'button', class: 'sub' }, 'やめる');
  const msg = h('p');
  action(ok, msg, async () => { const r = await o.onOk(); slot.replaceChildren(); return r; });
  cancel.addEventListener('click', () => { slot.replaceChildren(); o.onCancel?.(); });
  slot.replaceChildren(h('div', { class: 'subitem' }, h('p', { style: 'margin:0' }, o.text), h('div', { class: 'row' }, ok, cancel), msg));
}
