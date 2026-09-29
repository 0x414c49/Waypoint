# Using Engineering Journey Tracker

The tracker has reached the v1 boundary. It supports the daily learning loop, factual activity history, reflections, durable engineering Decisions, safe plan updates, Quarter navigation, global Search, and optional local generated advice.

## Start it locally

You need Node.js 24 and npm.

```sh
npm install
npm run dev
```

Open `http://127.0.0.1:5173` in a browser. Keep the terminal running while you use the app.

For a production-style local run:

```sh
npm run build
npm start
```

Then open `http://127.0.0.1:4173`.

Your data stays on this machine in `data/store`. Preserve that directory when backing up or moving the app; do not hand-edit its files while the server is running.

## The friendly daily loop

1. Open **Today**. The app offers one current learning item rather than a backlog to manage.
2. Choose **Start session**, or **Do 10 minutes** on a low-energy day. The smaller option is a normal session intention, not a reduced target or streak saver.
3. Use **Pause** when you stop. Use **Resume** when you return.
4. Choose **Finish item**, select the honest outcome, and optionally leave one useful takeaway.
5. Leave. Session time, activity, and Journey history are produced automatically from those actions.

The supplied Q4 2026 plan is loaded on a fresh installation. Today follows the real calendar, so before that plan begins it truthfully says the quarter has not started. You can still capture Thoughts and Decisions.

## Quarter and plan updates

Open **Quarter** to see current plan intent, success criteria, Focus Areas, Milestones, and planned work. Focus Area and Milestone links keep you in plan context; a Milestone can also open its generated Journey summary. Between quarters is shown as a normal pause in the plan, not a backlog or a missed target.

Choose **Update plan** to select a version 1 `.yaml`/`.yml` file or paste its contents. The tracker validates the whole document and previews semantic changes before applying anything. Review removed and changed items, read the explanation of preserved history, and confirm each removal or active-work change that needs acknowledgement. If the plan changed after Preview, refresh it and review again.

**Export YAML** downloads the current Quarter plan. It contains current intent only—not Sessions, completion, Decisions, reflections, or other history. Exporting and previewing the same plan again shows no semantic changes.

On a store with no Quarter, Today and Quarter offer a working plan-import path. An explicitly empty Quarter is valid when it has no planned Tasks.

## Journey and activity

Open **Journey** to see sessions, outcomes, thoughts, changed thinking, and Decision reviews in one historical stream.

- **+ Thought** captures something worth remembering without requiring a Task.
- Filters narrow the history by date, Task, Milestone, or entry type.
- **Learning activity** shows the last year as a weekly calendar. Darker cells mean more closed-session time for that local date. Hover a cell for the exact duration.
- The calendar is context, not a score: there is no streak, target, ranking, or penalty for an empty day.

## Decisions

Use **Decisions** for reasoning you may want to revisit later.

1. Create a Draft directly, or start one from a planned ADR Task.
2. Save while the reasoning is still changing.
3. Accept only when the original context and choice are worth preserving.
4. Later add a review: it still holds, you would adjust it, postpone the review, or supersede it.

Accepted reasoning stays read-only. Reviews append hindsight instead of rewriting what you originally knew.

Use **Search** in the top bar to find plan work, a Journey thought, or Decision reasoning. Search opens Tasks, Focus Areas, Milestones, Quarters, and Decisions in their own context; a thought opens at its exact Journey entry.

Task, Week, Quarter, and Accepted Decision views offer an optional **Generate reflection** action. V1 uses a deterministic local stub, not an external AI service. Its output is labeled as generated advice, saved separately as append-only history, and cannot change plan intent, execution state, human-authored Decisions, or a learning score. Generate another appends a new review; a failed generation saves nothing.

## Useful commands

- `npm run check` runs type checks, lint, automated tests, and the production build.
- `npm run test:browser` runs the browser and accessibility scenarios.
- Stop the local app with `Control-C` in its terminal.

## Current boundary

This is a private, single-user local app. It has no cloud sync, accounts, collaboration, notifications, or remote backup. Back up `data/store` yourself. Plan changes go through Quarter’s preview/apply flow rather than editing stored JSON manually.
