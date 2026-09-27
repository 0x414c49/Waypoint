# Persistence Contract

Status: Proposed for API/persistence confirmation

## Goal

Use one small storage port so application/domain behavior does not know that v1 persists to JSON. Keep the first adapter human-readable and safe without building an ORM, repository framework, or speculative database layer.

```text
JourneyStore
  └── JsonJourneyStore (v1)

Future, only when needed:
  ├── SqliteJourneyStore
  ├── PostgresJourneyStore
  └── MongoJourneyStore
```

## JourneyStore port

Conceptual interface:

```text
read(project)
  - provide one validated immutable JourneyState snapshot
  - return the projector result

transact(mutate)
  - acquire serialized write authority
  - reload and validate current state
  - clone to a mutable draft
  - run a pure in-memory mutation
  - validate candidate and old→new transition
  - commit exactly once or not at all
  - return mutation result
```

The mutation result distinguishes Changed from No change. Reads and true no-ops do not increment `storeRevision`.

Responsibilities deliberately outside the store:

- ID generation
- clock/current timestamp selection
- Today recommendation
- lifecycle decision logic
- plan diff semantics
- AI calls
- HTTP mapping

The callback performs no network/filesystem side effects and cannot leak its mutable draft. A later SQL adapter may initially implement the same user-scale unit-of-work contract; do not create one repository per entity now.

## Human-readable JSON document

```json
{
  "schemaVersion": 1,
  "storeRevision": 83,
  "writtenAt": "2026-11-03T18:10:00Z",
  "records": {
    "users": {},
    "quarters": {},
    "focusAreas": {},
    "milestones": {},
    "tasks": {},
    "sessions": {},
    "taskLifecycleEvents": {},
    "dailyReviews": {},
    "journeyEntries": {},
    "decisionRecords": {},
    "decisionReviews": {},
    "aiReviews": {}
  },
  "commandReceipts": {}
}
```

Rules:

- Collections are objects keyed by record ID; each map key equals the contained record’s `id`.
- Child records remain top-level with foreign-key IDs; history is not deeply embedded in Task.
- Serialize with stable key ordering, two-space indentation, and a final newline.
- Use word enums, ISO local dates, and UTC instants.
- Omit absent optional values or use a documented null consistently; do not invent placeholders.
- Never persist derived totals, recommendations, timer counters, contribution cells, progress percentages, or scores.
- File permissions are private to the current user where supported.

`schemaVersion`, `storeRevision`, and Quarter `planRevision` remain distinct.

## Command receipts

Receipts make command retries safe across response loss and process restart.

```text
CommandReceipt
  userId
  key
  method
  route
  requestFingerprint
  outcomeKind
  createdRecordIds[]
  affectedRecordIds[]
  committedStoreRevision
  createdAt
```

- Receipt key is User + `Idempotency-Key`.
- Same fingerprint returns the same committed domain outcome without re-running the mutation.
- Different fingerprint conflicts.
- Store identifiers/outcome facts, not a duplicate full Dashboard body. Replay reconstructs current representations around the original created/affected IDs and marks `Idempotency-Replayed: true`.
- The first semantically no-op command still writes one receipt; later retries become true no-write reads.
- Do not invent receipt expiration in v1; expiration could allow a sufficiently late retry to duplicate history.

Receipts are infrastructure records, not part of Journey or learning history.

## Validation

Validation occurs on every load and before every commit.

### Candidate-state validation

- document shape and supported schema version
- record types, enum values, dates, and timestamps
- key equals record ID
- reference existence and ownership paths
- same-Quarter relationships
- valid Session ranges and non-overlap
- at most one active Session per User
- Task status ↔ active Session invariant
- DailyReview ↔ Finished event relationship
- continuation uniqueness
- plan snapshot threshold and required values
- positive planned minutes
- non-overlapping Quarter ranges

### Transition validation

Old-to-new comparison protects facts that a candidate alone cannot prove:

- TaskPlanSnapshot immutability
- Session `taskId` permanence
- append-only lifecycle events and DecisionReviews
- accepted Decision reasoning immutability
- no deletion of history-bearing Tasks
- no plan-import write to execution records
- no removal of Sessions/reviews/history except an explicitly authorized JourneyEntry deletion

Application use cases remain responsible for valid actions; store validation is a final integrity boundary, not a second business-rules framework.

Never silently repair, drop, coerce, or reset a bad record.

## Locking and serialization

- Use a stable sidecar lock path; never lock the primary JSON inode that will be atomically replaced.
- Exclusive write authority spans load → mutation → validation → durable replace.
- Reads use shared locking when reliable; otherwise a short exclusive lock is acceptable for local v1.
- Prefer OS-released advisory locking.
- Lock timeout returns retryable `STORE_BUSY`; do not force-delete a supposedly stale lock.
- Concurrent first starts are serialized.

The application assumes one authoritative store file but remains safe if two local server processes contend through the lock.

## Safe commit

All artifacts reside on the same filesystem and in the same data directory.

1. Serialize candidate state to a uniquely named temporary file with private permissions.
2. Parse and validate the exact serialized bytes.
3. Flush the temporary file with `fsync`.
4. Write/update one rolling backup of the previous valid primary using its own temp + fsync + atomic rename.
5. Atomically rename the candidate temporary file over the primary.
6. `fsync` the containing directory where supported.
7. Only then return success and release the lock.

Never truncate or write the primary in place.

The rolling backup is proportional recovery insurance, not version history. No rotation, cloud sync, or automatic rollback exists.

## Failure semantics

### Before primary rename

The previous primary remains authoritative. Report `STORE_WRITE_FAILED`. No receipt or domain mutation is considered committed.

### After rename but before confirmed durability/response

The outcome may have committed. Report `STORE_DURABILITY_UNCERTAIN`; client retries with the identical Idempotency-Key. The persisted receipt determines whether to replay or perform the command.

### Corrupt or invalid primary

- Return/fail startup with `STORE_CORRUPT`.
- Perform no normal writes.
- Preserve primary, backup, and diagnostic context.
- Advertise a validated backup to a future recovery flow, but never auto-restore; silent restore can roll back learning history.

### Missing artifacts

- Missing primary and backup on true first run: initialize seeded state.
- Missing primary while backup/temp exists: `RECOVERY_REQUIRED`; do not assume first run.
- Abandoned temp files are never silently promoted. Clean them only after establishing a valid authoritative primary.

### Unsupported schema

Unknown future `schemaVersion` fails closed with `STORE_SCHEMA_UNSUPPORTED`. Never guess or downgrade.

If directory fsync is unavailable on a platform, the adapter must report reduced durability in diagnostics rather than claim full crash guarantees.

## Atomic plan apply

Preview is a consistent read and returns base Quarter `planRevision`.

Apply is one JourneyStore transaction:

1. Check command receipt first.
2. Verify base plan revision and preview token/content.
3. Verify active-item acknowledgements.
4. Recompute/validate applicability.
5. Apply every plan-owned change to the draft.
6. Preserve every execution-owned value.
7. Increment Quarter `planRevision` once.
8. Add command receipt.
9. Commit the document once.

Any failure leaves the prior primary authoritative. There are no per-record writes or partially applied plans.

## Schema migrations

V1 ships only `schemaVersion: 1` and no generic migration framework.

When version 2 actually exists:

- add one pure deterministic `v1 → v2` transform
- acquire exclusive lock
- validate source
- transform in memory
- validate target and transition
- write one fixed pre-migration backup
- commit through the same durable replace

Migration must not increment Quarter plan revision or fabricate domain timestamps/history. Failure leaves the source intact. No downgrade path is promised.

## Recovery scope

Appropriate for local private v1:

- one primary
- one rolling prior-valid backup
- at most one pre-migration backup
- fail-closed diagnostics
- later explicit recovery action

Out of scope:

- backup rotation
- cloud replication
- automatic failover
- write-ahead log
- distributed locks
- crash-recovery protocol beyond temp + replace + backup
