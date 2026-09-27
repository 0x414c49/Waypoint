# ADR-0006: Store AI reviews as separate history

Status: Accepted — 2026-09-27

## Context

AI advice may be useful evidence, but it is generated, repeatable, and fallible. It must not become hidden truth or mutate learning records.

## Decision

Use an `AIReviewer` port and persist each successful result as its own append-only `AIReview` linked to a target. V1 uses a deterministic stub. AI output never changes Task, Decision, plan, score, or outcome.

## Why

Generated advice is useful evidence but not human truth; separating it preserves provenance and prevents silent authority over the learning record.

## Consequences

- Generated advice remains distinguishable and auditable.
- Provider failure leaves domain state unchanged.
- A real provider can be added later at one boundary.
- No AI SDK, queue, streaming protocol, or scoring model is required in v1.
