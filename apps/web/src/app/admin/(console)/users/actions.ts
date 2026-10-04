'use server';
import { revalidatePath } from 'next/cache';
import type { Plan } from '@dealhunter/types';
import { canAssignRole } from '@dealhunter/core';
import { requireAdmin, serviceClient } from '../../../../server/admin';

type Target = 'MANAGED' | 'ADMIN' | 'SUPER_ADMIN' | 'NONE';
const TARGETS: Target[] = ['MANAGED', 'ADMIN', 'SUPER_ADMIN', 'NONE'];

/** Assign or revoke an admin-granted plan. Authorisation is re-checked on the server for every call. */
export async function setAccess(formData: FormData): Promise<{ ok: boolean; message: string }> {
  const actor = await requireAdmin();
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  const target = String(formData.get('plan') ?? '') as Target;
  if (!/^\S+@\S+\.\S+$/.test(email) || !TARGETS.includes(target)) return { ok: false, message: 'Invalid input' };
  const asPlan: Plan = target === 'NONE' ? 'FREE' : target;
  if (!canAssignRole(actor.plan, asPlan)) return { ok: false, message: 'You are not allowed to assign this role.' };

  const sb = serviceClient();
  let userId: string | null = null;
  for (let page = 1; page <= 20 && !userId; page++) {
    const { data } = await sb.auth.admin.listUsers({ page, perPage: 200 });
    userId = data.users.find((u) => u.email?.toLowerCase() === email)?.id ?? null;
    if (data.users.length < 200) break;
  }
  if (!userId) return { ok: false, message: 'User not found.' };
  if (userId === actor.id && target !== 'SUPER_ADMIN' && actor.plan === 'SUPER_ADMIN') return { ok: false, message: 'You cannot demote yourself.' };

  const { data: existing } = await sb.from('user_access').select('plan').eq('user_id', userId).maybeSingle();
  if (existing && !canAssignRole(actor.plan, existing.plan as Plan)) return { ok: false, message: 'You cannot modify a higher-privileged user.' };

  const { error } = target === 'NONE' ? await sb.from('user_access').delete().eq('user_id', userId) : await sb.from('user_access').upsert({ user_id: userId, plan: target, assigned_by: actor.id, assigned_at: new Date().toISOString() });
  if (error) return { ok: false, message: 'Update failed.' };
  await sb.schema('private').from('audit_logs').insert({ actor: actor.id, action: `access:${target}`, target: userId, meta: {} });
  revalidatePath('/admin/users');
  return { ok: true, message: target === 'NONE' ? 'Access removed.' : `Assigned ${target}.` };
}
