# Technology Stack

Status: Proposed for the consolidated implementation gate

## Selected stack

| Concern | Choice | Why it fits this product |
|---|---|---|
| Runtime | Node.js 24 LTS | One current supported runtime for the server and build tools; no split-language overhead. |
| Language | TypeScript, strict mode | Shared transport types and safer domain transitions without a separate schema language for application code. |
| Client | React + Vite + React Router | Small client-rendered app, fast development, route-level feature boundaries, no SSR requirement. |
| Server | Fastify | Small HTTP surface, explicit plugins, test injection, schema-oriented transport boundary. |
| Contracts | TypeBox/JSON Schema | One runtime-validatable schema can drive Fastify validation and inferred TypeScript transport types. |
| Plan parsing | `yaml` with strict safety options | Mature YAML parsing while the application supplies the normative unknown-field and domain validation. |
| Styling | CSS custom properties + co-located CSS Modules | Quiet Workshop tokens without a utility framework or runtime styling layer. |
| Unit/integration tests | Vitest + React Testing Library + user-event | One fast TypeScript test runner and behavior-focused component tests. |
| Browser tests | Playwright + axe-core, plus manual checks | Covers the daily loop across viewports; automated accessibility checks are useful but incomplete. |
| Packaging | One root npm package and lockfile | Client/server/shared folders do not yet justify workspace/versioning overhead. |

Exact dependency versions are selected and committed at scaffolding time after compatibility checks; this document chooses technologies, not floating version ranges.

## Evidence

- The [Node.js release table](https://nodejs.org/en/about/previous-releases) lists Node 24 as an LTS line on the architecture date.
- React's [build-from-scratch guidance](https://react.dev/learn/build-a-react-app-from-scratch) presents Vite as a build-tool option and React Router as a routing option for client applications.
- Vite's [production build guide](https://vite.dev/guide/build) supports the static client bundle served by the one production server.
- Fastify documents [testing through `inject()`](https://fastify.dev/docs/latest/Guides/Testing/), [schema-based validation/serialization](https://fastify.dev/docs/latest/Reference/Validation-and-Serialization/), and an official [`@fastify/type-provider-typebox` option](https://fastify.dev/docs/latest/Reference/TypeScript/).
- Playwright's [accessibility testing guidance](https://playwright.dev/docs/accessibility-testing) explicitly notes that automated checks find only some accessibility problems; the validation plan therefore retains manual keyboard, focus, zoom, and screen-reader checks.

## Deliberate exclusions

- No Next.js/SSR: Today is a private local application, not a search-indexed content site.
- No Redux/Zustand: server-resolved Dashboard plus feature-local UI state is sufficient; add a client store only when measured coordination requires it.
- No Tailwind/component suite: the custom visual system is small and token-driven.
- No ORM/database driver: JsonJourneyStore is the confirmed v1 adapter.
- No service container framework: explicit constructor/factory wiring is clearer at this size.
- No native file-lock package: the runtime is explicitly single-process.
- No production AI SDK in v1: AIReview ships behind a deterministic stub port.

## Dependency rule

Add a library only when it removes demonstrated risk or substantial code in the current slice. A dependency must have a named owner, narrow purpose, test coverage at its boundary, and no authority to bypass domain/store invariants.
