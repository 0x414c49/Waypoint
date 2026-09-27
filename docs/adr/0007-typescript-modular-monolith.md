# ADR-0007: TypeScript modular monolith

Status: Proposed — 2026-09-27

## Context

The app needs strong interaction quality and explicit domain boundaries, but its local scale does not justify multiple deployables or languages.

## Decision

Use one TypeScript package containing a React/Vite client, Fastify server, shared transport contracts, pure domain modules, application use cases, and adapter ports. Use explicit imports/factory wiring rather than a service framework.

## Why

One language and deployable keep the local app simple, while module and port boundaries protect the few areas expected to change.

## Consequences

- One toolchain and process keep implementation approachable.
- Modules align with real product capabilities, not infrastructure tiers alone.
- `shared` is limited to transport contracts; domain and persistence types stay server-owned.
- Microservices, message brokers, global client stores, and SSR remain absent until a proven need.
