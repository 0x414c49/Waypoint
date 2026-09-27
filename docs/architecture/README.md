# Architecture

Product behavior, UX, visual direction, and the domain/data model are confirmed. Domain documentation:

- [Domain and data model](domain-model.md)
- [Task lifecycle and invariants](task-lifecycle.md)
- [Plan updates and historical truth](plan-and-history.md)
- [Domain model review](domain-model-review.md)

The proposed API/persistence checkpoint is documented in:

- [REST API contract](api-contract.md)
- [Dashboard contract](dashboard-contract.md)
- [Error and conflict contract](error-contract.md)
- [Persistence contract](persistence-contract.md)
- [API and persistence review](api-review.md)

Wider system architecture and implementation remain gated.

The design tracks three intentionally small seams:

- `JourneyStore`
- `CurrentUserProvider`
- `AIReviewer`

`JourneyStore` is specified in the persistence checkpoint. `CurrentUserProvider`, `AIReviewer`, and the full component design remain for the next architecture stage. These are not implementation instructions yet.
