# ADR-0004: Separate current plan from historical context

Status: Accepted, including Milestone-boundary amendment — 2026-09-27

## Context

A learner must be able to revise a Quarter plan without rewriting what an already-started Task meant at the time.

## Decision

Keep current plan-owned fields plus one immutable `TaskPlanSnapshot` captured at the first Task history-bearing action. Capture `MilestoneIntentSnapshot` and `QuarterIntentSnapshot` at their first history boundary, including direct Journey/AI/Decision links that have no Task. Plan import changes only current intent and preserves execution-owned facts and period boundaries.

## Why

The learner needs freedom to improve future intent without retroactively renaming, moving, or redefining the work and periods already experienced.

## Consequences

- Quarter views can show the latest plan while Journey remains truthful.
- Historical Milestone summaries retain their original dates/mode after plan edits.
- The API explicitly selects current or historical `displayPlan`.
- V1 avoids full plan versioning, event sourcing, and restore/merge machinery.
- Some bounded text duplication is accepted for historical integrity.
