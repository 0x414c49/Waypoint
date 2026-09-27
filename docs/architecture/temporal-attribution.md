# Temporal Attribution and Historical Summaries

Status: Proposed for the consolidated implementation gate

## Purpose

Weekly/milestone summaries must remain truthful after late completion, reopen, plan changes, timezone changes, and Session correction. They therefore separate planned membership, effort occurrence, lifecycle occurrence, as-of state, and current state.

## Planned work attribution

A Task belongs to a planned Milestone using:

1. TaskPlanSnapshot `milestoneId` when the Task is history-bearing.
2. Otherwise the current plan `milestoneId`.

A later plan import cannot move historical planned work between Milestones. A pristine future Task may move because it has no lived context yet.

The Milestone's historical title, dates, mode, and period cutoff come from MilestoneIntentSnapshot when present; otherwise they come from current plan intent. A later import may change the current Milestone without redefining the historical summary boundary.

The summary’s `plannedItems` answers:

> What did this plan period intend?

## Effort attribution

Session duration belongs to the local dates on which the effort actually occurred:

- compute duration from UTC instants
- virtually split at local midnight using `timeZoneAtStart`
- include each segment in the Milestone whose historical date range contains that local date
- do not physically split or rewrite the Session

This means effort on a late continuation may appear in a later period even though the original Task remains planned in an earlier Milestone.

The summary labels these separately:

- `effortDuringPeriodSeconds`: all Session segments occurring inside the period
- per planned Task `taskActualSecondsAllTime`: all effort ever attached to that Task
- optional per planned Task `taskEffortDuringPeriodSeconds`: effort on that Task during the period

No unlabeled single “week total” mixes those meanings.

## Lifecycle and reflection attribution

- Finished, Skipped, Reopened, and Carried-forward events belong to the local date of `occurredAt` using `timeZoneAtOccurrence`.
- JourneyEntries belong to the local date of `occurredAt` using `timeZoneAtOccurrence`.
- DecisionReviews use `reviewedAt` and `timeZoneAtReview`.
- AIReviews use `generatedAt` and `timeZoneAtGeneration` for timeline display.

Capturing the occurrence timezone prevents a later User timezone change from moving non-Session history between dates. DailyReview inherits the date of its linked Finished event.

Historical counts such as “finished during this period” use occurrence date, not the Task’s planned date.

## State as of period end

The period-end cutoff is the instant immediately after MilestoneIntentSnapshot `endDate` in its `timeZoneAtCapture`. For a Milestone with no history/snapshot, use its current end date and current User timezone.

For each planned Task, derive `statusAtPeriodEnd` using only:

- Sessions that began before the period-end instant, treating an interval that ended later (or is still open) as active at the cutoff
- lifecycle events whose occurrence is on/before that instant
- the deterministic status projection rules

Also return `currentStatus` separately when it differs.

Example:

```text
Planned in Week 5
Status at Week 5 end: PAUSED
Current status: FINISHED · completed in Week 6
```

A later Finish therefore does not rewrite how Week 5 ended.

## Plan context in past summaries

- Historical Task title/focus/date comes from TaskPlanSnapshot.
- Historical Milestone title/dates/mode comes from MilestoneIntentSnapshot.
- Original Quarter mantra/success criteria/focus framing comes from QuarterIntentSnapshot.
- Current updated plan intent may be offered as a clearly labeled comparison; it never silently replaces historical context.
- A removed historical item remains visible in its original period with “removed from current plan” as quiet context.

## Corrections

Session correction intentionally repairs telemetry and recalculates affected past effort totals. This is not considered rewriting history; the correction establishes the best known factual interval.

Task outcomes and lifecycle events do not move merely because a Session interval was corrected.

## Summary response requirements

Milestone summary returns distinct groups:

```text
plan
  original planned items

effortDuringPeriod
  session seconds and count by occurrence date

eventsDuringPeriod
  finished, skipped, reopened, decisions reviewed, thoughts captured

plannedItemStates
  statusAtPeriodEnd
  currentStatus
  actualSecondsAllTime
```

The UI may phrase these naturally, but it must not collapse them into one progress percentage or learning score.

## Cross-midnight example

A Session runs from 23:50 to 00:20 in `Europe/Amsterdam`:

- the stored Session remains one UTC interval
- 10 minutes are attributed to the first local date
- 20 minutes are attributed to the next local date
- if midnight crosses a Milestone boundary, effort appears in both periods
- Task planned membership remains unchanged

## Acceptance checks

- Completing a Week 5 Task in Week 6 leaves Week 5 end-state Paused and current-state Finished.
- Rescheduling a history-bearing Task does not move its historical planned membership.
- Changing a history-bearing Milestone's dates does not move its historical effort boundary or period-end status.
- Correcting a Session across midnight updates both affected date totals.
- Changing User timezone later does not move historical Session effort.
- Reopen after period end does not rewrite the earlier as-of status.
- Current and historical states are visibly labeled when different.
