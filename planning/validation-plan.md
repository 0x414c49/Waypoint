# Product and System Validation Plan

Status: Required during implementation; assumptions are not facts until observed

## Why this exists

The documents confirm intended behavior, not human performance. Claims such as “obvious,” “friendly,” or “under 20 seconds” remain hypotheses. This plan prevents design approval from being mistaken for usability evidence.

## Product hypotheses

| Claim | Method | Passing evidence | When |
|---|---|---|---|
| The next action is obvious | Three-second exposure test on Ready, Running, Paused, Finished, Light | Participant names the intended next action without prompting in at least 4/5 states | Slice 1 prototype |
| Start/Pause/Resume are one-action interactions | Instrumented walkthrough on desktop and mobile viewport | Each succeeds with one activation from Today; no detail page or status choice | Slice 1 |
| Finish remains tiny | Timed usability task with all three outcomes | Median under 20 seconds; no prose required; Undo is found when requested | Slice 1 |
| Pausing before the Finish sheet is acceptable | Compare cancel/close behavior with users | Users understand the Task is Paused and can recover without surprise; otherwise reopen the interaction decision | Slice 1 prototype |
| Do 10 minutes reduces low-energy friction | Scenario test | User can state what will happen, begin in one action, and is not auto-finished at ten minutes | Slice 1 |
| Unfinished work priority feels supportive | Next-day Paused + scheduled-item scenario | User identifies Resume as primary and Up next as non-lost, without interpreting either as overdue guilt | Slice 1 |
| Holiday/optional work remains genuinely optional | Walk through Week 12 and buffer-reflection dates | Today stays Light, labels the item “Only if useful,” and creates no action/debt when ignored | Slice 1 |
| Quick Thought is capture-first | Mobile and desktop task | Composer focused in one activation; save requires text only; inferred link is visible/removable | Slice 2 |
| Weekly review feels generated, not assigned | Review walkthrough | User can explain the week without checking a “review complete” box or reading a score | Slice 2 |
| Decision review stays secondary | Due-review scenario while work is Ready | User still identifies Start as primary; can postpone in one review submission after choosing a later date | Slice 3 |
| Plan updates feel safe | Change/remove active and historical Tasks | User predicts what will change and explicitly understands what history is preserved before Apply | Slice 4 |
| Core mobile actions work one-handed | Run Today, Start, Pause, Resume, Thought, and Finish on a physical phone in both hands separately | Primary controls remain reachable and usable without switching to a desktop layout; text entry may naturally use both hands | Slice 1 |

Use at least one experienced engineer other than the builder for comprehension tests before calling the interaction validated. Record observations, not compliments.

## Accessibility checks

Automated checks are a floor, not proof.

- Keyboard-only traversal and operation of every normal flow.
- Visible focus, logical focus return after sheets/overlays, and inert backgrounds.
- Screen-reader labels/state announcements for timer and action changes without noisy per-second announcements.
- 200% and 400% zoom/reflow at representative desktop and mobile widths.
- Touch targets and spacing at the visual-system minimum.
- Contrast in light/dark themes, including contribution levels and non-color status cues.
- Reduced-motion behavior.
- Playwright + axe-core scans on stable states, followed by manual review.

## Domain and API evidence

- Property/table tests for every valid and invalid Task transition.
- Deterministic projection rebuild from lifecycle events, including Reopen chains.
- Two concurrent Starts, Finishes, Decision reviews, and plan applies.
- Same-key replay before stale/expired precondition checks; different-body reuse conflict.
- Cross-midnight and daylight-saving Session attribution using captured timezone.
- Historical milestone membership and `statusAtPeriodEnd` after later carry/reopen/correction.
- Snapshot capture on Start, Skip, Journey link, and Decision link.
- Dashboard Onboarding, future, between-quarter, overlap rejection, and active old-Quarter Task.
- Dashboard 14-day and full Activity projections split cross-midnight Sessions identically and update after Pause/Finish without persisted counters.
- Normative Q4 fixture validation and normalized export/reimport empty diff.

## Persistence failure evidence

- Interrupted `.store.init-*` initialization is recognized as recovery, never ignored or replaced by a new store.
- Invalid marker/primary/schema fails closed.
- Failure before replace preserves the prior primary.
- Simulated uncertain result after replace is safely recovered with the same command key.
- Valid backup is reported but never silently restored.
- Store mutex serializes writes and times out with `STORE_BUSY` under a controlled test.
- Store transition validation rejects plan-owned changes under `STANDARD`, execution changes under `PLAN_APPLY`, the wrong Journey deletion target, and HTTP access to `SCHEMA_MIGRATION`.
- Updating an existing JourneyEntry from no Milestone/Task link to a valid link captures the required Task/Milestone/Quarter snapshots in that same transaction.
- Private permissions and loopback-only binding are verified on the supported development platform.

Physical-phone reach testing uses a no-private-data prototype or USB reverse port forwarding (for example Android `adb reverse`) to the unchanged loopback server. Production binding is never relaxed merely to run a usability test.

## Performance budgets

These are budgets to test, not marketing claims:

- Warm Today read: p95 under 200 ms at the expected personal dataset size on the development machine.
- Unchanged plan preview: p95 under 200 ms at 8 Quarters / 1,000 Tasks / 2,000 Sessions / 2,000 Journey entries.
- Normal action response: p95 under 300 ms excluding deliberate fault injection.
- Client interaction feedback starts within 100 ms.
- Initial compressed JavaScript budget: 200 KiB target; any overage requires a recorded reason.
- Test dataset: at least 8 Quarters, 1,000 Tasks, 2,000 Sessions, and 2,000 Journey items to expose accidental quadratic projections.

## Recording outcomes

For each slice, append a short validation note with date, environment, scenario, observed result, failures, and follow-up decision. A failed product hypothesis reopens the relevant interaction decision; it is not “fixed” by changing the pass criterion.
