# Architecture

Product behavior, UX, visual direction, domain model, API, and persistence behavior are confirmed. Domain documentation:

- [Domain and data model](domain-model.md)
- [Task lifecycle and invariants](task-lifecycle.md)
- [Plan updates and historical truth](plan-and-history.md)
- [Domain model review](domain-model-review.md)
- [Temporal attribution and historical summaries](temporal-attribution.md)

The confirmed API/persistence checkpoint is documented in:

- [REST API contract](api-contract.md)
- [Dashboard contract](dashboard-contract.md)
- [Error and conflict contract](error-contract.md)
- [Persistence contract](persistence-contract.md)
- [API and persistence review](api-review.md)

The proposed final system architecture is documented in:

- [System design](system-design.md)
- [Technology stack](technology-stack.md)
- [Architecture review](architecture-review.md)
- [Architecture decision records](../adr/README.md)

Implementation remains gated by `planning/implementation-gate.md`.

The design tracks three intentionally small seams:

- `JourneyStore`
- `CurrentUserProvider`
- `AIReviewer`

All three seams and their v1 adapters are specified in the system design. These remain design constraints, not authorization to begin implementation before the final gate.
