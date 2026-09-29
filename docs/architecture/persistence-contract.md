# Persistence Contract

Status: Confirmed on 2026-09-27

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

transact(intent, mutate)
  - acquire serialized write authority
  - reload and validate current state
  - clone to a mutable draft
  - run a pure in-memory mutation
  - validate candidate and old→new transition
  - commit exactly once or not at all
  - return an immutable committed snapshot/result that cannot retain the mutable draft
```

`intent` is a closed infrastructure capability used only where old→new state cannot prove authority:

```text
STANDARD
PLAN_APPLY
JOURNEY_DELETE { journeyEntryId }
SCHEMA_MIGRATION { fromVersion, toVersion }
```

- `STANDARD` may create new valid records and change execution-owned/editable records, but may not change plan-owned fields on an existing plan entity or delete history.
- `PLAN_APPLY` permits current plan-owned additions/changes plus deletion of records proven pristine/unreferenced; it still cannot change execution-owned facts or immutable snapshots.
- `JOURNEY_DELETE` permits deletion of exactly the named JourneyEntry and no cascading history deletion.
- `SCHEMA_MIGRATION` is available only to the adapter's explicit version transform and never to an HTTP/application command.

The intent is not persisted as learning history and does not replace application use-case validation. It gives transition validation the minimum authority signal needed to enforce exceptional writes without guessing their caller.

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
  result
    outcomeKind
    createdRecordIds[]
    affectedRecordIds[]
    outcomeFacts{}
  committedStoreRevision
  createdAt
```

- Receipt key is User + `Idempotency-Key`.
- Same fingerprint returns the same committed domain outcome without re-running the mutation.
- Different fingerprint conflicts.
- Store only the minimal immutable result needed to reproduce command meaning: stable created/affected IDs and outcome facts such as outcome kind or closure event ID. Do not store a duplicate Dashboard body.
- Replay returns that original committed result plus freshly generated current representations and marks `Idempotency-Replayed: true`; it does not claim to reproduce byte-identical response JSON.
- The first semantically no-op command still writes one receipt; later retries become true no-write reads.
- Do not invent receipt expiration in v1; expiration could allow a sufficiently late retry to duplicate history.

Receipts are infrastructure records, not part of Journey or learning history.

## Validation

Validation occurs on every load and before every commit.

### Candidate-state validation

- document shape and supported schema version
- record types, enum values, dates, and timestamps
- valid captured IANA timezones on Sessions, Milestone/Quarter intent snapshots, and occurrence-bearing history
- key equals record ID
- reference existence and ownership paths
- same-Quarter relationships
- valid Session ranges and non-overlap
- at most one active Session per User
- Task status ↔ active Session invariant
- DailyReview ↔ Finished event relationship
- continuation uniqueness
- Task/Milestone/Quarter snapshot thresholds and required values
- positive planned minutes
- non-overlapping Quarter ranges

### Transition validation

Old-to-new comparison protects facts that a candidate alone cannot prove:

- TaskPlanSnapshot, MilestoneIntentSnapshot, and QuarterIntentSnapshot immutability
- Session `taskId` permanence
- append-only lifecycle events and DecisionReviews
- immutable legacy AIReview rows from stores written by an earlier build
- accepted Decision reasoning immutability
- no deletion of history-bearing Tasks
- plan-owned changes to existing records occur only under `PLAN_APPLY`
- `PLAN_APPLY` never writes execution records or immutable snapshots
- no removal of Sessions/reviews/history except the exact JourneyEntry named by `JOURNEY_DELETE`

Application use cases remain responsible for valid actions; store validation is a final integrity boundary, not a second business-rules framework.

Never silently repair, drop, coerce, or reset a bad record.

## Process and write serialization

- V1 is one local server process bound to a fixed loopback address and port. Binding failure means another instance may own the app; startup stops rather than selecting another port.
- The data directory is private to that one process. Sharing it across separately configured processes or network filesystems is unsupported.
- One in-process asynchronous mutex serializes load → mutation → validation → durable replace. Reads take a validated immutable snapshot and never observe a mutable draft.
- Mutex timeout returns retryable `STORE_BUSY`.
- The adapter uses no native advisory-lock dependency and makes no unsupported cross-process locking claim.

This is an explicit local-v1 constraint. Multi-process serving requires a storage adapter with real transactional concurrency rather than adding a fragile lock-file protocol.

## Safe commit

All artifacts reside on the same filesystem and in the same data directory.

1. Serialize candidate state to a uniquely named temporary file with private permissions.
2. Parse and validate the exact serialized bytes.
3. Flush the temporary file with `fsync`.
4. Write/update one rolling backup of the previous valid primary using its own temp + fsync + atomic rename.
5. Atomically rename the candidate temporary file over the primary.
6. `fsync` the containing directory where supported.
7. Only then return success and release the in-process write mutex.

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

### Default location and initialization

The default store directory is `<project>/data/store`, not the tracked `<project>/data` parent. `data/store` must be absent before first run; the repository's `data/.gitkeep` therefore does not look like an initialized store.

The data directory contains a `.journey-store` marker with a random store ID and creation instant. Initialization is an explicit operation:

- Before initialization, scan only for siblings matching `.store.init-*`. If the target is absent but any such sibling exists, return `RECOVERY_REQUIRED`; an interrupted initialization is never ignored, promoted, or overwritten automatically.
- If the configured data directory and initialization siblings do not exist, build a uniquely named `.store.init-<random-id>` sibling containing a flushed marker and validated/flushed primary, flush that directory, atomically rename it to `store`, then flush the parent where supported. Concurrent initialization has one winner; the loser reopens and validates the winner's store.
- If the directory exists but the marker does not, do not adopt or overwrite it; return `RECOVERY_REQUIRED`.
- If the marker exists but the primary is missing, return `RECOVERY_REQUIRED` whether or not backup/temp artifacts exist.
- If the marker and valid primary exist, normal startup may report and clean abandoned commit temp files only after establishing that authority. Initialization siblings are never cleaned automatically because they may contain the only copy of an interrupted first write.

V1 cannot detect deletion of the entire configured data directory followed by recreation at the same path. External backup remains the protection for total directory loss; the application must not imply otherwise. Abandoned commit temp files are never silently promoted.

### Canonical production seed

The production first run initializes one validated document using one Clock instant:

```text
schemaVersion = 1
storeRevision = 0
writtenAt = initialization instant
User = { id: local-user, name: Ali, timeZone: Europe/Amsterdam,
         createdAt: initialization instant }
Q4 plan = bundled, validated q4-2026-engineering-growth fixture
Quarter planRevision = 1
Quarter lastPlanImportedAt = absent
all generated plan-record createdAt/updatedAt values = initialization instant
all seeded Task statuses = NOT_STARTED
execution/history collections = empty
commandReceipts = empty
```

The seed contains plan intent, never Sessions, status history, reviews, thoughts, Decisions, AI output, or claimed completion. `LocalCurrentUserProvider` resolves the stored `local-user`; it does not overwrite the stored profile on later starts. Tests may inject an empty or alternate validated seed, but production uses the documented local user and supplied plan.

Initialization/recovery validation happens before the HTTP server listens. `RECOVERY_REQUIRED`, corrupt data, or unsupported schema stops startup and prints a concise terminal diagnostic with the recovery procedure; v1 does not start a partial recovery web server.

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
- acquire the process write mutex
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

Manual recovery procedure: stop the server, preserve all artifacts, validate the backup with the same schema/integrity checks, explicitly copy it into a new primary through the durable-write path, and restart. Never auto-restore or delete the damaged primary. Recovery can lose changes made after the rolling backup; the operator must be told that before confirming.

Out of scope:

- backup rotation
- cloud replication
- automatic failover
- write-ahead log
- distributed locks
- crash-recovery protocol beyond temp + replace + backup
