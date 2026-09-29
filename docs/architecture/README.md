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

The accepted system architecture is documented in:

- [System design](system-design.md)
- [Technology stack](technology-stack.md)
- [Architecture review](architecture-review.md)
- [Architecture decision records](../adr/README.md)

Implementation was authorized by `planning/implementation-gate.md`; delivered slices and their validation notes are tracked in `planning/`.

The design tracks two intentionally small seams:

- `JourneyStore`
- `CurrentUserProvider`

All three seams and their v1 adapters are specified in the system design. They keep the current local-first implementation modular without introducing speculative infrastructure.
