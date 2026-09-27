# ADR-0003: One active Session per User

Status: Accepted — 2026-09-27

## Context

Concurrent timers would make actual effort ambiguous and force manual cleanup—the opposite of quiet tracking.

## Decision

Allow at most one active Session per User. Starting or resuming another Task returns an explicit conflict that can atomically Pause current and switch, or cancel.

## Why

One active interval makes elapsed effort and the current Today state unambiguous without asking the learner to reconcile overlapping timers.

## Consequences

- Elapsed time and the Running hero are unambiguous.
- The rule is enforced inside the store transaction, not just the UI.
- Multiple browser tabs remain safe through preconditions and idempotency.
- Parallel manual timers are intentionally unsupported.
