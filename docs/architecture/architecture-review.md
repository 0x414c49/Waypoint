# Architecture Review

Status: Independent architecture review passed; awaiting explicit implementation-gate approval

## Review outcome

The proposed modular monolith is proportionate to the product: one private learner, one local process, one authoritative store, and clear seams for user resolution and AI generation. It preserves the confirmed domain and API boundaries without introducing distributed-system machinery.

## Cross-gate findings resolved

| Finding | Resolution |
|---|---|
| No normative representation of the supplied plan | Added versioned YAML contract, complete in-range schedule fixture, and mapping review. |
| Decision creation absent from the UX/API path | Added contextual Draft creation from a Task decision prompt; import remains side-effect free. |
| Weekly/historical attribution ambiguous | Added explicit temporal-attribution rules and period-end status. |
| Reviewed Decision could become due from its old initial date | Latest review now solely controls future due scheduling; null clears it. |
| Task status called rebuildable without an algorithm | Lifecycle projection now defines ordered event validation and deterministic status. |
| Receipt could not reproduce an “original response” | Receipt stores immutable outcome facts; replay combines them with current representations. |
| Missing store could be mistaken for first run | Explicit store marker and initialization/recovery states added. |
| Cross-process JSON locking overreached | V1 is explicitly one fixed-port loopback process with an in-process write mutex. |
| Settings promised unsupported domain mutations | V1 Settings now contains appearance and read-only support information only. |
| Dashboard lacked first-run/between-quarter shape | Added Onboarding, nullable Quarter, and quiet between-quarter Light states. |
| Historical/current plan display left to the client | API now supplies `displayPlan` and its source per endpoint. |
| Architecture/decision links could bypass snapshots | Linking commands capture Task, Milestone, and Quarter snapshots atomically. |
| Full API made initial delivery too broad | Scope is split into small vertical slices with the daily heart first. |
| Holiday/light tasks would become required-looking work | Added `OPTIONAL`; such items remain quiet context and never create a Ready hero or debt. |
| Milestone edits could rewrite historical period boundaries | Added immutable MilestoneIntentSnapshot and direct-link capture triggers. |
| Plan removal ignored non-Task references | Tombstone rules now cover JourneyEntry, WEEK AIReview, snapshots, and all Task references. |
| Store could not infer exceptional write authority | Added a closed transaction-intent capability for plan apply, exact Journey deletion, and migration. |
| Tracked `data/` conflicted with first-run detection | Defaulted storage to absent `data/store`, defined abandoned-init recovery, and documented the canonical seed. |
| Final gate summary was not a navigable consolidated review | Expanded it with choices/rejections, final ASCII states, exact visual tokens, domain/API/architecture/scope evidence, and direct links. |
| Slice 1 promised a contribution update without a contract | Added a server-derived 14-day Dashboard activity preview and a matching longer-range Activity read for Slice 2. |

## Constraint check

- **Simple:** one process, one package, three domain-facing ports.
- **Friendly:** Today remains the primary read model; infrastructure is invisible in normal use.
- **Safe:** atomic writes, fail-closed validation, explicit recovery, conditional requests, idempotent commands.
- **Evolvable:** transport, domain, and adapters are separated at real change boundaries.
- **Honest:** responsive mobile layout is promised; networked mobile access is not promised without authentication.

## Residual risks to prove in code

- Atomic-replace and directory-flush behavior varies by operating system and must be exercised with adapter integration tests.
- Browser close during Finish-sheet pause may feel surprising; usability testing decides whether the confirmed technical behavior is the right interaction.
- A one-document store remains appropriate only at personal scale; measure load/write latency before optimizing.
- TypeBox transport schemas must not leak into domain types or make domain validation dependent on Fastify.
- Automated accessibility checks require manual complements.

None requires speculative infrastructure before the first vertical slice. Each has a named validation check rather than an assumption disguised as completion.

## Recommendation

Approve this architecture for implementation under the staged scope. Reopen the architecture gate before enabling non-loopback access, real authentication, external AI, multi-process serving, or replacing the store adapter.
