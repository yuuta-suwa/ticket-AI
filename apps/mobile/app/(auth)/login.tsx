import React, { useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { Body, Button, H1, Screen, Small } from '../../src/ui/kit';
import { useApp } from '../../src/providers/AppProvider';
import { LEGAL, openLegal } from '../../src/lib/links';
import { radius, space, type, usePalette } from '../../src/theme';

export default function Login() {
  const { auth } = useApp(); const c = usePalette();
  const [email, setEmail] = useState(''); const [code, setCode] = useState(''); const [password, setPassword] = useState('');
  const [step, setStep] = useState<'email' | 'code' | 'password'>('email'); const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null);
  const input = { backgroundColor: c.surface, color: c.text, borderColor: c.border, borderWidth: 1, borderRadius: radius.md, padding: space.lg, fontSize: 17 } as const;

  const run = async (fn: () => Promise<void>) => { setBusy(true); setErr(null); try { await fn(); } catch (e) { setErr(e instanceof Error ? e.message : 'Something went wrong'); } finally { setBusy(false); } };
  const valid = /^\S+@\S+\.\S+$/.test(email.trim());

  return (
    <Screen>
      <View style={{ gap: space.sm, marginTop: space.xl }}>
        <H1>DEAL HUNTER AI</H1>
        <Body muted>AI finds price anomalies and tells you whether to buy now or wait.</Body>
      </View>
      <View style={{ gap: space.md }}>
        <TextInput accessibilityLabel="Email address" style={input} placeholder="Email address" placeholderTextColor={c.textMuted} autoCapitalize="none" autoComplete="email" keyboardType="email-address" textContentType="emailAddress" value={email} onChangeText={setEmail} editable={step === 'email' || step === 'password'} />
        {step === 'code' ? <TextInput accessibilityLabel="6-digit code" style={input} placeholder="6-digit code" placeholderTextColor={c.textMuted} keyboardType="number-pad" textContentType="oneTimeCode" maxLength={8} value={code} onChangeText={setCode} /> : null}
        {step === 'password' ? <TextInput accessibilityLabel="Password" style={input} placeholder="Password" placeholderTextColor={c.textMuted} secureTextEntry textContentType="password" value={password} onChangeText={setPassword} /> : null}
        {err ? <Text accessibilityRole="alert" style={[type.small, { color: c.danger }]}>{err}</Text> : null}
        {step === 'email' ? <Button title="Email me a sign-in code" disabled={!valid} loading={busy} onPress={() => run(async () => { await auth.sendEmailCode(email.trim()); setStep('code'); })} /> : null}
        {step === 'code' ? <><Button title="Verify and continue" disabled={code.length < 6} loading={busy} onPress={() => run(() => auth.verifyEmailCode(email.trim(), code.trim()))} /><Button title="Use a different email" variant="ghost" onPress={() => { setStep('email'); setCode(''); }} /></> : null}
        {step === 'password' ? <Button title="Sign in" disabled={!valid || !password} loading={busy} onPress={() => run(() => auth.signInWithPassword(email.trim(), password))} /> : null}
        {step !== 'password' ? <Button title="Sign in with a password instead" variant="ghost" onPress={() => setStep('password')} /> : <Button title="Use an email code instead" variant="ghost" onPress={() => setStep('email')} />}
      </View>
      <Small>By continuing you agree to the <Text style={{ textDecorationLine: 'underline' }} onPress={() => openLegal(LEGAL.terms)}>Terms of Service</Text> and acknowledge the <Text style={{ textDecorationLine: 'underline' }} onPress={() => openLegal(LEGAL.privacy)}>Privacy Policy</Text>.</Small>
    </Screen>
  );
}
