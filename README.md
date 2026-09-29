# Engineering Journey Tracker

A quiet, friendly learning companion for turning an engineering growth plan into a sustainable daily habit.

The product is intentionally **not** a project-management system or a data-entry tracker. Its normal loop should be:

> Open → see what matters now → start → learn → pause or finish → leave one small reflection → done.

## Run and use it

With Node.js 24 installed, run `npm install` and `npm run dev`, then open `http://127.0.0.1:5173`.

The daily workflow, Quarter plan preview/export, local-data location, Journey activity calendar, and Decisions flow are explained in [Using the app](docs/using-the-app.md).

## Current stage

The project has confirmed product, UX, visual, domain, API, and persistence behavior. The consolidated implementation review passed independent A/B verification and was explicitly approved on 2026-09-27. Slices 0–5 are complete: executable foundation, daily learning loop, lived Journey, durable Decisions, history-safe plan lifecycle with Quarter navigation, global Search, and a bounded local AI-review seam. The v1 completion boundary is reached.

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
21. [Representative Q4 mapping review](planning/q4-plan-mapping-review.md)
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

## Working rule

Each stage must leave a written decision behind. Later work must cite those decisions, and any change to a confirmed decision must be recorded in [the decision log](planning/decision-log.md).

Implementation follows the approved consolidated gate and must pass each slice's evidence checks before the next slice begins.
