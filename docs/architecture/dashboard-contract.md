# Dashboard Contract

Status: Confirmed on 2026-09-27
Endpoint: `GET /api/dashboard`

## Responsibility

Dashboard is the server-resolved read model for Today. It answers “What should I do next?” from one consistent state snapshot. The frontend renders the result and advances a visible active timer locally; it does not recreate task selection, unfinished-work priority, catch-up, or decision-due rules.

## Response shape

```json
{
  "dataRevision": 83,
  "generatedAt": "2026-11-03T18:10:00Z",
  "today": "2026-11-03",
  "timeZone": "Europe/Amsterdam",
  "quarter": {
    "id": "q4-2026",
    "title": "Q4 2026 — Engineering Growth",
    "planRevision": 3
  },
  "state": "PAUSED",
  "hero": {
    "state": "PAUSED",
    "reason": "MOST_RECENT_UNFINISHED",
    "task": {},
    "timing": {
      "actualSecondsAtGeneratedAt": 1680,
      "runningSince": null
    },
    "primaryAction": { "kind": "RESUME" },
    "secondaryActions": [
      { "kind": "ADD_THOUGHT" },
      { "kind": "FINISH" },
      { "kind": "SKIP" }
    ]
  },
  "activeSession": null,
  "upNext": {
    "reason": "SCHEDULED_TODAY",
    "task": {},
    "remainingTodayCount": 0
  },
  "milestoneSummary": {
    "id": "week-5",
    "title": "Week 5",
    "startDate": "2026-11-02",
    "endDate": "2026-11-06",
    "mode": "STANDARD",
    "sessionSeconds": 7200,
    "sessionCount": 4,
    "plannedItemCount": 5,
    "touchedItemCount": 4,
    "finishedItemCount": 3,
    "skippedItemCount": 0,
    "openItemCount": 1,
    "thoughtCount": 2,
    "changedMyMindCount": 1,
    "href": "/api/quarters/q4-2026/milestones/week-5/summary"
  },
  "decisionReviewsDue": {
    "count": 1,
    "items": [
      {
        "decisionId": "adr-1",
        "title": "Sync vs async workflow",
        "dueDate": "2026-11-03"
      }
    ]
  }
}
```

Task objects use the shared Task projection from the API contract. `href` values point to API resources, never frontend routes.

## Dashboard states

```text
ONBOARDING | READY | RUNNING | PAUSED | FINISHED | LIGHT
```

### Onboarding

- No Quarter exists for the User.
- `quarter`, `hero.task`, `activeSession`, `upNext`, and `milestoneSummary` are null.
- The one primary action is Import plan; a secondary action may load the representative example.
- The empty state explains the daily loop in one sentence and does not invent sample completion data.

### Running

- Exactly one active Session exists.
- Hero Task owns that Session.
- Primary action is Pause.
- `activeSession` contains timing anchors.

### Paused

- The most recently active nonterminal Task is recommended.
- Primary action is Resume.
- Today’s scheduled Task remains Up next.

### Ready

- No running or paused Task outranks the selected eligible planned Task.
- Primary action is Start.
- Do 10 minutes appears as a secondary action.

### Finished

- No Running, Paused, or eligible Ready recommendation exists.
- A non-undone Finished event occurred today.
- Hero may summarize the latest completion calmly.
- A finished item never hides another eligible task.

### Light

No current work recommendation exists. `reason` explains the plan state:

```text
PLAN_LIGHT | PLAN_BUFFER | NO_PLANNED_ITEM | ALL_ITEMS_CLOSED | BETWEEN_QUARTERS | QUARTER_NOT_STARTED
```

Skipped-only days resolve to Light, not Finished or failure. Primary action may be absent; the server never manufactures reflection work merely to fill the page.

## Resolution algorithm

Using User timezone and one consistent snapshot:

1. Resolve at most one current Quarter plus the nearest past/future Quarter. Overlapping Quarter dates are invalid in v1.
2. If a Session is active, select its Task → Running even when its Quarter is no longer date-current.
3. Otherwise select the Paused Task with the most recent effective Session activity → Paused, including an open Task from a just-ended Quarter.
4. When a current Quarter exists, select the first Not started `DEFAULT` Task scheduled today by plan position → Ready.
5. When a current Quarter contains `WHEN_CLEAR` work today:
   1. find the most recent untouched past `DEFAULT` Task in the same Milestone;
   2. if one exists, recommend it as Catch up → Ready;
   3. otherwise select today’s first `WHEN_CLEAR` Task → Ready.
6. If no higher-priority recommendation exists and a non-undone Finished event occurred today → Finished.
7. If no Quarter exists at all → Onboarding.
8. Otherwise → Light with a semantic reason. With no current Quarter, use `BETWEEN_QUARTERS` or `QUARTER_NOT_STARTED` and return the nearest relevant Quarter summary when one exists.

Past untouched work from older Milestones never becomes automatic backlog debt. Multiple same-day eligible Tasks use plan `position`; remaining items are summarized quietly rather than rendered as competing hero cards.

## Active Session

When present:

```json
{
  "id": "session-42",
  "etag": "opaque-session-etag",
  "task": {
    "id": "2026-11-03-partial-failure",
    "title": "Partial failure",
    "etag": "opaque-task-etag"
  },
  "startedAt": "2026-11-03T17:42:00Z",
  "timeZoneAtStart": "Europe/Amsterdam",
  "intentionMinutes": 10,
  "sessionElapsedSecondsAtGeneratedAt": 1680,
  "taskActualSecondsAtGeneratedAt": 3420
}
```

The browser advances elapsed display from `generatedAt` and `startedAt`. It does not POST timer ticks. Refresh obtains authoritative timestamps again.

## Up next

`upNext` is a single compact preview, never a second hero.

Reasons:

```text
SCHEDULED_TODAY | TODAY_WHEN_CLEAR | CATCH_UP | NEXT_PLANNED
```

When Running/Paused, today’s Default item is preferred as Up next. `remainingTodayCount` reports additional eligible items without displaying a backlog of equal cards.

## Milestone summary

The Dashboard embeds only compact generated facts needed by Today. Full rows and optional weekly reflection come from the milestone-summary endpoint.

Counts remain separate:

- time is effort
- touched/finished/skipped are lifecycle facts
- outcomes are available in full summary
- none combine into a score or percentage

When no current Milestone exists, `milestoneSummary` is null rather than fabricating a calendar period.

## Decision reviews due

A Decision is due when:

- status is Accepted
- it is not superseded
- if it has reviews, the latest DecisionReview has a non-null `nextReviewDate` on or before Today
- if it has no reviews, its initial review date is on or before Today

A review with no next date clears the due schedule; the initial date never becomes active again. A Deferred review requires and updates the next date but is not a substantive completed review. Dashboard returns at most three items plus total count. The UI presents this as quiet secondary context—never red urgency or the primary action.

## Completion receipt versus Dashboard

Finish mutation returns a specific completion receipt for immediate UI acknowledgement and Undo. Dashboard does not store a dismissed-completion flag.

- If another eligible item exists, Dashboard may immediately be Ready for it.
- The client may briefly show the receipt without replacing server recommendation state.
- `GET /api/dashboard` returns Finished only when no higher-priority recommendation exists.

## Consistency

- All fields come from one validated store revision.
- `dataRevision` is that read revision.
- Action responses compute Dashboard after their mutation commits.
- A client may discard an older Dashboard response when it already holds a higher `dataRevision`.
- The endpoint remains one request; the client does not fetch and join domain fragments for Home.
