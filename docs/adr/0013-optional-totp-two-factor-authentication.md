# ADR-0013: Optional TOTP two-factor authentication

Status: Accepted — 2026-09-30

## Context

ADR-0012 introduced standards-based authenticator protection but required it for every account. The product owner clarified that two-factor authentication must be optional. Waypoint should offer the stronger factor without preventing an invited person from registering or signing in with a password alone.

## Decision

Offer TOTP enrollment as an explicit optional section during invite registration. An account may be created without opening that section. If the person enables it, preserve ADR-0012’s security properties: a unique 160-bit secret, QR and manual-key setup, confirmation with a current six-digit code, AES-256-GCM encrypted persistence, a 30-second RFC 6238 step, a one-step clock-skew window, attempt limiting, and successful-step replay rejection.

Sign-in begins with email and password for every account. An account without TOTP creates a session after those credentials verify. For an enrolled account, a correct password produces a specific `TOTP_REQUIRED` challenge and the client then reveals the authenticator field. A missing account or incorrect password never reveals whether TOTP is enabled. The second request repeats the password plus the current code; the server remains authoritative and no partial session is created.

Registration accepts either no TOTP fields or a complete verified secret/code pair. Partial enrollment fails validation. Re-registering an already enrolled account may not silently remove its factor.

## Consequences

- People can opt into stronger protection without making an authenticator a prerequisite for using Waypoint.
- The normal sign-in form remains short for accounts without TOTP.
- Whether a real account has TOTP becomes visible only after its password verifies successfully.
- Factor management and recovery remain separate future work.
- ADR-0012 is superseded only on mandatory enrollment and unconditional prompting; its cryptographic mechanism remains in force for enrolled accounts.
