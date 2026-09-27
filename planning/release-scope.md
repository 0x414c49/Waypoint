# Release Scope and Vertical Slices

Status: Proposed for the consolidated implementation gate

## Scope rule

The architecture describes the intended v1 boundary; implementation does not build every endpoint at once. Each slice must produce one coherent, testable learner outcome and preserve the product compass.

During incremental development, expose only completed destinations and actions. Do not ship dead navigation, disabled placeholders, or an Onboarding action whose flow does not work. The confirmed four-destination navigation is the v1-complete shape.

## Slice 0 — Executable foundation

Deliver:

- one root TypeScript package and quality scripts
- React/Vite shell and Fastify same-origin server
- shared transport-schema location
- LocalCurrentUserProvider, injected Clock/IdGenerator, and logging baseline
- JsonJourneyStore initialization, validation, safe write, and recovery diagnostics
- Quiet Workshop tokens, responsive shell, and accessible primitives

Gate: the foundation harness starts locally with an injected validated no-history test seed, serves one origin, and passes store failure-path tests. The documented production User/Q4 seed is wired in Slice 1. No generic feature framework is added.

## Slice 1 — The daily heart

Deliver only the shortest valuable loop:

- canonical local User and supplied Q4 plan seed, loaded from the bundled fixture through strict validation but with no import-management UI or execution/completion history
- Dashboard states needed for Light/Ready/Running/Paused/Finished
- one Today hero and compact Up next
- Start, Do 10 minutes, Pause, Resume, Finish, and Undo/Reopen
- Finish outcome plus optional takeaway
- one-active-session conflict with Pause and switch
- automatic elapsed time from Sessions
- quiet contribution update derived from completed Session time
- responsive desktop/mobile Today and keyboard/focus basics

Gate: Open → Start → Pause/Resume → Finish → tiny reflection works without manual status or time entry, survives refresh/restart, and preserves exactly one history record per command despite retries.

Not in this slice: full Quarter management, Journey browsing, Decisions UI, Search, session correction UI, Carry forward UI, plan update UI, or AI.

## Slice 2 — Lived journey

Deliver:

- Quick Thought from Today with inferred/removable Task context
- Journey chronological view and essential filters
- Task/session detail and explicit session correction
- generated Milestone summary and optional weekly reflection
- contribution/activity history as quiet factual context
- Carry forward when genuinely needed by the normal flow

Gate: the learner can understand what happened without maintaining a log, and historical/current plan text is never confused.

## Slice 3 — Decisions

Deliver:

- contextual “Start decision draft” from a planned ADR Task
- independent Draft creation where needed
- Draft edit, explicit Accept, due list, substantive review, Postpone/Deferred, and Supersede
- Decision history surfaced in Journey without duplication

Gate: original reasoning remains immutable after Accept, reviews append safely under concurrency, and Decision work never blocks the Today action.

## Slice 4 — Plan lifecycle and Quarter

Deliver:

- strict YAML import with validation
- create/update preview with history-preservation explanations, acknowledgements, and atomic apply
- normalized current-plan export
- Quarter overview, FocusArea/Milestone navigation, success criteria, and between-quarter state
- Onboarding/empty-plan flow for an explicitly empty store or a future installation without a bundled plan
- complete in-range Q4 schedule fixture as the acceptance case

Gate: changing a plan cannot silently alter execution history, and an unchanged exported/reimported plan has an empty semantic diff.

## Slice 5 — Search and bounded AI seam

Deliver:

- global search overlay across plan, Journey, and Decisions
- deterministic StubAIReviewer flows for the confirmed review targets
- AIReview history clearly labeled as generated advice

Gate: search opens canonical context, and AI results can be repeated/failed without mutating or scoring their targets.

## V1 completion boundary

V1 is complete when Slices 0–5 pass their gates and the validation plan, not when every imaginable tracker feature exists.

## Explicitly deferred

- accounts, authentication, teams, sharing, permissions
- LAN/public hosting, cloud sync, offline/PWA sync
- notifications, reminders, calendar/email integrations
- real external AI provider or autonomous agent actions
- multiple simultaneous active Sessions
- arbitrary custom statuses, workflows, fields, dashboards, or goals
- streaks, badges, leaderboards, aggregate learning scores
- per-field plan history, rollback/merge, generic migration framework
- database, ORM, multi-process workers, event bus
- native mobile/desktop apps
- resource catalog/bookmark manager

Adding one of these requires a new decision entry and, where it changes the trust boundary, a reopened architecture gate.

## Scope-defense questions

Before adding work, ask:

1. Does it make Open → Work → Reflect easier?
2. Does it collect truth naturally rather than demand maintenance?
3. Is it required by a confirmed journey in the current slice?
4. Can it be derived instead of persisted?
5. Would omitting it make the current slice unsafe or dishonest?

If the answer is no, defer it.
