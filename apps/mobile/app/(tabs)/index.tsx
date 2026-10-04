import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import type { Deal } from '@dealhunter/types';
import type { HomeFeed } from '@dealhunter/api-client';
import { Body, Button, Card, DecisionBadge, ErrorState, H1, H2, Screen, Skeleton, Small, StaleNote } from '../../src/ui/kit';
import { DealCard } from '../../src/ui/DealCard';
import { AdSlot } from '../../src/ui/AdSlot';
import { useApp } from '../../src/providers/AppProvider';
import { useResource } from '../../src/lib/resource';
import { rememberDeals } from '../../src/lib/dealStore';
import { money } from '../../src/lib/format';
import { usePalette, type as t } from '../../src/theme';

function Section({ title, deals, onOpen }: { title: string; deals: Deal[]; onOpen: (d: Deal) => void }) {
  if (!deals.length) return null;
  return <View style={{ gap: 12 }}><H2>{title}</H2>{deals.slice(0, 3).map((d) => <DealCard key={d.offer.id} deal={d} onPress={() => onOpen(d)} />)}</View>;
}

export default function Home() {
  const { api, entitlements, session } = useApp(); const router = useRouter(); const c = usePalette();
  const feed = useResource<HomeFeed>(`home:${session?.userId}:${entitlements.plan}`, () => api.getHomeFeed(), [api]);
  const watch = useResource('watch', () => api.listWatchlist(), [api]);
  const [, force] = useState(0);
  const open = (d: Deal) => { rememberDeals([d]); router.push({ pathname: '/deal/[id]', params: { id: d.offer.id } }); };
  const f = feed.data;
  if (f) rememberDeals([...f.extremeDeals, ...f.buyNow, ...f.priceDrops, ...f.latest]);
  void force;

  return (
    <Screen refreshing={feed.refreshing} onRefresh={feed.refresh}>
      <H1>Find your next deal</H1>
      <Card onPress={() => router.push('/(tabs)/search')} label="Search flights" style={{ backgroundColor: c.primary }}>
        <Text style={[t.h2, { color: c.onPrimary }]}>Where to next?</Text>
        <Text style={[t.body, { color: c.onPrimary, opacity: 0.8 }]}>Search flights and get a BUY / WAIT / WATCH call.</Text>
      </Card>
      {feed.loading && !f ? <><Skeleton /><Skeleton /><Skeleton /></> : null}
      {feed.error && !f ? <ErrorState message="We couldn't load deals. Check your connection and try again." onRetry={feed.refresh} /> : null}
      {f ? (
        <>
          <StaleNote updatedAt={feed.updatedAt} fromCache={feed.fromCache} />
          <Section title="🔥 EXTREME DEAL" deals={f.extremeDeals} onOpen={open} />
          <Section title="BUY NOW" deals={f.buyNow} onOpen={open} />
          <AdSlot placement="HOME_FEED" />
          <Section title="Price drops" deals={f.priceDrops} onOpen={open} />
          {watch.data && watch.data.length ? (
            <View style={{ gap: 12 }}><H2>Watchlist update</H2>
              {watch.data.slice(0, 3).map((w) => <Card key={w.id} onPress={() => router.push('/(tabs)/watch')}><View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><Text style={[t.h3, { color: c.text }]}>{w.origin} → {w.destination}</Text>{w.lastDecision ? <DecisionBadge decision={w.lastDecision as 'BUY' | 'WAIT' | 'WATCH'} size="sm" /> : null}</View>{w.lastPrice ? <Body>{money(w.lastPrice, 'USD')}</Body> : null}</Card>)}
            </View>
          ) : null}
          <View style={{ gap: 12 }}><H2>Recommended routes</H2>
            {f.recommendedRoutes.map((r) => (
              <Card key={`${r.origin}${r.destination}`} onPress={() => router.push({ pathname: '/(tabs)/search', params: { origin: r.origin, destination: r.destination } })} label={`Search ${r.origin} to ${r.destination}`}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><Text style={[t.h3, { color: c.text }]}>{r.origin} → {r.destination}</Text><Body>from {money(r.fromPrice, r.currency)}</Body></View>
              </Card>))}
          </View>
          <Section title="Latest deals" deals={f.latest} onOpen={open} />
          <Small>Prices change in real time and forecasts are not guarantees. Always confirm the latest price before booking.</Small>
        </>
      ) : null}
      {!entitlements.advancedForecast ? <Card><H2>Go further with Premium</H2><Body muted>Advanced forecasts, instant EXTREME DEAL alerts, expanded watchlists, no ads.</Body><Button title="See Premium" variant="secondary" onPress={() => router.push('/paywall')} /></Card> : null}
    </Screen>
  );
}
