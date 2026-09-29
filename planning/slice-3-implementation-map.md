# Slice 3 Implementation Map — Durable Decisions

Status: Gate passed on 2026-09-29
Date opened: 2026-09-29

## Learner outcome

The learner can turn planned ADR work or an unplanned engineering decision into a durable Draft, explicitly Accept its reasoning, revisit it later without rewriting history, and see that hindsight naturally in Journey. Decision work remains secondary to the one obvious Today action.

## Scope boundary

Slice 3 delivers only:

- contextual **Start decision draft** from a planned ADR Task on Today and Task detail
- independent Draft creation from Decisions
- explicit Draft Save and explicit Accept
- a calm Decisions destination with due and all-decision lists
- append-only substantive reviews, Postpone as `DEFERRED`, and Supersede
- a quiet Today due notice that never replaces or competes with Start/Pause/Resume/Finish
- DecisionReview history derived into Journey and Milestone summaries without copied records

Quarter management/import, Search, AI, notifications, Decision deletion, review editing/deletion, accepted-reasoning editing, generic status mutation, attachments, and autosave infrastructure remain deferred. The shell exposes Today, Journey, and Decisions; Quarter stays hidden until Slice 4.

## Resolved gate decisions

### Durable review order

Every DecisionReview has an immutable `sequence`, unique within its Decision, starting at 1 and increasing by exactly one inside the serialized review transaction. Sequence is authoritative when `reviewedAt` timestamps are equal. ETags and current-due projection use this ordered chain, never object insertion order or random ID ordering.

### Supersede linkage

`SUPERSEDE` may omit a replacement. When `replacementDecisionId` is supplied, the replacement must be a same-user Draft, must differ from the original, must not form a cycle, and must have no conflicting ancestry. The same transaction appends the review, marks the original `SUPERSEDED`, and sets or verifies `replacement.supersedesDecisionId = original.id`. An unlinked Supersede stays unlinked in v1; no later relinking endpoint is invented.

### Timeline truth

Slice 3 places DecisionReviews—not Decision acceptance—into Journey. The confirmed model has a truthful review occurrence instant/timezone but no acceptance instant/timezone. No acceptance timestamp is fabricated.

### Postpone and evidence

Postpone requires the learner to choose a later date; there is no invented default interval. The validation hypothesis is therefore one review submission after choosing a date, not a literal single click. Supporting evidence remains ordinary review notes because no separate evidence model is confirmed.

## Domain and persistence work

- Replace Decision placeholders with strict `DecisionRecord` and `DecisionReview` schemas.
- Enforce direct Decision user ownership; same-user and same-Quarter Task/Quarter relationships; derived review ownership; map-key identity; option/list bounds; dates; sequence continuity; and acyclic supersession.
- A Task-linked Decision uses the same effective current-versus-historical plan source as Task display and captures missing Task/Milestone/Quarter snapshots atomically. A Quarter-only Decision captures its Quarter snapshot.
- Draft reasoning is replaceable. Accept requires nonblank title, context, decision, and decision date; `initialReviewDate` must be on/after the decision date.
- Accepted reasoning and relationships are immutable. Store transition validation independently rejects edits, review mutation/deletion, and unauthorized Supersede field changes.
- Review is allowed only for `ACCEPTED`. `DEFERRED` requires a later `nextReviewDate`; replacement is accepted only for `SUPERSEDE`.
- Decision ETag covers the record, sequence-ordered review chain, and current due projection.
- Receipt replay occurs before stale-precondition checks. Same-key retries replay; same-key/different-body conflicts; different-key concurrent reviews against one ETag yield one commit and one `412 STALE_WRITE`.
- Decision actions never change Task lifecycle or Session state.
- Journey-to-Decision ownership checks and future plan-deletion preservation include Decision references.

## API and projection surface

- `GET /api/decisions`
- `GET /api/decisions/:id`
- `POST /api/decisions`
- `PUT /api/decisions/:id`
- `POST /api/tasks/:id/decision-draft`
- `POST /api/decisions/:id/accept`
- `POST /api/decisions/:id/review`

The shared contract defines complete list/detail/review representations before UI work depends on them. Lists use opaque keyset cursors: due items order by `(dueDate, id)` ascending; the full list orders by `(updatedAt, id)` descending. Filters are Quarter, status, and due review. Unknown fields are rejected and documented bounds are enforced.

Task projection gains one server-selected Decision context: either the effective prompt plus a create action, or the existing Decision summary/open action. React never chooses between current and historical prompt data.

Dashboard returns total due count and at most three `{ decisionId, title, dueDate }` items. Due state comes from the initial date only before any review; after that, only the latest sequence's `nextReviewDate` applies. A null next date clears the schedule.

Journey derives one `DECISION_REVIEW` row per canonical review, including Deferred as factual history, using `reviewedAt` and `timeZoneAtReview`. No companion JourneyEntry is written. Milestone summaries count only substantive reviews (`HOLDS`, `ADJUST`, `SUPERSEDE`) in the captured local period; Deferred does not inflate that count.

## UI ownership and component limits

`features/decisions` owns focused list, detail, editor, original-reasoning, review-composer, review-history, API, and type components. Today owns only quiet placement of the due notice. Task surfaces own placement of contextual draft/open actions while the Decisions feature owns their behavior.

The editor is a full-page vertical document, not a modal. Draft Save is explicit. Accept remains separate from unsaved edits. Accepted reasoning is visibly historical and read-only. A `412` preserves typed text while offering refresh/recovery. Mobile uses one readable column with no horizontal page scroll. Exactly one filled accent action remains visible per state.

## Gate evidence

- Strict schema/reference/ownership/date/sequence/cycle validation passes.
- Store policy proves accepted reasoning immutable, reviews append-only, and Supersede changes only allowed fields.
- Contextual and independent creation capture the correct snapshots, survive restart replay, and leave Task status unchanged.
- Draft edit, Accept validation, replay-before-stale, and changed-body conflicts are covered.
- Two reviews at the same fixed instant still produce deterministic current due state; concurrent reviews against one ETag produce one success and one stale write.
- Supersede with and without a replacement covers self, cross-user, cycle, conflicting ancestry, and atomic rollback cases.
- Dashboard due matrices cover initial/latest/null/deferred/superseded behavior while the hero action remains identical.
- Journey shows every review once with canonical linking and duplicate-free keyset pagination; summaries count substantive reviews by captured timezone.
- Desktop and 360px mobile flows cover contextual Draft, independent Draft, Save, Accept, review, Postpone, Supersede, navigation, light/dark, keyboard, focus, axe, reflow, and reduced motion.
- Existing Slice 1 and Slice 2 behavior stays green; scale checks include Decisions/reviews and retain the documented read/action/bundle budgets.
- An independent final reviewer reports no blocking contract, architecture, history, concurrency, accessibility, or performance finding.

Evidence is recorded in `planning/slice-3-validation.md`. Slice 4 may begin after the complete Slice 3 worktree and validation record form one clean gate commit.
