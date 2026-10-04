import React, { useEffect, useState } from 'react';
import { Text } from 'react-native';
import { useRouter } from 'expo-router';
import { Body, Button, Card, Empty, ErrorState, H1, H2, Loading, Screen, Small, StaleNote } from '../../src/ui/kit';
import { useApp } from '../../src/providers/AppProvider';
import { useResource } from '../../src/lib/resource';
import { enablePush, getPushStatus, type PushStatus } from '../../src/lib/notifications';
import { ago } from '../../src/lib/format';
import { Platform, Linking } from 'react-native';
import { type, usePalette } from '../../src/theme';

export default function Alerts() {
  const { api, entitlements } = useApp(); const router = useRouter(); const c = usePalette();
  const [push, setPush] = useState<PushStatus>('undetermined');
  const list = useResource('notifications', () => api.listNotifications(), [api]);
  useEffect(() => { void getPushStatus().then(setPush); }, []);

  const turnOn = async () => {
    const r = await enablePush(); setPush(r.status);
    if (r.token) await api.registerDevice({ pushToken: r.token, platform: Platform.OS === 'ios' ? 'ios' : 'android' });
  };
  return (
    <Screen refreshing={list.refreshing} onRefresh={list.refresh}>
      <H1>Alerts</H1>
      {push !== 'granted' ? (
        <Card>
          <H2>Get notified about great deals</H2>
          <Body muted>EXTREME DEAL, BUY signals and target-price alerts for the routes you watch. You control types, routes, minimum score and quiet hours.</Body>
          {push === 'denied' ? <><Small>Notifications are turned off in system settings.</Small><Button title="Open settings" variant="secondary" onPress={() => Linking.openSettings()} /></>
            : push === 'unsupported' ? <Small>Push notifications need a physical device.</Small>
            : <Button title="Turn on notifications" icon="notifications" onPress={turnOn} />}
        </Card>
      ) : null}
      <Button title="Notification settings" variant="secondary" icon="options-outline" onPress={() => router.push('/settings/notifications')} />
      {!entitlements.instantAlerts ? <Small>Free plan: standard alerts. Premium adds instant EXTREME DEAL alerts.</Small> : null}
      {list.loading && !list.data ? <Loading /> : null}
      {list.error && !list.data ? <ErrorState message="We couldn't load your alerts." onRetry={list.refresh} /> : null}
      {list.data && !list.data.length ? <Empty icon="notifications-outline" title="No alerts yet" text="Add routes to your watchlist and alerts will show up here." /> : null}
      <StaleNote updatedAt={list.updatedAt} fromCache={list.fromCache} />
      {list.data?.map((n) => (
        <Card key={n.id} onPress={n.dealId ? () => router.push({ pathname: '/deal/[id]', params: { id: n.dealId! } }) : undefined}>
          <Text style={[type.h3, { color: c.text }]}>{n.title}</Text><Body muted>{n.body}</Body><Small>{ago(new Date(n.createdAt).getTime())}</Small>
        </Card>
      ))}
    </Screen>
  );
}
