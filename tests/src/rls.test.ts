import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { PLAN_LIMITS } from '@dealhunter/config';
import { addUser, as, denied, freshDb } from './harness';

let db: PGlite; let alice: string; let bob: string;
const watch = (uid: string, id = 'NRT-HNL:XA:2026-08-15:ECONOMY') => db.query(`insert into public.watchlists(user_id, origin, destination, departure_date, flight_identity) values ($1,'NRT','HNL','2026-08-15',$2)`, [uid, id]);

beforeAll(async () => { db = await freshDb(); alice = await addUser(db, 'alice@example.com'); bob = await addUser(db, 'bob@example.com'); });
afterAll(async () => { await db.close(); });

describe('RLS: structure', () => {
  it('every table in public and private has RLS enabled', async () => {
    const r = await db.query<{ n: string; rls: boolean }>(`select n.nspname||'.'||c.relname as n, c.relrowsecurity as rls from pg_class c join pg_namespace n on n.oid=c.relnamespace where c.relkind='r' and n.nspname in ('public','private')`);
    expect(r.rows.length).toBeGreaterThan(20);
    expect(r.rows.filter((x) => !x.rls).map((x) => x.n)).toEqual([]);
  });
  it('no public/anon/authenticated grants on private tables', async () => {
    const r = await db.query<{ t: string }>(`select table_schema||'.'||table_name as t from information_schema.role_table_grants where table_schema='private' and grantee in ('anon','authenticated','PUBLIC')`);
    expect(r.rows).toEqual([]);
  });
  it('plan_limits table matches packages/config PLAN_LIMITS', async () => {
    const r = await db.query<{ plan: keyof typeof PLAN_LIMITS; watchlist_limit: number }>('select plan, watchlist_limit from public.plan_limits');
    expect(r.rows.length).toBe(Object.keys(PLAN_LIMITS).length);
    for (const row of r.rows) expect(row.watchlist_limit).toBe(PLAN_LIMITS[row.plan].watchlistLimit);
  });
});

describe('RLS: cross-user access', () => {
  it('users cannot read or write each other\'s watchlists', async () => {
    await as(db, 'authenticated', alice, () => watch(alice));
    const seenByBob = await as(db, 'authenticated', bob, () => db.query('select * from public.watchlists'));
    expect(seenByBob.rows).toHaveLength(0);
    expect(await as(db, 'authenticated', bob, () => denied(watch(alice, 'other')))).toBe(true);           // insert as someone else
    const del = await as(db, 'authenticated', bob, () => db.query('delete from public.watchlists returning id'));
    expect(del.rows).toHaveLength(0);                                                                      // cannot delete alice's rows
    const seenByAlice = await as(db, 'authenticated', alice, () => db.query('select * from public.watchlists'));
    expect(seenByAlice.rows).toHaveLength(1);
  });
  it('anon cannot read user data', async () => {
    expect(await as(db, 'anon', null, () => denied(db.query('select * from public.watchlists')))).toBe(true);
    expect(await as(db, 'anon', null, () => denied(db.query('select * from public.profiles')))).toBe(true);
  });
  it('profiles are private to the owner', async () => {
    const r = await as(db, 'authenticated', bob, () => db.query('select id from public.profiles'));
    expect(r.rows.map((x) => (x as { id: string }).id)).toEqual([bob]);
  });
  it('notification devices / preferences / history are owner-only', async () => {
    await as(db, 'authenticated', alice, () => db.query(`insert into public.notification_devices(user_id, platform, push_token) values ($1,'ios','ExponentPushToken[a]')`, [alice]));
    expect((await as(db, 'authenticated', bob, () => db.query('select * from public.notification_devices'))).rows).toHaveLength(0);
    expect(await as(db, 'authenticated', bob, () => denied(db.query(`insert into public.notification_devices(user_id, platform, push_token) values ($1,'ios','ExponentPushToken[b]')`, [alice])))).toBe(true);
    expect((await as(db, 'authenticated', bob, () => db.query('select * from public.notification_preferences'))).rows).toHaveLength(1); // only bob's own default row
  });
});

describe('Role escalation / entitlement tampering', () => {
  it('a user cannot grant themselves premium, managed, or admin', async () => {
    expect(await as(db, 'authenticated', alice, () => denied(db.query(`insert into public.user_entitlements(user_id, premium_active) values ($1,true)`, [alice])))).toBe(true);
    expect(await as(db, 'authenticated', alice, () => denied(db.query(`insert into public.user_access(user_id, plan) values ($1,'SUPER_ADMIN')`, [alice])))).toBe(true);
    expect(await as(db, 'authenticated', alice, () => denied(db.query(`update public.user_access set plan='SUPER_ADMIN'`)))).toBe(true);
    expect(await as(db, 'authenticated', alice, () => denied(db.query(`insert into public.subscriptions(user_id, status) values ($1,'ACTIVE')`, [alice])))).toBe(true);
  });
  it('a user cannot flip review_mode or edit protected profile columns, but can edit allowed ones', async () => {
    expect(await as(db, 'authenticated', alice, () => denied(db.query('update public.profiles set review_mode = true where id = $1', [alice])))).toBe(true);
    await as(db, 'authenticated', alice, () => db.query(`update public.profiles set display_name = 'Alice' where id = $1`, [alice]));
    expect(((await db.query('select review_mode from public.profiles where id=$1', [alice])).rows[0] as { review_mode: boolean }).review_mode).toBe(false);
  });
  it('users cannot read other users\' entitlements; webhook (service role) can write', async () => {
    await as(db, 'service_role', null, () => db.query(`insert into public.user_entitlements(user_id, premium_active, expires_at) values ($1,true, now() + interval '30 days')`, [bob]));
    expect((await as(db, 'authenticated', alice, () => db.query('select * from public.user_entitlements'))).rows).toHaveLength(0);
    expect((await as(db, 'authenticated', bob, () => db.query('select * from public.user_entitlements'))).rows).toHaveLength(1);
  });
  it('notification_history: users may only mark read', async () => {
    await as(db, 'service_role', null, () => db.query(`insert into public.notification_history(user_id,type,title,body,dedupe_key) values ($1,'BUY_SIGNAL','t','b','k1')`, [alice]));
    expect(await as(db, 'authenticated', alice, () => denied(db.query(`update public.notification_history set title='x'`)))).toBe(true);
    await as(db, 'authenticated', alice, () => db.query(`update public.notification_history set read_at = now()`));
  });
});

describe('Private intelligence data', () => {
  it.each(['price_snapshots', 'recommendations', 'model_outcomes', 'ai_explanations', 'provider_logs', 'cost_events', 'audit_logs', 'notification_jobs', 'flight_offers', 'forecasts', 'anomaly_results'])('private.%s is unreachable by clients', async (t) => {
    expect(await as(db, 'authenticated', alice, () => denied(db.query(`select * from private.${t}`)))).toBe(true);
    expect(await as(db, 'anon', null, () => denied(db.query(`select * from private.${t}`)))).toBe(true);
  });
  it('service role can use them', async () => {
    await as(db, 'service_role', null, () => db.query(`insert into private.price_snapshots(route, flight_identity, provider, departure_date, cabin, price, currency) values ('NRT-HNL','x','mock','2026-08-15','ECONOMY',500,'USD')`));
    expect((await as(db, 'service_role', null, () => db.query('select * from private.price_snapshots'))).rows).toHaveLength(1);
  });
  it('rate limiter and deletion helper are service-role only', async () => {
    expect(await as(db, 'authenticated', alice, () => denied(db.query(`select * from public.rate_limit_hit('k', 1, 60)`)))).toBe(true);
    expect(await as(db, 'authenticated', alice, () => denied(db.query(`select public.delete_user_data($1)`, [bob])))).toBe(true);
    const hit = (_n: number) => as(db, 'service_role', null, async () => (await db.query<{ allowed: boolean }>(`select * from public.rate_limit_hit('rl-test', 2, 60)`)).rows[0]?.allowed);
    expect([await hit(1), await hit(2), await hit(3)]).toEqual([true, true, false]);
  });
});

describe('Server-enforced watchlist limits', () => {
  it('FREE is capped at 3; PREMIUM and MANAGED get more; limit is enforced by the database', async () => {
    const carol = await addUser(db, 'carol@example.com');
    for (let i = 0; i < PLAN_LIMITS.FREE.watchlistLimit; i++) await as(db, 'authenticated', carol, () => watch(carol, `id${i}`));
    expect(await as(db, 'authenticated', carol, () => denied(watch(carol, 'overflow')))).toBe(true);
    await as(db, 'service_role', null, () => db.query(`insert into public.user_access(user_id, plan) values ($1,'MANAGED')`, [carol]));
    await as(db, 'authenticated', carol, () => watch(carol, 'managed-extra'));
    expect(((await db.query<{ p: string }>('select public.effective_plan($1) as p', [carol])).rows[0] as { p: string }).p).toBe('MANAGED');
  });
  it('expired premium falls back to FREE', async () => {
    const dave = await addUser(db, 'dave@example.com');
    await db.query(`insert into public.user_entitlements(user_id, premium_active, expires_at) values ($1,true, now() - interval '1 day')`, [dave]);
    expect(((await db.query<{ p: string }>('select public.effective_plan($1) as p', [dave])).rows[0] as { p: string }).p).toBe('FREE');
  });
});

describe('Account deletion', () => {
  it('delete_user_data removes personal rows and anonymises audit/cost data', async () => {
    const erin = await addUser(db, 'erin@example.com');
    await as(db, 'authenticated', erin, () => watch(erin, 'e1'));
    await db.query(`insert into private.cost_events(provider, operation, user_id) values ('mock','search',$1)`, [erin]);
    await db.query(`insert into private.audit_logs(actor, action) values ($1,'x')`, [erin]);
    await as(db, 'service_role', null, () => db.query('select public.delete_user_data($1)', [erin]));
    await db.query('delete from auth.users where id=$1', [erin]);
    for (const t of ['watchlists', 'notification_preferences', 'profiles']) {
      expect((await db.query(`select 1 from public.${t} where ${t === 'profiles' ? 'id' : 'user_id'}=$1`, [erin])).rows).toHaveLength(0);
    }
    expect((await db.query('select 1 from private.cost_events where user_id=$1', [erin])).rows).toHaveLength(0);
    expect((await db.query('select 1 from private.audit_logs where actor=$1', [erin])).rows).toHaveLength(0);
  });
});
