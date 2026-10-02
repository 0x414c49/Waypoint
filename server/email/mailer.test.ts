// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { buildInviteEmail, createMailer, escapeHtml, NoopMailer, ResendMailer } from "./mailer.js";

function okResponse(body: unknown = { id: "re_123" }): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
}

describe("email foundation", () => {
  it("returns a noop mailer when the API key or sender is missing", async () => {
    for (const options of [{}, { apiKey: "key" }, { from: "Waypoint <noreply@example.com>" }]) {
      const mailer = createMailer(options);
      expect(mailer).toBeInstanceOf(NoopMailer);
      expect(mailer.configured).toBe(false);
      await expect(mailer.send({ to: "a@example.com", subject: "s", text: "t" })).resolves.toEqual({ sent: false });
    }
  });

  it("posts to Resend with bearer auth and returns the provider id", async () => {
    const fetchImpl = vi.fn(async () => okResponse({ id: "re_abc" }));
    const mailer = new ResendMailer({ apiKey: "re_key", from: "Waypoint <noreply@example.com>", fetchImpl: fetchImpl as unknown as typeof fetch });
    const result = await mailer.send({ to: "member@example.com", subject: "Hi", text: "hello", headers: { "List-Unsubscribe": "<https://w.example/u>" } });
    expect(result).toEqual({ sent: true, providerId: "re_abc" });
    expect(fetchImpl).toHaveBeenCalledOnce();
    const [url, init] = (fetchImpl.mock.calls[0] as unknown) as [string, RequestInit];
    expect(url).toBe("https://api.resend.com/emails");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer re_key");
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body).toMatchObject({ from: "Waypoint <noreply@example.com>", subject: "Hi" });
    expect(body.to).toEqual(["member@example.com"]);
    expect(body.headers).toEqual({ "List-Unsubscribe": "<https://w.example/u>" });
  });

  it("throws without sending on invalid addresses", async () => {
    const fetchImpl = vi.fn(async () => okResponse());
    const mailer = new ResendMailer({ apiKey: "re_key", from: "Waypoint <noreply@example.com>", fetchImpl: fetchImpl as unknown as typeof fetch });
    await expect(mailer.send({ to: "not-an-email", subject: "s", text: "t" })).rejects.toThrow(/invalid email/i);
    await expect(mailer.send({ to: "a@example.com", subject: "s", text: "t", headers: { "Bad\nName": "x" } })).rejects.toThrow(/invalid header/i);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("surfaces Resend rejections with the HTTP status", async () => {
    const fetchImpl = vi.fn(
      async () => new Response(JSON.stringify({ message: "Invalid `from` address." }), { status: 422 }),
    );
    const mailer = new ResendMailer({ apiKey: "bad", from: "Waypoint <noreply@example.com>", fetchImpl: fetchImpl as unknown as typeof fetch });
    const error = (await mailer.send({ to: "a@example.com", subject: "s", text: "t" }).catch((cause: unknown) => cause)) as Error & { status?: number };
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toMatch(/422/);
    expect(error.status).toBe(422);
  });

  it("builds an invite email carrying the register link and raw invite id", () => {
    const email = buildInviteEmail({ registerUrl: "https://waypoint.example.test/register", inviteId: "wp_inv_secret", inviterName: "Ali", expiresAt: "2026-10-09T00:00:00.000Z" });
    expect(email.subject).toBe("Your Waypoint invite");
    expect(email.text).toContain("wp_inv_secret");
    expect(email.text).toContain("https://waypoint.example.test/register");
    expect(email.text).toContain("2026-10-09");
    expect(email.html).toContain("<code>wp_inv_secret</code>");
  });

  it("escapes inviter-controlled values in the HTML invite", () => {
    const email = buildInviteEmail({ registerUrl: "https://w.example/register", inviteId: "wp_inv_x", inviterName: "<script>alert(1)</script>" });
    expect(email.html).not.toContain("<script>");
    expect(escapeHtml("<a>&\"")).toBe("&lt;a&gt;&amp;&quot;");
  });
});
