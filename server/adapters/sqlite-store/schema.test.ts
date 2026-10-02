// @vitest-environment node
// DDL constraint tests: the schema carries fail-closed guards (UNIQUE,
// FOREIGN KEY, CHECK) that backstop domain validation. Each guard is
// exercised with raw SQL on a scratch database built from schema.sql.
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";

const SCHEMA_SQL = readFileSync(new URL("./schema.sql", import.meta.url), "utf8");
const instant = "2026-09-27T10:00:00.000Z";

function openSchema(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys=ON;");
  db.exec(SCHEMA_SQL);
  return db;
}

function seedUserQuarterTask(db: DatabaseSync): void {
  db.prepare("INSERT INTO users (id, name, time_zone, created_at) VALUES ('u1', 'Ali', 'Europe/Amsterdam', ?)").run(
    instant,
  );
  db.prepare(
    "INSERT INTO quarters (id, user_id, title, start_date, end_date, success_criteria, plan_revision, created_at, updated_at) VALUES ('q1', 'u1', 'Q', '2026-09-01', '2026-12-31', '[]', 1, ?, ?)",
  ).run(instant, instant);
  db.prepare(
    "INSERT INTO tasks (id, quarter_id, planned_date, title, tags, position, recommendation_mode, status, created_at, updated_at) VALUES ('t1', 'q1', '2026-09-27', 'T', '[]', 0, 'DEFAULT', 'NOT_STARTED', ?, ?)",
  ).run(instant, instant);
}

function insertSession(
  db: DatabaseSync,
  id: string,
  taskId: string,
  owner: string,
  endedAt: string | null,
): void {
  db.prepare(
    "INSERT INTO sessions (id, task_id, started_at, ended_at, time_zone_at_start, created_at, updated_at, owner_user_id) VALUES (?, ?, '2026-09-27T10:00:00.000Z', ?, 'Europe/Amsterdam', ?, ?, ?)",
  ).run(id, taskId, endedAt, instant, instant, owner);
}

describe("sqlite schema guards", () => {
  it("creates every table, the FTS index, and no triggers", () => {
    const db = openSchema();
    try {
      const names = (
        db.prepare("SELECT name AS name FROM sqlite_master WHERE type = 'table'").all() as Array<{ name: string }>
      ).map((row) => row.name);
      for (const expected of [
        "meta",
        "users",
        "accounts",
        "auth_invites",
        "auth_sessions",
        "media_records",
        "email_preferences",
        "quarters",
        "focus_areas",
        "milestones",
        "tasks",
        "sessions",
        "task_lifecycle_events",
        "daily_reviews",
        "journey_entries",
        "decision_records",
        "decision_reviews",
        "ai_reviews_legacy",
        "command_receipts",
        "search_docs",
      ]) {
        expect(names).toContain(expected);
      }
      const triggers = db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'trigger'").get() as {
        n: number;
      };
      expect(triggers.n).toBe(0);
      const fts = db.prepare("SELECT sql AS sql FROM sqlite_master WHERE name = 'search_docs'").get() as {
        sql: string;
      };
      expect(fts.sql).toContain("remove_diacritics");
      expect((db.prepare("PRAGMA user_version").get() as { user_version: number }).user_version).toBe(1);
    } finally {
      db.close();
    }
  });

  it("allows one active session per user and rejects the second", () => {
    const db = openSchema();
    try {
      seedUserQuarterTask(db);
      insertSession(db, "s1", "t1", "u1", null);
      expect(() => insertSession(db, "s2", "t1", "u1", null)).toThrow(/UNIQUE constraint failed/);
      // A closed session for the same user is fine, and so is reopening activity afterwards.
      insertSession(db, "s3", "t1", "u1", "2026-09-27T10:30:00.000Z");
      db.prepare("UPDATE sessions SET ended_at = '2026-09-27T10:30:00.000Z' WHERE id = 's1'").run();
      insertSession(db, "s4", "t1", "u1", null);
    } finally {
      db.close();
    }
  });

  it("restricts deletes of referenced quarters and cascades account sessions", () => {
    const db = openSchema();
    try {
      seedUserQuarterTask(db);
      expect(() => db.prepare("DELETE FROM quarters WHERE id = 'q1'").run()).toThrow(/FOREIGN KEY constraint failed/);
      expect(() => db.prepare("DELETE FROM tasks WHERE id = 't1'").run()).not.toThrow();

      db.prepare(
        "INSERT INTO accounts (id, user_id, email, role, password_verifier, created_at, updated_at) VALUES ('a1', 'u1', 'a@x.com', 'OWNER', '{\"v\":1}', ?, ?)",
      ).run(instant, instant);
      db.prepare(
        "INSERT INTO auth_sessions (id, account_id, user_id, created_at, last_seen_at, expires_at) VALUES ('s9', 'a1', 'u1', ?, ?, ?)",
      ).run(instant, instant, instant);
      db.prepare("DELETE FROM accounts WHERE id = 'a1'").run();
      expect(
        (db.prepare("SELECT COUNT(*) AS n FROM auth_sessions").get() as { n: number }).n,
      ).toBe(0);
    } finally {
      db.close();
    }
  });

  it("rejects bad dates, enums, minutes, intervals, sequences, and JSON", () => {
    const db = openSchema();
    try {
      seedUserQuarterTask(db);
      expect(() =>
        db.prepare("UPDATE quarters SET start_date = '09/27/2026' WHERE id = 'q1'").run(),
      ).toThrow(/CHECK constraint failed/);
      expect(() => db.prepare("UPDATE quarters SET end_date = '2026-08-01' WHERE id = 'q1'").run()).toThrow(
        /CHECK constraint failed/,
      );
      expect(() => db.prepare("UPDATE tasks SET status = 'DONE' WHERE id = 't1'").run()).toThrow(
        /CHECK constraint failed/,
      );
      expect(() => db.prepare("UPDATE tasks SET planned_minutes = 0 WHERE id = 't1'").run()).toThrow(
        /CHECK constraint failed/,
      );
      expect(() => db.prepare("UPDATE tasks SET tags = 'not json' WHERE id = 't1'").run()).toThrow(
        /CHECK constraint failed/,
      );
      expect(() => insertSession(db, "sx", "t1", "u1", "2026-09-27T09:00:00.000Z")).toThrow(
        /CHECK constraint failed/,
      );
      expect(() =>
        db.prepare(
          "INSERT INTO task_lifecycle_events (id, task_id, sequence, type, occurred_at, time_zone_at_occurrence, created_at) VALUES ('e0', 't1', 0, 'FINISHED', ?, 'Europe/Amsterdam', ?)",
        ).run(instant, instant),
      ).toThrow(/CHECK constraint failed/);
    } finally {
      db.close();
    }
  });

  it("enforces receipt identity and lifecycle ordering guards", () => {
    const db = openSchema();
    try {
      seedUserQuarterTask(db);
      db.prepare(
        "INSERT INTO command_receipts (user_id, key, method, route, request_fingerprint, result_json, committed_store_revision, created_at) VALUES ('u1', 'k', 'POST', '/r', 'f', '{}', 1, ?)",
      ).run(instant);
      expect(() =>
        db.prepare(
          "INSERT INTO command_receipts (user_id, key, method, route, request_fingerprint, result_json, committed_store_revision, created_at) VALUES ('u1', 'k', 'POST', '/r', 'f', '{}', 1, ?)",
        ).run(instant),
      ).toThrow(/UNIQUE constraint failed/);
      expect(() =>
        db.prepare(
          "INSERT INTO command_receipts (user_id, key, method, route, request_fingerprint, result_json, committed_store_revision, created_at) VALUES ('ghost', 'k2', 'POST', '/r', 'f', '{}', 1, ?)",
        ).run(instant),
      ).toThrow(/FOREIGN KEY constraint failed/);
      expect(() =>
        db.prepare(
          "INSERT INTO decision_reviews (id, decision_id, sequence, reviewed_at, time_zone_at_review, outcome, created_at) VALUES ('r1', 'missing', 1, ?, 'UTC', 'HOLDS', ?)",
        ).run(instant, instant),
      ).toThrow(/FOREIGN KEY constraint failed/);
    } finally {
      db.close();
    }
  });
});
