// Cloudflare D1 / R2 バインディングのうち本アプリが使う最小部分。
// 公式型パッケージに依存せず、テスト用フェイクと差し替え可能にする。
export interface D1Result<T> { results: T[] }
export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  run(): Promise<unknown>;
}
export interface D1Database { prepare(sql: string): D1PreparedStatement }

export interface R2ObjectBody {
  arrayBuffer(): Promise<ArrayBuffer>;
  httpMetadata?: { contentType?: string };
}
export interface R2Bucket {
  put(key: string, value: Uint8Array | ArrayBuffer, options?: { httpMetadata?: { contentType?: string } }): Promise<unknown>;
  get(key: string): Promise<R2ObjectBody | null>;
  delete(key: string): Promise<void>;
}

/** 接続名は .openai/hosting.json（d1: "DB", r2: "BUCKET"）と一致させる */
export interface Env {
  DB: D1Database;
  BUCKET: R2Bucket;
  /** カンマ区切り。初期管理者のメール（秘密情報ではない設定値） */
  ADMIN_EMAILS?: string;
  /** ローカル開発専用。本番では未設定にすること */
  DEV_AUTH?: string;
}
