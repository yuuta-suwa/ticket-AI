export type DomainErrorCode =
  | 'unauthenticated'
  | 'not_approved'
  | 'forbidden'
  | 'not_found'
  | 'invalid_input';

export class DomainError extends Error {
  readonly code: DomainErrorCode;
  constructor(code: DomainErrorCode, message: string = code) {
    super(message);
    this.code = code;
  }
}
