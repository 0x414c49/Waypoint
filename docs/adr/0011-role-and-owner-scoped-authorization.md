# ADR-0011: Role checks plus owner-scoped private records

Status: Accepted — 2026-09-30

## Context

Authentication answers who made a request. Authorization must still decide what that identity may do and prevent one invited user from reading or changing another user's learning history. Most existing projections already accept a `userId`, but the implicit local-user adapter, media files, and globally keyed imported plan IDs leave gaps.

## Decision

Use two roles:

- `OWNER`: all normal learning actions plus creating, listing, and revoking invites;
- `MEMBER`: normal learning actions for that member's own records only.

Resolve the authenticated identity at the Fastify request boundary and expose it to existing application services through a request-scoped `AuthenticatedCurrentUserProvider`. Keep `LocalCurrentUserProvider` only as an explicit test adapter. Missing authentication returns `401`; an authenticated user without the required role returns `403`; a private resource owned by another user returns the same `404` as a missing resource.

Every query and command must derive ownership from the authenticated user, never from a request-body `userId`. Existing Quarter, Task, Session, Journey, Decision, search, and plan checks are audited and covered by two-user negative tests.

Imported plan identifiers are source identifiers, not globally safe persistence keys. For new non-legacy users, plan-owned persisted IDs are deterministically namespaced by user before storage and all internal references use those namespaced IDs. The legacy owner's existing IDs remain readable. Export presents the user's source identifiers, and authorization lookup always includes the authenticated owner.

Media uploads create an owner-bound media record in the same store. Upload and read require authentication; reads verify ownership before opening the file. Existing legacy media is assigned only to the legacy owner during the auth migration/reconciliation path. Random filenames remain defense in depth, not the authorization mechanism.

Owner-only routes are grouped under `/api/auth/invites`. No role grants access to another user's learning data. There is no impersonation endpoint.

## Why

The domain already models user ownership, so request-scoped identity preserves the established application boundaries. Explicit role checks keep administrative authority small, while owner-scoped lookups prevent insecure direct-object references.

## Consequences

- Authorization is enforced server-side; hiding owner controls in the client is only presentation.
- Multi-user stores can safely contain the same imported source plan IDs.
- Media metadata becomes part of validated persistence.
- Any future collaborative workspace is a separate decision; this change implements private per-user trackers, not shared records.

