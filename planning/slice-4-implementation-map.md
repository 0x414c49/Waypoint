# Slice 4 Implementation Map — Plan lifecycle and Quarter

Status: **Passed** on 2026-09-29 after the final neutral review
Baseline: 2026-09-29, clean at `1f2669a`; Node.js 26.10.0 / npm 11.19.1
Learner problem: keep the Quarter plan useful as intent changes, while making import consequences predictable and preserving every lived fact.

## Confirmed boundary

Deliver strict YAML validation, read-only create/update preview, explicit history explanations and required active-work acknowledgements, atomic/idempotent plan apply, current-intent-only normalized export, working Quarter overview and Focus Area/Milestone navigation, success criteria, between-quarter state, and a functional empty-store onboarding route. Keep the production Q4 seed and existing Today loop. Do not add Search, AI, generic task editing, manual progress, plan version history, or new trust boundaries.

## Ownership and approach

- **Domain/application:** reuse `parseAndNormalizePlanYaml`, record schemas, `JourneyStore` and its `PLAN_APPLY` intent. Add a plan command/query service that projects semantic changes, owns short-lived preview tokens, performs receipt-first serialized apply, and exports only normalized current intent.
- **HTTP/shared contract:** add strict contracts and routes for plan preview/apply/export and Quarter collection/detail. Keep the documented 2 MiB preview-wrapper/1 MiB YAML limits independent of the default request limit; map overlaps, stale revisions, missing acknowledgements, and expired previews to stable Problem Details.
- **Client:** add a responsibility-focused Quarter feature for overview/import/preview/export. Expose Quarter in both navigation bars only with real overview/import destinations. Connect the existing no-plan Today state to import, without changing the primary daily action when a plan exists.
- **History boundary:** `PLAN_APPLY` may modify only plan-owned fields on Quarter/FocusArea/Milestone/Task. It may not add/change execution-owned state or any snapshots, including on newly created plan records. Preserve snapshot/history-linked entities as tombstones and keep historical views on captured context.

## Known risks / arbiter findings

1. Existing store transition validation skips execution-owned fields on newly added plan records. Close this at the persistence boundary and add regression tests before relying on the use case.
2. Retry must find a matching command receipt before checking preview expiry or the now-changed plan revision; same-key/different-body reuse must conflict.
3. Apply-time identity and date-overlap checks must include the full validated store and run under the store mutex; preview alone is not an authorization to commit stale data.
4. The no-history seed and an explicitly empty store are different supported starting states. Preserve the Q4 production seed; make empty-store import functional.
5. The YAML contract allows no Milestones for an empty Quarter; require a Milestone only when Tasks make the Quarter non-empty.
6. Do not fabricate snapshots, sessions, completion, Decisions, reflections, or receipts during import other than the one apply command receipt.

## Baseline evidence

- `git status --short --branch`: clean (`## main`); HEAD `1f2669a`.
- `npm run check`: passed (96 tests / 31 files, typecheck, lint, production build).
- `npm run test:browser`: passed (9 passed, 3 intentional mobile skips).
- Production client output: 332.88 kB raw / 99.66 kB gzip at baseline.

## Delivered gate result

- Plan preview/apply/export and Quarter routes/UI are complete; the import/apply history boundary has regression coverage including a Task starting after Preview.
- Final `npm run check`: 119 tests across 35 files passed; final `npm run test:browser`: 13 passed, 3 intentional mobile mutation skips; `git diff --check` passed.
- Final client output: 349.43 kB raw / 103.99 KiB gzip.
- Independent final review: PASS. Remaining human/device/runtime evidence is listed honestly in [Slice 4 validation](slice-4-validation.md).

## Exact Slice 4 gate evidence to collect

- Strict parser regressions and normative fixture contract/count/range assertions.
- Service/store tests for diff classifications, history-preserving change/removal/re-add, active acknowledgements, no mutation on preview/failure, atomic revision update, idempotent replay, stale/expired requests, concurrent apply, ID collision, Quarter overlap, create mode, and export/reimport empty semantic diff.
- HTTP contract tests for size limits, unknown fields, documented response/error behavior, ETag/attachment headers, and no execution data in exports.
- UI/browser tests for Quarter navigation and canonical links, empty-store onboarding, create/update preview, history-preservation copy, active acknowledgement, validation/cancel behavior, export, and Q4 fixture review.
- Keyboard/focus, axe, light/dark, desktop/360px reflow, failure paths, and personal-scale timing checks; finish with a neutral history/concurrency/accessibility/scope review.
- Record environment, exact results, skipped/manual limitations, and disposition in `planning/slice-4-validation.md`; update stage and usage status; commit this gate separately before any later slice.
