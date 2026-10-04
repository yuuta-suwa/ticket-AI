import React, { useState } from 'react';
import { Text } from 'react-native';
import { useRouter } from 'expo-router';
import { Body, Button, Card, H2, Screen, Small } from '../../src/ui/kit';
import { useApp } from '../../src/providers/AppProvider';
import { openStoreSubscriptions } from '../../src/lib/links';
import { usePalette } from '../../src/theme';

export default function DeleteAccount() {
  const { api, entitlements, analytics, signOut } = useApp(); const router = useRouter(); const c = usePalette();
  const [step, setStep] = useState<'info' | 'confirm'>('info'); const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null);
  const paying = entitlements.plan === 'PREMIUM';
  const run = async () => {
    setBusy(true); setErr(null);
    try { await api.deleteAccount(); analytics.track('account_deleted'); await signOut(); router.replace('/(auth)/login'); }
    catch { setErr('We could not delete your account. Please try again or use the web deletion page.'); setBusy(false); }
  };
  return (
    <Screen edges={[]}>
      <H2>Delete your account</H2>
      <Body>This permanently deletes your account and personal data: profile, watchlist, saved deals, search history, notification settings and registered devices. This cannot be undone.</Body>
      {paying ? (
        <Card style={{ backgroundColor: c.warnBg }}>
          <Text style={{ color: c.warnText, fontWeight: '700' }}>Your Premium subscription is not cancelled automatically</Text>
          <Small>Deleting your account does not stop billing from Apple or Google. Cancel it in your store account settings first to avoid further charges.</Small>
          <Button title="Manage subscription" variant="secondary" onPress={() => openStoreSubscriptions()} />
        </Card>
      ) : null}
      {step === 'info' ? <Button title="Continue" variant="secondary" onPress={() => setStep('confirm')} /> : (
        <Card><H2>Are you sure?</H2><Body muted>Tap below to delete your account now.</Body>
          <Button title="Permanently delete my account" variant="danger" loading={busy} onPress={run} />
          <Button title="Cancel" variant="ghost" onPress={() => router.back()} />
          {err ? <Small style={{ color: c.danger }}>{err}</Small> : null}
        </Card>
      )}
    </Screen>
  );
}
