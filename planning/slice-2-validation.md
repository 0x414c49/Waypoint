# Slice 2 Validation Note

Date: 2026-09-28
Status: Passed by the backend and frontend implementation agents, primary arbiter, and final neutral reviewer
Environment: macOS, local workspace; dependency contract targets Node.js 24 LTS. Automated verification ran on the available Node.js 26.8.2 host and npm 11.19.1, so Node 24 remains a release-runtime check.

## Observed scenarios

- Quick Thought opened in one activation from Today, Journey, and the global shell; focus entered the composer and returned to the opener. Active-Task inference was visible and removable. When no relationship was displayed, the client sent explicit `null`, preventing hidden server inference.
- Journey returned deterministic reverse chronology with date, Task, Milestone, type, and changed-my-mind filters. Its `(occurredAt, id)` seek cursor did not duplicate a boundary row when a newer entry arrived between page requests.
- Journey and weekly thoughts could be edited without losing their relationships, and changed thinking could be marked after the deliberately minimal text-first capture.
- Linking a new or existing thought captured the missing Task, Milestone, and Quarter snapshots in the same transaction. A simulated later plan-title change left Journey’s historical Task title unchanged.
- Thought creation replayed after store reconstruction with the original result, rejected same-key/different-body reuse, and returned defined `410 IDEMPOTENT_RESULT_DELETED` semantics after an explicit deletion without recreating the entry.
- Task detail showed contextual outcome, thoughts, lifecycle, and Sessions. Session correction covered closed and active Sessions, stale ETags, invalid and negative instants, overlap, zero duration, cross-midnight splitting, and preserved Task status/outcome.
- Activity and Dashboard used the same closed-Session, captured-timezone splitting and contribution thresholds. Active time stayed out of contribution cells until closure.
- Milestone summary separated planned membership, occurrence-based effort, lifecycle/thought events, status at the exact historical period cutoff, current status, and all-time Task effort. Late completion remained visibly “paused at period end · now finished”; skip and reopen events remained visible.
- Carry forward atomically closed the source as Partial, retained its Sessions, created one same-Quarter continuation, appended the structural events, replayed across restart, and prevented reopening a source with an open continuation.
- Only Today and Journey were exposed as top-level destinations. Decisions, Quarter management/import, Search, and AI remained unavailable rather than becoming dead navigation.
- The deterministic paused-session mobile regression proved the 91-cell Activity grid could not expand the layout viewport. Mobile controls use 16px form text to avoid input zoom, and the Activity container is explicitly width-contained.

## Evidence

- Typecheck: passed.
- Lint: passed with zero warnings.
- Vitest: 78 tests passed across 25 files.
- Production build: passed; JavaScript was 93.89 KiB compressed, below the 200 KiB target.
- Playwright: 6 tests passed and 2 intentional mobile duplicates of shared-store mutation flows were skipped. Desktop exercised Today, refresh recovery, Quick Thought, Task detail, Session correction, Carry forward, and Milestone review. Desktop and 360px mobile exercised Journey/Quick Thought and light/dark axe-core checks with no detectable violations.
- Hands-on in-app browser inspection: Today and Journey rendered clearly in dark and light appearances; the 360×780 Journey and Quick Thought layouts showed no page overflow; Escape closed Quick Thought and returned focus to the exact launcher.
- Responsive reflow: the Journey browser check asserts document width remains within the viewport before and after Quick Thought capture. The reduced-motion media rules were also inspected in the component styles.
- Personal-scale projection budget: passed with 8 Quarters, 1,000 Tasks, 2,000 Sessions, and 2,000 Journey entries; warm Today and Journey p95 projections each remained below the accepted 200 ms read budget. The test initially exposed an approximately 477 ms Today p95 and passed only after quadratic paused-Task lookup and repeated Session segmentation were replaced with one-pass indexes/aggregation.
- Diff integrity: `git diff --check` passed.
- Final neutral audit: PASS with no blocking implementation findings after two correction rounds.

## Corrected gate findings

The neutral audit prevented the gate from closing on four factual defects:

1. hidden Quick Thought relationship inference when Dashboard context was unavailable;
2. offset Journey pagination duplicating rows after an intervening insert;
3. Milestone UI hiding current status when it differed from period-end status;
4. missing `eventsDuringPeriod`, which omitted skip/reopen history from the generated account.

All four were corrected and regression-covered. A separate mobile browser failure was traced to Activity-grid min-content expansion rather than dismissed as test flakiness. The scale test likewise failed before the read path was optimized.

## Limitations and follow-up

- Automated axe-core plus the in-app keyboard and responsive inspection do not replace a physical-phone, screen-reader, contrast, or actual 200% browser-zoom review. Those specialized hands-on checks stay in the release validation checklist.
- The host did not provide Node.js 24, so the same checks should be repeated on Node.js 24 before treating the runtime contract as release-proven.
- The task-list cursor remains an opaque offset. Plan mutation is not exposed in Slice 2, so its result set is stable here; Slice 4 plan-import work must either freeze or seek the list before concurrent plan mutation becomes possible.
- Task and Milestone surfaces are responsibility-sized but remain colocated under `features/journey`. Move them into dedicated feature directories if their responsibilities grow; no current TSX component exceeds 136 lines.
- Normal mutation p95 and client feedback-start timing were not separately instrumented at the large synthetic dataset size. The accepted read and bundle budgets passed; end-to-end action timing remains a release-level measurement.

Slice 3 may begin after this validation record and the complete Slice 2 worktree are committed together as a clean gate.
