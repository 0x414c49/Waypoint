# Preliminary UX Evaluation

Status: Draft evaluation—awaiting confirmation
Evaluated concept: Focused Today with state-aware controls and the recommended journey choices

## Recommended concept in one paragraph

The app opens to a single Today stage. It recommends one current item from the plan and current work state. Start, Pause, or Resume is the one primary action. A calm elapsed timer records sessions automatically. Finish opens one compact step with a one-tap outcome and optional takeaway. Unfinished work remains the primary Resume item without changing its original date; today’s scheduled work sits quietly under Up next. Reviews and history are generated from normal use.

## Evaluation against the product criteria

| Criterion | Result | Evidence / remaining question |
|---|---|---|
| Can a new user understand the primary action in under 3 seconds? | Likely yes | Every Today state has one task and one primary verb. Validate with a first-glance test. |
| Is today’s task obvious? | Yes in normal state | Focus area, title, intent, and planned guidance are grouped above Start. Bundled plan items still require a priority rule. |
| Is unfinished work obvious? | Yes | It replaces the hero with “Your place is saved” and Resume; today’s scheduled item becomes Up next. |
| Does the timer dominate only while needed? | Yes | It is prominent only in Running; elsewhere only a restrained active-session bar remains. |
| Is there any unnecessary field? | Mostly no | The outcome choice in Finish is the only disputed field. Test against immediate completion. |
| Is any status manually maintained? | No in normal flow | Status follows Start/Pause/Resume/Finish/Skip use cases. The user never selects a status menu. |
| Can a session start with one click? | Yes | Start begins immediately. Do 10 minutes also starts the same item immediately. |
| Can it be used one-handed on a phone? | Likely yes | Primary session controls own a bottom dock; capture lives inside the active surface. Needs touch prototype validation later. |
| Does reflection feel optional? | Likely | The takeaway is explicitly optional, but a required outcome may still feel like classification. |
| Could it become a data-entry system? | Controlled risk | Quick capture has one text field; finish has at most one outcome plus optional text; review is generated. Plan authoring remains out of the daily path. |

## Scenario walkthroughs using the Q4 plan

### 1. Normal Monday — Rust foundations

- Today resolves “Rust setup. The Book ch.1–4 + Rustlings 1–20.”
- The learner sees one Start action and can choose Do 10 minutes.
- Sessions automatically accumulate; the task does not ask for percentage complete.
- Finish captures outcome and optionally what the borrow checker revealed.

**Assessment:** Fits the model without special behavior.

### 2. Bundled Wednesday — ADR plus leadership rep

- The plan contains a decision artifact and a social practice in the same Wednesday description.
- Treating both as unrelated equal tasks would weaken the one-action promise.
- Proposed behavior: preserve one umbrella learning item (“ADR-3 + have someone else present it”) with checklist-like plan context that is not manually status-managed. If the activities happen separately, sessions and thoughts still attach to the same item.

**Assessment:** Plausible, but the later data-model stage must decide whether embedded evidence/activities require structure. Do not prematurely add subtasks.

### 3. Unfinished Monday collides with Tuesday

- Monday’s Rust item remains open with its original date and sessions.
- Tuesday opens with Monday as “Your place is saved” and Resume.
- Tuesday’s Partial failure item remains visible as Up next.
- The user may finish Monday as Made progress and move on, skip intentionally, or resume.

**Assessment:** Clear and truthful. Validate whether always prioritizing unfinished work feels too rigid after several days.

### 4. Conditional Friday

- The plan says explore one topic **or** catch up/review if the week ran hot.
- Today should recommend based on open work: Resume open work first; otherwise offer the planned exploration.
- It must never schedule both or imply that taking the lighter option is a failure.

**Assessment:** The recommendation policy can express the plan’s conditional intent without a form.

### 5. Holiday/light week

- Today says the lighter day is part of the plan.
- It may offer a reflection, an optional small activity, or taking the day.
- No red missed state, fabricated work item, or streak warning appears.

**Assessment:** Supports habit resilience instead of performative consistency.

### 6. Quarter retro

- The Today item can present the quarter’s planned questions and relevant prior artifacts.
- The Quarter view supplies evidence: sessions, finished work, thoughts, changed-mind entries, and ADR reviews.
- The retro remains a learning task, not an automatically generated score.

**Assessment:** The record supports sense-making while leaving conclusions to the learner.

## Chosen directions proposed for confirmation

| Area | Recommended direction | Rejected/default-not-chosen direction |
|---|---|---|
| Home | Minimal stateful Today + one focused card | Multi-panel command-center dashboard |
| Unfinished work | Original item becomes Resume hero; today is Up next | Automatic date move or duplicate continuation |
| Running state | Focused Today plus restrained global session bar | Full task pinned on every page |
| Time | Calm elapsed time; planned time as guidance | Countdown, score, or manually entered actual time |
| Low-energy | Do 10 minutes on the same task | Editing the plan target or “streak saver” mode |
| Quick capture | Visible Thought action; inferred reversible context | Required tags/category or hidden command palette only |
| Weekly review | Generated account + one optional question | Weekly form, completion status, or performance score |
| Decision review | Quiet due notice; append-only review | Interruptive modal or rewriting original ADR |
| Plan update | Human-readable Added/Changed/Removed preview | Raw diff or calendar as the only representation |

## The one material fork

### Finish A — Outcome before completion

Pros:

- Guarantees a minimal distinction between achieved, progressed, and not achieved.
- Makes week/quarter history more meaningful without reading every note.
- Matches the proposed Daily Review domain concept.

Cons:

- Adds a choice at the most repetition-sensitive moment.
- Can feel like status maintenance if the wording is unclear.

### Finish B — Complete immediately, reflect afterward

Pros:

- Fastest possible flow and emotionally light.
- Reflection reads as a genuine invitation rather than a gate.

Cons:

- Optional reflection may often remain empty.
- Completion alone cannot explain whether the intent was achieved or merely closed.

### Recommendation

Start with **A** in the interaction specification: three plain-language outcomes on the same compact sheet, optional prose, total target under 20 seconds. Before visual design, explicitly choose A or B. If A needs helper text to be understood, it has already become too heavy and B should win.

## Anti-drift checks for later stages

The following checks should appear in visual, data, API, and implementation reviews:

1. Can the main action still be found without reading navigation or metrics?
2. Did any new field enter Start, Pause, Resume, Finish, or Thought capture?
3. Is the user being asked to maintain a fact that the plan or system already knows?
4. Are time, completion, and learning quality kept distinct?
5. Can plan changes preserve original intent and completed history?
6. Does a missed, skipped, light, or empty day use neutral language?
7. Has Git-inspired language clarified structure or merely added theme?
8. Do advanced features remain outside the daily path?

## UX gate

Do not begin the visual system yet.

Confirmation is needed for:

- The Focused Today direction
- The unfinished-work priority behavior
- The active-session bar behavior
- Finish Alternative A or B
- The low-energy and quick-capture interactions
- The non-interrupting weekly and decision reviews

Once these are confirmed, revise the sketches into a single chosen flow, mark the UX gate complete, and only then define visual tokens and components.
