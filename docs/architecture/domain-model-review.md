# Domain Model Review

Status: Confirmed on 2026-09-27

## Summary

The proposed model supports the confirmed daily loop, the representative Q4 plan, safe plan updates, truthful reopen/carry-forward history, decision review, and a future AI seam without creating a general task-management system.

## Is anything duplicated?

Two duplications are deliberate and bounded:

### Task status projection

`Task.status` duplicates state that can partly be reconstructed from Sessions and lifecycle events. It is retained as a backend-owned current projection because Today/dashboard reads need a clear authoritative state and because Finished/Skipped cannot be inferred from time alone.

Safeguards:

- users and imports never write it
- use cases update it atomically with historical facts
- invariants define how to validate/rebuild it

### Task plan snapshot

The immutable TaskPlanSnapshot duplicates a small set of plan fields exactly once. This is necessary to prevent later plan changes from rewriting the title, date, focus context, or planned intent attached to lived work.

Rejected duplication:

- no stored `actualMinutes`
- no persisted weekly totals or contribution cells
- no latest-review fields copied onto DecisionRecord
- no plan snapshot per import or per field
- no session note duplicating JourneyEntry
- no AI score copied to Task/Quarter

## Is any field speculative?

Every nontrivial addition has a confirmed use:

- `timeZone` / `timeZoneAtStart`: Today and cross-midnight truth
- Milestone `mode`: explicit light/buffer/retro weeks in the Q4 plan
- Task `recommendationMode`: normal, when-clear/catch-up-aware, or genuinely optional recommendation semantics
- Session `intentionMinutes`: Do 10 minutes across refresh
- TaskLifecycleEvent: truthful Finish/Skip/Reopen/Undo history
- `planRevision`: stale preview prevention
- DecisionReview: append-only hindsight without rewriting the ADR

Potentially sparse fields remain optional:

- FocusArea `targetMinutes`
- Task tags
- deeper DailyReview `reflection`

They are present in the master plan/domain requirements but remain outside the normal daily form. If not used by the first plan/import slice, they may stay absent in stored records rather than receive placeholders.

## Is ownership clear?

Yes.

- Quarter owns plan structure and Tasks through `userId`.
- Task owns Sessions, DailyReviews, and lifecycle events.
- JourneyEntry and DecisionRecord have direct User ownership because they can stand alone. Legacy AIReview rows retain their prior owner field only for persisted-store compatibility.
- DecisionReview derives ownership through DecisionRecord.
- Relationships are checked to resolve to the same User.

No child receives redundant `userId` merely for convenience.

## Is history preserved?

Yes, under explicit rules:

- Sessions are never moved between Tasks.
- Reopen never deletes prior finish reviews/events.
- Carry forward creates a linked new Task and transfers no time.
- Accepted Decision reasoning is immutable; reviews append.
- AI advice appends and cannot mutate its target.
- Plan update can delete only pristine, unreferenced future records.
- A history-bearing Task retains one immutable plan snapshot and is tombstoned rather than deleted when removed from plan intent.
- Journey entries are outside plan-import ownership.

Session correction is the intentional exception: the User may repair erroneous telemetry. It records correction timestamps but does not require an audit ledger in private v1.

## Can storage later move to SQL without redesigning the domain?

Yes.

- Entities have stable IDs and explicit foreign-key ownership.
- Dates and instants have distinct types.
- Child collections can map to tables.
- Arrays may begin as JSON columns or be normalized by an adapter.
- Current status, single-active-session, time-range, and reference invariants can be enforced transactionally.
- Plan snapshots can map to a one-to-one table or JSON column without changing behavior.
- The application depends later on JourneyStore rather than storage shape.

The JSON adapter should use top-level collections instead of deeply nesting all history inside a Task.

## Is any model shaped around the UI instead of the concept?

No presentation constructs are persisted:

- no dashboard cards
- no Today record
- no active timer counter
- no week-review completion
- no contribution-grid cell
- no progress percentage
- no streak or score

Task status is lifecycle state, not a visual label. Milestone mode and recommendation mode encode plan semantics required to choose work on light/conditional days.

## Is anything missing that would be painful to retrofit?

The review identified and included four cheap, important foundations:

1. IANA timezone and per-session captured timezone
2. Immutable Task plan snapshot at the history boundary
3. Append-only DecisionReview separate from accepted reasoning
4. Small TaskLifecycleEvent history for Finish/Skip/Reopen/Undo

API review also confirmed two small rules: Quarter date ranges do not overlap in v1, and postponing a decision review is represented by an append-only `DEFERRED` review with a required next date.

Deliberately deferred because they are not painful foundational seams:

- authentication/permissions
- complete imported-plan archive and restore
- general audit logging
- task taxonomies/subtasks/dependencies
- notifications and integrations
- recurring habit entities
- provider-specific AI configuration

## Why there is no Habit entity

The habit is the behavior created by the plan, Today recommendation, and low-friction session loop. Persisting a separate Habit with targets, streaks, and completion rules would push the product toward a generic habit tracker and duplicate the Quarter plan.

## Why there is no WeekSummary entity

A week summary is a generated read model from Milestone, Tasks, Sessions, DailyReviews, JourneyEntries, and DecisionReviews. Persisting it would create synchronization work and a “review completed” ritual that the confirmed UX rejected.

## Main trade-offs accepted

- Current status is convenient but must never drift from Session/event facts.
- One plan snapshot preserves history without offering full plan rollback.
- Direct Session correction is simpler but does not keep a forensic audit trail.
- Stable text IDs keep JSON readable but require strict import validation.
- Polymorphic AI targets are easy in JSON and require adapter-specific referential enforcement later.

## Data-model confirmation requested

Confirm together:

1. The ownership tree and stable-ID policy
2. Current plan projection + one immutable Task snapshot
3. Task/Session lifecycle and single-active-session invariant
4. DailyReview per finish occurrence
5. Separate append-only DecisionReview
6. Derived—not persisted—time totals, weekly summaries, contributions, recommendations, progress, and scores
7. Safe plan import/tombstone behavior

This checkpoint was confirmed and fed the later REST/API, persistence, and system-design stages. Application code remains blocked by the consolidated implementation gate.
