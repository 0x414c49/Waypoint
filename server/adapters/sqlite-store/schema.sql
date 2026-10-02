-- Waypoint SQLite store (ADR-0014). Source of truth for the v2 layout.
-- Loaded and executed verbatim by sqlite-journey-store.ts on fresh init.
-- Conventions:
--   * TEXT PRIMARY KEY everywhere (existing stable domain IDs).
--   * FOREIGN KEY ... ON DELETE RESTRICT, except auth_sessions -> accounts CASCADE.
--   * JSON TEXT columns carry CHECK(json_valid(...)) for snapshots/arrays never
--     queried relationally (intent snapshots, plan snapshots, tags,
--     constraints/options/assumptions, success criteria, receipt blobs,
--     password verifiers).
--   * Light-touch CHECKs for dates/enums/positive minutes/session intervals/
--     sequence floors. Domain validation (assertValidState) stays authoritative;
--     these CHECKs are a fail-closed backstop, never a replacement.
--   * No triggers. FTS is app-maintained inside the same BEGIN IMMEDIATE
--     transaction as the row writes (delete + reinsert per touched doc).
--   * Store truth lives in the meta table (schema_version/store_revision/
--     written_at/store_id). PRAGMA user_version is a convenience marker only.

PRAGMA user_version = 1;

CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  time_zone TEXT NOT NULL,
  created_at TEXT NOT NULL CHECK(length(created_at) >= 20)
);

CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  email TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('OWNER', 'MEMBER')),
  password_verifier TEXT NOT NULL CHECK(json_valid(password_verifier)),
  totp_secret_cipher TEXT CHECK(totp_secret_cipher IS NULL OR json_valid(totp_secret_cipher)),
  last_totp_step INTEGER CHECK(last_totp_step IS NULL OR last_totp_step >= 0),
  created_at TEXT NOT NULL CHECK(length(created_at) >= 20),
  updated_at TEXT NOT NULL CHECK(length(updated_at) >= 20),
  disabled_at TEXT CHECK(disabled_at IS NULL OR length(disabled_at) >= 20)
);

CREATE TABLE IF NOT EXISTS auth_invites (
  id TEXT PRIMARY KEY,
  intended_email TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('OWNER', 'MEMBER')),
  created_by_user_id TEXT REFERENCES users(id) ON DELETE RESTRICT,
  bootstrap INTEGER NOT NULL CHECK(bootstrap IN (0, 1)),
  legacy_user_id TEXT,
  created_at TEXT NOT NULL CHECK(length(created_at) >= 20),
  expires_at TEXT NOT NULL CHECK(length(expires_at) >= 20),
  consumed_at TEXT CHECK(consumed_at IS NULL OR length(consumed_at) >= 20),
  consumed_by_user_id TEXT REFERENCES users(id) ON DELETE RESTRICT,
  revoked_at TEXT CHECK(revoked_at IS NULL OR length(revoked_at) >= 20)
);

CREATE TABLE IF NOT EXISTS auth_sessions (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL CHECK(length(created_at) >= 20),
  last_seen_at TEXT NOT NULL CHECK(length(last_seen_at) >= 20),
  expires_at TEXT NOT NULL CHECK(length(expires_at) >= 20),
  revoked_at TEXT CHECK(revoked_at IS NULL OR length(revoked_at) >= 20)
);

CREATE TABLE IF NOT EXISTS media_records (
  id TEXT PRIMARY KEY,
  filename TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  media_type TEXT NOT NULL CHECK(media_type IN ('image/png', 'image/jpeg', 'image/gif', 'image/webp')),
  byte_length INTEGER NOT NULL CHECK(byte_length >= 1),
  created_at TEXT NOT NULL CHECK(length(created_at) >= 20)
);

CREATE TABLE IF NOT EXISTS email_preferences (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  digest_unsubscribed_at TEXT CHECK(digest_unsubscribed_at IS NULL OR length(digest_unsubscribed_at) >= 20),
  updated_at TEXT NOT NULL CHECK(length(updated_at) >= 20)
);

CREATE TABLE IF NOT EXISTS quarters (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  title TEXT NOT NULL,
  description TEXT,
  mantra TEXT,
  start_date TEXT NOT NULL CHECK(start_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  end_date TEXT NOT NULL CHECK(end_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  success_criteria TEXT NOT NULL CHECK(json_valid(success_criteria)),
  plan_revision INTEGER NOT NULL CHECK(plan_revision >= 1),
  last_plan_imported_at TEXT CHECK(last_plan_imported_at IS NULL OR length(last_plan_imported_at) >= 20),
  intent_snapshot TEXT CHECK(intent_snapshot IS NULL OR json_valid(intent_snapshot)),
  created_at TEXT NOT NULL CHECK(length(created_at) >= 20),
  updated_at TEXT NOT NULL CHECK(length(updated_at) >= 20),
  CHECK(start_date <= end_date)
);

CREATE TABLE IF NOT EXISTS focus_areas (
  id TEXT PRIMARY KEY,
  quarter_id TEXT NOT NULL REFERENCES quarters(id) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  description TEXT,
  target_minutes INTEGER CHECK(target_minutes IS NULL OR target_minutes >= 1),
  position INTEGER NOT NULL CHECK(position >= 0),
  created_at TEXT NOT NULL CHECK(length(created_at) >= 20),
  updated_at TEXT NOT NULL CHECK(length(updated_at) >= 20),
  removed_from_plan_at TEXT CHECK(removed_from_plan_at IS NULL OR length(removed_from_plan_at) >= 20)
);

CREATE TABLE IF NOT EXISTS milestones (
  id TEXT PRIMARY KEY,
  quarter_id TEXT NOT NULL REFERENCES quarters(id) ON DELETE RESTRICT,
  title TEXT NOT NULL,
  description TEXT,
  start_date TEXT NOT NULL CHECK(start_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  end_date TEXT NOT NULL CHECK(end_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  mode TEXT NOT NULL CHECK(mode IN ('STANDARD', 'LIGHT', 'BUFFER', 'RETRO')),
  position INTEGER NOT NULL CHECK(position >= 0),
  intent_snapshot TEXT CHECK(intent_snapshot IS NULL OR json_valid(intent_snapshot)),
  created_at TEXT NOT NULL CHECK(length(created_at) >= 20),
  updated_at TEXT NOT NULL CHECK(length(updated_at) >= 20),
  removed_from_plan_at TEXT CHECK(removed_from_plan_at IS NULL OR length(removed_from_plan_at) >= 20),
  CHECK(start_date <= end_date)
);

CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  quarter_id TEXT NOT NULL REFERENCES quarters(id) ON DELETE RESTRICT,
  focus_area_id TEXT REFERENCES focus_areas(id) ON DELETE RESTRICT,
  milestone_id TEXT REFERENCES milestones(id) ON DELETE RESTRICT,
  planned_date TEXT NOT NULL CHECK(planned_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  title TEXT NOT NULL,
  description TEXT,
  planned_minutes INTEGER CHECK(planned_minutes IS NULL OR planned_minutes >= 1),
  tags TEXT NOT NULL CHECK(json_valid(tags)),
  position INTEGER NOT NULL CHECK(position >= 0),
  recommendation_mode TEXT NOT NULL CHECK(recommendation_mode IN ('DEFAULT', 'WHEN_CLEAR', 'OPTIONAL')),
  decision_prompt TEXT CHECK(decision_prompt IS NULL OR json_valid(decision_prompt)),
  removed_from_plan_at TEXT CHECK(removed_from_plan_at IS NULL OR length(removed_from_plan_at) >= 20),
  status TEXT NOT NULL CHECK(status IN ('NOT_STARTED', 'IN_PROGRESS', 'PAUSED', 'FINISHED', 'SKIPPED')),
  plan_snapshot TEXT CHECK(plan_snapshot IS NULL OR json_valid(plan_snapshot)),
  continuation_of_task_id TEXT REFERENCES tasks(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL CHECK(length(created_at) >= 20),
  updated_at TEXT NOT NULL CHECK(length(updated_at) >= 20)
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE RESTRICT,
  started_at TEXT NOT NULL CHECK(length(started_at) >= 20),
  ended_at TEXT CHECK(ended_at IS NULL OR length(ended_at) >= 20),
  time_zone_at_start TEXT NOT NULL,
  intention_minutes INTEGER CHECK(intention_minutes IS NULL OR intention_minutes = 10),
  created_at TEXT NOT NULL CHECK(length(created_at) >= 20),
  updated_at TEXT NOT NULL CHECK(length(updated_at) >= 20),
  corrected_at TEXT CHECK(corrected_at IS NULL OR length(corrected_at) >= 20),
  -- Deliberate denormalization (per-user active/overlap scope). Populated from
  -- tasks JOIN quarters at insert; never updated afterwards.
  owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  CHECK(ended_at IS NULL OR ended_at >= started_at)
);

CREATE TABLE IF NOT EXISTS task_lifecycle_events (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE RESTRICT,
  sequence INTEGER NOT NULL CHECK(sequence >= 1),
  type TEXT NOT NULL CHECK(type IN ('FINISHED', 'SKIPPED', 'REOPENED', 'CARRIED_FORWARD')),
  occurred_at TEXT NOT NULL CHECK(length(occurred_at) >= 20),
  time_zone_at_occurrence TEXT NOT NULL,
  related_task_id TEXT REFERENCES tasks(id) ON DELETE RESTRICT,
  -- No FK: a REOPENED event may be inserted in the same transaction as the
  -- terminal event it undoes. Domain validation enforces the reference.
  undoes_event_id TEXT,
  created_at TEXT NOT NULL CHECK(length(created_at) >= 20)
);

CREATE TABLE IF NOT EXISTS daily_reviews (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE RESTRICT,
  finish_event_id TEXT NOT NULL REFERENCES task_lifecycle_events(id) ON DELETE RESTRICT,
  outcome TEXT NOT NULL CHECK(outcome IN ('ACHIEVED', 'PARTIAL', 'NOT_ACHIEVED')),
  key_learning TEXT,
  reflection TEXT,
  created_at TEXT NOT NULL CHECK(length(created_at) >= 20),
  updated_at TEXT NOT NULL CHECK(length(updated_at) >= 20)
);

CREATE TABLE IF NOT EXISTS journey_entries (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  occurred_at TEXT NOT NULL CHECK(length(occurred_at) >= 20),
  time_zone_at_occurrence TEXT NOT NULL,
  text TEXT NOT NULL,
  tags TEXT NOT NULL CHECK(json_valid(tags)),
  related_task_id TEXT REFERENCES tasks(id) ON DELETE RESTRICT,
  related_milestone_id TEXT REFERENCES milestones(id) ON DELETE RESTRICT,
  related_decision_id TEXT REFERENCES decision_records(id) ON DELETE RESTRICT,
  changed_my_mind INTEGER NOT NULL CHECK(changed_my_mind IN (0, 1)),
  feeling TEXT CHECK(feeling IS NULL OR feeling IN ('curious', 'steady', 'stuck', 'uncertain', 'proud', 'tired')),
  created_at TEXT NOT NULL CHECK(length(created_at) >= 20),
  updated_at TEXT CHECK(updated_at IS NULL OR length(updated_at) >= 20)
);

CREATE TABLE IF NOT EXISTS decision_records (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  quarter_id TEXT REFERENCES quarters(id) ON DELETE RESTRICT,
  related_task_id TEXT REFERENCES tasks(id) ON DELETE RESTRICT,
  supersedes_decision_id TEXT REFERENCES decision_records(id) ON DELETE RESTRICT,
  title TEXT NOT NULL,
  decision_date TEXT CHECK(decision_date IS NULL OR decision_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  status TEXT NOT NULL CHECK(status IN ('DRAFT', 'ACCEPTED', 'SUPERSEDED')),
  context TEXT,
  constraints_json TEXT NOT NULL CHECK(json_valid(constraints_json)),
  options_json TEXT NOT NULL CHECK(json_valid(options_json)),
  decision TEXT,
  consequences TEXT,
  assumptions_json TEXT NOT NULL CHECK(json_valid(assumptions_json)),
  falsifier TEXT,
  initial_review_date TEXT CHECK(initial_review_date IS NULL OR initial_review_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  created_at TEXT NOT NULL CHECK(length(created_at) >= 20),
  updated_at TEXT NOT NULL CHECK(length(updated_at) >= 20)
);

CREATE TABLE IF NOT EXISTS decision_reviews (
  id TEXT PRIMARY KEY,
  decision_id TEXT NOT NULL REFERENCES decision_records(id) ON DELETE RESTRICT,
  sequence INTEGER NOT NULL CHECK(sequence >= 1),
  reviewed_at TEXT NOT NULL CHECK(length(reviewed_at) >= 20),
  time_zone_at_review TEXT NOT NULL,
  outcome TEXT NOT NULL CHECK(outcome IN ('HOLDS', 'ADJUST', 'SUPERSEDE', 'DEFERRED')),
  notes TEXT,
  next_review_date TEXT CHECK(next_review_date IS NULL OR next_review_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  replacement_decision_id TEXT REFERENCES decision_records(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL CHECK(length(created_at) >= 20)
);

-- Read-only compatibility for AIReview rows written by an earlier build.
-- The application never creates or updates these; the adapter preserves them.
-- target_id is polymorphic (TASK/WEEK/QUARTER/DECISION), so it carries no FK.
CREATE TABLE IF NOT EXISTS ai_reviews_legacy (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  target_type TEXT NOT NULL CHECK(target_type IN ('TASK', 'WEEK', 'QUARTER', 'DECISION')),
  target_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  model TEXT,
  summary TEXT,
  strengths_json TEXT NOT NULL CHECK(json_valid(strengths_json)),
  gaps_json TEXT NOT NULL CHECK(json_valid(gaps_json)),
  suggested_follow_up TEXT,
  questions_json TEXT NOT NULL CHECK(json_valid(questions_json)),
  generated_at TEXT NOT NULL CHECK(length(generated_at) >= 20),
  time_zone_at_generation TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS command_receipts (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  key TEXT NOT NULL,
  method TEXT NOT NULL,
  route TEXT NOT NULL,
  request_fingerprint TEXT NOT NULL,
  result_json TEXT NOT NULL CHECK(json_valid(result_json)),
  committed_store_revision INTEGER NOT NULL CHECK(committed_store_revision >= 1),
  created_at TEXT NOT NULL CHECK(length(created_at) >= 20),
  PRIMARY KEY (user_id, key)
);

-- FTS5 prefilter only (ADR-0014). App-maintained: the store deletes + reinserts
-- the affected doc_ids inside the same write transaction. Final ranking,
-- excerpts, and cursors stay in searchRecords (TypeScript). No triggers.
CREATE VIRTUAL TABLE IF NOT EXISTS search_docs USING fts5(
  doc_id UNINDEXED,
  user_id UNINDEXED,
  quarter_id UNINDEXED,
  group_type UNINDEXED,
  content_type UNINDEXED,
  occurred_at UNINDEXED,
  title,
  body,
  tokenize='unicode61 remove_diacritics 1'
);

CREATE INDEX IF NOT EXISTS idx_quarters_user_dates ON quarters(user_id, start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_tasks_quarter_planned ON tasks(quarter_id, planned_date);
CREATE INDEX IF NOT EXISTS idx_tasks_milestone ON tasks(milestone_id);
CREATE INDEX IF NOT EXISTS idx_tasks_focus_area ON tasks(focus_area_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_sessions_task_started ON sessions(task_id, started_at);
CREATE INDEX IF NOT EXISTS idx_sessions_owner_started ON sessions(owner_user_id, started_at);
CREATE UNIQUE INDEX IF NOT EXISTS sessions_single_active ON sessions(owner_user_id) WHERE ended_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS lifecycle_task_sequence ON task_lifecycle_events(task_id, sequence);
CREATE UNIQUE INDEX IF NOT EXISTS daily_reviews_finish_event ON daily_reviews(finish_event_id);
CREATE INDEX IF NOT EXISTS idx_journey_user_occurred ON journey_entries(user_id, occurred_at);
CREATE INDEX IF NOT EXISTS idx_decisions_user ON decision_records(user_id);
CREATE INDEX IF NOT EXISTS idx_decisions_quarter ON decision_records(quarter_id);
CREATE UNIQUE INDEX IF NOT EXISTS decision_reviews_decision_sequence ON decision_reviews(decision_id, sequence);
CREATE INDEX IF NOT EXISTS idx_decision_reviews_next_date ON decision_reviews(next_review_date);
CREATE INDEX IF NOT EXISTS idx_accounts_user ON accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_auth_sessions_account ON auth_sessions(account_id);
CREATE INDEX IF NOT EXISTS idx_auth_sessions_user ON auth_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_media_records_user ON media_records(user_id);
