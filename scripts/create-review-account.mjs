// Creates the App Review account. Run server-side with the service role; credentials come from env, never from the repo.
//   SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… REVIEW_EMAIL=… REVIEW_PASSWORD=… [REVIEW_MANAGED_EMAIL=… REVIEW_MANAGED_PASSWORD=…] node scripts/create-review-account.mjs
// The review account sees the deterministic demo market dataset (profiles.review_mode=true, settable only by service role)
// while purchases, restore, push and deletion use the real backend. Optional second account demonstrates the MANAGED role.
import { createClient } from '@supabase/supabase-js';
const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, REVIEW_EMAIL, REVIEW_PASSWORD, REVIEW_MANAGED_EMAIL, REVIEW_MANAGED_PASSWORD } = process.env;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !REVIEW_EMAIL || !REVIEW_PASSWORD) { console.error('Missing env. See header of this script.'); process.exit(1); }
const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
async function ensure(email, password, managed) {
  let id;
  const { data, error } = await sb.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) {
    const list = await sb.auth.admin.listUsers({ perPage: 200 });
    id = list.data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase())?.id;
    if (!id) throw error;
    await sb.auth.admin.updateUserById(id, { password });
  } else id = data.user.id;
  await sb.from('profiles').update({ review_mode: true }).eq('id', id);
  if (managed) await sb.from('user_access').upsert({ user_id: id, plan: 'MANAGED', assigned_at: new Date().toISOString() });
  console.log(`ready: ${email}${managed ? ' (MANAGED)' : ''}`);
}
await ensure(REVIEW_EMAIL, REVIEW_PASSWORD, false);
if (REVIEW_MANAGED_EMAIL && REVIEW_MANAGED_PASSWORD) await ensure(REVIEW_MANAGED_EMAIL, REVIEW_MANAGED_PASSWORD, true);
