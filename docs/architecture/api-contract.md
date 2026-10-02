# REST API Contract

Status: Confirmed on 2026-09-27
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

Fingerprinting happens only after JSON/query headers and request schemas validate. The server applies documented defaults, preserves array order, sorts object keys recursively for canonical JSON, and includes method, canonical route, normalized validated body, `If-Match`, and other command preconditions. Unknown fields are rejected rather than ignored. Invalid requests create no receipt. Plan Apply fingerprints the exact preview token plus ordered acknowledgement IDs after schema normalization.

## Input bounds

Reject oversized input with `413 PAYLOAD_TOO_LARGE` and excessive valid structure with `422 VALIDATION_FAILED`; never truncate silently.

- Normal JSON request body: 256 KiB. Plan Preview independently enforces both a 2 MiB raw JSON-wrapper limit and a 1 MiB decoded YAML-source limit. Escape-heavy content may reach the raw wrapper limit first.
- `Idempotency-Key`: 16–128 visible ASCII characters limited to letters, digits, `.`, `_`, `:`, and `-`.
- Opaque/user-authored IDs: 1–128 characters; title/name: 1–200; short labels/tags: 1–64.
- At most 20 tags per Task/JourneyEntry and 20 items in each Decision list; one Decision may contain at most 20 options.
- Description, reflection, Journey text, Decision long-text field, or AI text field: 20,000 characters each.
- Finish `keyLearning`: 2,000 characters. Search query: 1–200 characters.
- Paginated `limit`: 1–100, with endpoint defaults defined in route schemas.
- Plan structure: limits in the version-1 plan contract.

Text limits count Unicode code points after transport decoding. Domain validation rejects empty/whitespace-only values where a field is required.

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
    "tags": [],
    "recommendationMode": "DEFAULT",
    "removedFromPlanAt": null
  },
  "historicalPlan": {
    "capturedAt": "2026-11-03T17:42:00Z",
    "planRevision": 2,
    "plannedDate": "2026-11-03",
    "title": "Partial failure"
  },
  "displayPlanSource": "HISTORICAL",
  "displayPlan": {
    "plannedDate": "2026-11-03",
    "title": "Partial failure"
  },
  "timing": {
    "actualSecondsAtGeneratedAt": 1680,
    "firstStartedAt": "2026-11-03T17:42:00Z",
    "runningSince": null
  },
  "availableActions": ["RESUME", "FINISH", "SKIP", "CARRY_FORWARD"]
}
```

`displayPlan` is the endpoint-selected presentation projection and `displayPlanSource` is `CURRENT | HISTORICAL`. Quarter/plan endpoints select current intent. Today, Journey, and history-bearing task contexts select the immutable historical snapshot when present. `currentPlan` and `historicalPlan` remain available where comparison is useful; the client never chooses between them itself.

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

## Activity

```text
GET /api/activity?from=2026-10-01&to=2026-12-31
```

Returns one server-derived cell per local date with `sessionSeconds` and contribution `level`. Only closed Sessions contribute; an active interval first appears after a command closes it. The inclusive range is required, may span at most 366 days, and uses the same captured-timezone splitting and exact whole-second level thresholds as Dashboard/Milestone summaries. It returns no streak, target, rank, score, or “missed day” field. Dashboard embeds only the last 14 days; the longer activity read supports Journey in Slice 2.

## Quarters and milestones

```text
GET /api/quarters
GET /api/quarters/:id
GET /api/quarters/:id/milestones/:milestoneId/summary
```

### Quarter collection

Returns title, dates, date-derived phase, plan revision, and a Quarter ETag. It contains no aggregate learning score.

### Quarter detail

Returns current plan intent:

- focus areas
- milestones
- success criteria
- current-plan Task summaries or links
- `planRevision`
- a Quarter ETag for plan-update preconditions

Historical execution remains in Task/Journey reads.

### Milestone summary

Generated from Tasks, Sessions, DailyReviews, JourneyEntries, and DecisionReviews using the rules in [Temporal Attribution](temporal-attribution.md). It returns:

- milestone context and mode
- planned/touched/finished/skipped/open item counts
- actual session seconds and session count
- outcomes as separate counts
- chronological task rows with `currentStatus` and `statusAtPeriodEnd`
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
GET /api/journey/:id
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

`GET /api/journey/:id` returns one owned Thought/weekly reflection for a stable Search deep link and includes its ETag.

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

The same rule applies to optional Milestone/Decision relationships only where inference is defined; they otherwise default to null. Linking an untouched Task captures its TaskPlanSnapshot plus containing Milestone/Quarter snapshots. Linking directly to a Milestone captures Milestone/Quarter snapshots even without a Task. Create returns `201 Created`.

`PUT` updates only JourneyEntry-owned fields and requires `If-Match`. Explicit `DELETE` requires `If-Match` and returns `204`. Plan import never reaches these endpoints or records.

## Decisions

```text
GET /api/decisions
GET /api/decisions/:id
POST /api/decisions
PUT /api/decisions/:id
POST /api/tasks/:id/decision-draft
POST /api/decisions/:id/accept
POST /api/decisions/:id/review
```

List filters: `quarterId`, status, `review=due`, cursor, and limit.

- Create produces an independent Draft, requires `Idempotency-Key`, and accepts `{ title, quarterId?, relatedTaskId?, initialReviewDate? }`. A Task link captures Task/Milestone/Quarter snapshots; a direct Quarter link captures QuarterIntentSnapshot.
- Contextual draft creation has an empty body, uses the Task's `decisionPrompt`, requires Task `If-Match` plus `Idempotency-Key`, creates at most that prompt's stable Decision ID, and atomically captures Task/Milestone/Quarter snapshots when needed.
- If that prompt's Decision already exists and is linked to the same Task, a later call with a new command key returns `200` with the current Draft/Accepted/Superseded resource and records a no-op receipt. If the stable ID belongs to another relationship, return `409 PROMPT_DECISION_CONFLICT`.
- PUT replaces editable Draft reasoning and requires `If-Match`. Its complete body contains `title`, optional `decisionDate`, optional `context`, `constraints`, `options`, optional `decision`, optional `consequences`, `assumptions`, optional `falsifier`, and optional `initialReviewDate`.
- Accepted reasoning rejects PUT with `409 DECISION_IMMUTABLE`.
- Accept is an explicit command requiring Decision `If-Match` and `Idempotency-Key`; its optional `{ decisionDate }` body supplies the local date when the Draft does not already have one. Accept validates the minimal complete reasoning defined by the domain and never uses generic status mutation.
- Review requires Decision `If-Match` and `Idempotency-Key` and appends one DecisionReview.
- A Decision ETag covers the Decision plus its review chain and current due-date projection. Two concurrent reviews with the same prior ETag cannot both append; the loser receives `412 STALE_WRITE`.
- `SUPERSEDE` atomically appends its review and changes the Decision status to Superseded. When `replacementDecisionId` is supplied, it must name a same-user Draft that is not the original and does not create an ancestry cycle; the transaction also sets or verifies that replacement's `supersedesDecisionId` back-link. Conflicting ancestry is rejected. Omitting a replacement is allowed and remains unlinked in v1.
- Reviews receive an immutable per-Decision sequence starting at 1. The serialized transaction assigns the next sequence, which is the authoritative append order when two reviews share a timestamp.

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
GET /api/search?q=quorum&type=PLAN&quarterId=q4-2026&limit=25
```

`q` is required and contains 1–200 characters (whitespace-only terms are invalid). Optional filters are `type` (`PLAN | JOURNEY | DECISION`), `quarterId`, cursor, and `limit` (1–100, default 25). Search is case- and accent-insensitive and matches the current user’s Quarter plan, Tasks, Focus Areas, Milestones, Journey thoughts, and Decision reasoning/reviews. Results are grouped in plan, Journey, Decisions order and include a type-specific excerpt plus canonical resource/context IDs. They do not contain frontend route strings. Cursors are bound to the query and filters; changing the query requires a fresh search.

No advanced query language exists in v1.

## Email

```text
GET /api/email/preferences
POST /api/email/preferences
GET /api/email/unsubscribe?token=…
GET /api/email/resubscribe?token=…
```

Invite delivery (owner-only `POST /api/auth/invites`) sends a best-effort Resend email after the invite row commits; delivery failure never loses the invite. The response carries required `emailSent: boolean` (`AuthInviteCreateResponse`); old clients ignore the extra field.

- `GET`/`POST /api/email/preferences` are authenticated and read/write `{ digestUnsubscribed: boolean }` for the current user.
- `GET /api/email/unsubscribe` and `/api/email/resubscribe` are public, IP rate-limited, token-credentialed links (HMAC of the user ID under the installation key). Forged tokens and removed accounts return the identical invalid-link response. Only bulk mail (the future digest) honors the opt-out; one-to-one mail does not.

There is no `/api/media`: binary image upload was removed (ADR-0015). Images are pasted `https://` URL strings inside existing markdown fields; the server never fetches them.

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
  "baseEtag": "opaque-quarter-etag",
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

Create mode returns `basePlanRevision: null`. A successful create starts the new Quarter at `planRevision: 1`; later successful applies increment it by exactly one.

### Apply

Requires `Idempotency-Key`:

```json
{
  "previewToken": "opaque-short-lived-token",
  "acknowledgementIds": ["preserve-active:task-retries"]
}
```

Inside one serialized transaction it revalidates the token/content, HTTP precondition, base `planRevision`, required acknowledgements, references, overlap rules, and history preservation; then increments plan revision once.

- `UPDATE_QUARTER` requires `If-Match` equal to the Preview `baseEtag`.
- `CREATE_QUARTER` requires `If-None-Match: *` so a Quarter created after Preview cannot be overwritten.
- Every removed Quarter-plan item has a required acknowledgement. Running/Paused Task changes or removals additionally require `PRESERVE_ACTIVE_WORK`.
- A mismatched HTTP precondition returns `412 STALE_WRITE`; a valid preview whose base revision has since changed returns `409 PLAN_REVISION_CHANGED`.
- If the Quarter ID in a create preview has been created before Apply, the failed `If-None-Match: *` precondition returns `412 STALE_WRITE`.

Receipt replay lookup occurs before preview-token expiry or revision validation. A retry of an already committed apply therefore succeeds even if its ephemeral preview token has since expired.

- Expired/unknown preview: `410 PLAN_PREVIEW_EXPIRED`
- Changed base: `409 PLAN_REVISION_CHANGED`
- Missing acknowledgement: `409 ACKNOWLEDGEMENT_REQUIRED`
- Create-quarter success: `201 Created`
- Update-quarter success: `200 OK`

Preview tokens are ephemeral. Restart may require a fresh preview; no PlanPreview domain model exists.

### Export

Returns `application/yaml`, an attachment filename, and ETag derived from `planRevision`. It contains current plan intent only—never Sessions, status, outcomes, Decisions, legacy generated-advice rows, or reflection. Normalized reimport of an unchanged export has an empty semantic diff.

## HTTP status summary

| Status | Use |
|---:|---|
| 200 | Successful read/update/action |
| 201 | Resource/continuation/quarter created |
| 204 | Explicit JourneyEntry delete |
| 400 | Malformed JSON/query syntax |
| 403 | Untrusted Host/Origin for the local runtime |
| 413 | Request body exceeds the route limit |
| 404 | Missing or not owned resource |
| 409 | Domain/concurrency workflow conflict |
| 410 | Expired plan preview |
| 412 | Stale `If-Match` |
| 422 | Well-formed but invalid domain/plan content |
| 428 | Required precondition absent |
| 500 | Unexpected internal failure |
| 503 | Store busy, corrupt, unsupported, or safely unavailable |
