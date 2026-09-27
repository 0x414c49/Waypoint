# Learning Plan YAML Format — Version 1

Status: Proposed normative contract for implementation  
Media type at the API boundary: JSON wrapper containing YAML source, as defined in the API contract

## Goals

- Preserve a thoughtfully authored Quarter plan.
- Give Today enough explicit structure to recommend work without parsing prose.
- Keep stable identity across imports.
- Reject ambiguity rather than silently guessing.
- Round-trip current plan intent through normalized YAML export.
- Never accept execution state or history from a plan file.

## Complete shape

```yaml
version: 1

quarter:
  id: q4-2026
  title: Q4 2026 — Engineering Growth
  description: Optional longer context.
  mantra: Own the why. Design the system. Verify reality.
  start: 2026-10-05
  end: 2026-12-31
  successCriteria:
    - id: q4-2026-criterion-1
      text: Ship a Go service that handles concurrent load.

focusAreas:
  - id: q4-2026-systems
    name: Systems Reliability
    description: Optional.
    targetMinutes: 1200

milestones:
  - id: q4-2026-w01
    title: Week 1
    description: Optional plan-period context.
    start: 2026-10-05
    end: 2026-10-09
    mode: STANDARD

tasks:
  - id: 2026-10-06-timeouts
    milestoneId: q4-2026-w01
    focusAreaId: q4-2026-systems
    date: 2026-10-06
    title: Timeouts
    description: Explore what they protect and where they cascade.
    plannedMinutes: 45
    tags: [reliability]
    recommendationMode: DEFAULT
    decisionPrompt:
      decisionId: adr-q4-2026-01
      suggestedTitle: Sync vs async workflow
      initialReviewDate: 2026-10-28
```

## Parsing rules

- Accept UTF-8 YAML up to 1 MiB in v1.
- Reject duplicate mapping keys.
- Reject custom YAML tags and executable/object construction.
- Bound aliases/anchors using parser safety controls; this format does not require them.
- Reject unknown fields at every defined object level. This catches spelling mistakes and prevents silently discarded plan intent.
- Optional fields are omitted when absent. Explicit `null` is rejected in v1.
- Strings must be non-empty after trimming unless the field explicitly permits empty text; none currently do.
- Dates are plain `YYYY-MM-DD` calendar dates, never timestamps.
- Array order is meaningful and becomes the persisted `position`.
- Parse and validate the entire document before previewing changes.

## Stable IDs

- Every Quarter, FocusArea, Milestone, Task, criterion, and decision prompt ID must be stable.
- IDs use lowercase ASCII letters, numbers, `.`, `_`, and `-`, beginning with a letter or number.
- Entity IDs are globally unique in the store. The representative plan prefixes period-like IDs and dates Task IDs for readability.
- Identity never comes from title, date, or position.
- Rename/reschedule keeps the ID.
- A genuinely new/repeated intention receives a new ID.
- Changing an ID appears as Removed + Added.

## Quarter

Required:

- `id`
- `title`
- `start`
- `end`

Optional:

- `description`
- `mantra`
- `successCriteria` (defaults to `[]`)

Rules:

- Start must be on/before end.
- Quarter date range cannot overlap another Quarter for the current User in v1.
- Criterion IDs are stable and their array order is preserved.
- Criteria express intent; import never turns them into completion checkboxes or calculated scores.

## Focus areas

`focusAreas` is required and may be empty.

Required per item:

- `id`
- `name`

Optional:

- `description`
- `targetMinutes` (positive integer)

Target minutes are plan guidance only. They do not imply a progress percentage or learning score.

## Milestones

`milestones` is required and contains at least one item for a non-empty Quarter.

Required:

- `id`
- `title`
- `start`
- `end`
- `mode`: `STANDARD | LIGHT | BUFFER | RETRO`

Optional:

- `description`

Rules:

- Dates lie inside the Quarter.
- Milestone date ranges do not overlap in v1.
- Milestones may leave gaps for intentional rest/holidays.
- V1’s representative plan uses Milestones as weeks, but the record remains a named plan period.

## Tasks

`tasks` is required and may be empty.

Required:

- `id`
- `milestoneId`
- `date`
- `title`

Optional:

- `focusAreaId`
- `description`
- `plannedMinutes` (positive integer)
- `tags` (defaults to `[]`)
- `recommendationMode` (defaults to `DEFAULT`)
- `decisionPrompt`

Rules:

- Date lies inside the Quarter and referenced Milestone.
- FocusArea and Milestone belong to the same Quarter.
- Array order determines order among tasks with the same date.
- `DEFAULT` work may become Today’s normal recommendation.
- `WHEN_CLEAR` work yields to unfinished work and same-Milestone catch-up.
- The plan cannot supply Task status, Sessions, actual time, outcome, reviews, snapshots, timestamps, or continuation links.

## Decision prompt

An optional `decisionPrompt` marks a Task expected to produce an ADR.

Required:

- `decisionId`
- `suggestedTitle`

Optional:

- `initialReviewDate`

Rules:

- The prompt is planned intent only; import does not create a DecisionRecord.
- The user explicitly creates a Draft from the related Task.
- `decisionId` becomes the stable DecisionRecord ID when that Draft is created.
- A prompt may be associated with at most one DecisionRecord.
- Task Finish and Decision Accept remain independent actions.

## Defaults and normalization

Importer normalizes:

- missing `successCriteria` → `[]`
- missing `tags` → `[]`
- missing `recommendationMode` → `DEFAULT`
- line endings → `\n`
- surrounding scalar whitespace where it is not meaningful

Importer does not infer:

- FocusArea from weekday/title
- Milestone from date when `milestoneId` is missing
- planned minutes from prose ranges
- ADR prompts from the text “ADR”
- IDs from titles
- Task status from past dates

## Export behavior

Export produces normalized version-1 YAML containing current plan intent only.

- Preserve stable IDs and semantic values.
- Preserve array order.
- Omit absent optional fields and defaults where doing so remains unambiguous.
- Do not promise byte-for-byte round-trip, comment preservation, anchor preservation, or original wrapping style.
- Never export execution state, Sessions, snapshots, outcomes, Journey entries, Decisions, AI reviews, or command receipts.

Importing an unchanged normalized export must produce an empty semantic diff.

## Unknown versions

- `version: 1` is the only supported format initially.
- Missing or unsupported versions fail validation.
- Do not guess forward-compatible meanings or silently ignore future fields.

## Representative fixture

The complete Q4 mapping lives at:

`planning/fixtures/q4-2026-engineering-growth.yaml`

Its mapping notes are documented in `planning/q4-plan-mapping-review.md`.
