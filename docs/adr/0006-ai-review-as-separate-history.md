# ADR-0006: Store AI reviews as separate history

Status: Superseded on 2026-09-29 by the AI-removal decision in [the decision log](../../planning/decision-log.md).

## Context

AI advice may be useful evidence, but it is generated, repeatable, and fallible. It must not become hidden truth or mutate learning records.

## Decision

Use an `AIReviewer` port and persist each successful result as its own append-only `AIReview` linked to a target. V1 uses a deterministic stub. AI output never changes Task, Decision, plan, score, or outcome.

This was the former plan. The feature and provider connection were removed on 2026-09-29. The old record schema remains only so stores containing records from that implementation still load; the current application exposes no AI-review API, UI, provider, or generation path.

## Why

Generated advice is useful evidence but not human truth; separating it preserves provenance and prevents silent authority over the learning record.

## Consequences

- Historical rationale only. Current product behavior is defined by the superseding removal decision; no AI reviewer or generated-advice path is planned.
