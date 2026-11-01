// Applies drizzle/*.sql to the LOCAL miniflare D1 used by `pnpm dev`.
// Local development only: it writes to .wrangler/state and never touches a remote database.
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const root = resolve(import.meta.dirname, "../..");
const dir = mkdtempSync(join(tmpdir(), "ig-local-d1-"));
const config = join(dir, "wrangler.json");
writeFileSync(config, JSON.stringify({
  name: "ig-local-migrate",
  compatibility_date: "2026-05-15",
  d1_databases: [{ binding: "DB", database_name: "site-creator-d1", database_id: "00000000-0000-4000-8000-000000000000", migrations_dir: join(root, "drizzle") }],
}));
const wrangler = (...args) => spawnSync(process.execPath, [join(root, "node_modules/wrangler/bin/wrangler.js"), "d1", ...args, "--local", "--config", config, "--persist-to", join(root, ".wrangler/state")], { stdio: "inherit", cwd: root, env: { ...process.env, CI: "1" } });
// --reset-data: ローカル開発DBの業務データだけを空にする（テーブル・マイグレーション履歴は残す）。
const r = process.argv.includes("--reset-data")
  ? wrangler("execute", "DB", "--command", "DELETE FROM revenue_workspaces; DELETE FROM revenue_connections; DELETE FROM revenue_ai_usage; DELETE FROM revenue_ai_jobs; DELETE FROM revenue_audit_log; DELETE FROM revenue_external_operations;")
  : wrangler("migrations", "apply", "DB");
rmSync(dir, { recursive: true, force: true });
process.exit(r.status ?? 1);
