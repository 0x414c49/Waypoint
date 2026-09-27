# ADR-0005: Resolve current user behind a port

Status: Accepted — 2026-09-27

## Context

V1 is local and single-user, but hard-coding ownership throughout use cases would make later authentication invasive.

## Decision

Application use cases depend on `CurrentUserProvider`. The v1 `LocalUserProvider` returns the seeded local User. Do not add authentication fields, profile screens, or fake session infrastructure.

## Consequences

- Ownership remains explicit in every use case.
- A future authenticated adapter can change user resolution without rewriting domain policies.
- V1 must remain loopback-only because this seam is not security by itself.
