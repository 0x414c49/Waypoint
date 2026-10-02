# ADR-0016: Raspberry Pi + Cloudflare Tunnel deployment (extends ADR-0008)

Status: Accepted — 2026-10-02 (docs-first, implementation follows)

## Context

ADR-0008 restricted v1 to loopback single-process and declared LAN/public hosting unsupported until authentication, authorization, transport, backup, and concurrency were reopened. Since then: invite-gated accounts + scrypt + opaque cookie sessions + owner scoping (ADR-0009–0013), strict Host/Origin allowlists with no wildcards, and ADR-0014 SQLite transactions. The remaining gap is transport and Pi operations. Port-forwarding the Pi would expose Fastify directly to Internet scanning and home-uplink DDoS.

## Decision

Support exactly one public topology: Waypoint container on the Pi (unmodified single-process image) fronted solely by `cloudflared` Tunnel outbound connection. No port forwarding, no host-published `4173` to LAN.

- Container binds `0.0.0.0:4173` only inside Docker networking; host publishes via `127.0.0.1:4173:4173` or no `ports:` + shared network to a `cloudflared` service (`linux/arm64` image, token via `env_file 0600`).
- `JOURNEY_PUBLIC_URL` must be the exact `https://<tunnel-host>` users open (no path/query/credentials); `JOURNEY_SECURE_COOKIES=true` explicit; trusted hosts/origins contain only the tunnel host/origin. `127.0.0.1/localhost` code defaults remain but are unreachable via Tunnel.
- Cloudflare: proxied DNS, SSL Full (Strict), TLS ≥ 1.2, HSTS, managed WAF + Bot Fight on, rate rule for `/api/auth/*`, script-injecting features off (Rocket Loader, Email Obfuscation, Mirage). Optional Cloudflare Access (owner emails only) as a second gate for a 1–2-user journal.
- Container: keep `USER node`, `no-new-privileges:true`, `cap_drop:[ALL]`; decide one UID story (`99:100` bind-mount vs image `node`) and `chown` the volume once. `/healthz` keeps Host enforcement; health checks send the public Host.
- Pi: Debian/RPiOS unattended-upgrades, SSH key-only, UFW default-deny inbound (Tunnel needs outbound only), SSD over SD card, small UPS with graceful shutdown, arm64 image pull verified on the Pi.
- Secrets/backups: `/app/data` (`waypoint.db` + `auth.key`) is the complete backup unit; backups encrypted off-Pi (restic/age, key outside Pi), `auth.key` backed up alongside but required for restore (TOTP logins fail closed without it). Nightly backup + quarterly restore drill.
- Launch blockers before DNS cutover: exact-https public URL + `__Host-` cookie attrs verified; Host/Origin 403 matrix green (foreign/missing/`null` Origin on POST → 403); auth rate limits (login/register/totp-setup + invite-create) verified; TOTP replay, invite single-use/email-bound/expiry/revoke, logout revocation verified; generic login errors (dummy scrypt path); owner/member isolation tests green; LAN `http://<pi-ip>:4173/` refused; killing `cloudflared` fails closed.

## Why

Tunnel removes the inbound NAT hole and home-IP scanning while keeping the app's strict same-origin model intact — the cheapest big security win for a personal app, free forever, CGNAT-safe.

## Consequences

- ADR-0008 gains a second explicit exception alongside the container private-LAN profile: Tunnel-public is supported only under this ADR's blockers; raw port-forward/direct public exposure remains out of scope without a new review.
- No code change to auth/crypto; follow-ups filed, not blocking: 24h idle session timeout, revoke-all-sessions, global per-IP API brake, `Strict-Transport-Security` single-source, log-redaction tests, `read_only` container + `tmpfs`.
