# Stages and Decision Gates

This file prevents the project from drifting into premature implementation. Work may refine an earlier stage, but it may not silently skip a gate.

## Current position

**Passed:** Slice 5 — global Search and bounded AI (2026-09-29)
**V1 boundary reached:** Slices 0–5 are delivered. Further product changes require a new scope/decision entry.

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

Gate: confirmed on 2026-09-27 through approval to continue with the proposed plan.

## Stage 2 — Journey exploration

Deliverables:

- [x] Journeys A–I documented
- [x] Alternatives and recommendations retained
- [x] Edge cases and likely confusion identified

Gate: confirmed on 2026-09-27. Recommendations were accepted, including Finish Alternative A.

## Stage 3 — ASCII UX sketches

Deliverables:

- [x] Essential screen/state sketches
- [x] At least two alternatives for the most important screens
- [x] Mobile variants where hierarchy changes

Gate: confirm screen hierarchy and interaction model, not visual styling.

## Stage 4 — UX evaluation

Deliverables:

- [x] Preliminary heuristic evaluation
- [x] Feedback/approval incorporated
- [x] Final chosen flow recorded

Gate: confirmed on 2026-09-27. The chosen flow is recorded in `docs/journeys/confirmed-interaction-model.md`.

## Stage 5 — Visual system

Deliverables after UX confirmation:

- [x] Typography, spacing, radii, and semantic color tokens
- [x] Buttons, states, contribution levels, light/dark behavior
- [x] Mobile navigation and touch behavior

Gate: confirmed on 2026-09-27: Quiet Workshop and the four-destination information architecture were accepted.

## Stage 6 — Information architecture

- [x] Small navigation model proposed
- [x] Contextual versus top-level destinations proposed

Gate: confirmed on 2026-09-27.

## Stage 7 — Domain/data model

- [x] Models, ownership, invariants, and state transitions proposed
- [x] Plan/history boundaries and safe import behavior proposed
- [x] Duplication/speculation/history/SQL migration review complete

Gate: confirmed on 2026-09-27. Continue instruction accepted the proposed ownership, lifecycle, and history model.

## Stage 8 — API and persistence behavior

- [x] REST endpoints and dashboard aggregation proposed
- [x] Use-case-owned task transitions proposed
- [x] Error model and important request/response shapes proposed
- [x] JSON storage port and safe-write behavior proposed

Gate: confirmed on 2026-09-27. Continue instruction accepted the proposed API and persistence checkpoint.

## Stages 9–13 — System design and ADRs

- [x] Current-user seam
- [x] AI-review seam
- [x] Component responsibilities and data flows
- [x] Failure behavior
- [x] Concise ADRs for confirmed choices

Gate: documented and ready for explicit confirmation through the consolidated implementation gate.

## Stage 14 — Consolidated implementation gate

One document must summarize confirmed product, UX, visual, domain, API, architecture, v1 scope, and deferred scope.

- [x] Consolidated review passes final independent A/B verification on 2026-09-27
- [x] User explicitly approved implementation on 2026-09-27

Production implementation is authorized and proceeds through the documented vertical slices.

## Implementation delivery gates

- [x] Slice 0 — executable foundation passed on 2026-09-27. Evidence: [Slice 0 validation](slice-0-validation.md).
- [x] Slice 1 — daily heart passed on 2026-09-28. Evidence: [Slice 1 validation](slice-1-validation.md).
- [x] Slice 2 — lived journey passed on 2026-09-28. Evidence: [Slice 2 validation](slice-2-validation.md).
- [x] Slice 3 — decisions passed on 2026-09-29. Evidence: [Slice 3 validation](slice-3-validation.md).
- [x] Slice 4 — plan lifecycle and Quarter passed on 2026-09-29. Evidence: [Slice 4 validation](slice-4-validation.md).
- [x] Slice 5 — global Search and bounded AI passed on 2026-09-29. Evidence: [Slice 5 validation](slice-5-validation.md).

Each slice must pass its own behavioral, architecture, accessibility, and failure-path evidence before work begins on the next slice.

## Change discipline

- Drafts may change freely within their current stage.
- Confirmed decisions are changed by adding an entry to the decision log with the reason and affected documents.
- Implementation discoveries may reopen a decision, but they may not quietly override it.
- A feature request that conflicts with the product compass must be called out before work begins.
