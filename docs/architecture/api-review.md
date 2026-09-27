# API and Persistence Review

Status: Ready for API/persistence confirmation

## Outcome

The proposed REST boundary covers every confirmed journey while keeping lifecycle, recommendation, timing, and plan rules on the server. JsonJourneyStore can implement the required atomicity and safety without leaking persistence behavior into the frontend or application services.

## Journey coverage

| Confirmed journey | API support | Rule owner |
|---|---|---|
| Start today | Dashboard Ready + Task Start | Server recommendation + `startTask` |
| Pause/resume | Pause/Resume actions + active-session timing | Application use cases |
| Finish | Pause-on-sheet-open + Finish outcome + completion receipt | Application use cases |
| Unfinished work | Dashboard Paused priority + Up next | Dashboard resolver |
| Low-energy day | Start with `intentionMinutes: 10` | `startTask`; UI timer prompt |
| Quick Thought | Journey create with inferred active context | Journey application service |
| Weekly review | Generated Milestone summary + Journey reflection | Read-model service |
| Decision review | Review append; Deferred for Postpone | Decision service |
| Plan update | Preview token + atomic Apply + current-plan export | Plan application service/store transaction |

## Product-compass check

| Guardrail | Result |
|---|---|
| One primary action per state | Dashboard returns one `primaryAction` |
| No manual status maintenance | No generic Task status endpoint exists |
| Time tracked automatically | Sessions created/ended only by actions; totals derived |
| Client does not rebuild domain logic | Dashboard and conflicts are server-resolved |
| Capture first | Journey create requires only text; active link inferred |
| Reflection stays tiny | Finish requires outcome; text remains optional |
| Advanced work stays contextual | Plan/Decision/AI endpoints do not enter Today selection |
| No guilt/score mechanics | API exposes facts, not streaks, overdue debt, or aggregate score |

## Domain-model consistency

- Current plan and historical plan snapshot are explicit in Task projections.
- Task actions atomically update status, Sessions, events, and reviews.
- Single active Session is enforced inside serialized transactions.
- Reopen targets a specific closure event and preserves earlier review history.
- Carry forward creates one linked continuation and transfers no time.
- Plan apply writes only plan-owned fields and honors Task snapshots/tombstones.
- Deferred decision review resolves the confirmed Postpone interaction.
- Overlapping Quarters are rejected so Dashboard has one current plan.

## HTTP correctness

- Problem responses follow RFC 9457’s Problem Details media type and extension model.
- `If-Match`/ETag preconditions distinguish stale user intent from valid retries.
- `428` identifies missing required preconditions; `412` identifies a failed supplied precondition.
- Domain conflicts remain `409` with machine-readable resolutions.
- Ownership mismatch returns `404`.
- Idempotency and optimistic concurrency solve different problems and are both retained.

## Persistence correctness

- Read models use one validated snapshot/revision.
- Mutations serialize under a stable sidecar lock.
- Candidate and old→new transition validation occur before publish.
- Changed state is written to a same-directory temp, validated, flushed, backed up once, atomically replaced, and directory-flushed where supported.
- Failed writes cannot publish half a Task transition or plan update.
- Corruption and unsupported schema fail closed; the adapter never silently resets data.
- Command receipts make response-loss retries safe across restart.

## Deliberate additions beyond the initial endpoint sketch

### Milestone summary

Required by the confirmed weekly-review journey. It remains generated and has no completion state.

### Decision Accept

Required to make Draft → Accepted explicit and prevent generic status mutation or editing accepted reasoning.

### ETags and idempotency receipts

Required by multiple-device/double-click/uncertain-response cases. They are protocol/infrastructure metadata, not learner-facing model complexity.

### Create-quarter preview mode

Required to import the next Quarter without fuzzy-matching title/dates or bypassing validation.

## Rejected API directions

- GraphQL
- generic Task CRUD/status PATCH
- public Session create/delete
- client-composed Dashboard from many requests
- persisted timer ticks
- raw storage errors or file paths
- durable PlanPreview entity
- REST endpoints for streaks, scores, or progress percentages
- plan import that accepts execution fields

## Rejected persistence directions

- one repository interface per entity
- ORM abstraction before a database exists
- deep Task document embedding all Sessions/history
- in-place JSON writes
- automatic corruption repair/reset
- event sourcing or write-ahead log
- full plan revision archive/restore
- cloud sync or rotating backups

## Residual implementation checks

These are not design blockers but must be tested during implementation:

- two simultaneous Start requests for different Tasks
- idempotent response after commit but lost response
- ETag replay order versus idempotency lookup
- atomic Pause current and switch
- Finish opened then browser closed
- Session correction overlap
- store lock timeout
- failure before and after atomic replace
- invalid/corrupt primary with valid backup present
- plan preview becomes stale before apply
- Quarter create conflicts with an existing date range
- Dashboard response ordering across different `dataRevision` values

## Confirmation requested

Confirm together:

1. REST resource/action surface
2. Server-resolved Dashboard union and Today algorithm
3. RFC 9457 problem details and structured conflict resolutions
4. ETag + Idempotency-Key behavior
5. Single JourneyStore unit-of-work port
6. Human-readable JSON with locking, validation, temp + fsync + backup + replace

After confirmation, the next stage is the concise system design, component responsibilities, end-to-end data flows, failure behavior, and architecture decision records.
