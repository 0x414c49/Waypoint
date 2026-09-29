# Slice 4 Validation Note — Plan lifecycle and Quarter

Date: 2026-09-29
Status: **Passed** by the implementation owner and final neutral reviewer on 2026-09-29
Environment: macOS local workspace; Node.js 26.10.0 / npm 11.19.1. The package contract targets Node.js 24 LTS, which was not available on this host and remains a release-runtime check.

## Learner outcome and gate

The learner can inspect and navigate Quarter intent, safely preview/import strict YAML, understand removals and preserved history, explicitly acknowledge meaningful plan removals and active work, export current plan intent, and recover through import onboarding when the store contains no Quarter.

Required invariant: changing a plan cannot silently alter execution history, and normalized export/reimport of an unchanged plan has an empty semantic diff.

## Automated evidence

- `npm run check`: passed. TypeScript typecheck and server TypeScript build passed; ESLint passed with zero warnings; Vitest passed **119 tests across 35 files**; Vite production build passed.
- `npm run test:browser`: passed **13 tests**, with **3 intentional mobile duplicates skipped** (mutating shared-store Decision, daily-loop, and Task-history flows execute on desktop). Quarter navigation and plan preview/import workflows ran on both desktop and 360px mobile.
- `git diff --check`: passed before final documentation-only gate updates.
- Production client output: JavaScript **349.43 kB raw / 103.99 KiB gzip**; gzip remains below the 200 KiB JavaScript budget.

### Plan and history behavior

- Strict YAML parsing uses the complete Q4 2026 acceptance fixture: 9 success criteria, 4 Focus Areas, 13 in-range Milestones, and 64 Tasks. The parser rejects duplicate keys, aliases, unknown nested fields, invalid references/dates, and rejects Tasks without a Milestone. An explicitly empty Quarter with no Milestones and no Tasks is valid.
- Preview is read-only. Preview of the existing Q4 fixture and normalized current-plan export both produce an empty semantic diff.
- An empty validated store can preview and create Q4 at plan revision 1 through the HTTP API. Newly imported Tasks are Not started; tests confirm that import creates no snapshots, Sessions, lifecycle events, outcomes, Journey entries, Decisions, AIReviews, or reflections.
- Applying an update changes only plan-owned fields. Regression coverage verifies preserved active-session timestamps, task status, captured Task/Milestone/Quarter context, and no deletion of history-bearing items. Removing a pristine Task creates no Skip; removing an active Task tombstones it and preserves its live Session. Re-adding the stable ID clears the tombstone without resetting status or snapshot.
- The persistence transition boundary rejects new plan records carrying invented snapshots or execution state, and disallows `PLAN_APPLY` from changing history collections.
- Apply is one serialized `PLAN_APPLY` store transaction with one plan-revision increment and command receipt. Tests cover same-key replay, changed-body idempotency conflict, stale plan revision, competing applies, required update/create preconditions, preview expiry/replay ordering, and a Task becoming active after Preview. The latter is rejected as `412 STALE_WRITE` without an Apply write and requires a fresh preview.
- Every removed plan identity, including removed success criteria, requires acknowledgement; changed/removed Running or Paused Tasks additionally require explicit preserve-work acknowledgement. Missing acknowledgements fail without applying.
- Export returns normalized `application/yaml`, attachment filename, and revision-derived ETag. It excludes execution state/history. The normative Q4 export followed by reimport is asserted empty-diff in service and HTTP tests and in the desktop browser flow.
- Quarter HTTP tests verify date-derived phase, current plan projection, stable ETag behavior, criteria/FocusArea/Milestone/task counts, and omission of task execution status from the Quarter response. Client tests cover empty-store onboarding, Quarter navigation, between-quarter copy only when no Quarter is current, and retryable export failure that leaves the Quarter visible.
- HTTP failure evidence includes invalid YAML/unknown fields without writes, 1 MiB source parsing boundary behavior, 2 MiB route-specific JSON wrapper rejection, missing preconditions, missing acknowledgement, stale create/update preview, Quarter date overlap, and failure/replay behavior.

### Accessibility and responsive evidence

- Playwright/axe reported no detected violations on the exercised Quarter overview, plan preview, Today, Journey, and Decisions surfaces in light/dark themes.
- Quarter/plan flows reflowed without horizontal page overflow at 360px. Keyboard focus and Space activation were exercised on acknowledgement controls, and reduced-motion preference was verified in the browser.
- Quarter controls include text labels and status; apply is unavailable until required checkboxes are checked. Focus Area and Milestone routes open their canonical current-plan views; the Milestone provides a canonical link to its generated Journey summary.

### Personal-scale performance

- Existing 20-sample warm Today, Journey, and Decision projection p95 checks passed against the 200 ms budget at 8 Quarters, 1,000 Tasks, 2,000 Sessions, 2,000 Journey entries, 1,000 Decisions, and 2,000 Decision reviews.
- A new 20-sample unchanged plan-preview p95 check passed the 200 ms budget against an 8-Quarter / 1,000-Task / 2,000-Session / 2,000-Journey-item state.

## Review findings and disposition

Initial constructive/adversarial reviews identified a store-boundary gap for snapshots on new records, missing end-to-end Slice 4 surfaces, and the need to preserve command replay ordering. The final neutral review found an execution-state race: a Task could start after Preview without changing plan revision, leaving Apply with a stale acknowledgement set. The service now recomputes the semantic diff and complete acknowledgements under the serialized transaction and rejects changed work with `412 STALE_WRITE`; the regression test confirms no plan mutation occurs. It also prompted corrections to create-race status, selected-past Quarter copy, retryable export presentation, and isolated browser plan-removal setup. Final neutral disposition is to be appended after the follow-up audit.

## Remaining limitations

- The host did not provide Node.js 24; repeat `npm run check` and `npm run test:browser` on Node.js 24 before release.
- Automated axe/browser evidence is not a physical-phone test, screen-reader audit, dedicated 200%/400% zoom study, or human comprehension study with another experienced engineer. The plan-update safety hypothesis has not been validated with a participant; do not report it as a user-study pass.
- Empty-store creation and empty-store import navigation have separate HTTP/service and client component coverage; a single Playwright run against an independently initialized empty-store server was not run.
- The 3 mobile skips are deliberate duplicates of shared-store mutations; their desktop counterparts passed, while mobile still exercises navigation, preview, reflow, keyboard acknowledgement, theme, and axe checks. The Playwright projects share one server/store and use different explicit removal targets so the mobile preview remains reproducible after desktop Apply.

## Gate disposition

**PASS.** The final independent review found no remaining Slice 4 code blocker. The review specifically rechecked the active-after-preview race, create conditional status, between-quarter selection, inline export retry, independent project-specific removal targets, UTF-8 source bounds, history invariants, and export/reimport behavior. Commit `Slice 4 — plan lifecycle and Quarter` as one clean gate before starting Slice 5.
