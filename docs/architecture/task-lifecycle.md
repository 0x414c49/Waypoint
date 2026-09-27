# Task Lifecycle and Invariants

Status: Proposed for data-model confirmation

## State meanings

```text
NOT_STARTED  planned, with no session history
IN_PROGRESS  running now; exactly one active session exists
PAUSED       started previously, no active session, still open
FINISHED     intentionally closed with an outcome/review
SKIPPED      intentionally closed without doing the planned work
```

Outcome is separate from lifecycle. `ACHIEVED`, `PARTIAL`, and `NOT_ACHIEVED` all close an item as Finished.

## Valid transitions

```text
NOT_STARTED
  ├── Start ───────────────> IN_PROGRESS
  └── Skip ────────────────> SKIPPED

IN_PROGRESS
  ├── Pause ───────────────> PAUSED
  ├── Finish flow ─────────> PAUSED ── Finish(outcome) ──> FINISHED
  ├── Skip ────────────────> SKIPPED
  └── Carry forward ───────> FINISHED + new NOT_STARTED continuation

PAUSED
  ├── Resume ──────────────> IN_PROGRESS
  ├── Finish(outcome) ─────> FINISHED
  ├── Skip ────────────────> SKIPPED
  └── Carry forward ───────> FINISHED + new NOT_STARTED continuation

FINISHED / SKIPPED
  └── Reopen ──────────────> PAUSED if sessions exist,
                             otherwise NOT_STARTED
```

No date change transitions a task automatically.

## `startTask`

Valid from Not started.

Atomically:

1. Verify the User has no other active Session.
2. Capture TaskPlanSnapshot if absent.
3. Create a Session using one authoritative current timestamp and current User timezone.
4. Store optional `intentionMinutes` when starting through Do 10 minutes.
5. Change Task status to In progress.

Repeated Start on the same already-running Task returns the current Session without creating another. Starting a different Task while one is running returns a structured active-session conflict; it never silently switches.

## `pauseTask`

Valid from In progress.

Atomically:

1. Set the active Session’s `endedAt` using one authoritative timestamp.
2. Change Task status to Paused.

Repeated Pause on an already-paused Task returns current state without adding history. Browser navigation, refresh, or closure never pauses automatically.

## `resumeTask`

Valid from Paused.

Atomically:

1. Verify there is no other active Session.
2. Create a new Session; never reopen the previous interval.
3. Change Task status to In progress.

Repeated Resume on the same already-running Task returns the active Session. A conflict with another active Task offers **Pause current and switch** or Cancel.

## `pauseCurrentAndStartTask`

This is one application use case, not two client-managed state edits.

Atomically:

1. End the current Session and pause its Task.
2. Start a new Session for the target Task.
3. Change the target Task to In progress.

If any step fails, neither Task changes.

## Finish flow and `finishTask`

The confirmed UX stops work when the Finish sheet opens rather than counting reflection time as learning time.

1. From Running, selecting Finish uses the same backend-owned pause transition and opens the sheet.
2. Canceling the sheet leaves the Task Paused; timing does not silently restart.
3. Final Finish is normally submitted from Paused with one outcome and optional takeaway/reflection.
4. For robustness, `finishTask` may also accept In progress and end its active Session atomically.

Final Finish atomically:

1. End any active Session.
2. Create a Finished TaskLifecycleEvent.
3. Create a DailyReview linked to that event.
4. Change Task status to Finished.

Retrying the same command must not create a second event or review. Reopening and finishing again creates a new occurrence while preserving the old one.

## `skipTask`

Valid from Not started, In progress, or Paused.

Atomically:

1. Capture TaskPlanSnapshot if absent.
2. End any active Session.
3. Create a Skipped lifecycle event.
4. Change Task status to Skipped.

Skip requires no reason or reflection. Existing Sessions and Thoughts remain. Skipped is neutral and intentional, not a failed learning outcome.

## `reopenTask`

Valid from Finished or Skipped.

Atomically:

1. Create a Reopened lifecycle event referring to the closure it reverses.
2. Change status to Paused if any Session exists, otherwise Not started.

Reopen never starts a timer and never removes prior Sessions, reviews, thoughts, or lifecycle events. The short-lived Finish Undo uses this operation.

If an open continuation already exists, reopening its source returns a conflict linking to that continuation. This prevents two open representations of the same intended work.

## `carryForwardTask`

Carry forward is an explicit split after work has started, never an automatic date move.

Atomically:

1. End any active Session.
2. Finish the source with outcome Partial.
3. Create a Carried forward lifecycle event.
4. Create one new Not started Task with a new stable ID, explicit planned date, and `continuationOfTaskId` pointing to the source.
5. Copy only stable plan context: focus area, milestone where applicable, title, description, planned guidance, tags, and recommendation mode.

Sessions and actual time remain on the source. A source may have at most one direct continuation; retry returns the existing continuation. Continue a chain from its latest member rather than branching repeatedly from an earlier Task.

## Core invariants

1. A User has at most one active Session across all Quarters.
2. A Task is In progress if and only if it owns exactly one active Session.
3. Not started, Paused, Finished, and Skipped Tasks own no active Session.
4. Every Session belongs permanently to one Task.
5. Effective Session intervals for one User do not overlap.
6. Actual time is always derived from effective Session intervals.
7. Plan import cannot write execution status, Sessions, reviews, lifecycle events, or Thoughts.
8. Start/Pause/Resume/Finish/Skip/Reopen/Carry forward use one authoritative timestamp and apply atomically.
9. A failed mutation leaves no half-created Session, mismatched status, duplicate continuation, or duplicate review.
10. Outcome describes learning result; it is never inferred from elapsed time.

## Today recommendation

Unfinished work means a started, nonterminal Task—normally Paused.

Resolve Today in this order:

1. Running Task
2. Most recently active Paused Task
3. Today’s Default scheduled Task
4. A When clear Task if no unfinished/catch-up work exists
5. Light/free state

Rules:

- Multiple Paused Tasks may exist, but only the most recently active is recommended.
- Today’s scheduled item remains Up next while unfinished work is primary.
- A past untouched Not started item does not automatically displace Today or become overdue debt.
- Past untouched items may appear neutrally in Quarter or as catch-up candidates on a conditional day.
- A session crossing midnight continues to own Today; the new day’s planned item becomes Up next.

## Ten-minute intention

Do 10 minutes creates a normal Session with `intentionMinutes = 10`.

- It does not alter Task planned minutes.
- It never auto-pauses, auto-finishes, or changes outcome.
- At ten minutes the UI may offer Continue, Pause, or Finish.
- Pausing ends that Session’s small intention. A later Resume creates a normal Session unless the learner explicitly chooses Do 10 minutes again.
- It has no relation to streak preservation or reduced success.

## Timezone and midnight behavior

- Store Session instants in UTC and Task planned dates as local calendar dates.
- Capture `timeZoneAtStart` on every Session.
- Active Sessions may cross midnight, a week/quarter boundary, or daylight-saving transition; never split or pause the source record automatically.
- Daily/weekly activity virtually splits duration at local day boundaries using the captured timezone.
- A later User timezone change does not move historical activity.
- DST duration comes from UTC instants.

## Session correction

Correction fixes telemetry, not lifecycle intent.

- A closed Session may correct `startedAt` and `endedAt`.
- An active Session may correct its start; setting its end uses Pause, Finish, or Skip.
- Task relationship cannot change.
- Reject negative intervals and overlaps with any other Session for that User.
- Allow zero duration for an accidental start.
- An unusually long interval may show a warning but is not automatically rejected.
- Correction updates `correctedAt` and generated summaries immediately; it does not change Task status or outcome.

## Idempotency and concurrency expectations

Exact HTTP behavior is deferred to API design, but the domain requires:

- The same command retry returns the original result.
- The same retry identity with a different payload conflicts.
- Finish, Skip, Reopen, Carry forward, and Pause-current-and-switch cannot duplicate historical records.
- Two different simultaneous starts are serialized; exactly one active Session wins.
- Idempotency does not replace concurrency control or serialized writes.
- Conflicts expose current state and permitted resolutions so clients do not recreate domain rules.

## Edge cases to verify later

- Double Start produces one Session.
- Two devices start different Tasks simultaneously.
- Pause-current-and-switch fails without half-applying.
- Browser closes while Finish sheet is open; Task remains Paused.
- Finish response is lost and retried; one review exists.
- Skip while running ends the Session.
- Reopen a never-started skipped Task.
- Reopen and re-finish without losing the first review.
- Retry carry forward; one continuation exists.
- Midnight or DST changes during a Session.
- User timezone changes during a Session.
- Corrected Session would overlap another Task’s interval.
- Several Paused Tasks coexist; the most recently active is recommended.
- A past untouched Task does not become the Today hero.
- Ten-minute threshold passes while browsing another screen.
- Finish with Not achieved still closes calmly.
