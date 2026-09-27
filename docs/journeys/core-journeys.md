# Core Journey Exploration

Status: Draft—recommendations require UX confirmation
Representative scenario: Q4 2026 Engineering Growth Plan

## Proposed interaction model

Use one state-aware **Today** surface rather than separate dashboard modes. Its primary control follows reality:

| Current state | Primary action |
|---|---|
| No active or unfinished item | Start |
| Session running | Pause |
| Item paused/unfinished | Resume |
| Item just finished | Done / return to Today |

Finish and quick capture remain visible but secondary while work is active. If unfinished work exists, it receives the primary Resume action; the scheduled item remains visible as “Up next” instead of competing equally.

---

## Journey A — Start today’s work

**Journey:** Start today’s work
**User goal:** Open the app and begin the most relevant planned learning with no setup.

**Entry point:** Home/Today after opening the app.

**Happy path:**

1. The app resolves the most relevant item from the plan and current work state.
2. Today shows its focus area, title, brief intent, and approximate planned time.
3. The user selects **Start session**.
4. A session begins and the surface changes to Running.

**Primary action:** Start session; Resume when an unfinished item exists.

**Secondary actions:** Do 10 minutes; view the scheduled next item; skip intentionally; capture a thought on a free day.

**Possible confusion:**

- A Wednesday may contain an ADR and a leadership rep.
- An unfinished item may compete with today’s scheduled item.
- A Friday may mean explore, catch up, review, or intentionally rest.
- A blank date may be mistaken for a plan error.

The app needs a recommendation policy, not the fiction that the plan always contains one atomic task.

**Mobile considerations:** Put the task before navigation and metadata. Keep the primary action thumb-reachable and sticky when necessary. Do not compress a desktop dashboard.

**A/B alternatives:**

- **A — One Today card:** A single focused card with Start; quiet week context beneath it.
- **B — Command center:** Today, week, quarter, decisions, and activity visible together.
- **C — Minimal Today stage:** One stateful work surface; other areas move to navigation or below the fold.

**Recommendation:** C with the useful context of A.

**Why:** It has the lowest cognitive load and strongest mobile behavior. The command center is useful for Quarter, not as the daily entry point.

---

## Journey B — Pause and resume

**Journey:** Pause and resume
**User goal:** Stop and return later without losing time, place, or context.

**Entry point:** Running Today surface, or a restrained global active-session bar after navigating elsewhere.

**Happy path:**

1. User selects **Pause**.
2. The current session receives an end timestamp.
3. The item remains open and Today changes to Paused.
4. User returns and selects **Resume**.
5. A new session begins; accumulated time includes both sessions.

**Primary action:** Pause while running; Resume while paused.

**Secondary actions:** Capture a thought; Finish item.

**Possible confusion:** “Stop” and “Pause” could imply different things; they should not coexist. A refresh or second device must not appear to reset the timer. Starting another item while one is active must produce an understandable choice: Pause current and switch, or Cancel.

**Mobile considerations:** While running or paused, the session controls own the bottom action area. Ordinary bottom navigation should not compete with Pause/Resume.

**A/B alternatives:**

- **A — Button replacement:** Start becomes Pause, then Resume on the same Today surface.
- **B — Persistent mini-session bar:** A compact bar preserves controls across other areas.
- **C — Pinned task card everywhere:** The whole task remains at the top of every screen.

**Recommendation:** A plus a restrained version of B while a session is active.

**Why:** The state remains obvious on Today and recoverable elsewhere without turning every page into a timer screen. C consumes too much attention.

---

## Journey C — Finish

**Journey:** Finish today’s item
**User goal:** End the work truthfully in under 20 seconds and optionally preserve one useful thought.

**Entry point:** Secondary **Finish item** action from Running or Paused.

**Happy path (recommended draft):**

1. Finish ends any active session.
2. A compact sheet asks for one outcome: **Achieved**, **Made progress**, or **Not achieved**.
3. An optional field asks, “One thing worth remembering?”
4. Selecting **Finish** closes the item and returns a calm completed state.
5. A brief Undo action is available without inserting a confirmation dialog.

**Primary action:** Finish after choosing an outcome.

**Secondary actions:** Add a takeaway; Cancel and keep the item open.

**Possible confusion:** “Made progress” may sound unfinished even when the planned day is intentionally closed. Copy must distinguish the learning outcome from the item’s lifecycle. Reflection must never become a required essay.

**Mobile considerations:** Use a bottom sheet with large outcome targets. Keep controls above the keyboard. No multi-page wizard.

**A/B alternatives:**

- **A — Outcome then optional takeaway:** Smallest guaranteed learning signal, but adds one choice.
- **B — Complete immediately, reflect afterward:** Fastest and least form-like, but reflection and outcome data may disappear.
- **C — Outcome only:** Very fast, but loses the narrative that makes long-term history valuable.

**Recommendation:** A, kept to one compact surface; test it against B before confirmation.

**Why:** It best balances habit continuity and meaningful history while respecting the under-20-second constraint. If testing shows outcome choice feels like classification work, switch to B rather than adding explanation.

---

## Journey D — Unfinished work

**Journey:** Return to unfinished work
**User goal:** Continue without rescheduling or falsifying what happened.

**Entry point:** Opening Today when the latest item is still open.

**Happy path:**

1. The unfinished item becomes the primary Today surface with **Resume**.
2. Its original planned date and completed sessions remain unchanged.
3. Today’s scheduled item appears quietly as **Up next**.
4. The learner resumes, finishes, or intentionally closes/skips the open item.

**Primary action:** Resume.

**Secondary actions:** Finish with a partial outcome; skip intentionally; view today’s scheduled item.

**Possible confusion:** An indefinitely open item can become backlog guilt. After several days, the app may neutrally ask whether to keep it open, finish as partial, or skip—never show red overdue debt.

**Mobile considerations:** Do not present unfinished and scheduled items as equal full-size cards. The recovery choice must remain obvious on a small screen.

**A/B alternatives:**

- **A — Resume the original:** Preserve one item and all sessions until it is closed.
- **B — Create a linked continuation:** Close the original and create a new linked item for another date.
- **C — Leave everything open indefinitely:** Accurate but creates a growing unresolved backlog.

**Recommendation:** A by default; B is an explicit later action when the learner intentionally splits the work.

**Why:** It preserves truthful history with zero routine administration. Automatic cloning or date movement obscures what was originally planned.

---

## Journey E — Low-energy day

**Journey:** Begin on a low-energy day
**User goal:** Make a small, legitimate start without renegotiating the whole plan.

**Entry point:** Secondary option beneath Start on Today.

**Happy path:**

1. User selects **Do 10 minutes**.
2. A normal session begins on the same item with a small intention.
3. At ten minutes, the app gently offers Continue, Pause, or Finish.
4. Nothing automatically stops or changes the original planned duration.

**Primary action:** Do 10 minutes.

**Secondary actions:** Start the normal session; skip intentionally.

**Possible confusion:** The option must not look like a streak-saving shortcut, failure status, or automatic completion.

**Mobile considerations:** Keep it as quiet text below Start, not a second equally prominent button.

**A/B alternatives:**

- **A — Do 10 minutes:** Concrete and reversible.
- **B — Small session:** Friendly but vague.
- **C — Reduce today’s target:** Changes plan intent and introduces maintenance.

**Recommendation:** A.

**Why:** It reduces activation energy without changing history, progress rules, or the definition of completion.

---

## Journey F — Capture a thought

**Journey:** Capture an insight while learning
**User goal:** Begin typing in no more than two interactions.

**Entry point:** A visible **+ Thought** action in the header on desktop and a thumb-reachable action on mobile; also available inside Running/Paused.

**Happy path:**

1. User selects + Thought.
2. A focused composer opens immediately.
3. The user types and saves; Enter may save on desktop.
4. The app quietly relates it to the active task when one exists.

**Primary action:** Save thought.

**Secondary actions:** Remove inferred task link; expand optional details later.

**Possible confusion:** Auto-linking must be visible and reversible. Requiring a title, tags, category, or link would turn capture into filing.

**Mobile considerations:** During an active session, place capture within the work surface rather than adding a competing floating button and bottom bar.

**A/B alternatives:**

- **A — Global visible action:** Discoverable and one click before typing.
- **B — Keyboard shortcut/command palette:** Fast for experts, hidden for everyone else.
- **C — Persistent input:** Fast but visually noisy on every screen.

**Recommendation:** A, with B as an optional accelerator later.

**Why:** It meets the speed target without sacrificing discoverability or adding permanent input clutter.

---

## Journey G — Weekly review

**Journey:** Understand the week
**User goal:** See what happened and what matters next without compiling a report.

**Entry point:** Week summary from Today/Quarter, or a gentle end-of-week link that never interrupts the current task.

**Happy path:**

1. The app generates the week from planned items, sessions, outcomes, thoughts, and decisions.
2. It highlights completed work, open work, and meaningful captured insights.
3. It asks one optional reflection question.
4. The next action adapts: Resume open item, return to Today, or review the quarter.

**Primary action:** Contextual next action; the review itself does not require a completion status.

**Secondary actions:** Add/edit the optional weekly thought; open a task or captured insight.

**Possible confusion:** Time and completion counts must not claim to measure learning quality. Sparse weeks should not be red or framed as failure.

**Mobile considerations:** Use a short vertical timeline, not a wide table or contribution graph as the main content.

**A/B alternatives:**

- **A — Generated summary + one question:** Meaningful and lightweight.
- **B — GitHub-style weekly diff:** Developer-friendly, but abstract as the primary review.
- **C — Timeline with totals:** Concrete, but risks becoming a timesheet.

**Recommendation:** A with a small timeline from C; a diff may be an optional view later.

**Why:** It supports sense-making instead of administration or performance scoring.

---

## Journey H — Decision review

**Journey:** Revisit an architectural decision
**User goal:** Review prior reasoning when useful without interrupting today’s learning.

**Entry point:** A quiet secondary card on Today (“1 decision ready to revisit”) and a Due section in Decisions.

**Happy path:**

1. User opens a due decision when ready.
2. Original context, options, decision, consequences, and falsifier remain read-only as historical reasoning.
3. User records a dated outcome and what changed.
4. The review is appended; the original is never rewritten.

**Primary action:** Add review outcome.

**Secondary actions:** Postpone review; link supporting evidence; return to Today.

**Possible confusion:** “Due” must not imply urgency equal to the current learning item. Editing the original decision would destroy the very hindsight the review is meant to create.

**Mobile considerations:** Present original reasoning as collapsible sections, with the review composer first once context has been read.

**A/B alternatives:**

- **A — Interruptive due prompt:** Highly visible, but harms the daily loop.
- **B — Secondary Today card + Decisions section:** Visible without competing.
- **C — Decisions page only:** Calm, but easy to forget.

**Recommendation:** B.

**Why:** It preserves review discoverability without displacing the one primary daily action.

---

## Journey I — Plan update

**Journey:** Import an updated quarter plan
**User goal:** Understand prospective changes and apply them without harming execution history.

**Entry point:** Plan settings/import—not the daily path.

**Happy path:**

1. User selects a revised YAML plan.
2. The app validates it and produces a preview grouped by Added, Changed, Removed, and Historical item preserved.
3. Human-readable before/after details explain material changes.
4. Active/paused conflicts require explicit resolution.
5. User applies the update once; completed work, sessions, reviews, and linked history remain.

**Primary action:** Apply reviewed changes.

**Secondary actions:** Cancel; inspect raw diff; preview calendar placement.

**Possible confusion:** Matching by title is unreliable; stable IDs matter. “Removed” must mean removed from future plan, not deleted from history.

**Mobile considerations:** Import may work on mobile, but diff review is a secondary workflow and may recommend a wider screen without blocking access.

**A/B alternatives:**

- **A — Git-style text diff:** Precise but unnecessarily technical for normal review.
- **B — Added/Changed/Removed groups:** Immediately understandable.
- **C — Calendar preview:** Shows timing but obscures semantic changes.

**Recommendation:** B, with an optional calendar preview and raw detail.

**Why:** It explains impact most clearly while preserving the Git-inspired notion of reviewing changes before applying them.

---

## Cross-journey rules

- Planned minutes are guidance, never a countdown or score.
- Visible elapsed time derives from timestamps; the app does not persist a ticking counter.
- Start, Pause, Resume, Finish, and plan-apply actions must tolerate duplicate clicks/retries safely.
- A refresh must restore the authoritative active state.
- Accidental Finish or Skip should offer brief Undo rather than a routine confirmation modal.
- Empty, free, buffer, and holiday days are valid; never manufacture work to fill them.
- Skip language is neutral and contains no broken-streak framing.
- Git language is structural texture, not required control vocabulary.
- Every state must answer “What should I do next?” with one visually primary action.

## Open decisions for UX confirmation

1. Confirm the Minimal Today + single-card hybrid over a command center.
2. Confirm that unfinished work becomes primary and today’s planned item becomes Up next.
3. Choose Finish A (outcome before completion) or B (complete immediately, optional reflection afterward).
4. Confirm “Do 10 minutes” as a normal session intention.
5. Confirm weekly review has no completion status.
6. Confirm decision reviews remain secondary to Today.
