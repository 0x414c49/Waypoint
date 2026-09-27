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
| 2026-09-27 | Use a REST API as the frontend’s stable boundary with one server-resolved Dashboard response. | Confirmed | The client must not join storage-shaped fragments or recreate Today rules. | API contract, dashboard contract |
| 2026-09-27 | Use RFC 9457 Problem Details, ETags, and command idempotency receipts. | Confirmed | Structured conflicts, stale-write protection, and safe retries address distinct failure modes. | Error contract, API contract |
| 2026-09-27 | Use one JourneyStore unit-of-work port and JsonJourneyStore for v1. | Confirmed | A small whole-state boundary is sufficient for local scale and avoids repository/ORM scaffolding. | Persistence contract |
| 2026-09-27 | Persist JSON through validation, a single-process write mutex, temp write, fsync, one rolling backup, and atomic replace. | Confirmed, refined | This protects human-readable local data without a native-lock dependency or unsupported multi-process guarantee. | Persistence contract, system design |
| 2026-09-27 | Use a strict version-1 YAML plan format and the complete Q4 plan as its acceptance fixture. | Proposed for final gate | Today needs explicit stable structure without interpreting prose or importing execution. | Plan format, Q4 mapping review |
| 2026-09-27 | Use a TypeScript modular monolith with React/Vite, Fastify, and TypeBox transport schemas. | Proposed for final gate | One toolchain and one deployable fit the local product while preserving real domain/adapter boundaries. | System design, technology stack, ADR-0007 |
| 2026-09-27 | Run v1 as one fixed-port loopback process with same-origin frontend/API. | Proposed for final gate | No-auth local use and JSON serialization are honest only inside an explicit private single-process boundary. | System design, ADR-0008 |
| 2026-09-27 | Implement in vertical slices, validating the daily heart before secondary surfaces. | Proposed for final gate | The complete contract should not become one oversized first delivery. | Release scope, validation plan |
| 2026-09-27 | Treat holiday/rest work as `OPTIONAL`, distinct from normal and when-clear work. | Proposed for final gate | “Otherwise rest” must never resolve to a required-looking Ready hero or backlog debt. | Plan format, Q4 fixture, Dashboard contract |
| 2026-09-27 | Snapshot Milestone boundaries at their first history-bearing action. | Proposed for final gate | Later plan edits must not move historical effort or change a period-end state. | Domain model, temporal attribution, ADR-0004 |
| 2026-09-27 | Pass a closed exceptional-write intent into JourneyStore transactions. | Proposed for final gate | Store transition validation cannot infer plan-apply or explicit-delete authority from old/new state alone. | Persistence contract, system design |
| 2026-09-27 | Use `data/store` with an explicit marker, abandoned-initialization detection, and the supplied plan as the no-history production seed. | Proposed for final gate | The tracked data parent must not look initialized, and interrupted first writes must fail closed. | Persistence contract, release scope |

## Entry format for future changes

Add a row containing the decision, whether it is proposed/confirmed/replaced, the reason, and every document or later implementation area affected.
