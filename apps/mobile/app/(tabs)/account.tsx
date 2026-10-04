import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Body, Button, Card, H1, H2, Screen, Small } from '../../src/ui/kit';
import { useApp } from '../../src/providers/AppProvider';
import { LEGAL, openLegal, openStoreSubscriptions } from '../../src/lib/links';
import { APP_IDENTITY } from '@dealhunter/config';
import { type, usePalette } from '../../src/theme';

const PLAN_TEXT = { FREE: 'Free', PREMIUM: 'Premium', MANAGED: 'Managed (Premium access included)', ADMIN: 'Admin', SUPER_ADMIN: 'Super admin' } as const;

export default function Account() {
  const { session, entitlements, purchases, refreshEntitlements, analytics, signOut } = useApp(); const router = useRouter(); const c = usePalette();
  const [msg, setMsg] = useState<string | null>(null); const [busy, setBusy] = useState(false);

  const restore = async () => {
    if (!purchases) { setMsg('Purchases are not available right now.'); return; }
    setBusy(true); setMsg(null);
    const r = await purchases.restore();
    if (r.status === 'success') { await refreshEntitlements({ pollUntilPremium: r.state.premiumActive }); analytics.track('subscription_restored'); setMsg(r.state.premiumActive ? 'Your Premium access has been restored.' : 'No active subscription was found for this store account.'); }
    else setMsg(r.status === 'error' ? r.message : 'Restore cancelled.');
    setBusy(false);
  };
  const managed = !entitlements.subscriptionRequired;

  return (
    <Screen>
      <H1>Account</H1>
      <Card><Small>Signed in as</Small><Body>{session?.email ?? '—'}</Body><Small>Plan</Small><Text style={[type.h3, { color: c.text }]}>{PLAN_TEXT[entitlements.plan]}</Text></Card>

      <H2>Subscription</H2>
      <Card>
        {managed ? <Body muted>Your account includes Premium features. No subscription is needed.</Body> : entitlements.plan === 'FREE' ? (
          <><Body muted>Advanced forecasts, instant EXTREME DEAL alerts, expanded watchlists and no ads.</Body><Button title="Upgrade to Premium" icon="star" onPress={() => { analytics.track('paywall_viewed', { from: 'account' }); router.push('/paywall'); }} /></>
        ) : <><Body>Premium is active.</Body><Button title="Manage subscription" variant="secondary" onPress={() => openStoreSubscriptions()} /></>}
        {!managed ? <Button title="Restore purchases" variant="secondary" icon="refresh" loading={busy} onPress={restore} /> : null}
        {msg ? <Small>{msg}</Small> : null}
      </Card>

      <H2>Preferences</H2>
      <Button title="Notification settings" variant="secondary" icon="notifications-outline" onPress={() => router.push('/settings/notifications')} />

      <H2>About</H2>
      <View style={{ gap: 8 }}>
        <Button title="Privacy Policy" variant="ghost" onPress={() => openLegal(LEGAL.privacy)} />
        <Button title="Terms of Service" variant="ghost" onPress={() => openLegal(LEGAL.terms)} />
        <Button title="Support" variant="ghost" onPress={() => openLegal(LEGAL.support)} />
      </View>
      <Small>DEAL HUNTER AI is a price-analysis and decision-support tool. It does not sell or issue airline tickets. Recommendations are not guarantees.</Small>

      <Button title="Sign out" variant="secondary" onPress={signOut} />
      <Button title="Delete account" variant="danger" icon="trash-outline" onPress={() => router.push('/settings/delete-account')} />
      <Small>Version {APP_IDENTITY.version}</Small>
    </Screen>
  );
}
