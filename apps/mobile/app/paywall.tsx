import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { DemoApi } from '@dealhunter/api-client';
import type { PurchasePackage } from '@dealhunter/core';
import { Body, Button, Card, ErrorState, H1, Loading, Screen, Small, success } from '../src/ui/kit';
import { useApp } from '../src/providers/AppProvider';
import { LEGAL, openLegal } from '../src/lib/links';
import { type, usePalette } from '../src/theme';

const BENEFITS = ['Advanced Forecast', 'Instant EXTREME DEAL alerts', 'Expanded watchlists', 'Ad-free', 'Detailed price analysis', 'Priority monitoring'];
const PERIOD: Record<string, string> = { P1W: 'week', P1M: 'month', P2M: '2 months', P3M: '3 months', P6M: '6 months', P1Y: 'year' };

export default function Paywall() {
  const { purchases, entitlements, refreshEntitlements, analytics, api } = useApp(); const router = useRouter(); const c = usePalette();
  const [pkgs, setPkgs] = useState<PurchasePackage[] | null>(null); const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null); const [msg, setMsg] = useState<string | null>(null);
  const [sel, setSel] = useState<string | null>(null);

  useEffect(() => { analytics.track('paywall_viewed'); }, [analytics]);
  useEffect(() => {
    if (!purchases) return;
    purchases.getPackages().then((p) => { setPkgs(p); setSel(p[0]?.identifier ?? null); }).catch(() => setErr('Subscription options could not be loaded from the store.'));
  }, [purchases]);

  if (!entitlements.subscriptionRequired) return <Screen edges={['top']}><H1>Premium included</H1><Body muted>Your account already includes all Premium features.</Body><Button title="Close" onPress={() => router.back()} /></Screen>;

  const buy = async () => {
    if (!purchases || !sel) return;
    setBusy('buy'); setMsg(null);
    const r = await purchases.purchase(sel);
    if (r.status === 'success') {
      analytics.track('subscription_started');
      if (api instanceof DemoApi) api.setPlan('PREMIUM'); // demo/test builds only: simulates the server webhook
      await refreshEntitlements({ pollUntilPremium: true }); // access is granted by the SERVER entitlement, not by this client result
      success(); router.back();
    } else if (r.status === 'error') setMsg(r.message);
    setBusy(null);
  };
  const restore = async () => {
    if (!purchases) return; setBusy('restore'); setMsg(null);
    const r = await purchases.restore();
    if (r.status === 'success') { await refreshEntitlements({ pollUntilPremium: r.state.premiumActive }); analytics.track('subscription_restored'); if (r.state.premiumActive) router.back(); else setMsg('No active subscription was found for this store account.'); }
    else if (r.status === 'error') setMsg(r.message);
    setBusy(null);
  };
  const chosen = pkgs?.find((p) => p.identifier === sel);

  return (
    <Screen edges={['top', 'bottom']}>
      <H1>DEAL HUNTER Premium</H1>
      <Card>{BENEFITS.map((b) => <View key={b} style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}><Ionicons name="checkmark-circle" size={20} color={c.accent} /><Body>{b}</Body></View>)}</Card>
      {!pkgs && !err ? <Loading /> : null}
      {err ? <ErrorState message={err} /> : null}
      {pkgs && !pkgs.length ? <Body muted>No subscription is available right now.</Body> : null}
      {pkgs?.map((p) => (
        <Card key={p.identifier} onPress={() => setSel(p.identifier)} label={`${p.title} ${p.priceString}`} style={sel === p.identifier ? { borderColor: c.accent, borderWidth: 2 } : undefined}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <View style={{ flex: 1 }}><Text style={[type.h3, { color: c.text }]}>{p.title}</Text><Small>{p.billingPeriod ? `Billed every ${PERIOD[p.billingPeriod] ?? p.billingPeriod}` : 'Subscription'}</Small>{p.introPriceString ? <Small>Intro offer: {p.introPriceString}</Small> : null}</View>
            <Text style={[type.h2, { color: c.text }]}>{p.priceString}</Text>
          </View>
        </Card>
      ))}
      {chosen ? <Button title={`Subscribe · ${chosen.priceString}${chosen.billingPeriod ? ` / ${PERIOD[chosen.billingPeriod] ?? chosen.billingPeriod}` : ''}`} loading={busy === 'buy'} onPress={buy} /> : null}
      <Button title="Restore purchases" variant="secondary" loading={busy === 'restore'} onPress={restore} />
      {msg ? <Small>{msg}</Small> : null}
      <Small>Payment is charged to your Apple ID / Google Play account at confirmation of purchase. The subscription renews automatically at the price shown unless cancelled at least 24 hours before the end of the current period. You can manage or cancel anytime in your App Store / Google Play account settings. Price and billing period are provided by the store.</Small>
      <View style={{ flexDirection: 'row', gap: 16 }}><Text style={{ color: c.text, textDecorationLine: 'underline' }} onPress={() => openLegal(LEGAL.terms)}>Terms of Service</Text><Text style={{ color: c.text, textDecorationLine: 'underline' }} onPress={() => openLegal(LEGAL.privacy)}>Privacy Policy</Text></View>
      <Button title="Not now" variant="ghost" onPress={() => router.back()} />
    </Screen>
  );
}
