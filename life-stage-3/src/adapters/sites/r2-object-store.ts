import type { R2Bucket } from './bindings.ts';
import type { ObjectStore } from '../../application/ports.ts';

export class R2ObjectStore implements ObjectStore {
  private bucket: R2Bucket;
  constructor(bucket: R2Bucket) { this.bucket = bucket; }
  async put(key: string, body: Uint8Array, contentType: string) {
    await this.bucket.put(key, body, { httpMetadata: { contentType } });
  }
  async get(key: string) {
    const o = await this.bucket.get(key);
    if (!o) return null;
    return { body: new Uint8Array(await o.arrayBuffer()), contentType: o.httpMetadata?.contentType ?? 'application/octet-stream' };
  }
  async delete(key: string) { await this.bucket.delete(key); }
}
