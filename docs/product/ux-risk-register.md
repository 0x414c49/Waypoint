# UX Risk Register

Status: Open empirical assumptions; validation planned during prototype and implementation

These are the highest-risk product assumptions. They are not implementation risks; they determine whether the product feels helpful or becomes another chore.

| # | Assumption | Why it is risky | How to validate | Guardrail |
|---|---|---|---|---|
| 1 | The plan can identify one clear “today” item. | The Q4 example may contain a main task, ADR, leadership rep, and optional exploration on the same day. A false single choice can hide important intent. | Walk through normal, overloaded, buffer, holiday, and no-plan dates using the example. | Home may show one primary item plus quiet context, never several equal calls to action. |
| 2 | A single active session matches real learning behavior. | The learner may switch devices or jump between related items. Silent conflicts would be confusing. | Simulate refresh, second-task start, accidental duplicate click, and stale browser state. | One server-owned active session; conflicts explain the current task and offer “Pause and switch.” |
| 3 | Automatic time is useful without becoming surveillance. | A timer can dominate attention or create pressure to optimize minutes instead of learning. | Compare a prominent stopwatch with a calm elapsed label during sessions. | Time is visible while active but never framed as a score; no per-second persistence. |
| 4 | A tiny finish reflection balances speed and meaning. | Mandatory writing creates friction; fully optional reflection may produce an empty long-term story. | Test Achieved/Partial/Not achieved plus one optional takeaway against immediate finish. | Outcome is one tap; takeaway is optional; completion is never blocked by prose. |
| 5 | Carry-forward can preserve truthful history without mental overhead. | Moving a dated task can rewrite what was planned; cloning it can create confusing duplicates. | Walk through a task started Monday and resumed Tuesday, plus an untouched missed item. | Preserve the original item and sessions; explicitly link any continuation; never silently change history. |
| 6 | A low-energy mode feels supportive, not like a loophole or guilt prompt. | “Maintain your habit” can become disguised streak pressure. | Compare “Do 10 minutes,” “Small session,” and editing the target with users during an imagined busy day. | Offer “Do 10 minutes” as a session choice, not a reduced definition of success or a saved target change. |
| 7 | Quick capture can stay unstructured and still be useful later. | No organization can create an unusable inbox; required organization destroys capture speed. | Capture several thoughts from task and non-task contexts, then retrieve them in Journey. | Open editor in two interactions or fewer; infer context; tags and links remain optional after capture. |
| 8 | Weekly/quarter views motivate through meaning rather than metrics. | Contribution graphs and totals can become performative gamification or dashboard clutter. | Compare an activity graph, narrative diff, and simple timeline using sparse and busy weeks. | Lead with what progressed, remained open, and changed—not streaks, rankings, or completion percentages alone. |

## Validation order

1. Today selection and unfinished-work behavior
2. Start/pause/resume state comprehension
3. Finish reflection friction
4. Carry-forward truthfulness
5. Low-energy support
6. Quick capture and retrieval
7. Weekly review usefulness
8. Long-term activity representation

No risk is “closed” merely because a wireframe exists. Closure requires an explicit decision after reviewing the journey and its trade-offs.
