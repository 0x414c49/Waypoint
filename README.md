# Waypoint

A private learning log for turning an engineering growth plan into a sustainable daily habit.

The product is intentionally **not** a project-management system or a data-entry tracker. Its normal loop should be:

> Open → see what matters now → start → learn → pause or finish → leave one small reflection → done.

## Run and use it

With Node.js 24 installed, create the first owner account like this:

```sh
npm install
npm run auth:bootstrap -- --email you@example.com
npm run dev
```

Open `http://127.0.0.1:5173/register` and paste the one-time invite ID. You may optionally add two-factor authentication by scanning the displayed QR code—or entering its manual setup key—and confirming the six-digit code. The invite is bound to that email and expires after seven days. Creating a new bootstrap invite rotates any older unused bootstrap invite.

There is no default user or password. Your login is the email and password you register; Waypoint asks for an authenticator code only if you enabled 2FA.

The daily workflow, Quarter plan preview/export, local-data location, Journey activity calendar, and Decisions flow are explained in [Using the app](docs/using-the-app.md).

## Docker, Compose, and Unraid

The published image is `ghcr.io/0x414c49/waypoint:latest`. Copy `.env.example` to `.env` when you want to make the deployment settings discoverable. With `WAYPOINT_DATA_PATH` unset, Docker Compose creates one named volume (`waypoint-data`) mounted at `/app/data`; set it to an absolute host path when a bind mount is preferred:

```sh
docker compose pull
docker compose up -d
docker compose exec waypoint npm run auth:bootstrap:production -- --email you@example.com
```

For a bind mount, set `WAYPOINT_DATA_PATH=/srv/waypoint` (or another host path) in `.env` before `docker compose up -d`. The named volume and bind path contain the same complete backup unit: store JSON, media, and `store/auth.key`.

Open the `JOURNEY_PUBLIC_URL` configured in `compose.yaml` (the default is `http://localhost:4173`) and paste the one-time invite at `/register`. Bootstrap is an explicit operator command; it does not run or rotate an invite on container restarts. To use another LAN address, set `WAYPOINT_PUBLIC_URL` in a `.env` file, for example `WAYPOINT_PUBLIC_URL=http://192.168.1.25:4173`, before starting the service. The value must be the exact URL users open. Add exact comma-separated aliases with `WAYPOINT_TRUSTED_HOSTS` and `WAYPOINT_TRUSTED_ORIGINS` when needed; Waypoint never uses a wildcard Host or Origin rule.

For HTTPS behind a reverse proxy, set `WAYPOINT_PUBLIC_URL=https://waypoint.example.com` and either leave `WAYPOINT_SECURE_COOKIES` empty (it is inferred from `https`) or set it to `true`. Terminate TLS at the proxy, preserve the public `Host` and `Origin`, and keep Waypoint private to your LAN or authenticated proxy; this is not a hosted multi-tenant service.

The image supports `linux/amd64` (x86-64, the architecture usually called x86) and `linux/arm64`. True 32-bit `linux/386` is not supported or advertised because the Node.js 24 base image and native ecosystem are not a supported target.

Releases are automatic. Every successful push to `main` runs the checks once, increments the patch number from the newest `vMAJOR.MINOR.PATCH` Git tag, publishes `main`, the numbered version, `latest`, and the immutable commit-SHA image tags, then creates the matching Git tag. The generated tag does not trigger another workflow. A manual rerun on an already-tagged commit reuses that version instead of creating another release.

For Unraid, import [`unraid/waypoint.xml`](unraid/waypoint.xml) into Community Applications, keep the data mapping at `/mnt/user/appdata/waypoint:/app/data`, and set the required `JOURNEY_PUBLIC_URL` field to the exact address users will open (for example `http://192.168.1.25:4173`). The template supplies Docker's non-root `--user=99:100` (Unraid `nobody:users`) so new appdata files use the normal Unraid share ownership. If this directory already exists with different ownership, adjust it once before starting:

```sh
mkdir -p /mnt/user/appdata/waypoint
chown -R 99:100 /mnt/user/appdata/waypoint
```

Open the container console after it starts and run `npm run auth:bootstrap:production -- --email you@example.com`. The template intentionally has no invented logo URL. Stop the container before backing up `/mnt/user/appdata/waypoint` (including `store/auth.key`) and restore the complete directory before starting it again. Treat backups as private: they contain password verifiers, encrypted authenticator secrets, the key needed to decrypt them, and all activity/media.

The Compose file and the template expose only port 4173. The container health check is `/healthz`; it still enforces the configured Host boundary.

## Current stage

The project has confirmed product, UX, visual, domain, API, and persistence behavior. The consolidated implementation review passed independent A/B verification and was explicitly approved on 2026-09-27. Slices 0–5 are complete: executable foundation, daily learning loop, lived Journey, simplified durable Decisions, history-safe plan lifecycle with Quarter navigation, and global Search. Generated AI review and provider connections were removed from the product.

Start with:

1. [Product compass](docs/product/product-compass.md)
2. [Stages and decision gates](planning/stages-and-gates.md)
3. [UX risk register](docs/product/ux-risk-register.md)
4. [Core journeys](docs/journeys/core-journeys.md)
5. [ASCII wireframes](docs/journeys/ascii-wireframes.md)
6. [Confirmed interaction model](docs/journeys/confirmed-interaction-model.md)
7. [Preliminary UX evaluation](docs/journeys/ux-evaluation.md)
8. [Visual system — Quiet Workshop](docs/design/visual-system.md)
9. [Information architecture](docs/design/information-architecture.md)
10. [Visual and IA review](docs/design/design-review.md)
11. [Domain and data model](docs/architecture/domain-model.md)
12. [Task lifecycle](docs/architecture/task-lifecycle.md)
13. [Plan updates and history](docs/architecture/plan-and-history.md)
14. [Domain model review](docs/architecture/domain-model-review.md)
15. [REST API contract](docs/architecture/api-contract.md)
16. [Dashboard contract](docs/architecture/dashboard-contract.md)
17. [Error and conflict contract](docs/architecture/error-contract.md)
18. [Persistence contract](docs/architecture/persistence-contract.md)
19. [API and persistence review](docs/architecture/api-review.md)
20. [Plan YAML format](docs/product/plan-format-v1.md)
22. [System design](docs/architecture/system-design.md)
23. [Technology stack](docs/architecture/technology-stack.md)
24. [Architecture review](docs/architecture/architecture-review.md)
25. [Architecture decision records](docs/adr/README.md)
26. [Release scope and slices](planning/release-scope.md)
27. [Validation plan](planning/validation-plan.md)
28. [Consolidated implementation gate](planning/implementation-gate.md)
29. [Final A/B gate audit](planning/final-gate-audit.md)
30. [Slice 0 validation evidence](planning/slice-0-validation.md)
31. [Slice 1 validation evidence](planning/slice-1-validation.md)
32. [Slice 2 validation evidence](planning/slice-2-validation.md)
33. [Slice 3 implementation map](planning/slice-3-implementation-map.md)
34. [Slice 3 validation evidence](planning/slice-3-validation.md)
35. [Slice 4 implementation map](planning/slice-4-implementation-map.md)
36. [Slice 4 validation evidence](planning/slice-4-validation.md)
37. [Slice 5 implementation map](planning/slice-5-implementation-map.md)
38. [Slice 5 validation evidence](planning/slice-5-validation.md)
39. [Working agreement](planning/working-agreement.md)
40. [Using the app](docs/using-the-app.md)
41. [Authentication and authorization](docs/architecture/authentication-and-authorization.md)

## Working rule

Each stage must leave a written decision behind. Later work must cite those decisions, and any change to a confirmed decision must be recorded in [the decision log](planning/decision-log.md).

Implementation follows the approved consolidated gate and must pass each slice's evidence checks before the next slice begins.
