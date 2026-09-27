# Visual and Information Architecture Review

Status: Confirmed on 2026-09-27

## Outcome

The proposed Quiet Workshop visual system and four-destination information architecture support the confirmed interaction model without adding daily choices. The project should not enter domain/data design until this direction is confirmed.

## Product-compass check

| Guardrail | Result | Evidence |
|---|---|---|
| One obvious primary action | Pass | Only the current state action is accent-filled. |
| Starting remains one interaction | Pass | Start lives directly on Today; task detail is optional. |
| Tracking stays a by-product | Pass | No timesheet or Sessions destination; history is contextual. |
| Advanced work stays outside daily path | Pass | Plan update belongs to Quarter; decision review is quiet/contextual. |
| No guilt mechanics | Pass | Skipped/light days are neutral; no streaks, red missed days, or goals. |
| GitHub-inspired, not copied | Pass | Compact structure and contribution texture remain; warmer neutrals and teal create a distinct identity. |
| Mobile is prioritized, not compressed | Pass | Four bottom destinations, thumb-reachable action dock, mobile sheets, and stable navigation. |
| History stays meaningful | Pass | Journey owns lived history; Decisions preserves original reasoning and append-only reviews. |

## Q4 representative scenarios

### Normal Monday

Today presents the plan item as the single hero. Start is the only filled control. Quarter context and week progression remain outside the primary surface.

### Bundled Wednesday ADR + leadership rep

The umbrella learning item can show both pieces as plan context in the hero/task detail without creating multiple competing Today cards. Decisions links to the canonical ADR; Today still owns the action.

### Unfinished work collides with today

The original item becomes **Your place is saved** with Resume. Today’s scheduled item is one restrained Up next row. Warning color is limited to the Paused label; the page never reads as overdue.

### Conditional Friday

Today recommends open/catch-up work when it exists. Otherwise it presents the optional exploration. The light-day state uses the same visual hierarchy and no alert styling.

### Holiday/light week

The page uses calm body copy and a legitimate optional action. No empty-state illustration, red gap, streak, or invented task creates pressure.

### Quarter retro

Quarter supplies plan intent; Journey supplies lived evidence; Decisions supplies original reasoning and review outcomes. The retro can reference all three without adding a separate Analytics destination or composite learning score.

## Accessibility evidence

Representative contrast ratios were calculated against the proposed token pairs:

| Pair | Ratio |
|---|---:|
| Light primary text / canvas | 14.66:1 |
| Light secondary text / surface | 5.53:1 |
| Light on-accent / accent | 6.38:1 |
| Dark primary text / canvas | 15.83:1 |
| Dark secondary text / surface | 8.01:1 |
| Dark on-accent / accent | 8.29:1 |
| Light success text / success-soft | 5.87:1 |
| Light warning text / warning-soft | 5.51:1 |
| Dark success text / success-soft | 7.72:1 |
| Dark warning text / warning-soft | 7.50:1 |

These representative combinations meet WCAG AA for normal text. Component-level contrast, keyboard order, screen-reader names, zoom/reflow, reduced motion, and touch behavior still require verification during implementation.

## Resolved tensions

- **GitHub density vs friendliness:** keep compact lists and familiar structure; warm the canvas and language rather than adding decoration.
- **Mobile focus vs navigation:** Pause/Resume dominates a dock, but navigation remains available during long sessions.
- **Contribution history vs gamification:** show session-time texture with accessible date/duration; exclude streak and ranking interpretations.
- **Decisions as core vs infrequent:** retain the destination for now because it expresses engineering growth; revisit only with real usage evidence.
- **Quick capture vs action competition:** global utility in the header and contextual action during work; no floating button competing with Start/Pause.

## Rejected directions

- Direct GitHub visual copy
- Pastel wellness/habit tracker
- Multi-card command-center dashboard
- Permanent desktop sidebar for four destinations
- Six-tab navigation including Search and Settings
- Mobile focus mode that traps the user by hiding navigation for the whole session

## Confirmed direction

Confirmed together:

1. **Quiet Workshop:** warm neutral surfaces, deep teal accent, compact native typography, radii capped at 8px.
2. **Four destinations:** Today, Quarter, Journey, Decisions.
3. **Utilities:** Thought and Search in the header/overlay; Settings in overflow.
4. **Responsive behavior:** bottom navigation remains accessible while the active-session dock sits above it.

The next stage is the domain/data model: conceptual ownership, invariants, history preservation, and state transitions. Production UI remains blocked.
