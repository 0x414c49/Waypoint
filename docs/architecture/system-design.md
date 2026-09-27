# System Design

Status: Accepted for implementation on 2026-09-27

## Architectural shape

Build a local-first modular monolith: one TypeScript server process owns domain behavior and JSON persistence, serves one React single-page application, and exposes the confirmed REST API at `/api`.

```text
Browser
  └── React application
        └── same-origin HTTP /api
              └── Fastify transport
                    └── application use cases + queries
                          ├── pure domain policies/projections
                          └── ports
                                ├── JourneyStore → JsonJourneyStore
                                ├── CurrentUserProvider → LocalCurrentUserProvider
                                └── AIReviewer → StubAIReviewer

Cross-cutting injected utilities: Clock, IdGenerator, Logger
```

This is one deployable system with module boundaries, not distributed services. The boundaries protect the product rules and future adapters without turning a personal app into enterprise infrastructure.

## Runtime topology

### Production/local use

- One Node.js process binds `127.0.0.1:4173`; it never falls back to another address or port.
- Before binding/listening, startup initializes or validates the default `data/store` and resolves the canonical stored local user; recovery-required state stops startup with terminal guidance.
- Fastify serves the built frontend and `/api` from the same origin.
- The browser never reads the JSON store directly.
- The fixed port is the v1 single-instance authority; startup stops if it cannot bind.
- No CORS is enabled. Production accepts `Host` only as `127.0.0.1:4173` or `localhost:4173`. `POST`, `PUT`, `PATCH`, and `DELETE` require `Origin` exactly `http://127.0.0.1:4173` or `http://localhost:4173`; missing, `null`, or other origins return `403 UNTRUSTED_ORIGIN`. Safe reads still require an allowed Host. Development explicitly adds only the configured Vite proxy origin.
- V1 is responsive at mobile viewport sizes but is not exposed to a phone over LAN or the public internet. Remote-device use requires a later authenticated deployment design.

### Development

- Vite serves the frontend with `/api` proxied to the local Fastify process.
- The same API contracts and origin assumptions apply.
- Development tooling is not a second product runtime and never gets direct persistence access.

## Code ownership

```text
client/
  app/                 routing, shell, global error boundary
  features/
    today/
    quarter/
    journey/
    decisions/
    utilities/         thought, search, appearance
  ui/                  Quiet Workshop primitives

server/
  http/                routes, headers, transport validation, problem mapping
  application/
    dashboard/
    tasks/
    journey/
    decisions/
    plans/
    search/
    ai/
  domain/              entities, invariants, policies, projections
  ports/               JourneyStore, CurrentUserProvider, AIReviewer
  adapters/            JSON store, local user, stub AI, system clock/IDs

shared/
  contracts/           transport schemas and inferred request/response types only
```

Rules:

- The client owns interaction and presentation state, never lifecycle/recommendation rules.
- HTTP routes translate transport data and errors; they do not implement business transitions.
- Application use cases coordinate one command/query and one store boundary.
- Domain code is deterministic and has no filesystem, network, HTTP, or wall-clock access.
- Adapters implement ports and contain replaceable technical details.
- `shared` contains API contracts, not domain entities, persistence types, mutable stores, or a generic utility dumping ground.
- Features may use shared UI/contracts but do not reach into another feature's internals.
- Route/page components compose focused feature components; they do not grow into whole-feature implementations.
- Extract a component when it gains its own interaction, state, validation, reuse, or meaningful test boundary. Do not extract markup-only wrappers that obscure the screen hierarchy.
- Component boundaries follow responsibility and comprehension rather than an arbitrary line-count quota; a file that owns multiple independent interactions must be split.

## Component responsibilities

| Component | Owns | Explicitly does not own |
|---|---|---|
| Today client | Render Dashboard union, timer display, action feedback | Recommendation, elapsed truth, Task status |
| Quarter client | Plan/current-intent navigation and import review | Editing execution history |
| Journey client | Chronological lived record and Quick Thought | A second notes database taxonomy |
| Decisions client | Draft reasoning and append-only reviews | Interrupting daily work |
| HTTP transport | Schema validation, ETags, idempotency headers, Problem Details | Domain decisions |
| Task application module | Start/Pause/Resume/Finish/Skip/Reopen/Carry forward transactions | Generic status mutation |
| Dashboard query | One consistent server-resolved Today projection | Client-specific hidden state |
| Plan module | Strict parse, preview, diff, apply, export | Execution/history mutation |
| Domain policies | Lifecycle, recommendation, due date, temporal attribution | I/O and framework types |
| JourneyStore | Validated snapshot and atomic whole-state transaction | IDs, clock, recommendations, HTTP |
| CurrentUserProvider | Resolve the seeded local user | Authentication claims |
| AIReviewer | Generate review text from an explicit input | Mutating its target or scoring learning |

## Port contracts

### JourneyStore

The confirmed whole-state port has two operations: project from one immutable validated snapshot, and transact once against a private mutable draft. Transactions carry the persistence contract's closed intent capability so exceptional plan changes, one explicit Journey deletion, and schema migration can be validated without inferring caller authority. A transaction returns only an immutable committed result/snapshot. JsonJourneyStore implements the safe-write and recovery contract.

### CurrentUserProvider

```text
getCurrentUserId() → local-user
```

Every application use case asks this port for ownership context. V1's adapter returns the seeded user; a later authenticated adapter can resolve a session/claim without changing use-case signatures or adding speculative auth fields now.

### AIReviewer

```text
review(request, context) → { provider, model, content, generatedAt }
```

V1 uses a deterministic stub. The application writes an AIReview only after the adapter succeeds and never lets output mutate Task, Decision, or plan state. Provider errors produce no AIReview.

### Clock and IdGenerator

Use cases receive these small utilities so timestamps, Today, undo windows, stable IDs, and boundary tests are deterministic. They are testing seams rather than domain repositories.

## End-to-end flows

### Open Today

1. Browser requests `GET /api/dashboard`.
2. Route resolves the current user and asks the Dashboard query.
3. JourneyStore supplies one immutable validated state revision.
4. Pure policies derive current Quarter, effective Task statuses, active Session, recommendation, milestone facts, and decision reviews due.
5. Route returns the tagged Dashboard state with `dataRevision` and endpoint-selected `displayPlan`.

### Start or Resume

1. Client sends Task `If-Match` and a fresh `Idempotency-Key`.
2. Route validates the transport and calls one application command.
3. Store transaction checks receipt replay first, then Task precondition and single-active-session invariant.
4. Domain command captures Task/Milestone/Quarter snapshots if needed, appends/starts the Session, updates the status projection, and records the receipt.
5. The durable commit completes once; a fresh Dashboard is projected from committed state.

### Finish

1. The UI opens the Finish sheet and requests Pause first when the Task is running; closing/canceling the sheet leaves the Task Paused. This behavior remains an empirical UX hypothesis and will be tested.
2. Finish validates the outcome and optional reflection.
3. One transaction closes any still-active Session, appends a sequenced Finished event and DailyReview, projects Task status, and stores the command receipt.
4. Response contains immutable completion facts, current Task representation, and fresh Dashboard.

### Quick Thought or contextual Decision

One transaction creates the new JourneyEntry or Draft Decision, validates the link, and captures TaskPlanSnapshot plus containing Milestone/Quarter snapshots if this is the first durable history. Direct Milestone/Quarter links capture their snapshots even without a Task. Plan import never creates authored history.

### Plan preview and apply

Preview strictly parses the normative YAML format, validates it, diffs plan-owned fields, and returns an ephemeral token tied to normalized content plus base plan revision. Apply checks an existing command receipt before token validity, then performs all acknowledged plan-owned changes in one transaction. No execution-owned field is accepted or changed.

### AI review

The application checks receipt replay, reads a minimal target/context snapshot, calls the AIReviewer outside a store transaction, then opens one transaction that checks receipt replay again, revalidates target/link context, and appends the generated AIReview. If a concurrent identical command already won, the unused generated result is discarded and the committed result is replayed. The stub is synchronous; no queue or worker exists.

## Failure boundaries

- Transport validation fails before a use case; no write occurs.
- Domain/precondition conflict aborts the transaction and returns structured Problem Details.
- AI provider failure creates no history and leaves the target unchanged.
- Store validation/write failure publishes no candidate before atomic replace.
- Uncertain post-replace outcome is recovered by retrying the identical idempotency key.
- Invalid, unsupported, or ambiguously missing store data fails closed; no normal UI writes continue.
- Client network failure never causes optimistic status truth. It retains pending feedback, retries safely where allowed, then refreshes Dashboard.
- Unexpected route failures receive a trace ID; private reflection, plan source, and raw AI text are excluded from normal logs.

## Security and privacy baseline

- Loopback-only binding, same-origin frontend/API, Host allowlist, and no permissive CORS.
- Private filesystem permissions where supported.
- CSP and standard secure response headers despite local deployment.
- Strict bounded JSON/YAML bodies and escaped text rendering; user-authored/AI text is never treated as HTML.
- No secrets are required for the StubAIReviewer.
- No telemetry, cloud synchronization, accounts, or third-party calls in v1.

This baseline is appropriate only for the documented local runtime. Exposing the process beyond loopback reopens authentication, authorization, transport security, CSRF, data protection, backup, and operational architecture.

## Intentionally absent

- microservices, message broker, background worker, event bus, CQRS framework
- server-side rendering, WebSockets, persisted timer ticks
- ORM, per-entity repositories, database migrations
- global client state library
- authentication placeholder UI or fake cloud sync
- generic plugin/integration architecture

## Architecture acceptance checks

- Every confirmed journey has one owning feature and application use case.
- Today rules have one server/domain implementation.
- Every mutation is atomic and idempotent where response loss could duplicate history.
- Current plan and historical display context cannot be accidentally interchanged by the client.
- Local no-auth operation cannot silently become network-accessible.
- The initial slice can be built without implementing every planned endpoint.
- Replacing JSON, local-user, or stub-AI adapters does not require rewriting domain policies.
