'use client';
import { useState } from 'react';
import { browserClient } from '../../lib/supabase-browser';

type Step = 'email' | 'code' | 'confirm' | 'done';

/** Self-service web deletion (Google Play requirement): verify email ownership with a one-time code, then permanently delete. */
export default function DeletionFlow() {
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState(''); const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null); const [notice, setNotice] = useState<string | null>(null);
  const run = async (fn: () => Promise<void>) => { setBusy(true); setErr(null); try { await fn(); } catch (e) { setErr(e instanceof Error ? e.message : 'Something went wrong'); } finally { setBusy(false); } };

  return (
    <div className="card">
      {step === 'email' && (<>
        <label htmlFor="email"><b>Email address of the account</b></label>
        <input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <p><button className="btn" disabled={busy || !/^\S+@\S+\.\S+$/.test(email)} onClick={() => run(async () => { const { error } = await browserClient().auth.signInWithOtp({ email, options: { shouldCreateUser: false } }); if (error) throw error; setStep('code'); })}>Send verification code</button></p>
      </>)}
      {step === 'code' && (<>
        <label htmlFor="code"><b>Code sent to {email}</b></label>
        <input id="code" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value)} />
        <p><button className="btn" disabled={busy || code.length < 6} onClick={() => run(async () => { const { error } = await browserClient().auth.verifyOtp({ email, token: code.trim(), type: 'email' }); if (error) throw error; setStep('confirm'); })}>Verify</button></p>
      </>)}
      {step === 'confirm' && (<>
        <p><b>This permanently deletes your account and personal data</b> (profile, watchlist, saved deals, search history, notification settings and devices). It cannot be undone.</p>
        <p className="muted">If you have a Premium subscription, deleting your account does <b>not</b> cancel it. Cancel it in your App Store / Google Play subscription settings first.</p>
        <p><button className="btn danger" disabled={busy} onClick={() => run(async () => { const sb = browserClient(); const { data, error } = await sb.functions.invoke('delete-account', { body: { confirm: true } }); if (error) throw new Error('Deletion failed. Please try again or contact support.'); setNotice((data as { notice?: string })?.notice ?? null); await sb.auth.signOut(); setStep('done'); })}>Permanently delete my account</button></p>
      </>)}
      {step === 'done' && (<><h3>Your account has been deleted.</h3>{notice ? <p className="muted">{notice}</p> : null}</>)}
      {err ? <p role="alert" style={{ color: 'var(--danger)' }}>{err}</p> : null}
    </div>
  );
}
