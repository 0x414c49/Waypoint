# Email templates — Waypoint

Source: `server/email/templates.ts`. Rendered through the existing
`ResendMailer` text+HTML path (`server/email/mailer.ts`); templates are
stored in-repo (versioned, no dashboard drift) even though Resend offers a
hosted transactional-templates API (create/publish + send by template id).

Styling: Waypoint identity (accent `#315F7C`, text `#253139`,
secondary `#5D6A70`, canvas `#F2F5F3`, surface `#FCFDFC`, border `#D5DEDA`,
accent-soft `#E4EDF3`), inline CSS only, table-based layout, no external
assets. Every template returns `{ subject, text, html }` twins with
`escapeHtml` applied to caller-controlled values.

## a. Invite — PRODUCTION (wired to `POST /api/auth/invites`)

Builder: `buildInviteTemplate(vars)`; `buildInviteEmail` in `mailer.ts`
delegates to it with an unchanged signature so `build-app.ts` keeps working.

| Variable | Type | Required | Example |
|---|---|---|---|
| `registerUrl` | `string` | yes | `https://tracker.example/register` |
| `inviteId` | `string` | yes | `wp_inv_9f2c…` (raw, one-time) |
| `inviterName` | `string` | no | `Ali` |
| `expiresAt` | `string` (ISO) | no | `2026-10-09T00:00:00.000Z` (date part shown) |

Subject: `Your Waypoint invite`.

## b. Weekly digest — UNUSED skeleton (not wired to any route)

Builder: `buildWeeklyDigestEmail(vars)`. No digest route, scheduler, or
worker sends this today.

| Variable | Type | Required | Example |
|---|---|---|---|
| `recipientName` | `string` | yes | `Sam` |
| `weekLabel` | `string` | yes | `Sep 22 – Sep 28` |
| `tasksFinished` | `number` | yes | `5` |
| `tasksCarried` | `number` | yes | `2` |
| `focusSummary` | `string` | yes | `Shipped auth hardening.` |
| `dashboardUrl` | `string` | yes | `https://tracker.example/today` |
| `unsubscribeUrl` | `string` | yes | `https://tracker.example/api/email/unsubscribe?token=…` (per-recipient, from `issueDigestUnsubscribeUrl`) |

Subject: `Your Waypoint week: <weekLabel>`.

Every digest carries its way out: muted footer link in HTML plus
`Unsubscribe: <url>` line in text. Only the digest (bulk) needs this —
invites and recovery are one-to-one transactional mail and carry no
unsubscribe link. When the digest sender is built it must skip users
where `isDigestUnsubscribed()` is true and pass
`List-Unsubscribe: <url>` (+ `List-Unsubscribe-Post: List-Unsubscribe=One-Click`)
via `EmailMessage.headers`, which `ResendMailer` forwards verbatim.

## c. Password recovery — UNUSED skeleton (no reset-token system exists)

Builder: `buildPasswordRecoveryEmail(vars)`. No reset-token issuance,
route, or expiry enforcement exists — do NOT build one from this template
alone.

| Variable | Type | Required | Example |
|---|---|---|---|
| `resetUrl` | `string` | yes | `https://tracker.example/reset?token=…` |
| `expiresMinutes` | `number` | yes | `30` |

Subject: `Reset your Waypoint password`.

## Remote registration (Resend hosted templates, 2026-10-02)

The three in-repo designs above are also registered as hosted Resend
templates (all `published`). Remote send path: `POST /emails` with
`{ template: { id, variables } }` — `from`/`subject`/`reply_to` in the
send payload take precedence over the template defaults. No email has
been sent from these templates by this task.

Folder note: Resend "Template Folders" (changelog 2026-08-03) is a
dashboard-only organizer — no Templates API endpoint accepts or returns
a folder. The `waypoint-` name/alias prefix is the API-visible grouping;
move the three templates into the dashboard `waypoint` folder by hand
(ellipsis menu → Move).

| Remote name (= alias) | id | Variables (key: type) |
|---|---|---|
| `waypoint-invite` | `db1194e4-eac1-4fde-9d96-694aa317a601` | `registerUrl`: string, `inviteId`: string, `inviterName`: string, `expiresAt`: string |
| `waypoint-weekly-digest` | `59c57f36-2569-4b85-b25d-938bc4d36622` | `recipientName`: string, `weekLabel`: string, `tasksFinished`: number, `tasksCarried`: number, `focusSummary`: string, `dashboardUrl`: string |
| `waypoint-password-recovery` | `ac60f46c-5f81-410a-954e-c803d293cc2d` | `resetUrl`: string, `expiresMinutes`: number |

> Remote-sync pending (2026-10-02): the in-repo digest gained a required
> `unsubscribeUrl` variable (footer link) that the hosted
> `waypoint-weekly-digest` does not have yet. To sync, `PATCH
> /templates/59c57f36-2569-4b85-b25d-938bc4d36622` adding
> `unsubscribeUrl: string` to `variables`, appending the footer link
> (`{{{unsubscribeUrl}}}`) to html/text, then re-publish. Needs a valid
> Resend key; alternatively edit the template in the dashboard.

Subjects: `Your Waypoint invite`; `Your Waypoint week: {{{weekLabel}}}`
(API triple-mustache form of the requested `{{weekLabel}}`); `Reset
your Waypoint password`. HTML reuses the branded shell from
`templates.ts` (inline CSS, no external assets); each template also
carries a text twin. Variable references in HTML/text use
`{{{key}}}` (unescaped). Fallback values are placeholder examples only —
callers must always supply real values at send time.
