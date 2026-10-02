// Email foundation for Waypoint: one Mailer port with a Resend implementation.
// Uses the platform fetch API directly — no SDK dependency by design (KISS).
// Unconfigured (no API key or sender) → NoopMailer, every send is a no-op.
// Future callers: invite emails now; weekly digest and password recovery later.

export interface EmailMessage {
  readonly to: string;
  readonly subject: string;
  readonly text: string;
  readonly html?: string;
  /**
   * Optional transport headers (e.g. List-Unsubscribe for bulk mail).
   * Forwarded verbatim to Resend; names/values must be single-line.
   */
  readonly headers?: Record<string, string>;
}

export interface MailSendResult {
  readonly sent: boolean;
  readonly providerId?: string;
}

export interface Mailer {
  /** False when email is not configured; send() is then a no-op returning { sent: false }. */
  readonly configured: boolean;
  send(message: EmailMessage): Promise<MailSendResult>;
}

export class MailerError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "MailerError";
  }
}

const RESEND_ENDPOINT = "https://api.resend.com/emails";

function assertMessage(message: EmailMessage): void {
  if (!/^\S+@\S+\.\S+$/.test(message.to) || message.to.length > 320) {
    throw new MailerError("Refusing to send to an invalid email address.");
  }
  if (!message.subject || message.subject.length > 200) {
    throw new MailerError("Refusing to send an email with an invalid subject.");
  }
  if (!message.text || message.text.length > 20_000) {
    throw new MailerError("Refusing to send an email with an invalid body.");
  }
  if (message.headers !== undefined) {
    const names = Object.keys(message.headers);
    if (names.length > 10) throw new MailerError("Refusing to send an email with too many headers.");
    for (const [name, value] of Object.entries(message.headers)) {
      if (!name || name.length > 100 || !value || value.length > 1000 || /[\r\n]/.test(name) || /[\r\n]/.test(value)) {
        throw new MailerError("Refusing to send an email with an invalid header.");
      }
    }
  }
}

import { buildInviteTemplate } from "./templates.js";

export { escapeHtml } from "./templates.js";

export class NoopMailer implements Mailer {
  readonly configured = false;
  async send(): Promise<MailSendResult> {
    return { sent: false };
  }
}

type FetchImpl = typeof fetch;

export class ResendMailer implements Mailer {
  readonly configured = true;
  constructor(
    private readonly options: {
      apiKey: string;
      from: string;
      fetchImpl?: FetchImpl;
      timeoutMs?: number;
    },
  ) {
    if (!options.apiKey) throw new MailerError("A Resend API key is required.");
    if (!options.from || options.from.length > 320) throw new MailerError("A sender address is required.");
  }

  async send(message: EmailMessage): Promise<MailSendResult> {
    assertMessage(message);
    const runFetch = this.options.fetchImpl ?? fetch;
    let response: Response;
    try {
      response = await runFetch(RESEND_ENDPOINT, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.options.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: this.options.from,
          to: [message.to],
          subject: message.subject,
          text: message.text,
          ...(message.html ? { html: message.html } : {}),
          ...(message.headers ? { headers: message.headers } : {}),
        }),
        signal: AbortSignal.timeout(this.options.timeoutMs ?? 10_000),
      });
    } catch (error) {
      throw new MailerError(
        `The email could not be delivered: ${error instanceof Error ? error.message : "network error"}`,
      );
    }
    if (!response.ok) {
      let detail = "";
      try {
        const body = (await response.json()) as { message?: unknown };
        if (typeof body.message === "string" && body.message) detail = `: ${body.message.slice(0, 200)}`;
      } catch {
        detail = "";
      }
      throw new MailerError(`Resend rejected the email (HTTP ${response.status})${detail}.`, response.status);
    }
    let providerId: string | undefined;
    try {
      const body = (await response.json()) as { id?: unknown };
      if (typeof body.id === "string") providerId = body.id;
    } catch {
      providerId = undefined;
    }
    return { sent: true, ...(providerId ? { providerId } : {}) };
  }
}

export function createMailer(options: { apiKey?: string | undefined; from?: string | undefined }): Mailer {
  const apiKey = options.apiKey?.trim();
  const from = options.from?.trim();
  if (!apiKey || !from) return new NoopMailer();
  return new ResendMailer({ apiKey, from });
}

export interface InviteEmailInput {
  readonly registerUrl: string;
  readonly inviteId: string;
  readonly inviterName?: string;
  readonly expiresAt?: string;
}

/** Shared template for member invites. Raw invite ID travels only in this email and the one-time API response. */
export function buildInviteEmail(input: InviteEmailInput): { subject: string; text: string; html: string } {
  return buildInviteTemplate(input);
}
