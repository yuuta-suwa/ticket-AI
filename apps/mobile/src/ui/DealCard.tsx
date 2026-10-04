import React from 'react';
import { Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { Deal } from '@dealhunter/types';
import { Card, DecisionBadge, LevelBadge, Small } from './kit';
import { money, pct, duration, timeOf, ago } from '../lib/format';
import { type, usePalette } from '../theme';

export function DealCard({ deal, onPress, compact }: { deal: Deal; onPress: () => void; compact?: boolean }) {
  const c = usePalette(); const { offer: o, analysis: a } = deal;
  const discount = a.anomaly.discountPct;
  return (
    <Card onPress={onPress} label={`${o.origin} to ${o.destination}, ${money(o.price.amount, o.price.currency)}, ${a.decision.decision}`}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={[type.h3, { color: c.text }]}>{o.origin}  →  {o.destination}</Text>
        <DecisionBadge decision={a.decision.decision} size="sm" />
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 10 }}>
        <Text style={[type.price, { color: c.text }]}>{money(o.price.amount, o.price.currency)}</Text>
        {discount > 0.02 ? <Text style={{ color: c.buy, fontWeight: '700', marginBottom: 3 }}>▼ {pct(discount)} vs typical</Text> : null}
      </View>
      {!compact ? (
        <>
          <Small>Reference {money(a.anomaly.referencePrice, o.price.currency)} · Deal score {Math.round(a.anomaly.score)} · Confidence {pct(a.decision.confidence)}</Small>
          <Small>{o.carrierName} · {o.stops === 0 ? 'Nonstop' : `${o.stops} stop`} · {duration(o.durationMinutes)} · dep {timeOf(o.departureAt)}</Small>
        </>
      ) : null}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, justifyContent: 'space-between' }}>
        <LevelBadge level={a.anomaly.level} />
        <View style={{ flexDirection: 'row', gap: 4, alignItems: 'center' }}><Ionicons name="time-outline" size={12} color={c.textMuted} /><Small>{ago(new Date(o.capturedAt).getTime())}</Small></View>
      </View>
    </Card>
  );
}
