# Stages and Decision Gates

This file prevents the project from drifting into premature implementation. Work may refine an earlier stage, but it may not silently skip a gate.

## Current position

**Active:** Product discovery, journey exploration, and ASCII UX sketches
**Blocked:** Visual system, domain model, API, architecture, and implementation until the preceding decisions are confirmed

## Stage 0 — Workspace initialization

Deliverables:

- [x] Git repository initialized
- [x] Root README and ignore rules
- [x] Documentation, planning, design, architecture, ADR, client, server, shared, and data folders
- [x] No application code

Gate: workspace exists and clearly points to the product source of truth.

## Stage 1 — Product discovery

Deliverables:

- [x] Product brief/compass
- [x] Product principles and non-goals
- [x] Representative-plan implications
- [x] Highest-risk UX assumptions

Gate: confirm that the problem, promise, primary user, and anti-goals are correct.

## Stage 2 — Journey exploration

Deliverables:

- [x] Journeys A–I documented
- [x] Alternatives and recommendations retained
- [x] Edge cases and likely confusion identified

Gate: choose the primary behaviors for Start, Pause/Resume, Finish, unfinished work, low-energy days, capture, weekly review, decision review, and plan updates.

## Stage 3 — ASCII UX sketches

Deliverables:

- [x] Essential screen/state sketches
- [x] At least two alternatives for the most important screens
- [x] Mobile variants where hierarchy changes

Gate: confirm screen hierarchy and interaction model, not visual styling.

## Stage 4 — UX evaluation

Deliverables:

- [x] Preliminary heuristic evaluation
- [ ] Feedback incorporated
- [ ] Final chosen flow recorded

Gate: **explicit UX confirmation required.** Stop here before visual design.

## Stage 5 — Visual system

Deliverables after UX confirmation:

- [ ] Typography, spacing, radii, and semantic color tokens
- [ ] Buttons, states, contribution levels, light/dark behavior
- [ ] Mobile navigation and touch behavior

Gate: explicit visual-direction confirmation.

## Stage 6 — Information architecture

- [ ] Small navigation model confirmed
- [ ] Contextual versus top-level destinations confirmed

## Stage 7 — Domain/data model

- [ ] Models, ownership, invariants, and state transitions
- [ ] Duplication/speculation/history/SQL migration review

Gate: explicit data-model confirmation.

## Stage 8 — API and persistence behavior

- [ ] REST endpoints and dashboard aggregation
- [ ] Use-case-owned task transitions
- [ ] Error model and important request/response shapes
- [ ] JSON storage port and safe-write behavior

Gate: explicit API confirmation.

## Stages 9–13 — System design and ADRs

- [ ] Current-user seam
- [ ] AI-review seam
- [ ] Component responsibilities and data flows
- [ ] Failure behavior
- [ ] Concise ADRs for confirmed choices

Gate: explicit architecture confirmation.

## Stage 14 — Consolidated implementation gate

One document must summarize confirmed product, UX, visual, domain, API, architecture, v1 scope, and deferred scope.

- [ ] Consolidated review complete
- [ ] User explicitly approves implementation

Only then may production code begin, following vertical slices.

## Change discipline

- Drafts may change freely within their current stage.
- Confirmed decisions are changed by adding an entry to the decision log with the reason and affected documents.
- Implementation discoveries may reopen a decision, but they may not quietly override it.
- A feature request that conflicts with the product compass must be called out before work begins.
