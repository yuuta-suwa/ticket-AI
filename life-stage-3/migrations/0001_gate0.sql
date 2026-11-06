-- LIFE STAGE 3.0 Gate-0（spec/03 の論理設計に準拠した最小構成）
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  normalized_email TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS member_eligibility (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('pending','active','suspended','cancelled')),
  changed_at TEXT NOT NULL,
  changed_by TEXT
);
CREATE TABLE IF NOT EXISTS role_grants (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('admin')),
  granted_at TEXT NOT NULL,
  granted_by TEXT NOT NULL,
  revoked_at TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS role_grants_active ON role_grants(user_id, role) WHERE revoked_at IS NULL;
CREATE TABLE IF NOT EXISTS life_goals (
  id TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL,
  archived_at TEXT
);
-- Gate-0 は本人の目標1件（アーカイブ済みは除く）
CREATE UNIQUE INDEX IF NOT EXISTS life_goals_one_active ON life_goals(owner_user_id) WHERE archived_at IS NULL;
CREATE TABLE IF NOT EXISTS file_objects (
  id TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  object_key TEXT NOT NULL UNIQUE,
  content_type TEXT NOT NULL,
  size INTEGER NOT NULL,
  sha256 TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS file_objects_owner ON file_objects(owner_user_id);
CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  actor_user_id TEXT NOT NULL,
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  before_json TEXT,
  after_json TEXT,
  reason TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS audit_logs_target ON audit_logs(target_type, target_id);
