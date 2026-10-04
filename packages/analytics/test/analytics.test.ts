import { describe, expect, it } from 'vitest';
import { MemoryAnalytics, sanitizeProps, SanitizingAnalytics } from '../src';

describe('analytics privacy', () => {
  it('strips PII keys and email-like values', () => {
    expect(sanitizeProps({ email: 'a@b.com', route: 'NRT-HNL', note: 'me@x.org', user_id: 'u1', score: 90, push_token: 'x' })).toEqual({ route: 'NRT-HNL', score: 90 });
  });
  it('wrapper sanitises and never throws', () => {
    const m = new MemoryAnalytics();
    new SanitizingAnalytics(m).track('search_started', { email: 'a@b.com', cabin: 'ECONOMY' });
    expect(m.events[0]?.props).toEqual({ cabin: 'ECONOMY' });
    expect(() => new SanitizingAnalytics({ track() { throw new Error('x'); } }).track('app_open')).not.toThrow();
  });
});
