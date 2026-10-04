export interface RateLimiter { hit(key: string, limit: number, windowSeconds: number, now?: number): Promise<{ allowed: boolean; remaining: number; retryAfterSeconds: number }> }

/** In-memory fixed-window limiter (tests / single instance). Production edge functions use the SQL-backed rate_limit_hit(). */
export class InMemoryRateLimiter implements RateLimiter {
  private buckets = new Map<string, { windowStart: number; count: number }>();
  async hit(key: string, limit: number, windowSeconds: number, now = Date.now()) {
    const w = windowSeconds * 1000;
    const b = this.buckets.get(key);
    if (!b || now - b.windowStart >= w) { this.buckets.set(key, { windowStart: now, count: 1 }); return { allowed: true, remaining: limit - 1, retryAfterSeconds: 0 }; }
    b.count += 1;
    const allowed = b.count <= limit;
    return { allowed, remaining: Math.max(0, limit - b.count), retryAfterSeconds: allowed ? 0 : Math.ceil((b.windowStart + w - now) / 1000) };
  }
}
