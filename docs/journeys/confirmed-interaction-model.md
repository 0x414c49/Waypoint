# Confirmed Interaction Model

Status: Confirmed on 2026-09-27

This document turns the journey exploration into one coherent UX direction. The earlier alternatives remain in `core-journeys.md` and `ascii-wireframes.md` as decision history.

## Core model

The product has one state-aware **Today** stage. The learner never manages a status directly; actions change the state as a natural consequence.

```text
READY ──Start──> RUNNING ──Pause──> PAUSED
                    │                  │
                    └────Finish────────┘
                              │
                              v
                     OUTCOME + OPTIONAL NOTE
                              │
                              v
                          FINISHED
```

Resume moves Paused back to Running. Reopen is a contextual history action, not part of the normal daily path.

## One primary action by state

| State | Primary action | Secondary actions |
|---|---|---|
| Ready | Start session | Do 10 minutes; skip intentionally |
| Running | Pause | Thought; Finish item |
| Paused | Resume | Thought; Finish item |
| Finish sheet | Finish item | Optional takeaway; cancel |
| Finished | Done for now | Add thought; view next item |
| Light/free day | Add a reflection, when prompted by plan | Explore; Thought; take the day |

## Today selection policy

The app recommends one item using current reality before calendar order:

1. An actively running item always owns Today.
2. A paused or unfinished item becomes **Your place is saved** with Resume.
3. Today’s scheduled item appears as **Up next** while unfinished work is open.
4. With no open item, today’s scheduled plan item becomes the Ready item.
5. On a conditional Friday, open/catch-up work is recommended before optional exploration.
6. A date with no eligible Default/When-clear work—such as an explicit rest, holiday, or empty date—stays light; the app does not manufacture work merely from the calendar or Milestone label.
7. An explicitly Optional plan item may appear as **Only if useful**, but it never becomes the primary Ready hero or future backlog debt on its own.

This is a recommendation policy, not a lock. Secondary actions allow intentionally closing/skipping open work or opening the next item.

## Start, pause, and resume

- Start begins a session immediately in one interaction.
- Pause ends the current session immediately in one interaction.
- Resume begins a new session immediately in one interaction.
- Only one session may be active for the current user.
- If another item is active, offer exactly two choices: **Pause current and switch** or **Cancel**.
- Refresh and navigation restore state from recorded timestamps.
- The visible timer counts elapsed time; planned time is approximate guidance, never a countdown.
- A compact active-session bar appears outside Today, but the full task is not pinned everywhere.

## Finish

Finish Alternative A is selected.

1. Selecting **Finish item** stops an active session and opens one compact sheet.
2. The learner selects one outcome:
   - Achieved
   - Made progress
   - Not achieved
3. The learner may add one optional takeaway: **One thing worth remembering?**
4. **Finish item** closes the item.
5. A short-lived Undo action protects against accidental completion without a routine confirmation dialog.

The complete interaction must remain under 20 seconds in the normal case. If the outcome labels require explanatory copy, the flow must be simplified rather than expanded.

## Unfinished work

- Keep the original item, planned date, and accumulated sessions.
- Do not automatically move its date or create a copy.
- Resume it as the primary item on return.
- Show today’s scheduled work as Up next.
- Allow **Finish as partial** and **Skip intentionally** without guilt language.
- A linked continuation is an explicit future action only when the learner intentionally splits the work.

## Low-energy session

**Do 10 minutes** starts a normal session on the same item with a smaller intention. It does not change planned minutes, create a reduced task, preserve a streak, or auto-finish the item. At ten minutes the app may quietly offer Continue, Pause, or Finish.

## Quick thought

- A visible **+ Thought** action is available globally.
- One interaction opens a focused text composer.
- The active item is inferred as context and shown as a reversible link.
- No title, category, tag, or relationship is required.
- A keyboard shortcut may accelerate capture later but cannot be the only entry point.

## Weekly review

- Generated automatically from planned items, sessions, outcomes, thoughts, and decisions.
- Leads with what happened, what remains open, and what was learned.
- Asks at most one optional reflection question.
- Has no completion status and no required ritual.
- Uses no streaks, success percentage, red missed days, or aggregate learning score.

## Decision review

- Appears as a quiet secondary Today notice and in Decisions.
- Never displaces the current learning action.
- Preserves original reasoning verbatim.
- Adds a dated review outcome rather than editing history.

## Decision creation

- A planned ADR Task may contain a `decisionPrompt` with stable Decision ID, suggested title, and optional initial review date.
- Plan import stores the prompt only; it never creates authored reasoning.
- **Start decision draft** is a contextual secondary action on that Task.
- Creating the Draft atomically links it to the Task and captures Task/Milestone/Quarter snapshots if needed.
- Accept is explicit and freezes original reasoning.
- Task Finish and Decision Accept never trigger each other silently.

## Plan update

- Preview uses Added, Changed, Removed from future plan, and Historical item preserved.
- Completed or in-progress history is never deleted or rewritten.
- Stable plan IDs determine identity; titles do not.
- Active-item conflicts require an explicit choice before apply.
- Raw diff and calendar placement are secondary inspection tools.

## Language rules

Use plain verbs for controls: Start, Pause, Resume, Finish, Skip, Add thought.

GitHub is a structural metaphor, not role-play. “Merged” may appear subtly in history, but the learner should not have to translate Git vocabulary to use the product.

Avoid:

- overdue, failed day, broken streak, get back on track
- productivity score, learning score, consistency score
- celebratory noise, guilt, and exaggerated encouragement
- percentage-complete fields for learning quality

## Final screen inventory

Top-level:

- Today
- Quarter
- Journey
- Decisions

Global utilities:

- Search
- Quick Thought
- Settings/account menu

Contextual surfaces:

- Running/Paused Today states
- Finish sheet
- Task/session history
- Week summary
- Decision review
- Decision draft/editor
- Plan preview/apply

No additional top-level destination should be added without product review.
