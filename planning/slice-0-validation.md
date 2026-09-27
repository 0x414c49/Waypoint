# Slice 0 Validation Note

Date: 2026-09-27
Status: Passed by the implementation agent and independent arbiter
Environment: macOS, local workspace; dependency contract targets Node.js 24 LTS. Automated verification ran on the available Node.js 26.8.2 host and npm 11.19.1, so Node 24 remains the release-runtime check.

## Observed scenarios

- Strict TypeScript, ESLint, unit/integration tests, and production build completed successfully.
- The validated no-history seed initialized atomically with private directory/file permissions and the canonical local user.
- Missing authority markers, interrupted initialization, corrupt primary data, unsupported schemas, and arbitrary not-yet-modeled domain records failed closed.
- Failure before primary replacement preserved the prior primary; failure after replacement reported uncertain durability while leaving a valid committed revision.
- A valid rolling backup was reported but not automatically restored.
- `PLAN_APPLY` could not alter execution/history records, and normal or plan transactions could not alter the seeded local user.
- The loopback HTTP boundary accepted both documented local hosts, rejected foreign hosts and untrusted/missing mutation origins, set security headers, exposed no CORS allowance, and returned Problem Details for oversized and unknown requests.
- Playwright ran the same-origin production shell at desktop and 360px mobile viewports. Light and dark axe-core scans reported no detectable violations in either viewport, `/api/me` resolved from the same origin, and no product navigation or Slice 1 action was exposed.

## Evidence

- Typecheck: passed.
- Lint: passed with zero warnings.
- Vitest: 23 tests passed.
- Production build: passed; initial JavaScript was 83.24 KiB compressed, below the 200 KiB target.
- Playwright: 2 tests passed (desktop and mobile).
- Dependency audit: 0 known vulnerabilities at installation time.

## Limitations and follow-up

- Automated accessibility checks do not replace manual keyboard, screen-reader, contrast, and zoom review; the product flows that need those checks begin in Slice 1.
- The host did not provide Node.js 24, so the same checks should be repeated on Node.js 24 before treating the runtime contract as release-proven.
- Slice 0 intentionally rejects non-user domain records. Slice 1 must introduce each real entity schema and transition invariant before loading the Q4 production seed.
