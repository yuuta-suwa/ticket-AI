import React, { useEffect, useState } from 'react';
import { Switch, Text, TextInput, View } from 'react-native';
import type { NotificationPreferences, NotificationType } from '@dealhunter/types';
import { DEFAULT_NOTIFICATION_PREFS } from '@dealhunter/core';
import { Body, Button, Card, Chip, H2, Loading, Screen, Small, success } from '../../src/ui/kit';
import { useApp } from '../../src/providers/AppProvider';
import { radius, space, usePalette } from '../../src/theme';

const TYPES: [NotificationType, string, string][] = [
  ['EXTREME_DEAL', 'EXTREME DEAL', 'Prices far below normal'], ['BUY_SIGNAL', 'BUY signal', 'Our model says buy now'],
  ['TARGET_PRICE', 'Target price', 'A watched route hits your price'], ['PRICE_DROP', 'Price drop', 'A watched route drops ≥5%'], ['WATCHLIST_CHANGE', 'Watchlist change', 'Any notable move on your watchlist'],
];

export default function NotificationSettings() {
  const { api } = useApp(); const c = usePalette();
  const [p, setP] = useState<NotificationPreferences | null>(null); const [saved, setSaved] = useState(false); const [threshold, setThreshold] = useState(''); const [routes, setRoutes] = useState('');
  useEffect(() => { api.getNotificationPreferences().then((v) => { setP(v); setThreshold(v.priceThreshold?.toString() ?? ''); setRoutes(v.routes.join(', ')); }).catch(() => setP(DEFAULT_NOTIFICATION_PREFS)); }, [api]);
  if (!p) return <Screen><Loading /></Screen>;
  const toggle = (t: NotificationType) => setP({ ...p, enabledTypes: p.enabledTypes.includes(t) ? p.enabledTypes.filter((x) => x !== t) : [...p.enabledTypes, t] });
  const q = p.quietHours;
  const input = { backgroundColor: c.surface, color: c.text, borderColor: c.border, borderWidth: 1, borderRadius: radius.md, padding: space.md, fontSize: 16 } as const;
  const save = async () => {
    const parsed = routes.split(',').map((r) => r.trim().toUpperCase()).filter((r) => /^[A-Z]{3}-[A-Z]{3}$/.test(r));
    const th = threshold.trim() === '' ? null : Number(threshold);
    await api.saveNotificationPreferences({ ...p, routes: parsed, priceThreshold: th !== null && Number.isFinite(th) && th > 0 ? th : null }); success(); setSaved(true);
  };
  return (
    <Screen edges={[]}>
      <H2>Alert types</H2>
      <Card>{TYPES.map(([t, l, d]) => <View key={t} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}><View style={{ flex: 1 }}><Text style={{ color: c.text, fontWeight: '700' }}>{l}</Text><Small>{d}</Small></View><Switch accessibilityLabel={l} value={p.enabledTypes.includes(t)} onValueChange={() => toggle(t)} trackColor={{ true: c.accent }} /></View>)}</Card>
      <H2>Minimum deal score</H2>
      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>{[0, 50, 65, 80, 90].map((s) => <Chip key={s} label={s === 0 ? 'Any' : `${s}+`} selected={p.minScore === s} onPress={() => setP({ ...p, minScore: s })} />)}</View>
      <H2>Price threshold</H2>
      <TextInput accessibilityLabel="Maximum price" style={input} placeholder="Only alert below this price (optional)" placeholderTextColor={c.textMuted} keyboardType="numeric" value={threshold} onChangeText={setThreshold} />
      <H2>Routes</H2>
      <TextInput accessibilityLabel="Routes" style={input} placeholder="e.g. NRT-HNL, HND-SIN (blank = all)" placeholderTextColor={c.textMuted} autoCapitalize="characters" value={routes} onChangeText={setRoutes} />
      <H2>Quiet hours</H2>
      <Card>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}><Body>Silence alerts overnight</Body><Switch accessibilityLabel="Quiet hours" value={!!q} onValueChange={(v) => setP({ ...p, quietHours: v ? { startHour: 22, endHour: 8, utcOffsetMinutes: -new Date().getTimezoneOffset() } : null })} trackColor={{ true: c.accent }} /></View>
        {q ? <Small>{String(q.startHour).padStart(2, '0')}:00 – {String(q.endHour).padStart(2, '0')}:00 (your local time)</Small> : null}
      </Card>
      <Button title="Save" onPress={save} />
      {saved ? <Small>Saved.</Small> : null}
    </Screen>
  );
}
