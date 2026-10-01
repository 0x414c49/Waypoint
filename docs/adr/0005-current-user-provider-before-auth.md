# ADR-0005: Resolve current user behind a port

Status: Superseded by ADR-0009 and ADR-0011 — 2026-09-30

## Context

V1 is local and single-user, but hard-coding ownership throughout use cases would make later authentication invasive.

## Decision

Application use cases depend on `CurrentUserProvider`. The v1 `LocalCurrentUserProvider` returns the seeded local User. Do not add authentication fields, profile screens, or fake session infrastructure.

## Why

This tiny seam keeps ownership explicit and later authentication replaceable without pretending v1 has a security system it does not need.

## Consequences

- Ownership remains explicit in every use case.
- A future authenticated adapter can change user resolution without rewriting domain policies.
- V1 must remain loopback-only because this seam is not security by itself.

The seam remains, but the production adapter now resolves the authenticated request identity. `LocalCurrentUserProvider` remains an explicit test adapter only.
