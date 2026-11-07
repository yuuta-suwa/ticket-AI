import { DomainError } from './errors.ts';

/** 制御文字を除き、前後の空白を落として上限長で検証する */
export function cleanText(v: unknown, max: number, field = 'text'): string {
  if (v === undefined || v === null) return '';
  if (typeof v !== 'string') throw new DomainError('invalid_input', `${field} must be text`);
  const s = v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim();
  if (s.length > max) throw new DomainError('invalid_input', `${field} too long`);
  return s;
}

export function intIn(v: unknown, min: number, max: number, field: string, fallback?: number): number {
  if ((v === undefined || v === null || v === '') && fallback !== undefined) return fallback;
  const n = typeof v === 'string' ? Number(v) : v;
  if (typeof n !== 'number' || !Number.isInteger(n) || n < min || n > max) throw new DomainError('invalid_input', `${field} out of range`);
  return n;
}

export function asObject(raw: unknown): Record<string, unknown> {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new DomainError('invalid_input');
  return raw as Record<string, unknown>;
}
