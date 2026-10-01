# ADR-0010: Opaque server sessions in protected cookies

Status: Accepted — 2026-09-30

## Context

After registration or sign-in, the browser needs an authenticated identity for every API request. Storing a bearer token in browser storage would expose it to any script executing in the origin. Self-contained JWTs would make revocation and logout harder without solving a problem this single-process application has.

## Decision

Use opaque server-side sessions.

On successful registration or sign-in, generate at least 256 random bits. Send the raw token only in a cookie and persist only its SHA-256 digest. A Session record contains its account/user identity, creation time, last-seen time, absolute expiry, and optional revocation time. Rotate the token on every successful primary authentication and delete/revoke it on logout. Expired, revoked, or disabled-account sessions fail closed and are cleaned lazily.

The cookie is `HttpOnly`, `SameSite=Strict`, `Path=/`, has no `Domain`, and is never readable by client JavaScript. HTTPS deployments use `Secure` and the `__Host-` prefix. The supported loopback HTTP development/runtime uses a host-only `waypoint_session` cookie because browsers will not return a `Secure` cookie over HTTP. The absolute session lifetime is seven days; the server remains authoritative even if a stale cookie survives.

Authentication and private API responses use `Cache-Control: no-store`. Logout clears the cookie. Session IDs, password material, invite IDs, and raw authorization headers are excluded from logs.

Keep the existing exact Host allowlist and mutation Origin allowlist. `SameSite` is defense in depth, not a replacement for the Origin check. No CORS is enabled.

Apply a bounded in-memory rate limiter to sign-in and registration attempts, keyed by normalized account identifier plus the local request source. Missing-account sign-in performs the same injected password-verification work against a dummy verifier and returns the same `401` Problem Details response as a wrong password.

Public API surface is limited to session status, sign-in, and invite-gated registration. All other `/api` routes require an authenticated session. Test-only routes remain available only in explicitly configured test builds.

## Why

Opaque sessions are immediately revocable, fit the single-process JSON architecture, and keep bearer secrets out of JavaScript-accessible storage. OWASP recommends `HttpOnly`, `Secure`, explicit `SameSite`, narrow cookie scope, non-logging of session IDs, and `no-store` for responses that carry session material.

Reference: https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html

## Consequences

- The server performs a small digest lookup on each authenticated request.
- Logout and account disablement take effect immediately.
- The local HTTP runtime cannot claim transport confidentiality; any non-loopback deployment must add HTTPS before it is supported.
- JWT refresh-token machinery and browser local-storage tokens are intentionally absent.

