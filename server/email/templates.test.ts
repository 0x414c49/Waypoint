// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  buildInviteTemplate,
  buildPasswordRecoveryEmail,
  buildWeeklyDigestEmail,
  escapeHtml,
} from "./templates.js";
import { buildInviteEmail } from "./mailer.js";

describe("email templates", () => {
  it("builds a styled invite carrying the register link and raw invite id", () => {
    const email = buildInviteTemplate({
      registerUrl: "https://waypoint.example.test/register",
      inviteId: "wp_inv_secret",
      inviterName: "Ali",
      expiresAt: "2026-10-09T00:00:00.000Z",
    });
    expect(email.subject).toBe("Your Waypoint invite");
    expect(email.text).toContain("wp_inv_secret");
    expect(email.text).toContain("https://waypoint.example.test/register");
    expect(email.text).toContain("2026-10-09");
    expect(email.html).toContain("<code>wp_inv_secret</code>");
    // Waypoint identity + email-safe table layout, no external assets.
    expect(email.html).toContain("#315F7C");
    expect(email.html).toContain("<table");
    expect(email.html).not.toMatch(/<img|http[^"]*\.png|fonts\.googleapis/i);
  });

  it("escapes inviter-controlled values in the invite HTML", () => {
    const email = buildInviteTemplate({
      registerUrl: "https://w.example/register?a=1&b=2",
      inviteId: "<b>wp_inv_x</b>",
      inviterName: "<script>alert(1)</script>",
    });
    expect(email.html).not.toContain("<script>");
    expect(email.html).not.toContain("<b>wp_inv_x</b>");
    expect(email.html).toContain("&amp;");
    expect(escapeHtml("<a>&\"")).toBe("&lt;a&gt;&amp;&quot;");
  });

  it("keeps buildInviteEmail delegating with the same signature and behavior", () => {
    const input = {
      registerUrl: "https://waypoint.example.test/register",
      inviteId: "wp_inv_secret",
      inviterName: "Ali",
      expiresAt: "2026-10-09T00:00:00.000Z",
    };
    expect(buildInviteEmail(input)).toEqual(buildInviteTemplate(input));
  });

  it("builds the (UNUSED) weekly digest skeleton with counts, dashboard link, and unsubscribe", () => {
    const email = buildWeeklyDigestEmail({
      recipientName: "Sam",
      weekLabel: "Sep 22 – Sep 28",
      tasksFinished: 5,
      tasksCarried: 2,
      focusSummary: "Shipped auth hardening.",
      dashboardUrl: "https://waypoint.example.test/today",
      unsubscribeUrl: "https://waypoint.example.test/api/email/unsubscribe?token=abc",
    });
    expect(email.subject).toContain("Sep 22");
    expect(email.text).toContain("Finished: 5");
    expect(email.text).toContain("Carried forward: 2");
    expect(email.text).toContain("https://waypoint.example.test/today");
    expect(email.text).toContain("Unsubscribe: https://waypoint.example.test/api/email/unsubscribe?token=abc");
    expect(email.html).toContain("#315F7C");
    expect(email.html).toContain("Unsubscribe from the weekly digest");
    const evil = buildWeeklyDigestEmail({
      recipientName: "<img src=x>",
      weekLabel: "W1",
      tasksFinished: 0,
      tasksCarried: 0,
      focusSummary: "<script>x</script>",
      dashboardUrl: "https://w.example/?a=1&b=2",
      unsubscribeUrl: "https://w.example/u?x=<script>",
    });
    expect(evil.html).not.toContain("<script>");
    expect(evil.html).not.toContain("<img");
    expect(evil.html).toContain("&amp;");
  });

  it("builds the (UNUSED) password recovery skeleton with expiry minutes", () => {
    const email = buildPasswordRecoveryEmail({
      resetUrl: "https://waypoint.example.test/reset?token=abc",
      expiresMinutes: 30,
    });
    expect(email.subject).toBe("Reset your Waypoint password");
    expect(email.text).toContain("30 minutes");
    expect(email.text).toContain("https://waypoint.example.test/reset?token=abc");
    expect(email.html).toContain("Choose a new password");
    const evil = buildPasswordRecoveryEmail({ resetUrl: "https://w.example/?x=<script>", expiresMinutes: 15 });
    expect(evil.html).not.toContain("<script>");
  });
});
