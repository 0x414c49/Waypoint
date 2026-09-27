# Plan Updates and Historical Truth

Status: Confirmed on 2026-09-27

## Principle

Plan import changes intent. It never resolves, completes, skips, pauses, restarts, or deletes lived work.

Keep three things separate:

- **Plan format version:** the YAML schema declared by the imported document
- **Storage schemaVersion:** the later JSON persistence shape
- **Quarter planRevision:** the successful-import generation used to prevent stale applies

## Field ownership

### Plan-owned

- Quarter title, dates, description, mantra, success criteria
- Focus areas and their plan fields
- Milestones and their plan fields
- Task focus/milestone, date, title, description, planned minutes, tags, position, and recommendation mode
- Current-plan membership/removal marker

### Execution-owned

- Task status
- Task plan snapshot
- Sessions and corrections
- Lifecycle events
- Daily reviews and outcomes
- Continuation links
- Journey entries
- Decision records/reviews
- AI reviews

An import document may never supply or overwrite execution-owned fields.

## Stable identity

- Resolve the target Quarter by its stable ID; an import may not silently create a replacement for a known Quarter.
- Resolve Task, FocusArea, and Milestone identity by stable ID within the Quarter.
- Never fuzzy-match by title or date.
- Same ID means the same conceptual item.
- A real repeat or replacement receives a new ID.
- An ID change appears as Removed + Added.

## History-bearing threshold

A Task becomes history-bearing when its immutable TaskPlanSnapshot is captured. This happens before the first action that creates durable history:

- Start
- Skip
- linking a JourneyEntry
- linking a DecisionRecord
- linking an AIReview

Once history-bearing, the Task record cannot be hard-deleted by plan import. History views render plan context from the snapshot.

## Preview pipeline

No write occurs during preview.

1. Parse the full document.
2. Validate plan format version and required structure.
3. Validate Quarter identity and date range.
4. Validate duplicate IDs and all FocusArea/Milestone references.
5. Validate dates, positive planned minutes, and plan-specific range rules.
6. Normalize plan-owned values.
7. Diff against current plan-owned fields only.
8. Classify Added, Changed, Removed, Historical item preserved, and Conflict.
9. Record the Quarter’s current `planRevision` as the preview base.

Validation failure returns the complete useful error set where practical and performs no writes.

An unknown Quarter ID produces an explicit **Create quarter** preview mode. It is never fuzzy-matched to an existing Quarter by title or dates. Apply creates the Quarter only after the same preview/validation step and still rejects a date range that overlaps another Quarter for the User.

## Preview categories

### Added

The imported stable ID does not exist. Apply creates a new Not started record.

### Changed

The stable ID exists and one or more plan-owned values differ. Preview shows human-readable before/after values.

### Removed

An existing current-plan ID is absent from the incoming plan. “Removed” means absent from future plan intent, not deleted history or skipped work.

### Historical item preserved

The imported plan changes or removes an item with durable history. Preview explains that its original execution snapshot, state, sessions, reviews, and links remain.

### Conflict

A changed/removed Task is currently Running or Paused. The user must explicitly acknowledge **Preserve current work and apply plan changes** or cancel. No option may replace history.

## Apply pipeline

Apply is all-or-nothing.

1. Verify the preview base `planRevision` still equals the Quarter’s current revision.
2. Verify required active-item acknowledgements.
3. Apply all plan-owned additions/changes/removals under one serialized write.
4. Preserve every execution-owned value.
5. Increment `planRevision` exactly once.
6. Set `lastPlanImportedAt`.
7. Persist safely; failure leaves the prior document intact.

If the base revision changed after preview, reject apply and require a fresh preview.

## Add, change, and remove behavior

### Add unknown ID

- Create a Not started plan Task.
- Do not create a Session, snapshot, review, or Journey entry.

### Change pristine Not started Task

- Replace plan-owned fields.
- Keep status Not started.
- No historical notice is needed because no lived context exists.

### Change history-bearing/open Task

- Preserve TaskPlanSnapshot and every execution record.
- Update the current plan projection only after explicit acknowledgement for Running/Paused tasks.
- Today and historical views continue displaying the execution snapshot while the item remains open/history-bound.
- Quarter may show the updated plan intent with a quiet “changed after start” indication when necessary.
- Do not pause, finish, split, or restart the Task.

### Change Finished or Skipped Task

- Preserve terminal state and snapshot.
- The update is non-blocking and appears as Historical item preserved.
- The Task does not become open again.
- Repeating the work requires a new stable ID.

### Remove pristine, unreferenced Not started Task

- It may be hard-deleted because no execution or related history exists.
- No Skipped event is created; absence from a future plan is not a learning outcome.

### Remove history-bearing Task

- Retain it and set `removedFromPlanAt`.
- Exclude it from future-plan scheduling.
- Preserve status, snapshot, Sessions, reviews, lifecycle events, and links.
- If Running or Paused, require explicit acknowledgement; it remains open after apply and continues to own Today according to normal rules.

### Re-add a preserved/tombstoned ID

- Clear `removedFromPlanAt` and update plan-owned fields.
- Never duplicate the Task.
- Prior terminal state remains terminal.
- To perform the learning again, the plan needs a new ID.

## FocusArea and Milestone changes

- Pristine unreferenced records removed from the plan may be deleted.
- Records referenced by a Task snapshot or preserved Task remain as tombstones with `removedFromPlanAt`.
- A renamed FocusArea or Milestone updates current plan intent; snapshots retain the original display name/title for historical views.
- Removing a group cannot cascade-delete Tasks or history.

## Why one snapshot, not full plan versioning

The current projection plus one immutable per-Task snapshot solves the current problem:

- the Quarter reflects the latest accepted plan
- the learner’s historical context remains truthful
- preview/apply can reject stale revisions
- JSON remains human-readable
- later SQL mapping remains direct

Do not add in v1:

- a stored copy of every imported YAML document
- per-field revision chains
- restore-to-old-plan behavior
- event sourcing
- a plan merge engine

Those features solve audit/restore scenarios that have not been requested.

## Import invariants

1. Preview is read-only.
2. Apply matches the exact preview base revision.
3. Apply is atomic.
4. Plan import never changes execution status.
5. Plan import never creates or ends Sessions.
6. Plan import never writes DailyReview, JourneyEntry, DecisionReview, or AIReview.
7. History-bearing records are never hard-deleted.
8. Removed-from-plan is independent from Skipped.
9. Active conflicts offer no destructive-history resolution.
10. Export reconstructs current plan intent, not execution records or private reflection, unless a separate history export is explicitly requested later.
