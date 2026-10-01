# Product Compass

Status: Confirmed on 2026-09-27
Last updated: 2026-09-27

## One sentence

Waypoint is a private learning companion that turns a structured growth plan into one obvious daily action while quietly preserving effort, insights, technical choices, and change over time.

## The problem

A good quarterly learning plan explains intent, but it cannot help in the moment. During a busy week, the learner still has to decide what to do now, remember where they stopped, track time, recover unfinished work, and reconstruct what they learned.

Generic habit trackers flatten meaningful engineering growth into checkmarks. Project-management tools introduce statuses, forms, and upkeep. Notes capture thinking but do not create momentum. Combining all three makes the learner maintain a system instead of learning.

## Product promise

When the learner opens the app, it should already understand the plan, the date, and the latest work state. It should offer the next sensible action without demanding administration.

The daily loop is:

> Open → see what matters now → start → work → pause/resume if needed → finish → tiny reflection → done.

## Primary user

An experienced engineer following a deliberate quarterly growth plan alongside real work. The first version serves one local user. The domain should not make later multi-user support painful, but v1 has no authentication or multi-user UI.

## The job to be done

> When I have time to learn, help me begin the right thing immediately, remember the work automatically, and show me how my thinking is changing—without making me manage a tracker.

## Product personality

- Friendly, calm, and matter-of-fact
- Precise enough for an engineer
- Encouraging without praise theater
- Flexible when real life changes the plan
- Interested in learning quality, not activity for its own sake

The app may say: **“Here’s what you planned. Ready?”**

It should never imply: **“You are behind; repair your streak.”**

## North-star behavior

The learner returns because starting is easier than remembering and organizing the work alone—not because a streak, badge, or notification pressures them.

## Core principles

1. **Action before administration.** The current learning item and its one primary action come first.
2. **The plan supplies intent.** The user should not recreate planned work as tracker entries.
3. **Tracking is a by-product.** Sessions create time history; completion creates progress; reflection creates the learning record.
4. **One obvious action per state.** Start, Pause, Resume, or Finish—not a menu of statuses.
5. **Capture first, organize later.** A thought requires no category, tag, or link before typing.
6. **History remains truthful.** Plan changes may affect future work but never rewrite completed learning.
7. **Recovery is normal.** Unfinished work, low-energy days, and changed plans are expected states, not failures.
8. **Reflection is tiny by default.** The app invites one useful thought and allows deeper writing without requiring it.
9. **Advanced work stays contextual.** ADRs, plan import, and detailed history do not crowd the daily path.
10. **No guilt mechanics.** No streak anxiety, shame language, meaningless scores, or celebratory friction.

## Product metaphor

GitHub provides a useful structural metaphor, used quietly:

| Learning concept | Structural metaphor | User-facing language |
|---|---|---|
| Quarter | Project/release | Quarter |
| Focus area | Workstream | Focus area |
| Week | Milestone | Week |
| Daily item | Pull request | Learning item |
| Work session | Commit | Session |
| Daily reflection | Review | Reflection |
| Completion | Merge | Finish, with a subtle “merged” result |
| Engineering choice | ADR | Technical choice |
| Activity history | Contribution graph | Activity |

Normal language wins whenever Git terminology would require explanation.

## What the Q4 example teaches us

The representative plan includes more than repeated habits:

- Dated weekly work across four stable focus lanes
- Different forms of work: study, experiments, building, ADRs, leadership reps, delegation, and retrospectives
- Light and buffer weeks where rest or catch-up is intentional
- Quarter-level outcomes that cannot be reduced to task counts
- Decisions that must be revisited without changing their original reasoning
- A plan that may evolve while its execution history must remain true

Therefore the product must support structured intent without forcing every item into the same completion ritual. A 45-minute technical experiment and a leadership conversation can share the same simple session loop while keeping different context.

## Success signals

These are product targets, not observed facts. They are tested through the [validation plan](../../planning/validation-plan.md) during the relevant implementation slice.

- The primary action is understood within three seconds.
- Start, Pause, and Resume each take one interaction.
- Normal completion takes under 20 seconds.
- Actual effort is derived from sessions, never manually maintained.
- Unfinished work is visible without searching.
- A low-energy day can remain meaningful without gaming completion.
- Weekly review is generated from existing activity and asks at most one useful question.
- After a quarter, the record explains not only what was done but what changed in the learner’s thinking.

## Failure signals

- The learner must choose or maintain statuses.
- The home screen becomes a dashboard of metrics.
- Starting requires opening a task detail page or form.
- Reflection becomes mandatory journaling.
- The user creates entries already present in the plan.
- Plan changes overwrite completed or in-progress history.
- The product uses streak loss, red overdue counts, points, or badges to create pressure.
- The tracker takes more thought than a timer plus notes app.

## Explicit non-goals for v1

- General-purpose project management
- General-purpose habit creation
- Team assignment or performance reporting
- Authentication, permissions, billing, or social features
- Calendar/email integrations, notifications, or cloud sync
- Gamification, streak targets, leaderboards, or wellness scoring
- AI agents that change plans, records, or reflections
- Complex analytics, prediction, or recommendations
- A plugin framework or speculative infrastructure

## Decision test

Before adding a feature or field, ask:

1. Does it help the learner start, continue, finish, reflect, or understand the journey?
2. Can the system infer it from the plan or normal actions?
3. Does it add a choice to the daily path?
4. What current problem does it solve?
5. Would removing it make the learner’s work harder—or only make the product less feature-rich?

If the value is hypothetical or the user must maintain it, leave it out.
