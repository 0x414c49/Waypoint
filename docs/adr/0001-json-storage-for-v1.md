# ADR-0001: Human-readable JSON storage for v1

Status: Accepted — 2026-09-27

## Context

V1 is a private local tool for one learner. It needs inspectable persistence and safe whole-action commits, not database-scale querying.

## Decision

Define one whole-state `JourneyStore` port and implement it with `JsonJourneyStore`. Serialize writes in the one process, validate every load/candidate/transition, and publish through temp write, flush, rolling backup, atomic replace, and directory flush where supported.

## Why

This is the smallest persistence design that keeps local data inspectable while making a complete learning action atomic and replaceable behind a real seam.

## Consequences

- Data remains human-readable and the domain is storage-neutral.
- Atomicity covers a complete learning action or plan apply.
- Multi-process/data-directory sharing is unsupported.
- A database adapter is justified only by measured scale, concurrency, deployment, or query needs.
