# Slice 5 Implementation Map — Search and bounded AI seam

Status: **Delivered** on 2026-09-29. Automated gate evidence is recorded in [Slice 5 validation](slice-5-validation.md).
Baseline: 2026-09-29, clean at `6647546`; Node.js 26.10.0 / npm 11.19.1.
Learner problem: find a remembered plan item, thought, or Decision without knowing which area owns it, and request optional reflection without handing control or historical truth to a model.

## Confirmed boundary

Deliver one global Search overlay across plan, Journey, and Decisions, with results that open canonical context. Add deterministic local StubAIReviewer flows for Task, Week, Quarter, and Decision targets. Save completed output as separate, append-only AIReview history and label it as generated advice. No real provider, network access, score, automation, or mutation of execution/decision intent.

## Ownership and approach

- **Shared contracts:** explicit grouped Search results with excerpts and canonical IDs (not client route strings), plus AIReview record/list shapes and target types.
- **Search query:** one current-user-owned store read; matches Quarter/Focus Area/Milestone/Task plan text, Journey thought text, and Decision reasoning/reviews. Filters and cursors are bounded and query-bound.
- **Canonical navigation:** the client maps plan types to Quarter/Task routes, Decisions to their detail route, and Thoughts to `/journey?entryId=…`; the Journey route loads and focuses the exact owned entry.
- **AI boundary:** inject `AIReviewer`; v1 uses `StubAIReviewer` with a stable provider/model identifier and capped evidence. The application rechecks idempotency and target context inside the write transaction, captures required plan snapshots, then appends a separate AIReview and receipt.
- **HTTP:** expose global Search, a single-entry Journey read for Search deep links, target-specific review commands, and target review-history reads. Preserve ownership hiding, strict request validation, same-key retry behavior, and standard Problem Details.
- **Client:** the top-bar Search control opens one keyboard-operable overlay on desktop and a full-screen surface on mobile. Task, Week, Quarter, and accepted/superseded Decision contexts show clearly labeled generated-advice history; only Accepted Decisions offer a new review.
- **Persistence:** validate AIReview target ownership, snapshot requirements, normalized generation metadata, and append-only history. Plan transitions cannot add, edit, or delete AIReviews.

## Key safeguards

1. Search returns only the current local user’s content and contains no frontend URL values.
2. A Journey Search result remains addressable after refresh and opens the exact thought, not merely the first page of the timeline.
3. A provider failure writes neither an AIReview nor its receipt/snapshot changes.
4. If the target changes while advice is generated, discard the advice rather than append output based on stale context.
5. Repeating an idempotent request returns the committed review; an intentional rerun gets a new receipt and creates a distinct AIReview.
6. AIReview output never mutates a Task status, accepted Decision reasoning, plan intent, reflection, or learning score. Snapshot capture only preserves context for the separate AIReview history.
7. Search and generated advice are optional utilities; neither changes Today’s primary action.

## Deferred decision-page usability follow-up

Making Decisions easier to browse and act on is a separate UX improvement after the v1 implementation gate. Keep the existing four-destination architecture; begin with a clearer Decisions landing page organized around **Drafts**, **Ready to revisit**, and **Accepted history**, plus an obvious **New decision** action. Keep the dense original-reasoning form behind the focused detail/editor view. Validate whether people can quickly answer “what should I review or continue?” before changing Decision creation requirements or adding fields.

## Gate result

The global Search route opens canonical plan, Journey, and Decision contexts; the four local AI review targets persist and display separate generated-advice history. Unit/API/browser evidence and any remaining manual validation are listed in [Slice 5 validation](slice-5-validation.md).
