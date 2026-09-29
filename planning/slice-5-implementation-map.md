# Slice 5 Implementation Map — Global Search

Status: **Delivered** on 2026-09-29. Generated AI review was subsequently removed by explicit decision; only global Search remains in the Slice 5 gate.
Baseline: 2026-09-29, clean at `6647546`; Node.js 26.10.0 / npm 11.19.1.
Learner problem: find a remembered plan item, thought, or Decision without knowing which area owns it.

## Confirmed boundary

Deliver one global Search overlay across plan, Journey, and Decisions, with results that open canonical context. Search is a read-only utility, not another destination or query-builder product. No AI reviewer, generated advice, provider setting, API key, OAuth flow, or external model call is included. The former AI-review implementation has been removed; legacy persisted rows remain inert for store compatibility only.

## Ownership and approach

- **Shared contract:** grouped Search results with excerpts and canonical IDs, never frontend routes.
- **Search query:** one current-user-owned store read; matches Quarter/Focus Area/Milestone/Task plan text, Journey thoughts, and Decision reasoning/reviews. Query, filters, result size, and query-bound cursors are bounded.
- **Canonical navigation:** the client maps plan results to Quarter/Task routes and Decisions to their detail route. Thought results use `/journey?entryId=…`; Journey loads and focuses the exact owned entry.
- **HTTP:** global Search and a single-entry Journey read for stable deep links. Ownership hiding and Problem Details remain the normal contract.
- **Client:** one keyboard-operable top-bar Search overlay on desktop and a full-screen surface on mobile.

## Key safeguards

1. Search returns only the current local user’s content and contains no frontend URL values.
2. A Journey Search result remains addressable after refresh and opens the exact thought, not merely the first timeline page.
3. Search remains optional and does not change Today’s primary action or the four-destination navigation model.
4. Existing local AIReview records, if present from an earlier build, remain validated but are not displayed, changed, generated, or transmitted.

## Decision-page usability direction

The Decisions destination has since been simplified around Drafts to continue, Ready to revisit, Accepted decisions, and Earlier decisions. Draft capture begins with the gist; optional ADR detail is collapsed. Icons are small and decorative while labels remain visible. See the Decision implementation changes in the close-out commit and [Using the app](../docs/using-the-app.md).

## Gate result

Search opens canonical plan, Journey, and Decision contexts. Evidence and the explicit AI-removal change are recorded in [Slice 5 validation](slice-5-validation.md) and the [decision log](decision-log.md).
