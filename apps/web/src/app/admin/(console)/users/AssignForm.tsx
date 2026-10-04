'use client';
import { useState, useTransition } from 'react';
import { setAccess } from './actions';

export default function AssignForm({ canAssignAdmin }: { canAssignAdmin: boolean }) {
  const [msg, setMsg] = useState<string | null>(null); const [pending, start] = useTransition();
  return (
    <form className="card" action={(fd) => start(async () => setMsg((await setAccess(fd)).message))}>
      <h3 style={{ marginTop: 0 }}>Assign access</h3>
      <p className="muted">MANAGED users get Premium features with no subscription and no ads. Changes are server-validated and audit-logged. Never done from the client app.</p>
      <label>User email<input name="email" type="email" required /></label>
      <label>Plan<select name="plan" defaultValue="MANAGED"><option value="MANAGED">MANAGED</option>{canAssignAdmin ? <><option value="ADMIN">ADMIN</option><option value="SUPER_ADMIN">SUPER_ADMIN</option></> : null}<option value="NONE">Remove access (back to FREE/PREMIUM)</option></select></label>
      <p><button className="btn" disabled={pending}>Apply</button> {msg ? <span role="status">{msg}</span> : null}</p>
    </form>
  );
}
