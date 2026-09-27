# Information Architecture

Status: Confirmed on 2026-09-27
Principle: Today is home; detailed workflows remain contextual.

## Persistent destinations

Use four—and only four—persistent destinations in v1:

1. **Today** — what should I do now?
2. **Quarter** — what did I intend, and where am I in the plan?
3. **Journey** — what happened, and how did my thinking change?
4. **Decisions** — what reasoning should be preserved or revisited?

Do not add a separate Home destination; Today already fulfills that job.

Search, Thought, and Settings are global utilities, not equal destinations.

## Conceptual boundaries

| Area | Time orientation | Owns | Does not become |
|---|---|---|---|
| Today | Now | Current recommendation, active/paused state, next action | Dashboard or backlog |
| Quarter | Forward + plan context | Weeks, focus areas, planned work, success criteria, plan update | Progress scorecard |
| Journey | Backward + meaning | Sessions, thoughts, reflections, outcomes, changed thinking | Notes database or timesheet |
| Decisions | Durable reasoning | Original ADRs, review dates, append-only outcomes | Interruptive approval queue |

A decision review may appear chronologically in Journey, but it links to the canonical Decision rather than duplicating it.

## Hierarchy

```text
Application
├── Today
│   ├── Ready / Running / Paused / Finished state
│   ├── Finish sheet
│   ├── Quick Thought
│   ├── Up next
│   └── Quiet review-due prompt
├── Quarter
│   ├── Current quarter overview
│   ├── Week summary
│   │   └── Task detail / session history
│   ├── Focus area detail
│   ├── Original plan and success criteria
│   └── Plan update
│       ├── Validate
│       ├── Preview changes
│       └── Apply result
├── Journey
│   ├── Chronological entries
│   ├── Entry detail/edit
│   └── Contextual filters
├── Decisions
│   ├── Due for review
│   ├── All decisions
│   ├── Decision detail
│   └── Add review outcome
└── Global utilities
    ├── Thought composer
    ├── Search overlay
    └── Settings
```

## Desktop navigation

Use a compact top bar. A permanent sidebar would give a four-destination product unnecessary workspace weight.

```text
Journey mark | Today  Quarter  Journey  Decisions | + Thought  Search  •••
```

- The mark returns to Today.
- The active destination uses text weight, a small boundary/underline, and an accessible current-page indicator—not color alone.
- + Thought remains visible at normal desktop widths.
- Search opens an overlay rather than navigating to an empty page first.
- Settings lives under the overflow menu.
- When browsing away from Today during a running or paused session, a restrained active-session strip appears below the header.

A sidebar should be reconsidered only if later confirmed scope creates enough persistent destinations to require grouping.

## Mobile navigation

Use four stable bottom destinations:

```text
Today       Quarter       Journey       Decisions
```

- Each item uses icon + word label.
- Thought, Search, and overflow appear in the top bar; Thought is also available inside active Today.
- Do not add a floating action button; it would compete with Start/Pause and make the app resemble a generic task manager.
- During an active Today session, a sticky action dock sits above subdued navigation.
- Off Today, the compact session strip sits above the bottom navigation.
- Do not remove navigation for the full duration of a session; learners may need Journey or Decisions while working.

## Contextual surfaces

These are not persistent destinations:

- task detail
- session history and correction
- week summary
- focus-area detail
- finish flow
- quick capture
- decision review editor
- plan import/update
- future AI review

### Task detail

Task detail is optional and is never required before Start.

It may contain:

- original plan context
- scheduled date and planned guidance
- accumulated sessions
- related thoughts
- outcome/reflection
- contextual session correction or reopen

Desktop may use a focused nested page or side panel depending on content depth. Mobile uses a full-screen pushed view with a clear Back action. It must remain history/context, not expand into a status-edit form.

### Week summary

Opened from the week inside Quarter or a quiet Today prompt. It is generated and has no persistent “review complete” state.

### Plan update

Lives under the current Quarter’s actions because it changes quarter intent. It does not belong in general Settings.

### Decision review

Opens from Decisions or a quiet Today prompt. It never interrupts Start, Pause, Resume, or Finish.

## Quick Thought

- Desktop: visible + Thought utility in the header.
- Mobile: top-bar action and contextual action within active Today.
- One click/tap opens directly into the text field.
- Active-task association is inferred, displayed, and removable.
- No title, category, tag, or link is required.
- The composer closes back to the learner’s previous context.
- A keyboard shortcut may be added later as an accelerator, never as the only path.

## Search

Search is a global utility overlay:

- searches tasks, thoughts, decisions, and quarter plan content
- groups results by content type
- opens the result in its canonical context
- starts with a single query field and no advanced-filter builder
- becomes full-screen on mobile

Journey may expose date, task, and “changed my mind” filters for chronological browsing, but it uses the same search behavior rather than creating a second search system.

## Settings

Keep Settings behind the overflow menu. Include only app-wide preferences that exist in v1, such as:

- appearance: system/light/dark
- read-only app/data-location information for support and recovery

Do not create profile, team, notification, integration, or permission sections before those capabilities exist.

Appearance is stored in the browser and is not a domain/API setting. Timezone and week-convention controls are deferred until their historical effects have a designed workflow. Plan import/export belongs in Quarter. Low-level recovery is an explicit operator procedure, not a normal Settings control.

## Navigation behavior during states

| State | Navigation behavior |
|---|---|
| Ready | Standard navigation; Today is current |
| Running on Today | Pause dock dominates; navigation remains available but subdued |
| Running off Today | Compact session strip keeps title, elapsed time, Pause, and return-to-task action visible |
| Paused | Same structure with Resume replacing Pause |
| Finish sheet | Focus stays inside the sheet until finish or cancel; background is inert |
| Quick Thought | Composer returns to the exact prior context after save/cancel |

## IA acceptance checks

- Opening the app lands on Today.
- Start never requires visiting task detail.
- Every record has one canonical home.
- Quarter remains the plan; Journey remains the lived record.
- Search and Settings do not consume persistent navigation positions.
- Sessions do not receive a top-level area.
- Plan update does not appear in the daily path.
- Mobile navigation remains reachable during long sessions.
- Adding a fifth persistent destination requires explicit product review.

## Risks to watch

- **Quarter/Journey ambiguity:** protect the planned-future versus lived-record distinction in copy and content.
- **Decision frequency:** Decisions is core to engineering growth, but if real use is sparse it may later become a Journey section. Do not decide this from aesthetics alone.
- **Task-detail growth:** this is the likeliest place for forms and manual administration to accumulate.
- **Quarter dashboard drift:** resist metric cards, alerts, and competing action buttons.
- **Journey database drift:** chronological meaning remains the default; organization happens after capture and only when useful.
