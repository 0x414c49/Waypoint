# Waypoint

A private learning log for turning an engineering growth plan into a steady daily practice.

<img src="docs/assets/quiet-workspace.jpg" alt="An open notebook on a quiet desk beside a window" width="640">

Waypoint helps you decide what to work on today, record the time you spend, and keep the insight that came from it. Open the app, start a session, pause when you need to, and finish with a short reflection. Your history grows from the work itself.

## The experience

| Area | What it is for |
| --- | --- |
| **Today** | See the current learning item and start, pause, resume, or finish a session. |
| **Quarter** | Follow the plan, review milestones, preview plan changes, and export YAML. |
| **Journey** | Revisit sessions, outcomes, thoughts, and activity over time. |
| **Tech choices** | Record decisions, the reasoning behind them, and later reviews. |
| **Search** | Find plan work, thoughts, and decisions in their original context. |
| **Profile** | Manage your account, email preference, and member invites if you are the owner. |

Waypoint is intentionally quiet. There are no streaks, scores, leaderboards, or penalties for an empty day. Plan changes guide future work without rewriting completed history. Members can share an installation while keeping their learning records private.

See the app: [Today](docs/screenshots/today.png) · [Journey](docs/screenshots/journey.png) · [Quarter](docs/screenshots/quarter.png)

## Run locally

Requires Node.js 24.

```sh
npm ci
npm run auth:bootstrap -- --email you@example.com
npm run dev
```

Open [http://127.0.0.1:5173/register](http://127.0.0.1:5173/register) and use the one-time invite ID printed by the bootstrap command. The invite is bound to the email address and expires after seven days. There is no default account or password. Authenticator-app two-factor authentication is optional during registration.

To run the built app locally:

```sh
npm run build
npm start
```

The built app listens at [http://127.0.0.1:4173](http://127.0.0.1:4173). Local data is stored in `data/store`.

## Deploy with Docker Compose

The published image is `ghcr.io/0x414c49/waypoint:latest` for `linux/amd64` and `linux/arm64`.

```sh
cp .env.example .env
docker compose up -d
docker compose exec waypoint npm run auth:bootstrap:production -- --email you@example.com
```

Open the address set by `WAYPOINT_PUBLIC_URL`, which defaults to `http://localhost:4173`, and register with the printed invite ID. Set `WAYPOINT_PUBLIC_URL` in `.env` to the exact address people will use before starting the container. For example, use your LAN address for local access or an HTTPS address behind a reverse proxy. The bootstrap command runs only when you invoke it.

Compose stores data in the `waypoint-data` volume by default. Set `WAYPOINT_DATA_PATH` to an absolute host path if you prefer a bind mount. Optional invite email uses `WAYPOINT_RESEND_API_KEY` and `WAYPOINT_EMAIL_FROM`; leave both unset to disable outbound email. See [`.env.example`](.env.example) for the available settings.

For Unraid, use the [container template](unraid/waypoint.xml) and follow the [deployment notes](docs/using-the-app.md#docker-compose-and-unraid).

## Data and backups

SQLite is the source of truth. On an upgrade from the earlier JSON store, Waypoint imports the existing data before serving requests and preserves the JSON source and a dated backup.

Stop Waypoint before backing up or restoring data. Copy the **entire store directory** as one unit, including `waypoint.db`, `auth.key`, and the authority marker. In Docker, back up the corresponding volume or bind mount. Treat backups as private because they contain account credentials and learning history.

## How it works

Waypoint runs a TypeScript Fastify server and a React app in one process. The server owns the REST API at `/api`, authentication, domain rules, and SQLite persistence. FTS5 helps narrow search candidates while the application keeps ranking and excerpts consistent. Image references are HTTPS links; Waypoint does not upload image files.

Run the project checks with:

```sh
npm run check
```

## Documentation

- [Using the app](docs/using-the-app.md) covers the daily workflow, plans, Journey, decisions, and deployment.
- [Product compass](docs/product/product-compass.md) explains the scope and design principles.
- [System design](docs/architecture/system-design.md) and [API contract](docs/architecture/api-contract.md) describe the implementation.
- [Architecture decisions](docs/adr/README.md) record why the major choices were made.
