# Visual System — Waypoint

Status: Replaced and revised on 2026-09-29
Depends on: `docs/journeys/confirmed-interaction-model.md`

## Direction

**Waypoint** is a private engineering-learning log. Its interface combines developer-tool clarity with a personal, reflective record. An original route-and-checkpoint mark names the four destinations and makes a change of direction part of the visual identity.

Distinctiveness comes from:

- blue-gray instrument color rather than copied GitHub green
- a visible icon and word for each of the four destinations
- a clear, first-position “Start session” action on Today
- compact evidence/history rows, with longer material disclosed when useful
- optional feeling notes, not a progress score

Avoid gradients, glass effects, giant whitespace, oversized radii, decorative Git motifs, and card grids. Journal images are stored locally beside the JSON data; formatted writing is stored as Markdown.

## Visual principles

1. **One accent action.** Only the current primary action receives the filled accent treatment.
2. **Hierarchy through type and space.** Borders and fills support structure; they do not create it alone.
3. **One hero surface.** Today has one bordered work surface. Secondary content is separated by spacing or rules, not nested cards.
4. **Color communicates with words.** Every state has a text label and, when helpful, an icon in addition to color.
5. **Compact is not cramped.** Information density may increase on desktop, but readable type and touch targets remain protected.
6. **Time is evidence, not a score.** Elapsed time is prominent only while work is active.
7. **Motion confirms; it does not celebrate.** No confetti, streak animation, pulsing urgency, or attention loops.

## Typography

Use Avenir Next where available, with system sans-serif fallbacks. Timer numerals alone use system monospace.

```css
--font-sans: "Avenir Next", "Segoe UI Variable", "Segoe UI", system-ui, sans-serif;
--font-mono: ui-monospace, SFMono-Regular, Menlo, Consolas,
  "Liberation Mono", monospace;
```

Let the operating system and browser choose native text rasterization; do not
apply global font-smoothing overrides.

| Role | Desktop size / line | Mobile size / line | Weight | Use |
|---|---:|---:|---:|---|
| Display | 36 / 44px | 30 / 38px | 600 | Rare quarter/empty-state statement |
| Heading 1 | 30 / 38px | 26 / 34px | 600 | Page title |
| Hero title | 22 / 30px | 22 / 30px | 600 | Current learning item |
| Heading 2 | 16 / 24px | 16 / 24px | 600 | Section heading |
| Body large | 16 / 24px | 16 / 24px | 400 | Important description or prompt |
| Body | 15 / 22px | 15 / 22px | 400 | Default prose |
| Compact UI | 14 / 20px | 14 / 20px | 400 | Navigation, rows, controls |
| Small | 13 / 18px | 13 / 18px | 400 | Secondary supporting text |
| Metadata | 12 / 16px | 12 / 16px | 600 | Dates, focus labels, state labels |
| Timer | 40 / 48px | 36 / 44px | 600 | Active elapsed time only |

Rules:

- Buttons use Compact UI at weight 600 and sentence case.
- Labels use sentence case; avoid all-caps decoration.
- Timer numerals use the monospace stack with tabular numbers.
- Monospace is otherwise limited to code and ADR identifiers. It is not decorative “developer styling.”
- Default body text remains at least 15px. Do not shrink content to make a dense design fit.

## Spacing

Use one finite scale:

```text
4px   tight icon/text relationship
8px   compact control internals
12px  row and small group spacing
16px  mobile gutter / standard control grouping
24px  desktop gutter / panel padding
32px  section separation
48px  major page rhythm only
```

Layout:

- Maximum desktop content width: `1120px`
- Focused Today column: `760px`
- Desktop page gutter: `24px`, growing naturally on wide screens
- Mobile page gutter: `16px`
- Hero padding: `24px` desktop, `20px` mobile
- Standard section gap: `32px`

Do not introduce a new spacing value to repair a local layout. Use the nearest token or reconsider the hierarchy.

## Radii, borders, and elevation

```text
3px  compact tags and contribution cells
5px  buttons and controls
6px  hero surface, sheets, dialogs
```

- Default border: `1px`.
- Selected/focus border: `2px` without changing the outer dimensions.
- Shadows are reserved for floating sheets, dialogs, and menus: `0 8px 24px rgb(15 25 20 / 12%)`.
- Inline content and normal panels do not use shadows.
- Do not create pill-shaped containers for routine metadata. State labels can use an icon/dot plus text.

## Semantic color tokens

These tokens define roles, not components. Components must not use raw palette values directly.

| Token | Light | Dark | Purpose |
|---|---|---|---|
| `canvas` | `#F2F5F3` | `#111A1F` | Page background |
| `surface` | `#FCFDFC` | `#19242A` | Main work surface |
| `surface-subtle` | `#E9EFEC` | `#222F36` | Secondary rows and grouped context |
| `surface-raised` | `#FCFDFC` | `#26343B` | Menus, sheets, dialogs |
| `border` | `#D5DEDA` | `#35464E` | Standard separation |
| `border-strong` | `#AEBBB6` | `#526771` | Interactive boundary |
| `text` | `#253139` | `#EAF0EF` | Primary text |
| `text-secondary` | `#5D6A70` | `#A5B3B6` | Supporting text |
| `text-decorative` | `#819094` | `#839498` | Nonessential decoration only |
| `accent` | `#315F7C` | `#83B4D0` | Primary action and active emphasis |
| `accent-hover` | `#254D68` | `#9BC4DB` | Hover |
| `accent-pressed` | `#1D3F56` | `#6DA1BF` | Pressed |
| `accent-soft` | `#E4EDF3` | `#243C49` | Selected/active background |
| `on-accent` | `#FFFFFF` | `#12222B` | Text/icon on accent |
| `focus-ring` | `#2563EB` | `#78A9FF` | Keyboard focus, distinct from brand |
| `success` | `#276749` | `#89D3A5` | Finished/positive text |
| `success-soft` | `#E5F3EA` | `#193328` | Finished background accent |
| `warning` | `#805A16` | `#E4BB72` | Paused/caution text |
| `warning-soft` | `#FBF1D9` | `#3A2C17` | Paused/caution background accent |
| `error` | `#9B3B36` | `#F09A94` | Actual error/destructive text |
| `error-soft` | `#FAE9E7` | `#3B2221` | Error/destructive background |

Accessibility rules:

- `text-decorative` never carries required information.
- State and validation always include words; color is redundant.
- Normal text and essential controls must meet WCAG AA contrast.
- Focus is a visible `2px` focus-ring with a `2px` offset; never remove it.
- On bordered native controls, hide the resting border while the focus ring is shown so the focus state reads as one clear ring, not two nested borders.
- Test both themes independently; dark mode is not a mechanical inversion.

## Contribution levels

The contribution grid is a quiet historical texture showing recorded session time. It is not a target, score, or streak.

| Level | Meaning | Light | Dark |
|---|---|---|---|
| 0 | No recorded session | `#E6EBE9` | `#27343A` |
| 1 | 1–14 minutes | `#C9DCE5` | `#2A4857` |
| 2 | 15–29 minutes | `#9DBDCD` | `#386A82` |
| 3 | 30–59 minutes | `#6F9EB5` | `#598DA7` |
| 4 | 60+ minutes | `#315F7C` | `#83B4D0` |

Cells are `11 × 11px`, `3px` radius, with `4px` gaps. Each cell exposes date and duration through accessible text/tooltip. Zero means no recorded session, never failure.

Never show:

- current or longest streak
- “best day” or rank
- missed-day warnings
- goal rings or animated cell fills
- comparative red/green performance framing

## Buttons and links

### Primary

- Filled `accent` background with `on-accent` content
- One per visible state
- Minimum height `40px` desktop, `48px` mobile
- Minimum target area `44 × 44px`

### Secondary

- `surface` background, `border-strong` border, `text` content
- Used for a real alternative, not for every minor action

### Ghost

- No persistent container; `text-secondary` or accent text
- Receives `surface-subtle` on hover/focus
- Used for Thought, view detail, and low-emphasis actions

### Destructive

- `error` text/border; filled destructive treatment only in the final irreversible confirmation
- Finish is **not** destructive
- Skip intentionally is neutral, not red

### Behavior

- Hover transition: `120ms`, opacity/background/border only
- Sheet transition: `180ms`, opacity/transform only
- Respect `prefers-reduced-motion`
- Prefer hiding impossible actions over filling the interface with disabled controls
- A card receives hover treatment only when the entire card is clickable

## Inputs and choice controls

- Input height: `40px` desktop, minimum `48px` for primary mobile entry
- Long-form writing uses one Markdown-backed WYSIWYG editor with formatting, lists, tables, and locally stored images
- Markdown toolbars use labeled SVG icons; table row/column controls appear while the caret is in a table
- Labels remain visible; placeholders never replace labels
- Outcome choices use a radio-card group with a visible radio indicator
- The selected outcome uses `accent-soft` plus a `2px accent` boundary
- Achieved, Made progress, and Not achieved use the same accent selection treatment; do not grade them green/amber/red
- Validation errors use `error` icon/text and a plain explanation

## Status treatments

| Status | Treatment | Primary action |
|---|---|---|
| `NOT_STARTED` | Neutral state label; no full-card tint | Start |
| `IN_PROGRESS` | Accent dot + “Running”; elapsed timer | Pause |
| `PAUSED` | Pause icon + “Paused”; small `warning-soft` state area | Resume |
| `FINISHED` | Check icon + “Finished”; small `success-soft` label | Done for now |
| `SKIPPED` | Neutral skip icon + “Skipped intentionally” | None/contextual next |

No state is communicated only through a dot. Do not wash the entire card green or amber.

## Core component behavior

### Today hero

- The only large bordered surface on the normal Today page
- “Start here,” focus, task title, intent, planned guidance, one primary Start action, then the optional 10-minute action
- Maximum content width keeps line length readable
- Unfinished mode changes language to **Your place is saved**, not overdue

### Active timer

- Prominent only inside Running Today
- Mono/tabular elapsed time with body-sized planned guidance below
- Outside Today it collapses to a compact bar
- Never pulses, counts down, or changes color as planned time passes

### Week rows

- Compact list with date/day, title, word status, and duration where recorded
- No row of equally weighted dashboard cards
- Missed/unrecorded days use neutral text

### Finish sheet

- One title, session summary, outcome group, optional Markdown takeaway, one primary Finish button
- `8px` radius and raised-surface shadow
- Desktop: centered compact dialog or anchored sheet
- Mobile: bottom sheet above safe area

### Empty and light days

- Calm body copy with one optional action
- No giant illustration, celebration, or “zero state” that implies missing setup

## Responsive and mobile rules

- Primary breakpoint: `720px`
- Single-column page below the breakpoint; no horizontal page scroll
- Four stable bottom destinations with icon + word label: Today, Quarter, Journey, Tech choices
- Top bar holds Thought, Search, and appearance control
- On Today during a session, the action dock sits above subdued bottom navigation
- Off Today, a compact active-session strip sits above navigation
- Primary actions may span available width for thumb access
- Safe-area padding is included in bottom controls and sheets
- Contribution history may scroll horizontally inside its own region
- Do not depend on hover to reveal essential actions
- Do not hide navigation for the entire session; learning sessions may be long and Journey/Tech choices may be useful during them

## Rejected visual directions

### Direct GitHub copy

Rejected because copied green, cool grays, and repository UI would make the metaphor literal and the product feel like engineering administration.

### Soft wellness tracker

Rejected because oversized type, large rounded cards, pastel celebration, and emotional coaching would weaken precision and risk patronizing an experienced engineer.

### Dense command center

Rejected because multiple metric cards and charts compete with the current learning action and make the tracker itself the object of attention.

## Visual acceptance checklist

- Exactly one accent-filled action is visible in the current state.
- The current item can be identified without interpreting charts or color.
- No page becomes a grid of bordered cards.
- Timer prominence disappears outside active work.
- Touch targets remain at least `44 × 44px`.
- Status always includes text.
- Light and dark modes both meet contrast and focus requirements.
- Contribution history cannot be read as a streak competition.
- Skipped, free, and light days remain visually neutral.
- The result feels calm and compact at both `360px` and wide desktop widths.
