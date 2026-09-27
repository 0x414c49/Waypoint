# Domain and Data Model

Status: Confirmed on 2026-09-27
Scope: Storage-neutral logical model; no API or JSON file shape yet

## Modeling principles

1. Planned intent, execution facts, and generated views are different things.
2. Normal actions—not generic record editing—change task state.
3. Time is derived from sessions; learning quality is never inferred from time.
4. Plan imports may change current intent but may not rewrite lived history.
5. Independent records carry user ownership; child ownership is derived where it is unambiguous.
6. Stable text IDs are sufficient for v1 and remain valid SQL primary keys later.
7. Dates are local calendar dates; timestamps are UTC instants.

## Ownership

```text
User
├── Quarter
│   ├── FocusArea
│   ├── Milestone
│   ├── Task
│   │   ├── Session
│   │   ├── DailyReview
│   │   └── TaskLifecycleEvent
│   └── DecisionRecord (optional quarter relationship)
├── JourneyEntry
├── DecisionRecord
│   └── DecisionReview
└── AIReview
```

- `Quarter.userId` establishes quarter ownership.
- Task ownership derives through Quarter.
- Session, DailyReview, and TaskLifecycleEvent ownership derive through Task.
- FocusArea and Milestone ownership derive through Quarter.
- JourneyEntry, DecisionRecord, and AIReview keep `userId` because they may exist independently of a quarter/task and need a clear future authorization boundary.
- DecisionReview ownership derives through DecisionRecord.

Do not add `userId` to every child merely to make queries convenient.

## Identity and time conventions

### Stable IDs

- IDs are opaque, stable strings supplied by the plan or generated locally.
- Imported IDs must be unique within their documented scope; v1 should prefer globally unique plan IDs for readability.
- An ID is never inferred from title, date, or list position.
- Same ID means the same conceptual item.
- A renamed or rescheduled item keeps its ID.
- A genuinely repeated/new learning intention receives a new ID.
- Changing an ID appears as one removal and one addition.

### Dates and timestamps

- Calendar dates use `YYYY-MM-DD` in the user’s configured IANA timezone.
- Instants use ISO-8601 UTC timestamps.
- Session duration is calculated from instants, never local clock subtraction.
- A session captures the timezone active at its start so later timezone changes do not move historical activity between days.

## User

```text
User
  id
  name
  timeZone       // IANA name, e.g. Europe/Amsterdam
  createdAt
```

`timeZone` is required because Today, week boundaries, cross-midnight sessions, and activity history otherwise become ambiguous. Authentication and profile fields are deferred.

## Quarter

```text
Quarter
  id
  userId
  title
  description?
  mantra?
  startDate
  endDate
  successCriteria[]
    id
    text
    position
  planRevision
  lastPlanImportedAt?
  intentSnapshot?
  createdAt
  updatedAt
```

Rules:

- `startDate <= endDate`.
- A User cannot have overlapping Quarter date ranges in v1; Today must resolve to at most one current Quarter.
- `planRevision` is a monotonic integer incremented after each successful plan apply.
- Quarter status (future/current/past) is derived from dates; do not persist it.
- Success criteria preserve quarter intent but are not checkboxes or score inputs in the daily path.
- YAML format `version`, storage `schemaVersion`, and Quarter `planRevision` are different concepts.

### Quarter intent snapshot

When the Quarter first gains durable execution history, capture one immutable baseline:

```text
QuarterIntentSnapshot
  capturedAt
  planRevision
  timeZoneAtCapture
  title
  description?
  mantra?
  startDate
  endDate
  successCriteria[]
  focusAreas[]
    id
    name
    targetMinutes?
```

This preserves the intent used by later quarter retrospectives without storing every imported plan revision. Current Quarter fields may continue to reflect accepted plan updates.

## FocusArea

```text
FocusArea
  id
  quarterId
  name
  description?
  targetMinutes?
  position
  createdAt
  updatedAt
  removedFromPlanAt?
```

`targetMinutes` is optional plan intent, not an automatically enforced goal or a learning-quality score. Removed focus areas remain only when referenced by preserved history.

## Milestone

A Milestone is a plan-defined period. In the representative plan it is a week, but the domain does not hard-code ISO week behavior.

```text
Milestone
  id
  quarterId
  title
  description?
  startDate
  endDate
  mode           // STANDARD | LIGHT | BUFFER | RETRO
  position
  intentSnapshot?
  createdAt
  updatedAt
  removedFromPlanAt?
```

Rules:

- Milestone dates must sit within the Quarter.
- `mode` represents explicit plan intent and supports light, buffer, and retrospective weeks without manufacturing normal work.
- Milestone `mode` frames the period but does not override an individual Task's `recommendationMode`; a LIGHT week may still contain explicitly planned Default work.
- Weekly totals and review content are generated from tasks/sessions; they are not fields on Milestone.

### Milestone intent snapshot

When a Milestone first gains durable history, capture one immutable boundary:

```text
MilestoneIntentSnapshot
  capturedAt
  planRevision
  timeZoneAtCapture
  title
  description?
  startDate
  endDate
  mode
  position
```

This preserves the named period and its cutoff for historical summaries after a plan update. Current Milestone fields may still change through an accepted plan import.

## Task

Task contains a current plan projection plus execution state. The groups below describe field ownership; the physical persistence layout is decided later.

```text
Task
  id
  quarterId

  // Plan-owned fields
  focusAreaId?
  milestoneId?
  plannedDate
  title
  description?
  plannedMinutes?
  tags[]
  position
  recommendationMode       // DEFAULT | WHEN_CLEAR | OPTIONAL
  decisionPrompt?
    decisionId
    suggestedTitle
    initialReviewDate?
  removedFromPlanAt?

  // Execution-owned fields
  status                   // NOT_STARTED | IN_PROGRESS | PAUSED | FINISHED | SKIPPED
  planSnapshot?
  continuationOfTaskId?

  createdAt
  updatedAt
```

### Plan ownership

- Plan import may write only plan-owned fields.
- `recommendationMode = WHEN_CLEAR` models conditional exploration such as Friday work that should yield to catch-up. It is plan intent, not a priority score.
- `recommendationMode = OPTIONAL` marks “only if useful” work that may appear as quiet context but never becomes Today’s Ready hero automatically. The learner may still start it deliberately from context/Quarter.
- `decisionPrompt` marks planned work that is expected to produce an ADR. It surfaces a contextual draft action but does not create a DecisionRecord during import.
- `removedFromPlanAt` means only “not in the current plan.” It never means Skipped or Finished.
- `plannedMinutes` must be positive when present.
- `actualMinutes`, percent complete, and manual progress do not exist.

### Execution ownership

- Only task use cases may change `status`.
- Status is a backend-maintained, rebuildable current projection; the user and plan import never set it directly.
- `startedAt` is derived from the earliest effective Session start.
- `finishedAt` is derived from the latest non-undone Finished lifecycle event.
- `continuationOfTaskId` links an explicit split/carry-forward. It never moves prior sessions.

### Immutable plan snapshot

When the task first gains durable history, capture exactly one immutable snapshot:

```text
TaskPlanSnapshot
  capturedAt
  planRevision
  focusAreaId?
  focusAreaName?
  milestoneId?
  milestoneTitle?
  plannedDate
  title
  description?
  plannedMinutes?
  tags[]
  recommendationMode
  decisionPrompt?
```

History-bearing actions include:

- starting a session
- skipping an untouched item
- linking a JourneyEntry, DecisionRecord, or AIReview to the task

The same transaction captures the containing MilestoneIntentSnapshot (when the Task has a Milestone) and QuarterIntentSnapshot if absent. The current plan projection may later change through an accepted import; task history displays the immutable snapshot. This is intentional, bounded duplication that prevents a later rename, date change, focus-area change, or period-boundary change from rewriting what the learner actually encountered.

It is not a per-field history, revision chain, or event-sourced plan.

## Session

```text
Session
  id
  taskId
  startedAt
  endedAt?
  timeZoneAtStart
  intentionMinutes?
  createdAt
  updatedAt
  correctedAt?
```

Rules:

- `endedAt = null` means active.
- Closed intervals are half-open: `[startedAt, endedAt)`.
- `endedAt >= startedAt`; a corrected zero-duration session may represent an accidental start.
- Sessions never change `taskId`.
- `intentionMinutes = 10` preserves the confirmed low-energy session intention across refresh. It is not a target on the Task and never auto-finishes a session.
- No authoritative duration field exists. Effective duration is calculated from timestamps.
- Session notes are omitted; Quick Thought/JourneyEntry already owns freeform capture.

Session correction directly fixes timestamps and records `updatedAt/correctedAt`. Full correction audit records are disproportionate for a private v1 and can be added later without changing ownership.

## TaskLifecycleEvent

Sessions already explain Start, Pause, and Resume. A small append-only record preserves terminal and structural history that current status cannot retain after Reopen.

```text
TaskLifecycleEvent
  id
  taskId
  sequence         // monotonic within Task
  type             // FINISHED | SKIPPED | REOPENED | CARRIED_FORWARD
  occurredAt
  timeZoneAtOccurrence
  relatedTaskId?   // continuation created by carry-forward
  undoesEventId?   // Reopen/Undo relationship
  createdAt
```

This is not event sourcing: current Task status remains authoritative for current behavior, and the application is not rebuilt solely by replaying events. The records exist to preserve truthful finish/skip/reopen history and safe Undo behavior.

## DailyReview

Despite its established name, DailyReview is one finish review occurrence, not a mandatory daily journal.

```text
DailyReview
  id
  taskId
  finishEventId
  outcome          // ACHIEVED | PARTIAL | NOT_ACHIEVED
  keyLearning?
  reflection?
  createdAt
  updatedAt
```

Rules:

- A finish requires `outcome`; text remains optional.
- UI label “Made progress” maps to `PARTIAL`.
- All outcomes close the task as Finished; `NOT_ACHIEVED` is not a failure status.
- A reopened and re-finished task receives a new event and a new DailyReview; prior reviews remain.
- `keyLearning` is the one normal finish takeaway. `reflection` is optional deeper context and must not enter the normal finish form unless explicitly expanded.
- There is no one-review-per-task uniqueness constraint.

## JourneyEntry

```text
JourneyEntry
  id
  userId
  occurredAt
  timeZoneAtOccurrence
  text
  tags[]
  relatedTaskId?
  relatedMilestoneId?
  relatedDecisionId?
  changedMyMind
  createdAt
  updatedAt?
```

Rules:

- Quick capture requires only `text`.
- Active-task association is inferred, displayed, and removable.
- Tags and `changedMyMind` may be added after capture; they are never required to begin typing.
- A weekly reflection is a JourneyEntry related to the relevant Milestone; no WeeklyReview entity is needed.
- Plan import never writes or deletes Journey entries.

Hard deletion may be explicitly user-requested later through the Journey API. Full revision history for typo edits is not required in a private v1.

## DecisionRecord and DecisionReview

```text
DecisionRecord
  id
  userId
  quarterId?
  relatedTaskId?
  supersedesDecisionId?
  title
  decisionDate?
  status                    // DRAFT | ACCEPTED | SUPERSEDED
  context?
  constraints[]
  options[]
    id
    title
    description
    strengths[]
    weaknesses[]
  decision?
  consequences?
  assumptions[]
  falsifier?
  initialReviewDate?
  createdAt
  updatedAt
```

Draft reasoning may be edited. Once Accepted, context/options/decision reasoning is immutable. A materially new decision creates another DecisionRecord linked through `supersedesDecisionId`.

```text
DecisionReview
  id
  decisionId
  reviewedAt
  timeZoneAtReview
  outcome                  // HOLDS | ADJUST | SUPERSEDE | DEFERRED
  notes?
  nextReviewDate?
  replacementDecisionId?
  createdAt
```

Rules:

- Reviews are append-only.
- `DEFERRED` records the confirmed Postpone action and requires `nextReviewDate`; it is not counted as a completed substantive review.
- If no review exists, the current due date is `initialReviewDate`.
- After any review exists, the current due date is that latest review’s `nextReviewDate`; when absent, the Decision is not due.
- On Accept, `initialReviewDate` must be on/after `decisionDate`. Any `nextReviewDate` must be later than the review's local date; Deferred therefore always postpones rather than remaining immediately due.
- Review never overwrites original reasoning.
- A Supersede outcome atomically marks the original DecisionRecord Superseded and links a replacement when one exists.
- Draft may be sparse so creating it does not become an ADR form tax. Accept requires a non-empty title, context, decision, and decision date; options, constraints, consequences, assumptions, and falsifier remain useful but optional.
- Draft → Accepted is an explicit domain transition. Generic Decision editing cannot set status.

Do not duplicate `reviewedAt` or latest outcome onto DecisionRecord.

## AIReview

AIReview is separate historical advice. Rerunning a review creates another record rather than replacing prior advice.

```text
AIReview
  id
  userId
  targetType              // TASK | WEEK | QUARTER | DECISION
  targetId
  provider
  model?
  summary?
  strengths[]
  gaps[]
  suggestedFollowUp?
  questions[]
  generatedAt
  timeZoneAtGeneration
```

Rules:

- `WEEK` targets a Milestone representing a week.
- Provider is `stub` in v1; it remains historical provenance when real providers arrive.
- V1 writes only completed reviews. Provider failure creates no AIReview; pending/failed job state does not exist without asynchronous processing.
- No AI score exists because the product rejects aggregate learning-quality scoring.
- AI advice cannot mutate plans, task state, human reflection, decisions, or history.
- The target union is validated by the application. A future SQL adapter may enforce it with separate nullable foreign keys or a target table without changing application behavior.

## Derived concepts—not records

Do not persist models for:

- Today recommendation
- active elapsed counter
- actual minutes
- contribution cells
- weekly summary or review-complete status
- quarter progress percentage
- streaks
- aggregate learning score

They are query results derived from plan intent and execution facts.

## Cross-record invariants

1. FocusArea, Milestone, and Task belong to the same Quarter when linked.
2. Related records resolve to the same User.
3. Task planned date lies within its Quarter unless an explicitly cross-quarter continuation is created in the destination Quarter.
4. A user owns at most one Session with `endedAt = null` across all quarters.
5. A Task is `IN_PROGRESS` if and only if it owns exactly one active Session.
6. Other Task statuses own no active Session.
7. Session intervals for one User do not overlap after corrections.
8. DailyReview `finishEventId` references a Finished event for the same Task.
9. A continuation belongs to the same User as its source and receives a new stable ID.
10. Imported plan IDs are unique and references are valid before any write occurs.
11. DecisionReview cannot mutate accepted DecisionRecord reasoning.
12. AIReview is advisory and cannot write its target.

## SQL migration readiness

The records map directly to tables and foreign keys. A JSON adapter should keep top-level collections keyed by IDs rather than deeply embedding all children.

Likely later indexes/constraints:

- Quarter by `(userId, startDate, endDate)`
- Task by `(quarterId, plannedDate)` and stable `id`
- Session by `(taskId, startedAt)`
- a serialized/unique active-session constraint per User in the storage adapter
- JourneyEntry by `(userId, occurredAt)`
- Decision review due-date lookup
- foreign keys for all ownership paths
- checks for positive planned minutes and valid timestamp ranges

Arrays such as tags, options, assumptions, strengths, and gaps can begin as JSON fields or child collections and be normalized by a SQL adapter without changing domain behavior.
