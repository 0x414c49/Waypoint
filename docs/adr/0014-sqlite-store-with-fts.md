# ADR-0014: Plain SQLite store with FTS5 (supersedes JSON)

Status: Accepted — 2026-10-02 (docs-first, implementation follows)

## Context

ADR-0001 chose human-readable JSON with whole-file atomic replace, explicitly allowing a database adapter when scale, concurrency, deployment, or query needs justify it. All four now apply: Pi long-running deployment with SD power-loss risk, FTS query need (current `searchRecords` is an in-memory substring scan), WAL concurrency over temp+rename, and 360KB single-user data that still fits one file but deserves real transactions and indexes.

SQLCipher was considered and rejected: native build pain on `linux/arm64`, key-loss equals data-loss, and a new backup story for no threat-model gain on a trusted Pi disk.

## Decision

Implement one `SqliteJourneyStore` behind the unchanged `JourneyStore` port (`read`/`transact` + intents `STANDARD / PLAN_APPLY / JOURNEY_DELETE / AUTHENTICATION / SCHEMA_MIGRATION`) using Node 24 built-in `node:sqlite`. No ORM, no per-entity repositories, no triggers, no dual-write.

- Storage: ~14 normalized tables, `TEXT PRIMARY KEY` (existing stable IDs), `FOREIGN KEY … ON DELETE RESTRICT` (except `auth_sessions → accounts CASCADE`), `JSON TEXT CHECK(json_valid(...))` columns for snapshots/arrays never queried relationally (intent snapshots, plan snapshots, tags, constraints/options/assumptions, success criteria, receipt blobs).
- Indexes: quarters `(user_id, start_date, end_date)`; tasks `(quarter_id, planned_date)`, `(milestone_id)`, `(focus_area_id)`, `(status)`; sessions `(task_id, started_at)`, `(owner_user_id, started_at)` + partial `UNIQUE(owner_user_id) WHERE ended_at IS NULL` (single active session); lifecycle `(task_id, sequence)` unique; `daily_reviews(finish_event_id)` unique; journey `(user_id, occurred_at)`; decisions `(user_id)`, `(quarter_id)`; reviews `(decision_id, sequence)` unique + `(next_review_date)`; auth/receipt lookup indexes.
- `sessions.owner_user_id` is the one deliberate denormalization (per-user active/overlap scope); populated from `tasks ⋈ quarters` at insert, never updated.
- Pragmas: `journal_mode=WAL; synchronous=FULL; foreign_keys=ON; busy_timeout=5000`. File `data/store/waypoint.db` mode `0600`. Keep existing in-process mutex; map SQLite `BUSY` to `STORE_BUSY`.
- Validation stays monolithic: materialize whole `JourneyState`, reuse `assertValidState` + `assertJourneyStateTransition` unchanged. Indexed queries serve reads/prefilter; integrity logic is not rewritten as triggers.
- FTS5 ships day one as prefilter only: `search_docs(doc_id UNINDEXED, user_id UNINDEXED, quarter_id UNINDEXED, group_type UNINDEXED, content_type UNINDEXED, occurred_at UNINDEXED, title, body, tokenize='unicode61 remove_diacritics 1')`, app-maintained inside the same `BEGIN IMMEDIATE` transaction (delete + reinsert per touched doc). Final ranking/excerpts/cursor stay in existing `searchRecords` code; `bm25` orders prefilter only.
- Field-level crypto unchanged: scrypt password verifiers + AES-256-GCM TOTP secrets with `data/store/auth.key`. No at-rest DB encryption beyond filesystem perms + host disk encryption.

## Why

Satisfies "proper DB with indexes" without violating KISS: normalized storage and indexes where they matter, one adapter file where complexity would otherwise spread. `node:sqlite` removes the Pi native-build risk that `better-sqlite3`/SQLCipher carry. App-maintained FTS avoids hidden trigger logic on a single-writer app.

## Consequences

- ADR-0001 is superseded; JSON adapter is deleted after one verified SQLite release. Backup unit becomes `waypoint.db + auth.key` (+ legacy `media/` until ADR-0015 cutover).
- Migration is automatic on boot, not a manual script. `docker pull latest + restart` is the whole upgrade because the volume (`/app/data`, mounted at `JOURNEY_STORE_DIR`) already holds everything the migrator needs. Boot logic:
  - `waypoint.db` exists → open SQLite, verify, serve. Untouched `journey-state.json` (if still present) is ignored; SQLite is authoritative.
  - `waypoint.db` missing + `journey-state.json` exists → run the one-time `v1 → v2` importer inside startup before listening: validate source (fail closed, no repair), copy `journey-state.json` to `journey-state.pre-sqlite-<timestamp>.json` in the same directory, create `waypoint.db` (`0600`), load in FK order in one transaction, rebuild FTS, verify row counts + `storeRevision` + receipts + zero double-active-timers + FK check + search parity sample. Log counts + backup path. Then serve from SQLite.
  - Neither exists → fresh SQLite init with the production seed (same semantics as current JSON first-run).
  - Partial `waypoint.db` (crash mid-migration, integrity/meta check fails) → delete partial DB, retry from the untouched JSON on next boot. JSON is never deleted or overwritten by the migrator.
  - Corrupt JSON or failed verification → fatal startup error (`STORE_CORRUPT` / `RECOVERY_REQUIRED`), no listening, everything preserved, operator restores from backup. Same fail-closed posture as today.
- No dual-write: after a successful auto-migration all writes go to SQLite only; the frozen JSON + pre-sqlite backup remain as file-restore rollback for one release, then are eligible for manual deletion after an encrypted off-Pi backup is verified.
- No receipt expiry, no backup rotation, no keyset pagination, no downgrade path. Multi-process sharing remains unsupported beyond `BEGIN IMMEDIATE` + mutex.
