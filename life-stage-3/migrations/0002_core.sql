-- LIFE STAGE 3.0 BUILD-B：人生攻略のコア（10ステップ・LIFE MAP・ミッション・XP・週次レビュー・AI相談メモ）
-- 本人データはすべて owner_user_id を持ち、アプリ側で所有者を必ず照合する
CREATE TABLE IF NOT EXISTS goal_step_versions (
  id TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  cycle INTEGER NOT NULL DEFAULT 1,
  step_no INTEGER NOT NULL CHECK (step_no BETWEEN 1 AND 10),
  version INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('draft','completed')),
  content_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS goal_step_versions_uq ON goal_step_versions(owner_user_id, cycle, step_no, version);
CREATE TABLE IF NOT EXISTS life_stages (
  id TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  title TEXT NOT NULL,
  condition_text TEXT NOT NULL DEFAULT '',
  due_on TEXT,
  status TEXT NOT NULL CHECK (status IN ('locked','active','achieved','hold')),
  evidence_note TEXT NOT NULL DEFAULT '',
  next_challenge TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  achieved_at TEXT,
  archived_at TEXT
);
CREATE INDEX IF NOT EXISTS life_stages_owner ON life_stages(owner_user_id, position);
CREATE TABLE IF NOT EXISTS life_stage_events (
  id TEXT PRIMARY KEY,
  stage_id TEXT NOT NULL REFERENCES life_stages(id) ON DELETE CASCADE,
  owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  from_status TEXT NOT NULL,
  to_status TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS missions (
  id TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT '',
  stage_id TEXT REFERENCES life_stages(id) ON DELETE SET NULL,
  due_on TEXT,
  contribution INTEGER NOT NULL DEFAULT 3 CHECK (contribution BETWEEN 0 AND 5),
  effort INTEGER NOT NULL DEFAULT 2 CHECK (effort BETWEEN 0 AND 5),
  kpi_gap INTEGER NOT NULL DEFAULT 0 CHECK (kpi_gap BETWEEN 0 AND 5),
  verify_mode TEXT NOT NULL CHECK (verify_mode IN ('self','reviewer')),
  status TEXT NOT NULL CHECK (status IN ('not_started','in_progress','submitted','verified','returned')),
  today_on TEXT,
  evidence_note TEXT NOT NULL DEFAULT '',
  return_reason TEXT NOT NULL DEFAULT '',
  verified_by TEXT,
  verified_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  archived_at TEXT
);
CREATE INDEX IF NOT EXISTS missions_owner ON missions(owner_user_id, status);
CREATE TABLE IF NOT EXISTS mission_logs (
  id TEXT PRIMARY KEY,
  mission_id TEXT NOT NULL REFERENCES missions(id) ON DELETE CASCADE,
  owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  actor_user_id TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS mission_logs_mission ON mission_logs(mission_id);
CREATE TABLE IF NOT EXISTS xp_rule_versions (
  version INTEGER PRIMARY KEY,
  rules_json TEXT NOT NULL,
  reason TEXT NOT NULL DEFAULT '',
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL
);
-- XP台帳は追記のみ。取消は負のポイントの行を追加し、source_event_id の一意性で二重付与を防ぐ
CREATE TABLE IF NOT EXISTS xp_ledger (
  id TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source_event_id TEXT NOT NULL UNIQUE,
  rule_key TEXT NOT NULL,
  rule_version INTEGER NOT NULL,
  points INTEGER NOT NULL,
  reason TEXT NOT NULL DEFAULT '',
  awarded_on TEXT NOT NULL,
  actor_user_id TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS xp_ledger_owner ON xp_ledger(owner_user_id, awarded_on);
CREATE TABLE IF NOT EXISTS weekly_reviews (
  id TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  week_key TEXT NOT NULL,
  went_well TEXT NOT NULL DEFAULT '',
  blockers TEXT NOT NULL DEFAULT '',
  improvements TEXT NOT NULL DEFAULT '',
  next_actions TEXT NOT NULL DEFAULT '',
  submitted_at TEXT,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS weekly_reviews_uq ON weekly_reviews(owner_user_id, week_key);
CREATE TABLE IF NOT EXISTS coach_notes (
  id TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  theme TEXT NOT NULL,
  body TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('draft','adopted','discarded')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS coach_notes_owner ON coach_notes(owner_user_id, created_at);
