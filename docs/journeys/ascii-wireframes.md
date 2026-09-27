# ASCII UX Sketches

Status: Historical interaction sketches; hierarchy confirmed and visual direction defined separately
Purpose: Confirm hierarchy, state, and actions before choosing colors or styling

Legend:

- `[ Primary ]` is the one primary action in the current state.
- Plain text actions are secondary.
- `✓`, `○`, and `●` are redundant with text labels; final UI must not rely on symbols or color alone.

## 1. Home / Today

### Alternative A — Focused Today (recommended)

```text
┌──────────────────────────────────────────────────────────────┐
│ Journey                              Q4 2026 · Week 5       │
│ Today      Quarter      Journey      Decisions      Search   │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│ TODAY · TUE 3 NOV                                            │
│ Ready when you are.                                          │
│                                                              │
│ ┌──────────────────────────────────────────────────────────┐ │
│ │ SYSTEMS RELIABILITY                                      │ │
│ │                                                          │ │
│ │ Partial failure                                          │ │
│ │ What happens when the network fails halfway through      │ │
│ │ an operation?                                            │ │
│ │                                                          │ │
│ │ About 45 min                                             │ │
│ │                                                          │ │
│ │                    [ Start session ]                     │ │
│ │                                                          │ │
│ │                     Do 10 minutes                        │ │
│ └──────────────────────────────────────────────────────────┘ │
│                                                              │
│ THIS WEEK                                                    │
│ Mon · Rust setup · finished    Tue · Today    Wed–Fri · Next │
│                                                              │
│ + Thought                           1 decision ready to review │
└──────────────────────────────────────────────────────────────┘
```

Rationale: The task, intent, and Start action are understood without interpreting metrics. Week and decision context remain available but cannot compete.

### Alternative B — Command center (not recommended for Home)

```text
┌──────────────────────────────────────────────────────────────┐
│ Q4 2026                 22h invested            14/48 items  │
├───────────────────┬───────────────────┬──────────────────────┤
│ TODAY             │ THIS WEEK         │ FOCUS AREAS          │
│ Partial failure   │ M ✓ T ○ W ○ ...  │ Paradigm       31%  │
│ [ Start ]         │ 52m this week     │ Reliability    26%  │
├───────────────────┴───────────────────┼──────────────────────┤
│ CONTRIBUTIONS                         │ REVIEWS DUE          │
│ ░ ░ ▒ ▓ ░ ▒ ░ ░ ▓ ▒ ░               │ ADR-1 · overdue      │
├───────────────────────────────────────┴──────────────────────┤
│ RECENT THOUGHTS · PLAN CHANGES · SUCCESS CRITERIA            │
└──────────────────────────────────────────────────────────────┘
```

Trade-off: It exposes breadth but asks the learner to parse a dashboard before starting. It also encourages scores and overdue pressure. Its useful parts belong in Quarter and review views.

### Today with unfinished work

```text
┌──────────────────────────────────────────────────────────────┐
│ TODAY                                                        │
│                                                              │
│ YOUR PLACE IS SAVED                                          │
│ Rust ownership and borrowing                                 │
│ 28 min across 2 sessions · planned Mon 2 Nov                 │
│                                                              │
│                         [ Resume ]                           │
│                                                              │
│ Finish as partial       Skip intentionally                   │
├──────────────────────────────────────────────────────────────┤
│ UP NEXT TODAY                                                │
│ Partial failure · Systems Reliability · about 45 min    View │
└──────────────────────────────────────────────────────────────┘
```

The unfinished item and today’s scheduled item are not equal cards. Resume is the recommendation; today’s plan remains truthful and visible.

### Today on a light/free day

```text
┌──────────────────────────────────────────────────────────────┐
│ TODAY · FRI 27 NOV                                           │
│                                                              │
│ A lighter day is part of the plan.                           │
│                                                              │
│ Reflect: What bugs disappeared because Rust forced a         │
│ stronger guarantee?                                         │
│                                                              │
│                    [ Add a reflection ]                     │
│                                                              │
│ Explore something      Capture a thought      Take the day   │
└──────────────────────────────────────────────────────────────┘
```

This state gives permission to follow the plan’s intentional lightness. It does not fabricate an overdue task.

## 2. Running task

### Alternative A — Focused running state (recommended on Today)

```text
┌──────────────────────────────────────────────────────────────┐
│ TODAY · SYSTEMS RELIABILITY                         RUNNING ● │
│                                                              │
│ Partial failure                                              │
│                                                              │
│                            18:42                             │
│                        about 45m planned                     │
│                                                              │
│                          [ Pause ]                           │
│                                                              │
│ + Thought                                      Finish item   │
│                                                              │
│ Intent                                                       │
│ Design what happens when the network fails halfway through.  │
└──────────────────────────────────────────────────────────────┘
```

The timer counts elapsed time, not time remaining. Pause owns the visual hierarchy; Finish is available but carries more semantic weight.

### Alternative B — Global mini-session bar (recommended only off Today)

```text
┌──────────────────────────────────────────────────────────────┐
│ Partial failure · Running 18:42              [ Pause ] Finish│
├──────────────────────────────────────────────────────────────┤
│ JOURNEY                                                      │
│                                                              │
│ Recent thoughts and reflections...                           │
└──────────────────────────────────────────────────────────────┘
```

Trade-off: It keeps work recoverable across the app but is too compressed to be the main work surface. It complements Alternative A.

## 3. Paused task

```text
┌──────────────────────────────────────────────────────────────┐
│ TODAY · SYSTEMS RELIABILITY                          PAUSED ‖ │
│                                                              │
│ Partial failure                                              │
│ 28 min across 2 sessions                                     │
│                                                              │
│ Your place is saved.                                         │
│                                                              │
│                         [ Resume ]                           │
│                                                              │
│ + Thought                                      Finish item   │
└──────────────────────────────────────────────────────────────┘
```

The app does not ask why the learner paused or when they will return.

## 4. Finish flow

### Alternative A — Outcome then optional takeaway (recommended for testing)

```text
┌──────────────────────────────────────────────────────────────┐
│ FINISH · PARTIAL FAILURE                                     │
│ 38 min across 2 sessions                                     │
│                                                              │
│ How did this session land?                                   │
│                                                              │
│ ( ) Achieved    ( ) Made progress    ( ) Not achieved       │
│                                                              │
│ One thing worth remembering? · optional                      │
│ ┌──────────────────────────────────────────────────────────┐ │
│ │                                                          │ │
│ └──────────────────────────────────────────────────────────┘ │
│                                                              │
│ Cancel                                      [ Finish item ]  │
└──────────────────────────────────────────────────────────────┘
```

Benefits: creates one consistent outcome signal and offers a meaningful note in one compact step. Risk: even three chips may feel like tracker classification.

### Alternative B — Complete immediately, reflect afterward

```text
┌──────────────────────────────────────────────────────────────┐
│                              ✓                               │
│                       Item finished                          │
│                           38 min                             │
│                                                              │
│ Anything worth keeping? · optional                           │
│ ┌──────────────────────────────────────────────────────────┐ │
│ │ What changed, surprised you, or needs another pass?      │ │
│ └──────────────────────────────────────────────────────────┘ │
│                                                              │
│                            [ Done ]                           │
│                                                              │
│ Undo                                                         │
└──────────────────────────────────────────────────────────────┘
```

Benefits: fastest completion and least form-like. Risk: it cannot distinguish achieved versus intentionally closed with partial learning unless inferred from optional prose.

### Completed Today state

```text
┌──────────────────────────────────────────────────────────────┐
│ TODAY                                                        │
│                                                              │
│ Partial failure                                      FINISHED│
│ 38 min · Made progress                                       │
│                                                              │
│ “A timeout contains waiting, but not duplicate side effects.”│
│                                                              │
│                         [ Done for now ]                     │
│                                                              │
│ Add another thought                         View next item    │
└──────────────────────────────────────────────────────────────┘
```

No confetti, points, or pressure to start more work.

## 5. Week summary

```text
┌──────────────────────────────────────────────────────────────┐
│ WEEK 5 · NOV 2–6                                             │
│ Here’s how the week unfolded.                                │
├──────────────────────────────────────────────────────────────┤
│ Mon  Rust setup and Rustlings              Finished     52m  │
│ Tue  Partial failure                       Finished     38m  │
│ Wed  ADR-3 + leadership rep                Finished     61m  │
│ Thu  Delegated service                     Paused       41m  │
│ Fri  AI agent protocols                    Planned       —   │
│                                                              │
│ 4 sessions · 3h 12m · 2 thoughts captured                   │
│                                                              │
│ STILL OPEN                                                   │
│ Delegated service · your place is saved                      │
│                         [ Resume item ]                      │
├──────────────────────────────────────────────────────────────┤
│ OPTIONAL WEEKLY THOUGHT                                      │
│ What should next week remember?                              │
│ ┌──────────────────────────────────────────────────────────┐ │
│ │                                                          │ │
│ └──────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────┘
```

This is an automatically generated account, not a weekly form. There is no “complete review” status.

## 6. Quarter overview

```text
┌──────────────────────────────────────────────────────────────┐
│ Q4 2026 · ENGINEERING GROWTH                   Oct 5–Dec 31  │
│ Own the why. Design the system. Verify reality.              │
├──────────────────────────────────────────────────────────────┤
│ NOW                                                          │
│ Week 5 · Rust foundations · Partial failure                  │
│                                             [ Go to Today ]   │
├──────────────────────────────────────────────────────────────┤
│ FOCUS AREAS                                                  │
│ Different paradigm        Go finished · Rust underway        │
│ Systems reliability      5 experiments · 1 open              │
│ Architecture/leadership  3 ADRs · 3 leadership reps          │
│ AI leverage              4 delegated tasks                   │
├──────────────────────────────────────────────────────────────┤
│ 13-WEEK JOURNEY                                             │
│ W1 ✓ W2 ✓ W3 ✓ W4 · W5 NOW · W6 ○ W7 ○ ... W13 ○          │
├──────────────────────────────────────────────────────────────┤
│ QUARTER INTENT                                               │
│ Success criteria and original plan                      View │
└──────────────────────────────────────────────────────────────┘
```

The overview reports phase and evidence without combining them into a fictional “learning score.” Planned future weeks remain visible but quiet.

## 7. Task/session history

```text
┌──────────────────────────────────────────────────────────────┐
│ ← Week 5                                                     │
│ PARTIAL FAILURE                                  FINISHED    │
│ Systems Reliability · planned Tue 3 Nov · about 45m          │
├──────────────────────────────────────────────────────────────┤
│ OUTCOME                                                      │
│ Made progress · finished Tue 3 Nov at 20:14                   │
│                                                              │
│ “A timeout contains waiting, but not duplicate side effects.”│
├──────────────────────────────────────────────────────────────┤
│ SESSIONS · 38 MIN                                            │
│ 17:42–18:03   21m                                            │
│ 19:57–20:14   17m                                   Edit     │
├──────────────────────────────────────────────────────────────┤
│ THOUGHTS                                                     │
│ 18:01  Retry ownership must be explicit.                     │
│ 20:09  Test the side effect, not only the response.          │
├──────────────────────────────────────────────────────────────┤
│ Reopen item                                                  │
└──────────────────────────────────────────────────────────────┘
```

Session correction exists for forgotten timers or mistakes, but it is contextual—not part of normal daily tracking.

## 8. Journey

```text
┌──────────────────────────────────────────────────────────────┐
│ JOURNEY                                          + Thought   │
│ The record of what you noticed and changed.                  │
├──────────────────────────────────────────────────────────────┤
│ Search thoughts...                        Tags · Date · Task │
├──────────────────────────────────────────────────────────────┤
│ NOV 3 · SYSTEMS RELIABILITY                                  │
│ Retry ownership must be explicit.                            │
│ Related: Partial failure                                     │
│                                                              │
│ NOV 2 · DIFFERENT PARADIGM                 CHANGED MY MIND    │
│ Borrowing feels less restrictive once shared mutation is     │
│ treated as the expensive operation.                          │
│ Related: Rust ownership and borrowing                        │
│                                                              │
│ OCT 30 · GO WRAP-UP                                          │
│ The service needed fewer abstractions than my first design.  │
└──────────────────────────────────────────────────────────────┘
```

The default is chronological meaning, not a database table. Filters support retrieval after capture; they are never required during capture.

### Quick thought overlay

```text
┌──────────────────────────────────────────────────────────────┐
│ ADD A THOUGHT                                             ×  │
│ ┌──────────────────────────────────────────────────────────┐ │
│ │                                                          │ │
│ └──────────────────────────────────────────────────────────┘ │
│                                                              │
│ Related to: Partial failure                         Change   │
│                                                  [ Save ]    │
└──────────────────────────────────────────────────────────────┘
```

The inferred relationship is visible and reversible. There are no required tags or title.

## 9. Decision review

```text
┌──────────────────────────────────────────────────────────────┐
│ ← Decisions                                                  │
│ ADR-1 · Sync vs async workflow              READY TO REVIEW  │
│ Accepted Oct 7 · review planned Nov 4                        │
├──────────────────────────────────────────────────────────────┤
│ ORIGINAL REASONING                                           │
│ Context       ...                                            │
│ Constraints   ...                                            │
│ Options       A ...  B ...                                   │
│ Decision      ...                                            │
│ Consequences  ...                                            │
│ Falsifier     Duplicate work exceeds ...                     │
├──────────────────────────────────────────────────────────────┤
│ REVIEW · NOV 4                                               │
│ What did reality show?                                       │
│ ┌──────────────────────────────────────────────────────────┐ │
│ │                                                          │ │
│ └──────────────────────────────────────────────────────────┘ │
│                                                              │
│ Outcome  ( ) Holds  ( ) Adjust  ( ) Supersede               │
│                                                              │
│ Postpone                                    [ Add review ]   │
└──────────────────────────────────────────────────────────────┘
```

The original reasoning remains immutable. Review creates a dated addendum rather than rewriting hindsight into the original.

## 10. Plan import

### Step 1 — Select and validate

```text
┌──────────────────────────────────────────────────────────────┐
│ UPDATE Q4 PLAN                                               │
│ Review changes before anything is applied.                   │
│                                                              │
│ Drop a YAML plan here or choose a file                       │
│                                                              │
│                      [ Preview changes ]                     │
│                                                              │
│ Completed work and session history can never be removed.     │
└──────────────────────────────────────────────────────────────┘
```

### Step 2 — Human-readable diff

```text
┌──────────────────────────────────────────────────────────────┐
│ PLAN UPDATE PREVIEW                                          │
│ 3 added · 2 changed · 1 removed · 1 preserved                │
├──────────────────────────────────────────────────────────────┤
│ + ADDED                                                      │
│   Dec 8 · Defensive boundary experiment · 45m                │
│   Dec 18 · Team design review · 60m                          │
│                                                              │
│ ~ CHANGED                                                    │
│   Nov 10 · Eventual consistency                              │
│   Date: Nov 10 → Nov 12        Planned: 45m → 60m            │
│                                                              │
│ - REMOVED FROM FUTURE PLAN                                   │
│   Dec 4 · Reactive UI exploration                            │
│                                                              │
│ ! HISTORY PRESERVED                                          │
│   Nov 3 · Partial failure · already finished                 │
│   Incoming title changed; recorded work will not be replaced.│
├──────────────────────────────────────────────────────────────┤
│ Cancel          Calendar preview          [ Apply changes ]  │
└──────────────────────────────────────────────────────────────┘
```

Added/Changed/Removed is the primary representation. A raw Git-style diff may exist as a secondary diagnostic view, not the default.

## Mobile sketches

### Mobile Today — idle

```text
┌────────────────────────────┐
│ Journey          W5     •••│
├────────────────────────────┤
│ TODAY · TUE                │
│ Ready when you are.        │
│                            │
│ SYSTEMS RELIABILITY        │
│ Partial failure            │
│                            │
│ What happens when the      │
│ network fails halfway      │
│ through an operation?      │
│                            │
│ About 45 min               │
│ Do 10 minutes              │
│                            │
│ Mon ✓  Tue Today  Wed Next │
├────────────────────────────┤
│     [ Start session ]      │
└────────────────────────────┘
```

### Mobile Running

```text
┌────────────────────────────┐
│ Partial failure    RUNNING │
│                            │
│           18:42            │
│                            │
│ + Thought                  │
│                            │
│ Intent                     │
│ Design failure halfway     │
│ through the operation.     │
│                            │
├────────────────────────────┤
│  18:42       [ Pause ]     │
│               Finish item  │
└────────────────────────────┘
```

The session control dock replaces normal bottom navigation during active work.

### Mobile Finish — Alternative A

```text
┌────────────────────────────┐
│ Finish item             ×  │
│ 38 min                     │
│                            │
│ How did this session land? │
│ ┌────────────────────────┐ │
│ │ Achieved               │ │
│ │ Made progress          │ │
│ │ Not achieved           │ │
│ └────────────────────────┘ │
│                            │
│ One thing worth keeping?   │
│ ┌────────────────────────┐ │
│ │ Optional               │ │
│ └────────────────────────┘ │
│                            │
│      [ Finish item ]       │
└────────────────────────────┘
```

### Mobile quick capture

```text
┌────────────────────────────┐
│ Add a thought           ×  │
│ ┌────────────────────────┐ │
│ │                        │ │
│ │                        │ │
│ └────────────────────────┘ │
│                            │
│ Related: Partial failure   │
│                   [ Save ] │
└────────────────────────────┘
```

## Interaction hierarchy summary

| Surface/state | Primary action | Important secondary action |
|---|---|---|
| Today, ready | Start session | Do 10 minutes |
| Today, unfinished | Resume | Finish as partial |
| Running | Pause | Finish item; Thought |
| Paused | Resume | Finish item; Thought |
| Finish sheet A | Finish item | Optional takeaway |
| Completed | Done for now | View next item |
| Week with open work | Resume item | Optional weekly thought |
| Quarter | Go to Today | Inspect focus area |
| Journey | Add thought | Search/filter |
| Decision review | Add review | Postpone |
| Plan preview | Apply changes | Cancel/inspect |
