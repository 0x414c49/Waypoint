# Slice 3 Validation Note

Date: 2026-09-29
Status: Passed by the backend and frontend implementation agents, primary arbiter, and final neutral reviewer
Environment: macOS, local workspace; dependency contract targets Node.js 24 LTS. Automated verification ran on the available Node.js 26.8.2 host and npm 11.19.1, so Node 24 remains a release-runtime check.

## Observed scenarios

- A learner could start a contextual Decision Draft from planned ADR work without changing the Task lifecycle, or create an independent Draft from Decisions.
- Draft Save and Accept remained separate. Accept required a nonblank title, context, decision, and decision date; once accepted, original reasoning became read-only while hindsight stayed append-only.
- A stale Draft save returned structured `412 STALE_WRITE` Problem Details. Recovery refreshed the ETag without clearing the learner's typed text, after which the same edit saved successfully.
- Accepted Decisions supported substantive `HOLDS` and `ADJUST` reviews, deliberate Postpone through `DEFERRED`, and Supersede. A supplied replacement had to be a same-user Draft and was linked atomically without cycles, conflicting ancestry, or an unproven back-link.
- Review sequence—not random record ID or object insertion order—made equal-time reviews deterministic. Decision ETags and due-date projection followed that sequence.
- Today kept its one primary learning action and added only a quiet due-review notice. The Decisions list exhausted all due-result pages instead of silently stopping at the first page.
- Journey derived every Decision review once from the canonical record and exposed it in the type filter. Milestone summaries counted substantive reviews while excluding Postpone from the learning-event total.
- Historical Task continuation read every plan-owned field from its captured snapshot when present. A later current-plan Decision prompt could not leak into a historical carry-forward.
- The desktop browser path exercised independent create, Save, stale recovery, Accept, Adjust, Postpone, Supersede, Journey evidence, and contextual Draft creation. Desktop and 360px mobile independently exercised the Draft editor and accepted read-only view without horizontal page overflow.

## Evidence

- Typecheck: passed.
- Lint: passed with zero warnings.
- Vitest: 95 tests passed across 30 files.
- Production build: passed; JavaScript was 98.76 KiB compressed, below the 200 KiB target.
- Playwright: 9 tests passed and 3 intentional mobile duplicates of shared-store mutation flows were skipped. The mobile project still created its own Accepted Decision and checked editor/read-only reflow; axe-core reported no detectable violations in the exercised light and dark surfaces.
- Raw HTTP conflict contract: concurrent review coverage asserted `application/problem+json` with status, code, and detail for the stale writer. The client also tolerates the framework's compact error shape defensively.
- Due pagination: the UI regression loaded 101 due Decisions across multiple pages.
- Personal-scale projection budget: passed with 8 Quarters, 1,000 Tasks, 2,000 Sessions, 2,000 Journey entries, 1,000 Decisions, and 2,000 reviews. Warm read projections remained below the accepted 200 ms p95 budget after latest-review lookup was replaced with a one-pass index.
- Diff integrity: `git diff --check` passed.
- Final neutral audit: PASS with no blocking contract, history, concurrency, accessibility, or performance finding after three correction rounds.

## Corrected gate findings

The adversarial and neutral reviews prevented the gate from closing on these factual defects:

1. historical Task projections and carry-forward could leak a later current-plan Decision prompt or other optional plan fields;
2. failed or stale review/save actions could clear unsaved learner text, and a two-phase new-Draft retry could create duplicates;
3. equal-time review ordering could depend on random IDs, while the due list could stop after its first page;
4. malformed nested options could reach store validation, and candidate validation did not prove replacement-link provenance or reject whitespace-only Accepted titles;
5. the Journey type filter omitted Decision reviews;
6. due projection repeatedly scanned every review for every Decision at personal scale;
7. the browser evidence depended on an earlier test's state and exposed Fastify's compact stale-error response instead of the documented Problem Details contract.

Each finding was corrected and regression-covered. The expanded scale test initially exceeded the read budget and passed only after the one-pass latest-review index was added. The browser gate also failed before its fixture isolation and server error-handler registration were corrected.

## Limitations and follow-up

- Automated axe-core, keyboard-capable browser flows, reflow assertions, and source inspection do not replace a physical-phone, screen-reader, contrast, actual 200% browser-zoom, or dedicated reduced-motion review. Those specialized checks remain in release validation.
- The host did not provide Node.js 24, so the same checks should be repeated on Node.js 24 before treating the runtime contract as release-proven.
- The UI deliberately supports an unlinked Supersede rather than asking the learner to paste a raw replacement ID. The backend supports and validates atomic replacement linkage; a friendly replacement picker can be introduced only if later evidence shows it is needed.
- Search and AI remain absent. Decision discovery is intentionally bounded to filters and due state until Slice 5.

Slice 4 may begin after this validation record and the complete Slice 3 worktree are committed together as a clean gate.
