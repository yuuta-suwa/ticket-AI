// deno-lint-ignore-file no-explicit-any
import { handler, json, requireCronSecret } from '../_shared/http.ts';
import { cost } from '../_shared/domain.ts';

const EXPO_URL = 'https://exp.host/--/api/v2/push/send';
Deno.serve(handler(async (req, sb) => {
  requireCronSecret(req);
  const { data: jobs } = await sb.schema('private').from('notification_jobs').select('*').eq('status', 'PENDING').lt('attempts', 3).limit(200);
  let sent = 0, failed = 0;
  for (const job of jobs ?? []) {
    const { data: devices } = await sb.from('notification_devices').select('id, push_token').eq('user_id', job.user_id).eq('enabled', true);
    if (!devices?.length) { await sb.schema('private').from('notification_jobs').update({ status: 'SKIPPED' }).eq('id', job.id); continue; }
    const messages = devices.map((d: any) => ({ to: d.push_token, title: job.payload.title, body: job.payload.body, sound: 'default', channelId: 'deals', data: { offerId: job.payload.offerId, type: job.type } }));
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      const tok = Deno.env.get('EXPO_ACCESS_TOKEN'); if (tok) headers.Authorization = `Bearer ${tok}`;
      const r = await fetch(EXPO_URL, { method: 'POST', headers, body: JSON.stringify(messages) });
      if (!r.ok) throw new Error(`expo ${r.status}`);
      const { data: tickets } = await r.json();
      (tickets ?? []).forEach(async (t: any, i: number) => { if (t.status === 'error' && t.details?.error === 'DeviceNotRegistered') await sb.from('notification_devices').update({ enabled: false }).eq('id', devices[i].id); });
      await sb.schema('private').from('notification_jobs').update({ status: 'SENT', sent_at: new Date().toISOString(), attempts: job.attempts + 1 }).eq('id', job.id);
      await cost(sb, { provider: 'expo-push', operation: 'send', request_count: messages.length });
      sent++;
    } catch (e) {
      await sb.schema('private').from('notification_jobs').update({ status: job.attempts + 1 >= 3 ? 'FAILED' : 'PENDING', attempts: job.attempts + 1, error: String(e).slice(0, 200) }).eq('id', job.id);
      failed++;
    }
  }
  return json(req, { sent, failed });
}));
