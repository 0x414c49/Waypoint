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
| 2026-09-27 | Separate current plan intent from lived context using one immutable Task plan snapshot. | Proposed | This preserves historical truth without full plan versioning or event sourcing. | Domain model, plan/history |
| 2026-09-27 | Keep Task status as a backend-owned current projection and Sessions/events as history facts. | Proposed | Today needs clear current state while reopen/skip/finish history must remain truthful. | Domain model, lifecycle |
| 2026-09-27 | Store one DailyReview per finish occurrence and separate DecisionReview records. | Proposed | Reopen/re-finish and ADR hindsight must not overwrite prior reasoning. | Domain model |
| 2026-09-27 | Derive totals, weekly summaries, contributions, recommendations, progress, and scores. | Proposed | Persisting these creates synchronization and tracker maintenance without adding truth. | Domain model review |

## Entry format for future changes

Add a row containing the decision, whether it is proposed/confirmed/replaced, the reason, and every document or later implementation area affected.
