# Decision Log

This log records product and UX decisions before formal architecture ADRs begin.

| Date | Decision | Status | Reason | Affected documents |
|---|---|---|---|---|
| 2026-09-27 | The app is a learning companion, not a general tracker. | Confirmed | The normal experience must reduce effort rather than create maintenance. | Product compass |
| 2026-09-27 | No application code before the consolidated implementation gate. | Confirmed by project brief | Product behavior and architecture must be deliberate before implementation. | Stages and gates |
| 2026-09-27 | Use the Q4 Engineering Growth Plan as the representative design scenario. | Confirmed | It exercises dated work, focus lanes, experiments, ADRs, leadership reps, buffers, and retrospectives. | Risks, journeys, wireframes |
| 2026-09-27 | Use a single state-aware Today surface with one primary action. | Confirmed | It minimizes cognitive load and keeps Start/Pause/Resume obvious. | Confirmed interaction model, visual system, information architecture |
| 2026-09-27 | Unfinished work becomes the Resume hero; scheduled work remains Up next. | Confirmed | This preserves history and avoids two equal competing tasks. | Confirmed interaction model |
| 2026-09-27 | Finish uses one required outcome and one optional takeaway. | Confirmed | It preserves a minimal learning signal while keeping normal completion under 20 seconds. | Confirmed interaction model, later domain/API design |
| 2026-09-27 | Weekly reviews are generated and have no completion status. | Confirmed | Review should create understanding, not another administrative ritual. | Confirmed interaction model |
| 2026-09-27 | Use the Quiet Workshop visual direction. | Confirmed | Warm neutrals, deep teal, compact density, and restrained geometry feel precise without copying GitHub or resembling a wellness tracker. | Visual system |
| 2026-09-27 | Use Today, Quarter, Journey, and Decisions as the only persistent destinations. | Confirmed | Four destinations preserve clear boundaries; Thought, Search, and Settings work better as utilities. | Information architecture |
| 2026-09-27 | Separate current plan intent from lived context using one immutable Task plan snapshot. | Confirmed | This preserves historical truth without full plan versioning or event sourcing. | Domain model, plan/history |
| 2026-09-27 | Keep Task status as a backend-owned current projection and Sessions/events as history facts. | Confirmed | Today needs clear current state while reopen/skip/finish history must remain truthful. | Domain model, lifecycle |
| 2026-09-27 | Store one DailyReview per finish occurrence and separate DecisionReview records. | Confirmed | Reopen/re-finish and ADR hindsight must not overwrite prior reasoning. | Domain model |
| 2026-09-27 | Derive totals, weekly summaries, contributions, recommendations, progress, and scores. | Confirmed | Persisting these creates synchronization and tracker maintenance without adding truth. | Domain model review |
| 2026-09-27 | Use a REST API as the frontend’s stable boundary with one server-resolved Dashboard response. | Proposed | The client must not join storage-shaped fragments or recreate Today rules. | API contract, dashboard contract |
| 2026-09-27 | Use RFC 9457 Problem Details, ETags, and command idempotency receipts. | Proposed | Structured conflicts, stale-write protection, and safe retries address distinct failure modes. | Error contract, API contract |
| 2026-09-27 | Use one JourneyStore unit-of-work port and JsonJourneyStore for v1. | Proposed | A small whole-state boundary is sufficient for local scale and avoids repository/ORM scaffolding. | Persistence contract |
| 2026-09-27 | Persist JSON through validation, locking, temp write, fsync, one rolling backup, and atomic replace. | Proposed | This protects human-readable local data without speculative recovery infrastructure. | Persistence contract |

## Entry format for future changes

Add a row containing the decision, whether it is proposed/confirmed/replaced, the reason, and every document or later implementation area affected.
