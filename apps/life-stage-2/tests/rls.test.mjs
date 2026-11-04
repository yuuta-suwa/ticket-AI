// RLS検証：PGlite 上に auth スタブを作りマイグレーションを適用して権限を確認する
// 実行: npm i @electric-sql/pglite && node apps/life-stage-2/tests/rls.test.mjs
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
const db = new PGlite();
await db.exec(`
create role anon; create role authenticated; create role service_role;
create schema auth; grant usage on schema auth to anon, authenticated, service_role;
create table auth.users(id uuid primary key, email text);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$;
grant execute on function auth.uid() to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;`);
await db.exec(readFileSync(new URL("../supabase/migrations/0001_life_stage.sql", import.meta.url), "utf8"));
const M="00000000-0000-0000-0000-00000000000a", C="00000000-0000-0000-0000-00000000000c", A="00000000-0000-0000-0000-0000000000ad";
await db.exec(`insert into auth.users values ('${M}','m@x.jp'),('${C}','c@x.jp'),('${A}','a@x.jp');
update public.ls_profiles set role='admin' where user_id='${A}';`);
let fail=0; const ok=(c,m)=>{console.log((c?"PASS ":"FAIL ")+m); if(!c) fail++;};
async function as(uid, sql){ await db.exec(`reset role; select set_config('request.jwt.claim.sub','${uid}',false); set role authenticated;`);
  try{ return {rows:(await db.query(sql)).rows}; }catch(e){ return {err:e.message}; } finally { await db.exec("reset role"); } }
ok((await as(M,`insert into ls_work(user_id,program) values('${M}','all') returning 1`)).rows?.length===1,"member can create own 'all' work");
ok(!!(await as(M,`insert into ls_work(user_id,program) values('${M}','core')`)).err,"member cannot create 'core' work");
ok(!!(await as(M,`update ls_profiles set role='core' where user_id='${M}'`)).err,"member cannot change own role");
ok(!!(await as(M,`select public.ls_set_role('m@x.jp','core')`)).err,"member cannot call ls_set_role");
ok(!(await as(A,`select public.ls_set_role('c@x.jp','core')`)).err,"admin can grant core");
ok((await as(C,`insert into ls_work(user_id,program) values('${C}','core') returning 1`)).rows?.length===1,"core can create 'core' work");
ok((await as(M,`select * from ls_work where user_id='${C}'`)).rows?.length===0,"member cannot read others' work");
ok((await as(M,`select * from ls_profiles`)).rows?.length===1,"member sees only own profile");
ok((await as(A,`select * from ls_profiles`)).rows?.length===3,"admin sees all profiles");
ok((await as(A,`select * from ls_work where user_id='${C}'`)).rows?.length===0,"admin cannot read members' private work");
await as(A,`select public.ls_set_role('c@x.jp','member')`);
ok((await as(C,`select * from ls_work where program='core'`)).rows?.length===0,"revoked core cannot read core work");
ok(!!(await as(M,`select public.ls_ai_consume('${M}',5)`)).err,"client cannot consume AI quota directly");
ok(!!(await as(M,`select * from ls_ai_usage`)).err,"client cannot read AI usage table");
await db.exec(`select set_config('request.jwt.claim.sub','',false); set role anon;`);
let anonErr=false; try{ await db.query("select * from ls_work"); }catch{ anonErr=true; } await db.exec("reset role");
ok(anonErr,"anon cannot read work");
console.log(fail?`${fail} FAILED`:"ALL PASSED"); process.exit(fail?1:0);
