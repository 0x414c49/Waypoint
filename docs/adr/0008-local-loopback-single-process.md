# ADR-0008: Local loopback single-process runtime

Status: Proposed — 2026-09-27

## Context

V1 has no authentication and stores private reflection locally. Network exposure or multiple writers would make the current security and persistence model false.

## Decision

Run one fixed-port Node.js process bound only to loopback. Serve frontend and API from one origin, restrict Host/Origin, and serialize JsonJourneyStore writes with one in-process mutex. Stop startup on port conflict.

## Consequences

- Local privacy and JSON write assumptions are explicit.
- Responsive mobile viewport support does not imply remote phone access.
- A second process, shared data directory, LAN access, or public hosting is unsupported.
- Any networked deployment must reopen authentication, authorization, transport security, backup, and storage concurrency decisions.
