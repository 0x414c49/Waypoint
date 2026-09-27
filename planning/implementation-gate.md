# Consolidated Implementation Gate

Status: Approved for implementation on 2026-09-27
Date: 2026-09-27

This is the single implementation-review manifest required by the master prompt. It summarizes the decisions and links each authoritative specification so approval never depends on reconstructing the project from scattered files.

## 1. Product

### Promise and boundary

Build a quiet engineering-learning companion that turns an authored Quarter plan into a natural daily habit. It collects effort, outcomes, reflection, decisions, and changing thought while the learner works. It is not a task manager, self-maintained database, wellness tracker, or streak game.

```text
Open → see what matters → Start → work → Pause/Resume → Finish → tiny reflection → done
```

The [Product Compass](../docs/product/product-compass.md) is the decision test. If a feature makes the learner maintain the tracker or adds guilt, it is out.

### Journey choices and rejected alternatives

| Journey | Accepted | Rejected / constrained |
|---|---|---|
| Start today | One focused, state-aware Today hero | Metric command center; several equal task cards; detail page before Start |
| Pause/resume | Full focused state on Today; compact session strip elsewhere | Global mini-bar as the main surface; task pinned over every page |
| Finish | Outcome + optional takeaway, then Finish; short Undo | Required prose; immediate close with no outcome; celebratory/gamified completion |
| Unfinished work | Preserve original item and Resume it; scheduled work is Up next | Automatic reschedule, silent clone, overdue debt |
| Low energy | Do 10 minutes as a Session intention | Reduced Task target; streak-saving mode; auto-finish at ten minutes |
| Thought | Global + Thought opens directly into text | Required title/tag/category/link; keyboard-only entry |
| Weekly review | Generated facts + at most one optional question | Review-complete status; scorecard; required weekly ritual |
| Decision review | Quiet secondary notice and append-only review | Interrupting Today; editing accepted reasoning; urgent red queue |
| Plan update | Added/Changed/Removed/Historical preserved preview | Raw diff as primary UI; silent apply; history rewrite |
| Decision creation | Contextual Draft from ADR Task, with explicit Accept | Creating authored Decisions during import; coupling Task Finish to Decision Accept |

Full evidence: [Core journey alternatives](../docs/journeys/core-journeys.md) and [Confirmed interaction model](../docs/journeys/confirmed-interaction-model.md).

## 2. UX

### Interaction rules

- Today owns one primary action: Start, Pause, Resume, Finish, or a calm light-day action.
- Running wins over everything; most-recent Paused work wins over scheduled work.
- `DEFAULT` plan work may become Ready. `WHEN_CLEAR` yields to unfinished/same-Milestone catch-up. `OPTIONAL` is labeled **Only if useful** and never becomes an automatic hero or debt.
- Start/Pause/Resume each commit in one activation; state is restored from server timestamps after refresh.
- Finish requires one outcome; takeaway is optional; reflection time is not counted as learning time.
- Quick Thought requires text only and shows inferred active context as removable.
- The browser never asks the learner to choose a Task status or enter actual time.

### Final essential screens

Ready:

```text
┌────────────────────────────────────────────┐
│ TODAY · SYSTEMS RELIABILITY                │
│ Partial failure                            │
│ Network fails halfway through an operation │
│ Week 5 · Tue 3 Nov                         │
│                                            │
│              [ Start session ]             │
│               Do 10 minutes                │
├────────────────────────────────────────────┤
│ RECENT ACTIVITY · recorded effort only     │
│ ░ ░ ▒ ░ ▓ ░ ░ ▒ ░ ░ ░ ░ ▓ ▒              │
└────────────────────────────────────────────┘
```

Running / off-Today recovery:

```text
┌────────────────────────────────────────────┐
│ Partial failure              RUNNING       │
│                   18:42                    │
│                 [ Pause ]                  │
│ + Thought                    Finish item   │
└────────────────────────────────────────────┘

Off Today: Partial failure · 18:42 [Pause] Return
```

Paused with scheduled work preserved:

```text
┌────────────────────────────────────────────┐
│ YOUR PLACE IS SAVED · PAUSED               │
│ Rust ownership · 28 min / 2 sessions       │
│                 [ Resume ]                 │
│ Finish item              Skip intentionally│
├────────────────────────────────────────────┤
│ UP NEXT TODAY · Partial failure            │
└────────────────────────────────────────────┘
```

Finish:

```text
┌────────────────────────────────────────────┐
│ FINISH · 38 min                            │
│ How did this session land?                 │
│ ( ) Achieved  ( ) Made progress  ( ) Not  │
│ One thing worth remembering? · optional    │
│ [                                      ]   │
│ Cancel                       [ Finish item ]│
└────────────────────────────────────────────┘
```

Light/optional day:

```text
┌────────────────────────────────────────────┐
│ TODAY                                      │
│ A lighter day is part of the plan.         │
│                                            │
│ Only if useful                             │
│ Revisit the least-attended reliability     │
│ topic                                      │
│                                            │
│ + Thought                    Take the day   │
└────────────────────────────────────────────┘
```

Mobile hierarchy:

```text
┌────────────────────────────────┐
│ Journey             + Thought │
│ TODAY                          │
│ Partial failure                │
│ 18:42                          │
│ [          Pause           ]   │
│ Finish item                    │
├────────────────────────────────┤
│ Today Quarter Journey Decisions│
└────────────────────────────────┘
```

Complete desktop/mobile history: [ASCII sketches](../docs/journeys/ascii-wireframes.md). Empirical claims are tested, not assumed: [Validation plan](validation-plan.md).

## 3. Visual system — Quiet Workshop

### Exact tokens

- System sans: `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif`.
- Monospace only for timer/code/ADR IDs.
- Type: Display 32/40 (mobile 28/36), H1 24/32 (22/30), Hero 20/28, H2 16/24, Body 15/22, Compact 14/20, Small 13/18, Metadata 12/16, Timer 40/48 (36/44).
- Spacing: `4, 8, 12, 16, 24, 32, 48px` only.
- Radius: `4px` small, `6px` controls, `8px` surfaces/sheets. No giant rounded cards.
- Layout: `960px` maximum, `680px` focused Today, 24px desktop and 16px mobile gutters, breakpoint `720px`.

Core semantic colors:

| Role | Light | Dark |
|---|---|---|
| Canvas | `#F7F8F6` | `#0F1412` |
| Surface | `#FFFFFF` | `#171D1A` |
| Border | `#D8DED9` | `#344039` |
| Text | `#1F2521` | `#E9EEE9` |
| Secondary text | `#616B64` | `#AAB4AC` |
| Accent | `#176B5B` | `#63C6AE` |
| Focus ring | `#2563EB` | `#78A9FF` |
| Success | `#276749` | `#89D3A5` |
| Warning | `#805A16` | `#E4BB72` |
| Error | `#9B3B36` | `#F09A94` |

### Components and mobile

- Exactly one filled accent action per state; mobile primary height 48px; all targets at least 44×44px.
- Today uses one main work surface, not a card grid. Timer is prominent only while Running.
- Outcome choices share one neutral accent selection style; results are not graded green/amber/red.
- Finish is a compact dialog on desktop and safe-area bottom sheet on mobile.
- Four final mobile bottom destinations: Today, Quarter, Journey, Decisions. Thought/Search remain utilities.
- Focus is visible; status always includes text; reduced motion is honored; contribution cells cannot imply streak failure.

Authoritative detail: [Visual system](../docs/design/visual-system.md) and [Information architecture](../docs/design/information-architecture.md). Rejected directions: direct GitHub copy, soft wellness tracker, dense command center, permanent desktop sidebar, and floating action button.

## 4. Domain and historical truth

### Ownership

```text
User
├── Quarter
│   ├── FocusArea
│   ├── Milestone ── MilestoneIntentSnapshot
│   ├── Task ── TaskPlanSnapshot
│   │   ├── Session
│   │   ├── DailyReview
│   │   └── TaskLifecycleEvent
│   └── QuarterIntentSnapshot
├── JourneyEntry
├── DecisionRecord ── DecisionReview
└── AIReview
```

- User ownership is direct on Quarter/JourneyEntry/DecisionRecord/AIReview and derived through parents for children.
- Plan fields describe current intent. Sessions/events/reviews/entries/Decisions/AIReviews are execution/history and cannot be imported.
- Task, Milestone, and Quarter snapshots freeze the context/boundaries at their first history-bearing action, including direct Milestone/Quarter links without a Task.

### Task state

```text
NOT_STARTED ─Start→ IN_PROGRESS ─Pause→ PAUSED ─Resume→ IN_PROGRESS
      │                    │          │
      └─Skip→ SKIPPED      └─Finish───┴─Finish→ FINISHED

FINISHED / SKIPPED ─Reopen→ PAUSED when sessions exist,
                              otherwise NOT_STARTED
```

Status is a stored, validated projection of Sessions plus sequenced terminal/reopen events. One User has at most one active Session. Actual time, contribution levels, Dashboard recommendation, Milestone summaries, and `statusAtPeriodEnd` are derived.

Authoritative detail: [Domain model](../docs/architecture/domain-model.md), [Task lifecycle](../docs/architecture/task-lifecycle.md), [Plan/history](../docs/architecture/plan-and-history.md), and [Temporal attribution](../docs/architecture/temporal-attribution.md).

## 5. REST API

### Surface

```text
GET  /api/me
GET  /api/dashboard
GET  /api/activity?from=&to=
GET  /api/quarters
GET  /api/quarters/:id
GET  /api/quarters/:id/milestones/:milestoneId/summary
GET  /api/tasks
GET  /api/tasks/:id
POST /api/tasks/:id/{start|pause|resume|finish|skip|reopen|carry-forward}
GET  /api/tasks/:id/sessions
PUT  /api/sessions/:id
GET|POST /api/journey
PUT|DELETE /api/journey/:id
GET|POST /api/decisions
GET|PUT /api/decisions/:id
POST /api/tasks/:id/decision-draft
POST /api/decisions/:id/{accept|review}
GET  /api/search?q=
POST /api/plans/preview
POST /api/plans/apply
GET  /api/plans/export/:quarterId
POST /api/ai/review/{task/:id|week|quarter/:id|decision/:id}
```

### Important shapes

Start normally uses `{}`; low-energy Start uses `{ "intentionMinutes": 10 }`. Finish:

```json
{
  "outcome": "ACHIEVED | PARTIAL | NOT_ACHIEVED",
  "keyLearning": "optional",
  "reflection": "optional deeper text"
}
```

Decision review appends `{ outcome, notes?, nextReviewDate?, replacementDecisionId? }`; `DEFERRED` requires a later next date. Plan Preview receives `{ sourceFormat: "yaml", content }`; Apply receives `{ previewToken, acknowledgementIds }`.

Every command that can duplicate history requires `Idempotency-Key`; mutable-resource commands also require `If-Match`. Receipt replay occurs before stale/expired checks. Responses choose `displayPlan` as CURRENT or HISTORICAL so the client never guesses. Errors use RFC 9457 with stable codes; expected status families are 400/403/404/409/410/412/413/422/428/503.

Authoritative detail: [API contract](../docs/architecture/api-contract.md), [Dashboard contract](../docs/architecture/dashboard-contract.md), and [Error contract](../docs/architecture/error-contract.md).

## 6. Architecture and persistence

```text
Browser / React + Vite
        │ same-origin REST
        ▼
Fastify HTTP transport
        ▼
Application commands / queries
        ▼
Pure domain policies and projections
        ▼
Ports
├── JourneyStore ─────── JsonJourneyStore
├── CurrentUserProvider  LocalCurrentUserProvider
└── AIReviewer ───────── StubAIReviewer

Injected: Clock, IdGenerator, Logger
```

Responsibilities:

- Client owns interaction/presentation state, never recommendation/status truth.
- HTTP owns schemas, conditional headers, idempotency headers, and Problem mapping.
- Application use cases coordinate one command/query.
- Domain owns deterministic lifecycle/recommendation/temporal rules with no I/O.
- Adapters own filesystem, local user resolution, and stub generation.

V1 is one Node.js process at `127.0.0.1:4173`, serving frontend and API from one origin with exact Host/Origin allowlists. It is responsive at phone sizes but not remotely accessible over LAN/public internet.

`JourneyStore` reads immutable validated snapshots and transacts with a closed capability (`STANDARD`, `PLAN_APPLY`, exact `JOURNEY_DELETE`, or internal `SCHEMA_MIGRATION`). JsonJourneyStore uses one in-process mutex, validation, same-directory temp, fsync, rolling backup, atomic replace, and fail-closed recovery. Default data is `data/store`; production first run seeds `local-user` and the supplied Q4 plan with no execution history.

Authoritative detail: [System design](../docs/architecture/system-design.md), [Technology stack](../docs/architecture/technology-stack.md), [Persistence contract](../docs/architecture/persistence-contract.md), [Architecture review](../docs/architecture/architecture-review.md), and [ADRs](../docs/adr/README.md).

## 7. V1 scope and build order

The [Release scope](release-scope.md) follows vertical slices:

1. Executable TypeScript/React/Fastify/store foundation.
2. Seed user/plan, Dashboard/Today, Start, timer, Pause, Resume, Finish, tiny reflection, merged state, contribution update.
3. Journey, Quick Thought, Task/session history, generated Week view.
4. Decision records, review due, retrospective.
5. Plan YAML import, preview, apply, export, and full Quarter views.
6. Stub AI review, clearly labeled advice, follow-up suggestion.

Each slice exposes only completed destinations/actions. The heart is validated before secondary surfaces grow.

### Explicitly deferred

- authentication, accounts, permissions, teams, sharing, billing
- LAN/public hosting, cloud sync, PWA/offline sync, notifications
- calendar/email/integrations, plugins, social features
- real external AI, embeddings, RAG, agent frameworks, autonomous mutation
- database/ORM, multi-process workers, queues, event bus, CQRS/event sourcing
- arbitrary workflows/statuses/fields, complex analytics, scores/streaks/badges
- native mobile/desktop applications

## 8. Representative Q4 plan

The [normative YAML fixture](fixtures/q4-2026-engineering-growth.yaml) is a complete in-range schedule mapping: four lanes, 13 Milestones, 64 Tasks, nine success criteria, nine conditional technology explorations, six detailed ADR prompts, buffer reflections, holiday optional work, and Quarter retrospectives.

It preserves the “Standard” capability statement and discloses source tensions: the overview asks for eight ADRs while weekly detail specifies six; Dec 25 is outside Week 12; Week 13 has five activities across four dates. It invents no planned minutes, execution, completion, or decision reasoning. Full review: [Q4 mapping](q4-plan-mapping-review.md).

## 9. Known hypotheses and required evidence

These are not closed merely by documentation:

- “Obvious in three seconds,” “under 20 seconds,” “friendly,” and one-handed mobile use require observed tests.
- Pause-on-opening-Finish may be revised if cancel/close surprises users.
- Decisions remains top-level only while real usage justifies it.
- JSON durability/performance and all concurrency/replay cases require fault/integration tests.
- Automated accessibility checks require keyboard, focus, zoom, contrast, and screen-reader review.

The [Validation plan](validation-plan.md) defines pass evidence and decision-reopen rules.

## 10. Gate checklist

- [x] Product compass confirmed
- [x] Primary journeys, alternatives, and selected interaction model reviewed
- [x] Final screen hierarchy and responsive interaction sketches reviewed
- [x] Exact Quiet Workshop tokens/components/mobile behavior reviewed
- [x] Domain ownership, lifecycle, snapshots, and temporal rules reviewed
- [x] API surface, important shapes, errors, concurrency, and Dashboard reviewed
- [x] Persistence, recovery, user seam, AI seam, and system responsibilities reviewed
- [x] Representative source-plan mapping and tensions disclosed
- [x] V1 slices and deferred scope explicit
- [x] Empirical claims separated into a validation plan
- [x] Independent A/B re-review passes after the 2026-09-27 corrections
- [x] User explicitly approved this consolidated implementation gate on 2026-09-27

## Approval effect

Explicit user approval confirms the plan format, optional-item semantics, Task/Milestone/Quarter snapshots, temporal attribution, architecture, stack, and sliced scope; accepts ADR-0007 and ADR-0008; and authorizes implementation beginning with Slice 0 then the daily-heart Slice 1. It does not authorize deferred scope or network deployment. Minor implementation choices inside these boundaries need no repeated approval; changes to product philosophy, historical truth, trust boundary, or deferred scope reopen the relevant decision.
