import { DomainError } from './errors.ts';

export interface StoredFile {
  id: string;
  ownerId: string;
  objectKey: string;
  contentType: string;
  size: number;
  sha256: string;
  createdAt: string;
}

export const TEST_IMAGE_MAX_BYTES = 5 * 1024 * 1024; // 5MB（スマホ写真を想定）
export const ALLOWED_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);

export function validateImage(contentType: string, size: number): void {
  if (!ALLOWED_IMAGE_TYPES.has(contentType)) throw new DomainError('invalid_input', 'unsupported type');
  if (size <= 0 || size > TEST_IMAGE_MAX_BYTES) throw new DomainError('invalid_input', 'size out of range');
}

/** 署名バイトが宣言Content-Typeと一致するか（偽装防止）。 */
export function sniffMatches(contentType: string, b: Uint8Array): boolean {
  if (contentType === 'image/png') return b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47;
  if (contentType === 'image/jpeg') return b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
  if (contentType === 'image/webp')
    return b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45;
  return false;
}

export function objectKeyFor(ownerId: string, fileId: string): string {
  return `members/${ownerId}/test-images/${fileId}`;
}

/** 標準Web Crypto（Workers/Node共通）でSHA-256を16進文字列に */
export async function sha256Hex(body: Uint8Array): Promise<string> {
  const d = new Uint8Array(await crypto.subtle.digest('SHA-256', body as unknown as ArrayBuffer));
  return Array.from(d, (x) => x.toString(16).padStart(2, '0')).join('');
}
