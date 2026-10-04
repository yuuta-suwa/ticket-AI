import { requireAdmin, serviceClient } from '../../../../server/admin';
import AssignForm from './AssignForm';

export default async function Users() {
  const actor = await requireAdmin(); const sb = serviceClient();
  const [{ data: access }, { data: ents }, { data: recent }] = await Promise.all([
    sb.from('user_access').select('user_id, plan, assigned_at').order('assigned_at', { ascending: false }).limit(200),
    sb.from('user_entitlements').select('user_id, premium_active, expires_at, will_renew').eq('premium_active', true).limit(200),
    sb.from('profiles').select('id, created_at').order('created_at', { ascending: false }).limit(25),
  ]);
  const { data: list } = await sb.auth.admin.listUsers({ page: 1, perPage: 200 });
  const email = new Map(list.users.map((u) => [u.id, u.email ?? '—']));
  return (
    <>
      <h1>Users</h1>
      <AssignForm canAssignAdmin={actor.plan === 'SUPER_ADMIN'} />
      <h2>Admin-assigned access</h2>
      <table><thead><tr><th>Email</th><th>Plan</th><th>Since</th></tr></thead><tbody>{(access ?? []).map((a) => <tr key={a.user_id}><td>{email.get(a.user_id) ?? a.user_id}</td><td>{a.plan}</td><td>{new Date(a.assigned_at).toLocaleDateString()}</td></tr>)}</tbody></table>
      <h2>Active Premium subscriptions</h2>
      <table><thead><tr><th>Email</th><th>Expires</th><th>Renews</th></tr></thead><tbody>{(ents ?? []).map((e) => <tr key={e.user_id}><td>{email.get(e.user_id) ?? e.user_id}</td><td>{e.expires_at ? new Date(e.expires_at).toLocaleDateString() : '—'}</td><td>{e.will_renew ? 'Yes' : 'No'}</td></tr>)}</tbody></table>
      <h2>Newest sign-ups</h2>
      <table><thead><tr><th>Email</th><th>Joined</th></tr></thead><tbody>{(recent ?? []).map((r) => <tr key={r.id}><td>{email.get(r.id) ?? r.id}</td><td>{new Date(r.created_at).toLocaleString()}</td></tr>)}</tbody></table>
      <p className="muted">Lookups cover the first 200 auth users; add pagination/search before this scales further.</p>
    </>
  );
}
