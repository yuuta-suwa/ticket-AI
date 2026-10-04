import React, { useMemo } from 'react';
import { View } from 'react-native';
import Svg, { Circle, Line, Path } from 'react-native-svg';
import type { PricePoint } from '@dealhunter/types';
import { Small } from './kit';
import { money } from '../lib/format';
import { usePalette } from '../theme';

/** Lightweight SVG line chart (no heavy chart library). Down-samples to ≤120 points. */
export function PriceChart({ history, current, reference, currency, width = 320, height = 150 }: { history: PricePoint[]; current: number; reference: number; currency: string; width?: number; height?: number }) {
  const c = usePalette();
  const { d, yRef, yCur, lo, hi } = useMemo(() => {
    const step = Math.max(1, Math.ceil(history.length / 120));
    const pts = history.filter((_, i) => i % step === 0).map((h) => h.price);
    const all = [...pts, current, reference];
    const lo = Math.min(...all), hi = Math.max(...all), span = Math.max(1, hi - lo);
    const pad = 8;
    const y = (v: number) => pad + (height - 2 * pad) * (1 - (v - lo) / span);
    const x = (i: number) => pad + ((width - 2 * pad) * i) / Math.max(1, pts.length - 1);
    return { d: pts.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' '), yRef: y(reference), yCur: y(current), lo, hi };
  }, [history, current, reference, width, height]);
  if (history.length < 2) return <Small>Price history is still building for this flight.</Small>;
  return (
    <View accessible accessibilityLabel={`Price history chart. Low ${money(lo, currency)}, high ${money(hi, currency)}, current ${money(current, currency)}, typical ${money(reference, currency)}`}>
      <Svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`}>
        <Line x1={0} x2={width} y1={yRef} y2={yRef} stroke={c.textMuted} strokeDasharray="4 4" strokeWidth={1} />
        <Path d={d} stroke={c.accent} strokeWidth={2} fill="none" />
        <Circle cx={width - 8} cy={yCur} r={5} fill={c.primary} stroke={c.accent} strokeWidth={2} />
      </Svg>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><Small>Low {money(lo, currency)}</Small><Small>- - typical {money(reference, currency)}</Small><Small>High {money(hi, currency)}</Small></View>
    </View>
  );
}
