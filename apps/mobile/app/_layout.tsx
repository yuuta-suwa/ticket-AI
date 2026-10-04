import React, { useEffect } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as Notifications from 'expo-notifications';
import * as SplashScreen from 'expo-splash-screen';
import { View, Text } from 'react-native';
import { AppProvider, useApp } from '../src/providers/AppProvider';
import { usePalette } from '../src/theme';

void SplashScreen.preventAutoHideAsync().catch(() => {});

function Gate() {
  const { ready, session, configError, analytics } = useApp();
  const segments = useSegments(); const router = useRouter(); const c = usePalette();

  useEffect(() => { if (ready) { void SplashScreen.hideAsync().catch(() => {}); analytics.track('app_open'); } }, [ready, analytics]);
  useEffect(() => {
    if (!ready) return;
    const inAuth = segments[0] === '(auth)';
    if (!session && !inAuth) router.replace('/(auth)/login');
    else if (session && inAuth) router.replace('/(tabs)');
  }, [ready, session, segments, router]);

  // Deep link from a push notification → deal detail (dealhunter://deal/<id> works through expo-router too).
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((r) => {
      const offerId = (r.notification.request.content.data as { offerId?: string } | undefined)?.offerId;
      analytics.track('notification_opened');
      if (offerId) router.push({ pathname: '/deal/[id]', params: { id: offerId } });
    });
    return () => sub.remove();
  }, [router, analytics]);

  if (configError) return <View style={{ flex: 1, justifyContent: 'center', padding: 24, backgroundColor: c.bg }}><Text style={{ color: c.text, fontSize: 16 }}>{configError}</Text></View>;
  if (!ready) return null;
  return (
    <>
      <StatusBar style="auto" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="paywall" options={{ presentation: 'modal' }} />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  return <AppProvider><Gate /></AppProvider>;
}
