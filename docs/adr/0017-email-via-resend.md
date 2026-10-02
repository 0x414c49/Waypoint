# ADR-0017: Email foundation via Resend (opt-in, invites first)

Status: Accepted — 2026-10-02

## Context

Invite delivery is copy-the-ID-today. That works locally but not once the Pi is Tunnel-public and members register from their own devices. Password recovery does not exist yet, and a weekly digest was floated. All three need the same thing: a way to send an email, off by default, without turning a private local app into a telemetry emitter.

Resend was chosen because it is a plain HTTPS API (no SDK/agent needed), has a free tier that covers invite-scale volume, and keeps the secret in one env var.

## Decision

Add one `Mailer` port (`server/email/mailer.ts`) with a `ResendMailer` over platform `fetch` and a `NoopMailer` when unconfigured. No SDK dependency.

- Config: `JOURNEY_RESEND_API_KEY` + `JOURNEY_EMAIL_FROM` (composed as `WAYPOINT_*` in `.env.example`/`compose.yaml`). Both set → email enabled; either missing → disabled; half-set → warn at boot, keep serving without email.
- First and only sender today: `POST /api/auth/invites` (owner-only, already rate-limited). After the invite row commits, the route sends `buildInviteEmail()` best-effort: register link from the exact `JOURNEY_PUBLIC_URL` + raw invite ID + 7-day expiry note. Delivery failure never loses the invite — the raw ID is still returned once and the failure is logged; the response carries `emailSent: boolean`.
- Template rules: text + minimal HTML twins, `escapeHtml` on inviter-controlled values, no credentials/secrets besides the invite link itself, subject/body length caps, recipient re-validated at send time.
- What is NOT built: no password-reset tokens, no digest scheduler/worker, no other email types, no open `/api/email` endpoint, no per-user mail preferences. Those reuse this foundation later.

## Why

One small module unblocks invites-over-email now and digest/recovery later, while the default (no keys) keeps the v1 "no third-party calls" posture intact — the app phones Resend only when the operator explicitly configured it for this exact purpose.

## Consequences

- New unit: first opt-in third-party call; document it as such in `system-design.md` on the next pass (baseline "no third-party calls" now reads "none unless email configured").
- Contract change: `AuthInviteCreateResponse` gains required `emailSent: boolean`. Old clients ignore the extra field; the Access page shows "also emailed" when true.
- Secrets: Resend key lives in env/volume only, never in logs, store, or backups. `EMAIL_FROM` should be a domain the operator controls (SPF/DKIM via Resend DNS).
- Abuse posture: invite creation stays owner-only + rate-limited; Resend-side rate limits surface as `emailSent: false` with a warning log, never a 500.

## Templates pointer

Template bodies live in-repo at `server/email/templates.ts` (invite in
production; weekly-digest and password-recovery as UNUSED skeletons) and
are documented in `docs/architecture/email-templates.md`. Resend's hosted
transactional-templates API exists but is intentionally unused — in-repo
keeps templates versioned with no dashboard drift.

## Amendment — digest unsubscribe (2026-10-02)

Bulk mail needs a way out; one-to-one mail (invites, recovery) does not.
`records.emailPreferences` (optional, keyed by userId) stores a single
`digestUnsubscribedAt` timestamp. Links are HMAC-SHA256(userId) tokens
under the 32-byte installation key (domain-separated from TOTP use), so
`GET /api/email/unsubscribe?token=` and `GET /api/email/resubscribe?token=`
show confirmation forms without changing state; the matching `POST` routes
apply the change. They need no session — the token is the credential. All are public, IP
rate-limited, and return identical invalid-link responses for forged
tokens and removed accounts. The digest template carries a required
`unsubscribeUrl` variable; the future digest sender must skip opted-out
users and send `List-Unsubscribe` headers (supported by `EmailMessage.headers`).
