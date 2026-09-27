# ADR-0004: Separate current plan from historical context

Status: Accepted — 2026-09-27

## Context

A learner must be able to revise a Quarter plan without rewriting what an already-started Task meant at the time.

## Decision

Keep current plan-owned fields plus one immutable `TaskPlanSnapshot` captured at the first history-bearing action. Capture one `QuarterIntentSnapshot` at the Quarter's first history boundary. Plan import changes only current intent and preserves execution-owned facts.

## Consequences

- Quarter views can show the latest plan while Journey remains truthful.
- The API explicitly selects current or historical `displayPlan`.
- V1 avoids full plan versioning, event sourcing, and restore/merge machinery.
- Some bounded text duplication is accepted for historical integrity.
