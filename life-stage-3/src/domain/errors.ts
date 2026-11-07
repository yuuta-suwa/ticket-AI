export type DomainErrorCode =
  | 'unauthenticated'
  | 'not_approved'
  | 'forbidden'
  | 'not_found'
  | 'invalid_input'
  | 'conflict';

export class DomainError extends Error {
  readonly code: DomainErrorCode;
  /** 利用者に見せてよい補足（入力不足の項目名など）。内部情報は入れない */
  readonly details: string[];
  constructor(code: DomainErrorCode, message: string = code, details: string[] = []) {
    super(message);
    this.code = code;
    this.details = details;
  }
}
