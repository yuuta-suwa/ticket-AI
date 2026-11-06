import type { Identity } from '../../domain/member.ts';

/**
 * Sites公式仕様: サインイン後、本人情報はリクエストヘッダーで転送される。
 *  - oai-authenticated-user-email（必須として扱う）
 *  - oai-authenticated-user-full-name（任意。空ならメールで代替）
 * 出典: https://learn.chatgpt.com/docs/sites/data-and-connections
 * 【実機未検証】クライアントが同名ヘッダーを偽装した場合にSitesが除去/上書きすること。
 */
export const SITES_SIGNIN_PATH = '/signin-with-chatgpt';
export const SITES_SIGNOUT_PATH = '/signout-with-chatgpt';

export function sitesIdentity(req: Request): Identity | null {
  const email = req.headers.get('oai-authenticated-user-email')?.trim();
  if (!email) return null;
  const name = decodeHeaderText(req.headers.get('oai-authenticated-user-full-name'))?.trim();
  return { email, fullName: name ? name : null };
}

/**
 * 【実機未検証】日本語氏名のヘッダー符号化方式は公式に未記載。
 * 百分率エンコード / UTF-8バイト列(latin1として届く) / そのまま のいずれでも読めるようにする。
 * 解釈できなければ null（画面はメールアドレス表示にフォールバック）。
 */
export function decodeHeaderText(v: string | null): string | null {
  if (!v) return null;
  if (/%[0-9A-Fa-f]{2}/.test(v)) {
    try { return decodeURIComponent(v); } catch { /* fallthrough */ }
  }
  if (/[\u0080-\u00ff]/.test(v) && !/[^\u0000-\u00ff]/.test(v)) {
    try {
      return new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(v, (c) => c.charCodeAt(0)));
    } catch { return null; }
  }
  return v;
}
