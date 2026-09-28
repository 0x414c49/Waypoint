# Slice 2 Implementation Map — Lived Journey

Status: Gate passed on 2026-09-28
Date opened: 2026-09-28

## Learner outcome

The learner can understand what happened without maintaining a log, correct factual timing mistakes, and preserve a small thought in one focused action. Current plan intent and historical lived context must never be silently confused.

## Scope boundary

Slice 2 delivers only:

- Quick Thought from Today and the global shell, with visible removable active-Task inference
- a chronological Journey with essential date, Task, Milestone, type, and changed-my-mind filters
- contextual Task detail, Session history, and explicit Session correction
- generated Milestone/week summary plus one optional Journey reflection
- quiet full-range Activity derived from closed Sessions
- deliberate Carry forward for started work

Decisions, Quarter management/import, Search, and AI remain deferred. The shell exposes only the working Today and Journey destinations in this slice; Quarter and Decisions remain hidden until their own slices rather than becoming dead navigation.

## Domain and persistence work

- Replace the placeholder Journey record with a strict `JourneyEntry` schema and integrity rules.
- Capture Task, Milestone, and Quarter snapshots atomically when a Journey link first makes plan context historical.
- Keep Journey text, tags, changed-my-mind flag, relationships, and occurrence facts owned by Journey commands.
- Derive Journey timeline rows, durations, Activity cells, Milestone summaries, and period-end state; persist none of those projections.
- Correct only editable Session timestamps, preserve Task/timezone ownership, reject overlap/negative intervals, allow zero duration, and stamp `updatedAt`/`correctedAt`.
- Carry forward atomically finishes the source as Partial, retains its Sessions, appends the structural history, and creates at most one same-Quarter continuation.
- Preserve immutable receipts, ETag concurrency, exact Journey deletion authority, and restart-safe replay.

## API surface

- `GET /api/activity`
- `GET /api/tasks` and `GET /api/tasks/:id`
- `GET /api/tasks/:id/sessions`
- `PUT /api/sessions/:id`
- `GET`, `POST`, `PUT`, and `DELETE /api/journey`
- `GET /api/quarters/:id/milestones/:milestoneId/summary`
- `POST /api/tasks/:id/carry-forward`

Mutations use the accepted `If-Match` and/or `Idempotency-Key` rules. The client consumes server-selected current versus historical display projections and never reimplements domain selection.

## UI ownership and component limits

- `features/journey`: timeline, filters, Activity context, Journey entry presentation, and Quick Thought composer
- `features/tasks`: Task detail, Session rows/correction, and Carry forward surface
- `features/milestones`: generated summary and optional weekly thought
- application shell: only routing, working navigation, and compact off-Today active-session context

Pages orchestrate focused components; domain rules, projection logic, and transport schemas do not live in React components. A component that gains a second independent reason to change is extracted before the gate review.

## Gate evidence

- Quick Thought focuses in one activation on desktop and mobile, saves with text only, shows/removes inferred context, and returns focus to the prior surface.
- Journey chronology and filter combinations are server-owned, deterministic, and paginated without duplicate rows.
- Session correction covers closed, active, zero-duration, negative, overlap, cross-midnight, and stale-ETag cases; summaries update without changing Task status/outcome.
- A Journey link captures missing snapshots in the same transaction, and simulated plan changes leave historical display context intact.
- Activity and Dashboard use identical timezone splitting and contribution thresholds; active Sessions are excluded until closed.
- Milestone summary separates planned membership, effort occurrence, events, period-end status, and current status without scores or completion percentages.
- Thought creation and Carry forward replay exactly once after restart; changed-body key reuse conflicts; Carry forward creates one continuation.
- Today and Slice 1 behavior remain green.
- Desktop and 360px mobile light/dark browser checks pass axe-core; keyboard focus, dialog return, reduced motion, and responsive layout receive manual inspection.
- A neutral final reviewer reports no blocking contract or architecture findings.

The evidence is recorded in `planning/slice-2-validation.md`. Slice 3 begins only after the clean Slice 2 gate commit.
