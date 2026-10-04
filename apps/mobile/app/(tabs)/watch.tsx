import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Body, Button, Card, DecisionBadge, Empty, ErrorState, H1, Loading, Screen, Small, StaleNote } from '../../src/ui/kit';
import { useApp } from '../../src/providers/AppProvider';
import { useResource } from '../../src/lib/resource';
import { money } from '../../src/lib/format';
import { type, usePalette } from '../../src/theme';
import type { WatchItem } from '@dealhunter/api-client';

export default function Watch() {
  const { api, entitlements } = useApp(); const router = useRouter(); const c = usePalette();
  const list = useResource<WatchItem[]>('watchlist', () => api.listWatchlist(), [api]);
  const [removing, setRemoving] = useState<string | null>(null);
  const remove = async (id: string) => { setRemoving(id); try { await api.removeFromWatchlist(id); await list.refresh(); } finally { setRemoving(null); } };
  const used = list.data?.length ?? 0;
  return (
    <Screen refreshing={list.refreshing} onRefresh={list.refresh}>
      <H1>Watchlist</H1>
      <Small>{used} of {entitlements.watchlistLimit} used · {entitlements.plan}</Small>
      {list.loading && !list.data ? <Loading /> : null}
      {list.error && !list.data ? <ErrorState message="We couldn't load your watchlist." onRetry={list.refresh} /> : null}
      {list.data && !list.data.length ? <Empty icon="eye-outline" title="Nothing watched yet" text="Open a deal and tap “Add to watchlist”. We'll alert you when the price or our recommendation changes." /> : null}
      <StaleNote updatedAt={list.updatedAt} fromCache={list.fromCache} />
      {list.data?.map((w) => (
        <Card key={w.id}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={[type.h3, { color: c.text }]}>{w.origin} → {w.destination}</Text>
            {w.lastDecision ? <DecisionBadge decision={w.lastDecision as 'BUY' | 'WAIT' | 'WATCH'} size="sm" /> : null}
          </View>
          <Body>{w.lastPrice !== null ? money(w.lastPrice, 'USD') : '—'} · departs {w.departureDate}</Body>
          {w.targetPrice ? <Small>Alert at or below {money(w.targetPrice, 'USD')}</Small> : null}
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {w.flightIdentity ? <View style={{ flex: 1 }}><Button title="Open" variant="secondary" onPress={() => router.push({ pathname: '/deal/[id]', params: { id: `${/^[a-z]+:/.test(w.flightIdentity!) ? '' : 'mock:'}${w.flightIdentity}` } })} /></View> : null}
            <View style={{ flex: 1 }}><Button title="Remove" variant="ghost" loading={removing === w.id} onPress={() => remove(w.id)} /></View>
          </View>
        </Card>
      ))}
      {!entitlements.priorityMonitoring ? <Card><Body muted>Premium watchlists are monitored more often and can hold more routes.</Body><Button title="See Premium" variant="secondary" onPress={() => router.push('/paywall')} /></Card> : null}
    </Screen>
  );
}
