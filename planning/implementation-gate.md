# Consolidated Implementation Gate

Status: Ready for explicit approval after neutral audit
Date: 2026-09-27

## Product promise

Build a quiet engineering-learning companion that turns an authored Quarter plan into a natural daily habit. It collects time, outcomes, reflection, decisions, and growth while the learner works. It is not a general task manager, data-entry database, or streak game.

The normal loop remains:

```text
Open → see what matters → Start → work → Pause/Resume → Finish → tiny reflection → done
```

## Confirmed experience

- Today is home and has one state-aware hero/primary action.
- A Paused Task outranks newly scheduled work; scheduled work remains quietly visible as Up next.
- Do 10 minutes is an intention, not an auto-finish target.
- Finish asks for one outcome and an optional takeaway.
- Weekly review is generated and has no completion state.
- Quick Thought is capture-first and infers removable active context.
- Decision reviews are append-only, quiet, and never block Today.
- Plan changes preview exactly what changes and preserve all lived history.

Persistent navigation is Today, Quarter, Journey, and Decisions. Thought, Search, and Settings are utilities. The visual system is Quiet Workshop: warm neutrals, deep teal, compact but calm density, restrained geometry, accessible light/dark behavior, and no decorative gamification.

## Confirmed truth model

- Quarter/FocusArea/Milestone/Task describe current plan intent.
- Session is authoritative effort; time is derived.
- Sequenced lifecycle events plus Sessions deterministically project Task status.
- DailyReview records each Finish occurrence.
- JourneyEntry captures thoughts/reflections; DecisionRecord/DecisionReview preserve reasoning and hindsight; AIReview remains clearly generated advice.
- One active Session exists per User.
- One immutable Task plan snapshot and one Quarter intent snapshot protect historical context after plan edits.
- Temporal attribution distinguishes planned membership, effort by local date, occurrence date, current status, and status at period end.

## Confirmed boundary and storage

- REST API with one server-resolved Dashboard read model.
- Explicit action commands, no generic status mutation.
- RFC 9457 errors, ETags/`If-Match`, and durable command receipts.
- One JourneyStore whole-state transaction boundary.
- Strict version-1 YAML plan contract and complete Q4 fixture.
- Human-readable JSON with validation, in-process serialization, temp/flush/backup/atomic replace, explicit store marker, and fail-closed recovery.

## Proposed architecture to approve with this gate

- TypeScript modular monolith: React/Vite client, Fastify server, TypeBox transport schemas, plain tokenized CSS.
- One fixed-port loopback Node.js process serves frontend and API from the same origin.
- Domain/application code is framework- and I/O-free behind three ports: JourneyStore, CurrentUserProvider, AIReviewer.
- LocalUserProvider and StubAIReviewer are honest v1 adapters, not partial account/AI systems.
- Vitest/Testing Library cover units/components; Playwright + axe and manual testing cover the browser experience.
- Delivery follows Slices 0–5; the daily heart is validated before secondary surfaces grow.

## Representative-plan facts retained

The Q4 fixture preserves all four lanes, 13 Milestones, in-range activities, nine success criteria, conditional Fridays, and six detailed ADR prompts. It does not conceal that the overview asks for eight ADRs while the weekly detail specifies six. It omits the out-of-range Dec 25 activity and maps the fifth Week-13 activity to Dec 31 as a second conditional item. It invents no completion or time estimate.

## Deferred—not quietly promised

No auth/accounts, teams, cloud/LAN access, sync, notifications, calendar integrations, real AI provider, generic workflow customization, streaks/scores, database/ORM, microservices, offline PWA, or native apps. Responsive mobile layout is included; remote phone access is not.

## Known hypotheses, not blockers disguised as facts

- “Obvious,” “friendly,” and timing claims require observed usability evidence.
- Pause-on-opening-Finish may need revision after a cancel/close test.
- Decisions as a top-level destination should be reconsidered only after real usage volume exists.
- JSON-store performance and filesystem durability require implementation tests.
- Automated accessibility testing must be supplemented manually.

These are governed by [the validation plan](validation-plan.md), with explicit reopen rules.

## Gate checklist

- [x] Product compass confirmed
- [x] Primary journeys and selected interaction model confirmed
- [x] Screen hierarchy and responsive structure confirmed
- [x] Quiet Workshop visual direction confirmed
- [x] Domain ownership, lifecycle, and snapshots confirmed; temporal clarification documented for this gate
- [x] API, errors, concurrency, Dashboard, and persistence confirmed
- [x] Complete representative plan format/fixture reviewed
- [x] System components, runtime trust boundary, ports, and failure behavior documented
- [x] Architecture decisions recorded
- [x] Initial release sliced and deferred scope explicit
- [x] Empirical claims separated into a validation plan
- [x] Neutral cross-gate issues resolved or named as implementation evidence
- [ ] User explicitly approves this consolidated implementation gate

## Approval effect

Explicit approval confirms the plan format, temporal-attribution clarification, architecture, stack, and sliced scope; accepts ADR-0007 and ADR-0008; and authorizes production implementation beginning with Slice 0, then Slice 1. It does not authorize deferred scope or external/network deployment. After approval, minor implementation details inside these boundaries do not require repeated permission; any decision that changes product philosophy, history truth, trust boundary, or deferred scope does.
