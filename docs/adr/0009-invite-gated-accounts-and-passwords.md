# ADR-0009: Invite-gated accounts and memory-hard passwords

Status: Accepted — 2026-09-30

## Context

The tracker is moving from one implicit local user to authenticated users. Registration must not be public: a person may create an account only with a valid one-time invite ID. Persistence remains the existing validated, atomically replaced JSON store rather than a database.

Passwords are low-entropy, user-chosen secrets. Invite IDs are high-entropy, machine-generated bearer secrets. Treating both as a fast unsalted hash would make offline password guessing unnecessarily cheap.

## Decision

Store authentication records in optional, backward-compatible collections inside the existing `JourneyState`, so user creation, credential creation, and invite consumption commit atomically with one `JourneyStore` transaction.

An account contains a normalized unique email, its Journey `userId`, an `OWNER | MEMBER` role, password-hash metadata, and lifecycle timestamps. Never store a password.

Passwords use asynchronous Node.js `scrypt` with:

- a new cryptographically random salt of at least 16 bytes for every password;
- a 64-byte derived key;
- production parameters `N=2^17`, `r=8`, `p=1`, with an explicit memory ceiling high enough for that configuration;
- parameters and an algorithm version stored beside the salt and derived key so future logins can rehash after a policy upgrade;
- constant-time comparison of equal-length derived keys;
- NFC normalization, a minimum of 15 Unicode code points, a maximum of 128, no arbitrary composition rules, and rejection of a small offline list of common and context-specific passwords.

Tests inject a fast deterministic password hasher. Production parameters may not be weakened by an ordinary runtime setting.

Invite IDs contain at least 256 random bits and are shown only when created. Persist only a SHA-256 digest because an offline attacker cannot feasibly guess a uniformly random 256-bit value. Each invite is bound to an intended normalized email and role, expires after at most seven days, is one-time use, and records creator, consumption, or revocation.

The first owner is not an unauthenticated web-registration exception. A local operator command creates or rotates a one-time bootstrap invite bound to the existing `local-user`; it prints the raw invite ID once. Subsequent invites are created and revoked by an authenticated owner.

Registration requires the invite ID, matching email, display name, valid IANA time zone, and password. Consuming the invite, creating or claiming the User, and creating the credential are one atomic transaction. Responses never reveal whether an email already exists beyond what the authenticated owner already knows.

## Why

OWASP recommends Argon2id and, when it is unavailable in the platform, `scrypt` with `N=2^17`, `r=8`, and `p=1`. Node provides `scrypt`, cryptographic randomness, and constant-time comparison without a native password package. NIST recommends at least 15 characters for single-factor passwords, blocking common passwords, and rate limiting rather than arbitrary composition rules.

References:

- https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html
- https://pages.nist.gov/800-63-4/sp800-63b.html
- https://nodejs.org/download/release/v24.20.0/docs/api/crypto.html

## Consequences

- A JSON file can safely hold salted password verifiers, invite digests, and account metadata when filesystem permissions and backup handling remain private; a database is not required for this scale.
- Copying the store still enables offline password guessing, so strong passwords and the memory-hard cost remain important.
- Registration is closed by default and bootstrap is an explicit local operator action.
- There is no email delivery or password-reset flow in this change. Recovery is an explicit local owner/operator workflow and must not bypass invite or ownership checks.
- ADR-0005 is superseded for the production runtime; its provider seam is retained and receives an authenticated adapter.

