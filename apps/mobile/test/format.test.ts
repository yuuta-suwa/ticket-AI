import { describe, expect, it } from 'vitest';
import { ago, duration, money, pct, REASON_TEXT } from '../src/lib/format';

describe('format helpers', () => {
  it('formats', () => { expect(duration(135)).toBe('2h 15m'); expect(pct(0.256)).toBe('26%'); expect(money(1234, 'USD')).toContain('1,234'); });
  it('relative time', () => { const n = 1_000_000_000; expect(ago(n, n)).toBe('just now'); expect(ago(n - 5 * 60_000, n)).toBe('5 min ago'); expect(ago(n - 3 * 3_600_000, n)).toBe('3 h ago'); });
  it('every reason code has user text', () => {
    for (const k of ['PRICE_NEAR_HISTORIC_LOW', 'EXTREME_MEDIAN_DEVIATION', 'RAPID_PRICE_DROP', 'HIGH_PRICE_RISE_RISK', 'LOW_ADDITIONAL_DOWNSIDE', 'INVENTORY_RISK', 'LOW_DATA_CONFIDENCE', 'INSUFFICIENT_HISTORY']) expect(REASON_TEXT[k]).toBeTruthy();
  });
});
