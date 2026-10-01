# ADR-0012: Mandatory TOTP two-factor authentication

Status: Superseded by ADR-0013 — 2026-09-30

The user clarified that TOTP must be optional. ADR-0013 retains the secure TOTP mechanism but replaces mandatory enrollment and unconditional code prompts.

## Context

Waypoint already requires an invite, email, password, and protected server session. A stolen or reused password should not be sufficient to enter a private learning history. The application remains a loopback-first local service with JSON persistence and no email or SMS provider.

## Decision

Require a standards-based TOTP authenticator for every newly registered account. Registration prepares one unique 160-bit random secret only after a valid, email-bound invite is presented. The browser shows both a QR code containing an `otpauth://` URI and the same Base32 secret as a manual setup key. Account creation succeeds only after a current six-digit code verifies the enrollment.

Use RFC 6238 defaults for broad authenticator compatibility: HMAC-SHA-1, six digits, a 30-second step, and Unix epoch zero. Verification accepts the current step plus one adjacent step in either direction for ordinary clock skew. A time step accepted successfully for an account is persisted and may not be accepted again.

Sign-in requires email, password, and a current authenticator code in one request. Every failure returns the same generic authentication response. Password and TOTP attempts share the existing bounded per-account/source rate limit. Codes and secrets are excluded from logs.

Unlike passwords and high-entropy bearer tokens, the TOTP secret cannot be stored as a one-way hash because the verifier must recompute future codes. Encrypt each secret with AES-256-GCM and authenticated account identity under a random 256-bit installation key. The key is created with owner-only filesystem permissions beside the local store, outside the validated JSON snapshot. Losing the key makes enrolled accounts unrecoverable, so local backups must include it and keep it private.

No default account or default credentials are introduced. The first owner still registers using the local bootstrap invite.

## Why

RFC 6238 defines interoperable time-based one-time passwords, unique randomly generated keys, a 30-second default step, narrow clock-skew windows, and rejection of a reused successful OTP. OWASP recommends MFA at login, standardized TOTP enrollment by QR code, strict attempt limits, and a secure recovery procedure.

References:

- https://www.rfc-editor.org/info/rfc6238/
- https://cheatsheetseries.owasp.org/cheatsheets/Multifactor_Authentication_Cheat_Sheet.html

## Consequences

- A password alone can no longer create a session.
- Registration adds one clear authenticator setup and confirmation step.
- The installation key becomes part of the private local backup set.
- Losing both the authenticator enrollment and installation recovery material requires an explicit local operator recovery feature; no weaker web bypass is added in this change.
- TOTP reduces password-only compromise but remains phishable. A later passkey/WebAuthn decision may add phishing-resistant authentication.
