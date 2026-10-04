'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { browserClient } from '../../../lib/supabase-browser';

export default function AdminLogin() {
  const router = useRouter();
  const [email, setEmail] = useState(''); const [code, setCode] = useState(''); const [step, setStep] = useState<'email' | 'code'>('email'); const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  useEffect(() => { browserClient().auth.getSession().then(({ data }) => { if (data.session) router.replace('/admin'); }).catch(() => {}); }, [router]);
  const run = async (fn: () => Promise<void>) => { setBusy(true); setErr(null); try { await fn(); } catch (e) { setErr(e instanceof Error ? e.message : 'Failed'); } finally { setBusy(false); } };
  return (
    <main>
      <h1>Admin sign-in</h1>
      <div className="card">
        <label htmlFor="e">Email</label><input id="e" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        {step === 'code' ? <><label htmlFor="c">Code</label><input id="c" inputMode="numeric" value={code} onChange={(e) => setCode(e.target.value)} /></> : null}
        <p>{step === 'email'
          ? <button className="btn" disabled={busy} onClick={() => run(async () => { const { error } = await browserClient().auth.signInWithOtp({ email, options: { shouldCreateUser: false } }); if (error) throw error; setStep('code'); })}>Send code</button>
          : <button className="btn" disabled={busy} onClick={() => run(async () => { const { error } = await browserClient().auth.verifyOtp({ email, token: code.trim(), type: 'email' }); if (error) throw error; router.replace('/admin'); router.refresh(); })}>Sign in</button>}</p>
        {err ? <p role="alert" style={{ color: 'var(--danger)' }}>{err}</p> : null}
        <p className="muted">Access requires an admin role assigned in the database. Signing in alone grants nothing.</p>
      </div>
    </main>
  );
}
