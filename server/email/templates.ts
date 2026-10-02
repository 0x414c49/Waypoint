// In-repo email templates for Waypoint (versioned, no dashboard drift).
//
// Resend DOES offer a hosted transactional-templates API (POST /templates,
// publish, then send with `{ template: { id, variables } }`), but this
// project keeps templates in-repo by choice: versioned in git, no dashboard
// drift, rendered through the existing ResendMailer text+html path.
//
// Status:
// - buildInviteTemplate: PRODUCTION — wired to POST /api/auth/invites.
// - buildWeeklyDigestEmail: UNUSED skeleton — no digest route/scheduler exists.
// - buildPasswordRecoveryEmail: UNUSED skeleton — no reset-token system exists;
//   do NOT build one from this template alone.

export interface EmailTemplateOutput {
  readonly subject: string;
  readonly text: string;
  readonly html: string;
}

export function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// ---------------------------------------------------------------------------
// Shared shell (Waypoint identity, email-safe: tables + inline CSS only)
// ---------------------------------------------------------------------------

const ACCENT = "#315F7C";
const TEXT = "#253139";
const TEXT_SECONDARY = "#5D6A70";
const CANVAS = "#F2F5F3";
const SURFACE = "#FCFDFC";
const BORDER = "#D5DEDA";
const ACCENT_SOFT = "#E4EDF3";
const FONT = "'Avenir Next','Segoe UI',system-ui,-apple-system,sans-serif";
const MONO = "ui-monospace,SFMono-Regular,Menlo,Consolas,monospace";

/** Table-based shell: header wordmark, body slot, quiet footer. No external assets. */
function shell(bodyInner: string): string {
  return [
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${CANVAS};padding:24px 0;margin:0;">`,
    `<tr><td align="center" style="padding:0 16px;">`,
    `<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background-color:${SURFACE};border:1px solid ${BORDER};border-radius:6px;">`,
    `<tr><td style="padding:20px 24px 0 24px;font-family:${FONT};font-size:13px;font-weight:600;letter-spacing:0.04em;color:${ACCENT};">&#9670; Waypoint</td></tr>`,
    `<tr><td style="padding:12px 24px 0 24px;">${bodyInner}</td></tr>`,
    `<tr><td style="padding:16px 24px 24px 24px;font-family:${FONT};font-size:12px;line-height:16px;color:${TEXT_SECONDARY};">Waypoint is a private learning log. If you were not expecting this email, you can ignore it.</td></tr>`,
    `</table>`,
    `</td></tr>`,
    `</table>`,
  ].join("");
}

function heading(text: string): string {
  return `<p style="font-family:${FONT};font-size:22px;line-height:30px;font-weight:600;color:${TEXT};margin:0 0 12px 0;">${text}</p>`;
}

function paragraph(text: string): string {
  return `<p style="font-family:${FONT};font-size:15px;line-height:22px;color:${TEXT};margin:0 0 12px 0;">${text}</p>`;
}

function muted(text: string): string {
  return `<p style="font-family:${FONT};font-size:13px;line-height:18px;color:${TEXT_SECONDARY};margin:0 0 12px 0;">${text}</p>`;
}

function button(url: string, label: string): string {
  return (
    `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:16px 0;"><tr><td ` +
    `style="background-color:${ACCENT};border-radius:5px;" bgcolor="${ACCENT}">` +
    `<a href="${url}" style="display:inline-block;padding:12px 24px;font-family:${FONT};font-size:14px;font-weight:600;color:#FFFFFF;text-decoration:none;">${label}</a>` +
    `</td></tr></table>`
  );
}

function codeBlock(value: string): string {
  return (
    `<p style="font-family:${MONO};font-size:14px;line-height:20px;color:${TEXT};` +
    `background-color:${ACCENT_SOFT};border:1px solid ${BORDER};border-radius:5px;padding:12px 16px;` +
    `word-break:break-all;margin:0 0 12px 0;"><code>${value}</code></p>`
  );
}

// ---------------------------------------------------------------------------
// a. INVITE (production)
// ---------------------------------------------------------------------------

export interface InviteTemplateVars {
  readonly registerUrl: string;
  readonly inviteId: string;
  readonly inviterName?: string;
  readonly expiresAt?: string;
}

/** Production invite email. Same inputs/behavior contract as the original buildInviteEmail. */
export function buildInviteTemplate(input: InviteTemplateVars): EmailTemplateOutput {
  const inviter = input.inviterName?.trim();
  const who = inviter ? ` from ${inviter}` : "";
  const expiry = input.expiresAt ? ` It expires on ${input.expiresAt.slice(0, 10)} and can be used once.` : "";
  const subject = "Your Waypoint invite";
  const text = [
    `You were invited to join a Waypoint${who}.`,
    "",
    "Open the registration page and paste this invite ID:",
    "",
    input.inviteId,
    "",
    input.registerUrl,
    "",
    `Use the email address this message was sent to.${expiry}`,
  ].join("\n");
  const html = shell(
    [
      heading(`You are invited to Waypoint${escapeHtml(who)}`),
      paragraph(`Open the <a href="${escapeHtml(input.registerUrl)}" style="color:${ACCENT};">registration page</a> and paste this invite ID:`),
      codeBlock(escapeHtml(input.inviteId)),
      button(escapeHtml(input.registerUrl), "Open registration"),
      muted(`Use the email address this message was sent to.${escapeHtml(expiry)}`),
    ].join(""),
  );
  return { subject, text, html };
}

// ---------------------------------------------------------------------------
// b. WEEKLY DIGEST (UNUSED skeleton — not wired to any route)
// ---------------------------------------------------------------------------

export interface WeeklyDigestVars {
  readonly recipientName: string;
  readonly weekLabel: string;
  readonly tasksFinished: number;
  readonly tasksCarried: number;
  readonly focusSummary: string;
  readonly dashboardUrl: string;
  /** One-click opt-out for this recipient (issueDigestUnsubscribeUrl). Required so every digest carries its way out. */
  readonly unsubscribeUrl: string;
}

/**
 * UNUSED skeleton for a future weekly digest. No route, scheduler, or worker
 * sends this today. Counts are plain numbers; no task rows are embedded.
 * When it ships, the sender must skip users where isDigestUnsubscribed() is
 * true and pass List-Unsubscribe headers (see mailer EmailMessage.headers).
 */
export function buildWeeklyDigestEmail(input: WeeklyDigestVars): EmailTemplateOutput {
  const subject = `Your Waypoint week: ${input.weekLabel}`;
  const text = [
    `Hi ${input.recipientName}, here is your Waypoint week (${input.weekLabel}).`,
    "",
    `Finished: ${input.tasksFinished}`,
    `Carried forward: ${input.tasksCarried}`,
    "",
    `Focus: ${input.focusSummary}`,
    "",
    `Open your dashboard: ${input.dashboardUrl}`,
    "",
    `No longer want these? Unsubscribe: ${input.unsubscribeUrl}`,
  ].join("\n");
  const html = shell(
    [
      heading(`Your week: ${escapeHtml(input.weekLabel)}`),
      paragraph(`Hi ${escapeHtml(input.recipientName)}, here is what your log recorded.`),
      `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 12px 0;">` +
        `<tr>` +
        `<td style="font-family:${FONT};font-size:13px;color:${TEXT_SECONDARY};padding-right:24px;">Finished<br><span style="font-size:22px;font-weight:600;color:${TEXT};">${input.tasksFinished}</span></td>` +
        `<td style="font-family:${FONT};font-size:13px;color:${TEXT_SECONDARY};">Carried forward<br><span style="font-size:22px;font-weight:600;color:${TEXT};">${input.tasksCarried}</span></td>` +
        `</tr></table>`,
      paragraph(`Focus: ${escapeHtml(input.focusSummary)}`),
      button(escapeHtml(input.dashboardUrl), "Open dashboard"),
      muted(`Week: ${escapeHtml(input.weekLabel)}.`),
      muted(`<a href="${escapeHtml(input.unsubscribeUrl)}" style="color:${TEXT_SECONDARY};">Unsubscribe from the weekly digest</a>`),
    ].join(""),
  );
  return { subject, text, html };
}

// ---------------------------------------------------------------------------
// c. PASSWORD RECOVERY (UNUSED skeleton — no reset-token system exists)
// ---------------------------------------------------------------------------

export interface PasswordRecoveryVars {
  readonly resetUrl: string;
  readonly expiresMinutes: number;
}

/**
 * UNUSED skeleton for a future password-recovery email. No reset-token
 * system, route, or expiry enforcement exists yet — do NOT build one from
 * this template alone.
 */
export function buildPasswordRecoveryEmail(input: PasswordRecoveryVars): EmailTemplateOutput {
  const subject = "Reset your Waypoint password";
  const text = [
    "Someone requested a password reset for your Waypoint account.",
    "",
    `Open this link to choose a new password (valid for ${input.expiresMinutes} minutes):`,
    "",
    input.resetUrl,
    "",
    "If you did not request this, you can ignore this email.",
  ].join("\n");
  const html = shell(
    [
      heading("Reset your password"),
      paragraph("Someone requested a password reset for your Waypoint account."),
      button(escapeHtml(input.resetUrl), "Choose a new password"),
      muted(
        `This link is valid for ${input.expiresMinutes} minutes. If you did not request it, you can ignore this email.`,
      ),
      muted(`Or paste this link: ${escapeHtml(input.resetUrl)}`),
    ].join(""),
  );
  return { subject, text, html };
}
