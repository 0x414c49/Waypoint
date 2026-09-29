# Visual System — Quiet Workshop

Status: Confirmed on 2026-09-27
Depends on: `docs/journeys/confirmed-interaction-model.md`

## Direction

**Quiet Workshop** combines GitHub’s clarity, compactness, and developer familiarity with a warmer and more personal character. It should feel like a well-kept workbench: the current work is obvious, useful context is close, and nothing performs for attention.

Distinctiveness comes from:

- warm neutral canvas rather than a cool admin-dashboard gray
- deep teal for the current action rather than copied GitHub green
- one generous work surface instead of a grid of cards
- compact evidence/history rows
- plain language and restrained status treatment

Avoid gradients, glass effects, giant whitespace, oversized radii, decorative Git motifs, and card grids.

## Visual principles

1. **One accent action.** Only the current primary action receives the filled accent treatment.
2. **Hierarchy through type and space.** Borders and fills support structure; they do not create it alone.
3. **One hero surface.** Today may have one bordered work surface. Secondary content is usually separated by spacing or rules, not nested cards.
4. **Color communicates with words.** Every state has a text label and, when helpful, an icon in addition to color.
5. **Compact is not cramped.** Information density may increase on desktop, but readable type and touch targets remain protected.
6. **Time is evidence, not a score.** Elapsed time is prominent only while work is active.
7. **Motion confirms; it does not celebrate.** No confetti, streak animation, pulsing urgency, or attention loops.

## Typography

Use native system fonts. This avoids a font request, feels familiar on every platform, and keeps rendering fast.

```css
--font-sans: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI",
  Roboto, Helvetica, Arial, sans-serif;
--font-mono: ui-monospace, SFMono-Regular, Menlo, Consolas,
  "Liberation Mono", monospace;
```

Let the operating system and browser choose native text rasterization; do not
apply global font-smoothing overrides.

| Role | Desktop size / line | Mobile size / line | Weight | Use |
|---|---:|---:|---:|---|
| Display | 32 / 40px | 28 / 36px | 600 | Rare quarter/empty-state statement |
| Heading 1 | 24 / 32px | 22 / 30px | 600 | Page title |
| Hero title | 20 / 28px | 20 / 28px | 600 | Current learning item |
| Heading 2 | 16 / 24px | 16 / 24px | 600 | Section heading |
| Body large | 16 / 24px | 16 / 24px | 400 | Important description or prompt |
| Body | 15 / 22px | 15 / 22px | 400 | Default prose |
| Compact UI | 14 / 20px | 14 / 20px | 400 | Navigation, rows, controls |
| Small | 13 / 18px | 13 / 18px | 400 | Secondary supporting text |
| Metadata | 12 / 16px | 12 / 16px | 600 | Dates, focus labels, state labels |
| Timer | 40 / 48px | 36 / 44px | 600 | Active elapsed time only |

Rules:

- Buttons use Compact UI at weight 600 and sentence case.
- Metadata may use uppercase with `0.04em` letter spacing, but never for paragraphs.
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

- Maximum desktop content width: `960px`
- Focused Today column: `680px`
- Desktop page gutter: `24px`, growing naturally on wide screens
- Mobile page gutter: `16px`
- Hero padding: `24px` desktop, `20px` mobile
- Standard section gap: `32px`

Do not introduce a new spacing value to repair a local layout. Use the nearest token or reconsider the hierarchy.

## Radii, borders, and elevation

```text
4px  compact tags, inputs, contribution cells
6px  buttons and controls
8px  hero surface, sheets, dialogs
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
| `canvas` | `#F7F8F6` | `#0F1412` | Page background |
| `surface` | `#FFFFFF` | `#171D1A` | Main work surface |
| `surface-subtle` | `#F0F3EF` | `#202823` | Secondary rows and grouped context |
| `surface-raised` | `#FFFFFF` | `#252E29` | Menus, sheets, dialogs |
| `border` | `#D8DED9` | `#344039` | Standard separation |
| `border-strong` | `#BBC5BD` | `#4B5A51` | Interactive boundary |
| `text` | `#1F2521` | `#E9EEE9` | Primary text |
| `text-secondary` | `#616B64` | `#AAB4AC` | Supporting text |
| `text-decorative` | `#7C877F` | `#89938B` | Nonessential decoration only |
| `accent` | `#176B5B` | `#63C6AE` | Primary action and active emphasis |
| `accent-hover` | `#125848` | `#7BD3BD` | Hover |
| `accent-pressed` | `#0D463A` | `#4CB198` | Pressed |
| `accent-soft` | `#E3F1ED` | `#193D34` | Selected/active background |
| `on-accent` | `#FFFFFF` | `#092019` | Text/icon on accent |
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
| 0 | No recorded session | `#E8ECE8` | `#27302B` |
| 1 | 1–14 minutes | `#CDE5DE` | `#21463C` |
| 2 | 15–29 minutes | `#98CDBE` | `#2D6A59` |
| 3 | 30–59 minutes | `#53A98F` | `#42937B` |
| 4 | 60+ minutes | `#176B5B` | `#63C6AE` |

Cells are `11 × 11px`, `4px` radius, with `4px` gaps. Each cell exposes date and duration through accessible text/tooltip. Zero means no recorded session, never failure.

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
- Textareas begin at three body-text lines and expand with content where practical
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
- Focus label, title, intent, planned guidance, primary action, then low-energy action
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

- One title, session summary, outcome group, optional takeaway, one primary Finish button
- `8px` radius and raised-surface shadow
- Desktop: centered compact dialog or anchored sheet
- Mobile: bottom sheet above safe area

### Empty and light days

- Calm body copy with one optional action
- No giant illustration, celebration, or “zero state” that implies missing setup

## Responsive and mobile rules

- Primary breakpoint: `720px`
- Single-column page below the breakpoint; no horizontal page scroll
- Four stable bottom destinations: Today, Quarter, Journey, Decisions
- Top bar holds Thought, Search, and overflow as space permits
- On Today during a session, the action dock sits above subdued bottom navigation
- Off Today, a compact active-session strip sits above navigation
- Primary actions may span available width for thumb access
- Safe-area padding is included in bottom controls and sheets
- Contribution history may scroll horizontally inside its own region
- Do not depend on hover to reveal essential actions
- Do not hide navigation for the entire session; learning sessions may be long and Journey/Decisions may be useful during them

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
