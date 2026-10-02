# ADR-0015: URL-only images, no binary upload

Status: Accepted — 2026-10-02 (docs-first, implementation follows)

## Context

The 2026-09-29 decision added local image uploads (`POST /api/media` data-URL, magic-byte check, 2MB, `0600` files, `mediaRecords` ownership) for the private engineering log. For a Tunnel-public Pi deployment that path is the largest exposed write surface: 2.8MB base64 JSON bodies, disk writes, disk-fill vector, and auth-gated binary serving — for a feature whose user need is "paste a picture in a thought."

## Decision

Remove binary upload entirely. Images are pasted `https://` URL strings inside existing markdown fields (`JourneyEntry.text`, decision text fields). The server validates and stores the string only and never fetches it.

- Delete: `server/http/media-routes.ts` (`POST /api/media`, `GET /api/media/:filename`, `reconcileLegacyMedia`, `imageType`), `registerMediaRoutes` call, `mediaDirectory` plumbing, `mediaRecords` schema/ownership/transition entries, `uploadJourneyImage` client call, editor file-picker UI, binary upload tests, `data/store/media/`.
- Contract: markdown `![](https://host/path.png)` only. Server validation: `https:` only (reject `http:`, `data:`, `blob:`, `javascript:`, protocol-relative), `new URL()` parse, reject credentials/non-443 ports/`localhost`/metadata `169.254.*`, length ≤ 2048 per URL, existing body size limits retained (drop the 2.8MB media exception).
- Rendering: existing `react-markdown` + `rehype-sanitize` path unchanged; default is link-card, not auto-inline `<img>`, unless an explicit host allowlist is added later. `img-src` stays `'self' data:`; no global `https:` widening. `loading="lazy" referrerpolicy="no-referrer"`, no `on*` handlers (sanitizer verified).
- History rule: existing `/api/media/…` references in old entries are left as inert text (never silently rewritten); operator maps the 2 known local files via a throwaway `media-orphans.json` report and re-hosts or deletes references manually. `mediaRecords` is dropped in the v1→v2 migration transform.
- No image-host integration: no Imgur API keys, no oEmbed, no thumbnail proxy, no object storage (S3/R2/minio). Search treats URLs as plain text for free.

## Why

KISS/DRY: ~215 LOC deleted, one upload vector gone, zero new dependencies, zero SSRF surface (no server fetch by construction). The tracking-pixel/IP-leak trade-off of third-party images is contained by the link-card default.

## Consequences

- `POST /api/media` 404s (route gone); old local files stop resolving. Backup unit shrinks to DB + `auth.key`.
- UX copy changes to: "To add an image, upload it to your preferred image host and paste the link as `![](https://…)`."
- Docs to update on implementation: `using-the-app.md`, `README.md` backup sentence, `system-design.md` intentionally-absent list, `persistence-contract.md` (`mediaRecords` removal), `api-contract.md` (`/api/media` removal).
