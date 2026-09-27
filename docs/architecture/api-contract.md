# REST API Contract

Status: Proposed for API confirmation
Base path: `/api`

## Boundary principles

1. The frontend depends only on this HTTP API, never storage details.
2. The server owns Today selection, state transitions, derived time, and conflict rules.
3. Task actions are use cases; no generic status update exists.
4. Current plan context and historical snapshot context are explicit in responses.
5. Successful reads return JSON resources directly; collections use `{ items, nextCursor }`.
6. Errors use `application/problem+json` as defined by [RFC 9457](https://www.rfc-editor.org/rfc/rfc9457.html).
7. Dates are `YYYY-MM-DD`; instants are ISO-8601 UTC strings; IDs are opaque strings.

## Concurrency metadata

Mutable resources expose an opaque `etag` in representations and the same value in the HTTP `ETag` header on individual-resource reads. Preconditions use the standard conditional request semantics defined by [RFC 9110](https://www.rfc-editor.org/rfc/rfc9110.html).

- A single-resource mutation requires `If-Match` where documented.
- Missing `If-Match` returns `428 PRECONDITION_REQUIRED`.
- A stale value returns `412 STALE_WRITE` with current resource state and a Refresh resolution.
- ETags are API/persistence metadata, not learning-domain fields.
- `dataRevision` versions a consistent generated read snapshot.
- `Quarter.planRevision` versions accepted plan intent only.

## Idempotency

Command POSTs require an `Idempotency-Key` header.

- Scope: current User + key.
- Fingerprint: method, route, normalized body, and relevant preconditions.
- Same key + same fingerprint returns the original committed domain outcome, reconstructed with current resource representations, and `Idempotency-Replayed: true`.
- Same key + different fingerprint returns `409 IDEMPOTENCY_KEY_REUSED`.
- Replay lookup happens before stale-write checks, allowing a lost successful response to be recovered with its original precondition.
- A deliberate later action uses a new key.

## Shared task projection

Task responses distinguish current intent from the context preserved when history began:

```json
{
  "id": "2026-11-03-partial-failure",
  "etag": "opaque-task-etag",
  "status": "PAUSED",
  "currentPlan": {
    "focusArea": { "id": "systems", "name": "Systems Reliability" },
    "milestone": { "id": "week-5", "title": "Week 5" },
    "plannedDate": "2026-11-03",
    "title": "Partial failure",
    "description": "What happens when the network fails halfway through?",
    "plannedMinutes": 45,
    "tags": [],
    "recommendationMode": "DEFAULT",
    "removedFromPlanAt": null
  },
  "historicalPlan": {
    "capturedAt": "2026-11-03T17:42:00Z",
    "planRevision": 2,
    "plannedDate": "2026-11-03",
    "title": "Partial failure",
    "plannedMinutes": 45
  },
  "timing": {
    "actualSecondsAtGeneratedAt": 1680,
    "firstStartedAt": "2026-11-03T17:42:00Z",
    "runningSince": null
  },
  "availableActions": ["RESUME", "FINISH", "SKIP", "CARRY_FORWARD"]
}
```

Quarter/plan views prefer `currentPlan`. Today and history-bearing views prefer `historicalPlan` when present. The server returns the correct presentation projection so the client does not guess.

## Current user

```text
GET /api/me
```

Returns the seeded local User:

```json
{
  "id": "local-user",
  "name": "Ali",
  "timeZone": "Europe/Amsterdam",
  "createdAt": "2026-09-27T10:00:00Z"
}
```

There is no authentication or profile API in v1. Appearance is client-local. Timezone mutation is deferred until a real settings workflow is designed; the seeded timezone is still a domain fact.

## Dashboard

```text
GET /api/dashboard
```

Returns the entire Today screen from one consistent snapshot. See [Dashboard Contract](dashboard-contract.md).

## Quarters and milestones

```text
GET /api/quarters
GET /api/quarters/:id
GET /api/quarters/:id/milestones/:milestoneId/summary
```

### Quarter collection

Returns title, dates, date-derived phase, mantra, and plan revision. It contains no aggregate learning score.

### Quarter detail

Returns current plan intent:

- focus areas
- milestones
- success criteria
- current-plan Task summaries or links
- `planRevision`

Historical execution remains in Task/Journey reads.

### Milestone summary

Generated from Tasks, Sessions, DailyReviews, JourneyEntries, and DecisionReviews. It returns:

- milestone context and mode
- planned/touched/finished/skipped/open item counts
- actual session seconds and session count
- outcomes as separate counts
- chronological task rows
- captured thoughts and changed-my-mind count
- open work
- at most one optional reflection prompt and existing related JourneyEntry

It has no completion status, success percentage, streak, or score. In v1 the representative plan uses Milestones as weeks; if a future plan defines another period, the API calls it a milestone rather than silently imposing calendar-week boundaries.

## Tasks

```text
GET /api/tasks
GET /api/tasks/:id
```

Supported list filters:

- `quarterId`
- `milestoneId`
- `focusAreaId`
- `plannedFrom`
- `plannedTo`
- `status`
- `includeRemoved=false`
- `cursor`
- `limit`

Task detail returns current plan, historical snapshot, derived timing, Sessions link, reviews, related Journey/Decision/AI summaries, lifecycle history, and available actions.

There is deliberately no public `POST /api/tasks`, generic Task update, or status field mutation. Planned Tasks come from plan apply; continuations come from Carry forward.

## Task action endpoints

```text
POST /api/tasks/:id/start
POST /api/tasks/:id/pause
POST /api/tasks/:id/resume
POST /api/tasks/:id/finish
POST /api/tasks/:id/skip
POST /api/tasks/:id/reopen
POST /api/tasks/:id/carry-forward
```

All require `Idempotency-Key` and target Task `If-Match`.

### Start

Normal:

```json
{}
```

Low-energy session:

```json
{ "intentionMinutes": 10 }
```

Only `10` is accepted in v1; this is the confirmed Do 10 minutes interaction, not a generic target editor.

When another Task is active, the first request returns `ACTIVE_SESSION_CONFLICT`. The explicit retry may include:

```json
{
  "activeSessionResolution": {
    "kind": "PAUSE_AND_SWITCH",
    "activeSessionId": "session-current",
    "activeTaskEtag": "opaque-current-etag"
  }
}
```

The target `If-Match` plus active identifiers/precondition protect the atomic two-Task transition.

### Pause

Request body is empty. It closes the active Session and returns the Paused Task.

### Resume

Request body is empty unless resolving an active-session conflict with the same `activeSessionResolution` structure used by Start. Resume creates a new Session.

### Finish

The Running UI first uses Pause when opening the Finish sheet so reflection time is not counted. Finish also safely accepts an In-progress Task and closes its Session atomically.

```json
{
  "outcome": "PARTIAL",
  "keyLearning": "A timeout limits waiting, not duplicate side effects.",
  "reflection": null
}
```

`outcome` is `ACHIEVED | PARTIAL | NOT_ACHIEVED`. Text fields are optional.

Success includes a completion receipt and freshly resolved dashboard:

```json
{
  "task": {},
  "completion": {
    "taskId": "2026-11-03-partial-failure",
    "finishEventId": "event-42",
    "reviewId": "review-42",
    "outcome": "PARTIAL",
    "undoUntil": "2026-11-03T20:15:30Z"
  },
  "dashboard": {}
}
```

`undoUntil` is presentation guidance, not a permanent dismissal flag. Dashboard may already recommend another Ready Task; the client briefly presents the completion receipt without changing recommendation rules.

### Skip

Empty body. It ends any active Session, captures plan context if needed, records Skipped, and returns the newly resolved dashboard. It requires no reason.

### Reopen / Undo

```json
{ "closureEventId": "event-42" }
```

Targeting the closure event prevents Undo from reopening the wrong occurrence after a later reopen/re-finish sequence. Reopen never starts timing.

### Carry forward

```json
{
  "plannedDate": "2026-11-04",
  "keyLearning": "The read path is covered; write conflicts remain."
}
```

V1 carry-forward remains within the same Quarter. The server resolves the destination Milestone by date, generates a new stable continuation ID, finishes the source as Partial, and transfers no Sessions.

Returns `201 Created`, `Location: /api/tasks/:continuationId`, source Task, finish receipt, continuation Task, and dashboard. Retry returns the same continuation.

### Common action response

Start/Pause/Resume return:

```json
{
  "task": {},
  "activeSession": {},
  "affectedTasks": [],
  "dashboard": {}
}
```

The dashboard is returned after actions because selection is server-owned. Clients do not rebuild “what next?” locally.

## Sessions

```text
GET /api/tasks/:id/sessions
PUT /api/sessions/:id
```

`GET` returns effective intervals and ETags.

`PUT` is a complete correction of editable interval fields and requires `If-Match`:

```json
{
  "startedAt": "2026-11-03T17:40:00Z",
  "endedAt": "2026-11-03T18:12:00Z"
}
```

Rules:

- `taskId` and `timeZoneAtStart` are immutable.
- Closed Sessions may correct start/end.
- Active Sessions may correct only start; ending uses Pause, Finish, or Skip.
- Negative intervals return `422 VALIDATION_FAILED`.
- Overlap with another User Session returns `409 SESSION_OVERLAP`.
- No public Session create/delete endpoint exists.

## Journey

```text
GET /api/journey
POST /api/journey
PUT /api/journey/:id
DELETE /api/journey/:id
```

### Timeline

`GET` returns a chronological generated union with item types such as:

- `THOUGHT`
- `SESSION`
- `TASK_FINISHED`
- `DECISION_REVIEW`
- `WEEKLY_REFLECTION`

Filters: date range, Task, Milestone, `changedMyMind`, item type, cursor, and limit.

### Create / Quick Thought

Requires `Idempotency-Key`:

```json
{
  "text": "The retry boundary belongs above transport.",
  "tags": [],
  "changedMyMind": false
}
```

Relationship semantics:

- omitted `relatedTaskId`: infer the active Task when one exists
- explicit `null`: do not link
- string: validate and link that Task

The same rule applies to optional Milestone/Decision relationships only where inference is defined; they otherwise default to null. Create returns `201 Created`.

`PUT` updates only JourneyEntry-owned fields and requires `If-Match`. Explicit `DELETE` requires `If-Match` and returns `204`. Plan import never reaches these endpoints or records.

## Decisions

```text
GET /api/decisions
GET /api/decisions/:id
POST /api/decisions
PUT /api/decisions/:id
POST /api/decisions/:id/accept
POST /api/decisions/:id/review
```

List filters: `quarterId`, status, `review=due`, cursor, and limit.

- Create produces Draft and requires `Idempotency-Key`.
- PUT replaces editable Draft reasoning and requires `If-Match`.
- Accepted reasoning rejects PUT with `409 DECISION_IMMUTABLE`.
- Accept is an explicit idempotent command and never generic status mutation.
- Review appends a DecisionReview.

Substantive review:

```json
{
  "outcome": "ADJUST",
  "notes": "The load profile changed; keep the choice with a smaller cache.",
  "nextReviewDate": "2026-12-01",
  "replacementDecisionId": null
}
```

Postpone:

```json
{
  "outcome": "DEFERRED",
  "nextReviewDate": "2026-12-01"
}
```

`DEFERRED` requires a next date and does not count as a substantive review. `SUPERSEDE` may link a replacement but never edits original reasoning.

## Search

```text
GET /api/search?q=quorum
```

Optional filters: `type`, `quarterId`, cursor, and limit. Results group by type and contain an excerpt plus canonical resource context IDs. They do not contain frontend route strings.

No advanced query language exists in v1.

## Plan preview, apply, and export

```text
POST /api/plans/preview
POST /api/plans/apply
GET /api/plans/export/:quarterId
```

### Preview

Read-only; no idempotency key required:

```json
{
  "sourceFormat": "yaml",
  "content": "version: 1\nquarter:\n  id: q4-2026\n..."
}
```

Response:

```json
{
  "previewToken": "opaque-short-lived-token",
  "expiresAt": "2026-09-27T14:30:00Z",
  "mode": "UPDATE_QUARTER",
  "quarterId": "q4-2026",
  "basePlanRevision": 3,
  "summary": {
    "added": 2,
    "changed": 3,
    "removed": 1,
    "historicalPreserved": 2,
    "conflicts": 1
  },
  "changes": [],
  "requiredAcknowledgements": [
    { "id": "preserve-active:task-retries", "code": "PRESERVE_ACTIVE_WORK" }
  ]
}
```

An unknown Quarter ID returns `mode = CREATE_QUARTER`; it is never fuzzy-matched by title/dates.

### Apply

Requires `Idempotency-Key`:

```json
{
  "previewToken": "opaque-short-lived-token",
  "acknowledgementIds": ["preserve-active:task-retries"]
}
```

Inside one serialized transaction it revalidates the token/content, base `planRevision`, required acknowledgements, references, overlap rules, and history preservation; then increments plan revision once.

- Expired/unknown preview: `410 PLAN_PREVIEW_EXPIRED`
- Changed base: `409 PLAN_REVISION_CHANGED`
- Missing acknowledgement: `409 ACKNOWLEDGEMENT_REQUIRED`
- Create-quarter success: `201 Created`
- Update-quarter success: `200 OK`

Preview tokens are ephemeral. Restart may require a fresh preview; no PlanPreview domain model exists.

### Export

Returns `application/yaml`, an attachment filename, and ETag derived from `planRevision`. It contains current plan intent only—never Sessions, status, outcomes, Decisions, AI advice, or reflection.

## AI review stubs

```text
POST /api/ai/review/task/:id
POST /api/ai/review/week
POST /api/ai/review/quarter/:id
POST /api/ai/review/decision/:id
```

Week body:

```json
{ "milestoneId": "week-5" }
```

Each requires `Idempotency-Key`, creates one historical AIReview, and returns `201 Created`. The StubAIReviewer completes synchronously in v1. A deliberate new review uses a new key and creates another record; transport retry does not.

No score is returned. AI cannot mutate its target.

## HTTP status summary

| Status | Use |
|---:|---|
| 200 | Successful read/update/action |
| 201 | Resource/continuation/review/quarter created |
| 204 | Explicit JourneyEntry delete |
| 400 | Malformed JSON/query syntax |
| 404 | Missing or not owned resource |
| 409 | Domain/concurrency workflow conflict |
| 410 | Expired plan preview |
| 412 | Stale `If-Match` |
| 422 | Well-formed but invalid domain/plan content |
| 428 | Required precondition absent |
| 500 | Unexpected internal failure |
| 503 | Store busy, corrupt, unsupported, or safely unavailable |
