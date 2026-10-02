# Architecture Decision Records

ADRs preserve decisions that materially constrain implementation. `Accepted` records reflect gates already confirmed; `Proposed` records become accepted only with the consolidated implementation gate.

1. [ADR-0001 — Human-readable JSON storage for v1](0001-json-storage-for-v1.md)
2. [ADR-0002 — REST and a server-resolved Dashboard](0002-rest-and-server-resolved-dashboard.md)
3. [ADR-0003 — One active Session per User](0003-single-active-session.md)
4. [ADR-0004 — Separate current plan from historical context](0004-plan-and-history-are-separate.md)
5. [ADR-0005 — Resolve current user behind a port](0005-current-user-provider-before-auth.md)
6. [ADR-0006 — Store AI reviews as separate history (superseded)](0006-ai-review-as-separate-history.md)
7. [ADR-0007 — TypeScript modular monolith](0007-typescript-modular-monolith.md)
8. [ADR-0008 — Local loopback single-process runtime](0008-local-loopback-single-process.md)
9. [ADR-0009 — Invite-gated accounts and memory-hard passwords](0009-invite-gated-accounts-and-passwords.md)
10. [ADR-0010 — Opaque server sessions in protected cookies](0010-opaque-server-sessions.md)
11. [ADR-0011 — Role checks plus owner-scoped private records](0011-role-and-owner-scoped-authorization.md)
12. [ADR-0012 — Mandatory TOTP two-factor authentication (superseded)](0012-mandatory-totp-two-factor-authentication.md)
13. [ADR-0013 — Optional TOTP two-factor authentication](0013-optional-totp-two-factor-authentication.md)
14. [ADR-0014 — Plain SQLite store with FTS5 (supersedes ADR-0001)](0014-sqlite-store-with-fts.md)
15. [ADR-0015 — URL-only images, no binary upload](0015-url-only-images.md)
16. [ADR-0016 — Raspberry Pi + Cloudflare Tunnel deployment (extends ADR-0008)](0016-pi-tunnel-deployment.md)
17. [ADR-0017 — Email foundation via Resend (opt-in, invites first)](0017-email-via-resend.md)

Superseded ADRs remain in this folder and link to their replacements. Product and UX decisions remain in `planning/decision-log.md`.
