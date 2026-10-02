# Authentication and authorization contract

Status: Confirmed on 2026-09-30

This contract implements ADR-0009 through ADR-0013 without introducing a database or changing the app into a public multi-tenant service. The supported runtime remains one loopback-bound process; authentication now makes identity explicit and prepares a later HTTPS deployment.

## Records

The backward-compatible Journey state gains optional maps. The implementation may choose exact field names, but it must preserve these meanings:

- `accounts`: normalized unique email, `userId`, `OWNER | MEMBER`, password verifier version/parameters/salt/key, encrypted TOTP secret, last accepted TOTP time step, and lifecycle timestamps.
- `authInvites`: SHA-256 digest identity, intended normalized email, role, creator or bootstrap marker, expiry, consumed/revoked facts, and optional legacy user to claim.
- `authSessions`: SHA-256 token digest identity, account/user identity, created/last-seen/absolute-expiry/revoked timestamps.
- `mediaRecords` (legacy, ADR-0015): filename, owner `userId`, verified media type, byte length, and created timestamp. Migrated rows are preserved in storage for forensic completeness but no API serves them and no transaction intent writes them.

Raw passwords, raw TOTP secrets, one-time codes, raw invite IDs, and raw session tokens are never persisted or logged. Auth collections participate in state validation and the existing atomic replace/backup path. Registration and invite administration use closed transaction intents; ordinary learning commands may not mutate authentication records.

The TOTP secret is encrypted with AES-256-GCM under a random per-installation key stored with owner-only permissions next to the local store. The installation key is required when restoring a backup and is never returned by an HTTP endpoint.

## HTTP surface

```text
GET    /api/auth/session
POST   /api/auth/totp/setup
POST   /api/auth/register
POST   /api/auth/login
POST   /api/auth/logout

GET    /api/auth/invites          OWNER
POST   /api/auth/invites          OWNER
DELETE /api/auth/invites/:id      OWNER
```

`GET /api/auth/session` returns `{ authenticated: false }` or an authenticated user projection containing `id`, `name`, `email`, `timeZone`, and `role`. It never returns credential, invite, or session storage fields.

Registration body:

```json
{
  "inviteId": "wp_inv_<opaque>",
  "email": "person@example.com",
  "name": "Person",
  "timeZone": "Europe/Amsterdam",
  "password": "a long user-chosen passphrase",
  "totpSecret": "BASE32SETUPKEY",
  "totpCode": "123456"
}
```

Optional TOTP setup first validates the invite and matching email, then returns a unique QR code and manual setup key. Registration accepts no TOTP fields or verifies a complete secret/code pair. Sign-in begins with email and password; only an enrolled account with a correct password receives a `TOTP_REQUIRED` challenge before a session can be created. Other authentication failures use one generic message. Registration failures may distinguish an invalid/expired/used invite from invalid form fields, but never disclose another account's credential state.

Invite creation accepts an intended email and creates a `MEMBER` invite expiring within seven days. The response contains the raw invite ID exactly once. Listing returns metadata and status, never a reusable raw invite ID.

Every mutation remains subject to the exact Origin check. Successful registration and sign-in set the cookie and return the authenticated session projection. Logout is idempotent.

## Bootstrap and migration

Existing stores continue to validate before auth records exist. A local operator command creates or rotates a bootstrap owner invite and prints its raw ID once. That invite is bound to the existing `local-user`, so registration claims the existing Quarter, Journey, and Decisions rather than orphaning them.

Fresh stores use the same bootstrap path. The web application never manufactures or displays a bootstrap secret to an unauthenticated visitor. Losing an unused bootstrap ID requires the operator command to revoke/rotate it.

## Client behavior

Application startup checks `/api/auth/session` before rendering private routes:

- unauthenticated users see Sign in, with a clear link to Register with an invite;
- registration includes invite ID, email, display name, password, confirmation, detected time zone, and an optional QR/manual authenticator setup with six-digit confirmation;
- authenticated users see the existing Waypoint shell unchanged except for a small account menu with Sign out;
- owners additionally see an Access page for creating, copying once, listing, and revoking invites;
- a `401` from a later API call clears client auth state and returns to Sign in without retaining a private screen underneath.

Do not store session tokens in React state or browser storage. The client sends same-origin requests with the cookie implicitly.

The visual direction stays inside Waypoint's existing blue-gray workbench system. Authentication is a calm entry checkpoint, not a marketing landing page: one compact panel, direct language, visible focus, useful inline errors, and the same shared page width and typography.

## Required security tests

- Password verifier round-trip, wrong password, unique salts, production parameter contract, and constant-time compare wrapper.
- RFC TOTP vectors, QR/manual enrollment, narrow clock skew, encrypted secret round-trip, and successful-code replay rejection.
- Invite expiry, email binding, one-time consumption, revocation, and concurrent double-use.
- Generic sign-in failure for missing and wrong-password accounts plus rate-limit behavior.
- Session cookie attributes, rotation, expiry, revocation, logout, and no raw token persistence/logging.
- Unauthenticated denial for every private route family.
- Member denial for invite administration.
- Two users cannot read or mutate each other's Quarter, Task, Journey, Decision, search, or plan resources.
- Two users can import the same source plan IDs without collision.
- Existing single-user stores migrate/claim without losing history.
- Browser coverage for bootstrap registration, sign-in, refresh persistence, sign-out, owner invite creation, invited-member registration, and mobile accessibility.
