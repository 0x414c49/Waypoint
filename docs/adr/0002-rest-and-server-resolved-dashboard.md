# ADR-0002: REST and a server-resolved Dashboard

Status: Accepted — 2026-09-27

## Context

The client must not reconstruct Task lifecycle, unfinished-work priority, or Today recommendation from storage-shaped fragments.

## Decision

Expose a resource/action REST API. `GET /api/dashboard` returns one consistent tagged Today projection. Commands use explicit action endpoints, ETags, idempotency keys, and RFC 9457 Problem Details.

## Why

One server-owned projection prevents the browser from duplicating lifecycle and recommendation rules while REST keeps the boundary direct and testable.

## Consequences

- The browser stays a thin interaction layer.
- Domain rules have one server implementation.
- Generic Task CRUD/status updates and client-composed Dashboard requests are rejected.
- The API can outlive the first client and first storage adapter.
