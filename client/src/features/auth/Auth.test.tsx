import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../../app/App.js";

const dashboard = {
  dataRevision: 1, generatedAt: "2026-09-27T08:00:00.000Z", today: "2026-09-27", timeZone: "UTC",
  quarter: { id: "q4", title: "Q4", planRevision: 1 }, state: "LIGHT", hero: { state: "LIGHT", reason: "NO_PLANNED_ITEM", task: null, timing: null, primaryAction: null, secondaryActions: [] }, activeSession: null, upNext: null, optionalToday: null, activityPreview: { startDate: "2026-09-14", endDate: "2026-09-27", days: [] }, milestoneSummary: null, decisionReviewsDue: { count: 0, items: [] },
};
const owner = { id: "owner", name: "Ari Owner", email: "owner@example.test", timeZone: "UTC", role: "OWNER" as const, createdAt: "2026-09-27T08:00:00.000Z" };
const member = { ...owner, id: "member", name: "Mina Member", email: "member@example.test", role: "MEMBER" as const };
const invite = { id: "a".repeat(64), intendedEmail: "new@example.test", role: "MEMBER" as const, bootstrap: false, createdAt: "2026-09-27T08:00:00.000Z", expiresAt: "2026-10-04T08:00:00.000Z", status: "pending" as const };

function response(body: unknown, status = 200) { return new Response(status === 204 ? null : JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }); }
function renderApp(path: string) { return render(<MemoryRouter initialEntries={[path]}><App /></MemoryRouter>); }

afterEach(() => { vi.unstubAllGlobals(); });

describe("authentication checkpoint", () => {
  beforeEach(() => { vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/api/auth/session")) return response({ authenticated: false });
    if (url.includes("/api/auth/login")) return response({ authenticated: true, user: owner });
    if (url.includes("/api/auth/logout")) return response({}, 204);
    return response(dashboard);
  })); });

  it("keeps private routes out of the DOM while loading and redirects unauthenticated visitors", async () => {
    let release!: () => void;
    const pending = new Promise<void>((resolve) => { release = resolve; });
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes("/api/auth/session")) { await pending; return response({ authenticated: false }); }
      return response(dashboard);
    }));
    renderApp("/quarter");
    expect(screen.getByRole("status").textContent).toContain("Checking your session");
    expect(screen.queryByRole("heading", { name: "Today" })).toBeNull();
    release();
    expect(await screen.findByRole("heading", { name: "Sign in" })).toBeTruthy();
  });

  it("signs in and exposes an owner account menu with sign out", async () => {
    const user = userEvent.setup();
    renderApp("/sign-in");
    await user.type(await screen.findByLabelText("Email"), owner.email);
    await user.type(screen.getByLabelText("Password"), "a long passphrase");
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByRole("button", { name: /Ari Owner/ })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: /Ari Owner/ }));
    expect(screen.getByText("Owner")).toBeTruthy();
    await user.click(screen.getByRole("menuitem", { name: "Sign out" }));
    expect(await screen.findByRole("heading", { name: "Sign in" })).toBeTruthy();
  });

  it("supports optional invite-bound authenticator setup during registration", async () => {
    const user = userEvent.setup();
    const qrDataUrl = `data:image/png;base64,${"a".repeat(120)}`;
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/auth/session")) return response({ authenticated: false });
      if (url.includes("/api/auth/totp/setup")) return response({ secret: "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP", qrDataUrl });
      if (url.includes("/api/auth/register")) return response({ authenticated: true, user: owner }, 201);
      return response(dashboard);
    }));
    renderApp("/register");
    await user.type(await screen.findByLabelText("Invite ID"), "wp_inv_test");
    await user.type(screen.getByLabelText("Email"), owner.email);
    await user.type(screen.getByLabelText("Display name"), owner.name);
    await user.type(screen.getByLabelText("Password", { exact: true }), "a sufficiently long passphrase");
    await user.type(screen.getByLabelText("Confirm password"), "a sufficiently long passphrase");
    await user.click(screen.getByRole("button", { name: "Add authenticator" }));
    expect(await screen.findByAltText("QR code for the Waypoint authenticator account")).toBeTruthy();
    await user.type(screen.getByLabelText("Confirm authenticator code"), "123456");
    await user.click(screen.getByRole("button", { name: "Create account" }));
    expect(await screen.findByRole("button", { name: /Ari Owner/ })).toBeTruthy();
  });

  it("reveals the authenticator field only after an enabled account verifies its password", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/api/auth/session")) return response({ authenticated: false });
      if (url.includes("/api/auth/login")) {
        const body = JSON.parse(String(init?.body)) as { totpCode?: string };
        if (!body.totpCode) return response({ code: "TOTP_REQUIRED", detail: "Enter the current code." }, 401);
        return response({ authenticated: true, user: owner });
      }
      return response(dashboard);
    }));
    renderApp("/sign-in");
    await user.type(await screen.findByLabelText("Email"), owner.email);
    await user.type(screen.getByLabelText("Password"), "a long passphrase");
    expect(screen.queryByLabelText("Authenticator code")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    await user.type(await screen.findByLabelText("Authenticator code"), "123456");
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByRole("button", { name: /Ari Owner/ })).toBeTruthy();
  });
});

describe("owner and member authorization UI", () => {
  it("lets owners manage invites from the profile page", async () => {
    const user = userEvent.setup();
    const created = { ...invite, id: "b".repeat(64), intendedEmail: "created@example.test" };
    vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText: vi.fn(async () => undefined) } });
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/api/auth/session")) return response({ authenticated: true, user: owner });
      if (url === "/api/auth/invites" && init?.method === "POST") return response({ inviteId: "wp_inv_secret", invite: created, emailSent: true }, 201);
      if (url.includes("/api/auth/invites/") && init?.method === "DELETE") return response({}, 204);
      if (url === "/api/auth/invites") return response({ items: [invite] });
      if (url.includes("/api/email/preferences")) return response({ digestUnsubscribed: false });
      return response(dashboard);
    }));
    renderApp("/profile");
    await screen.findByRole("heading", { name: "Profile" });
    expect(screen.getByRole("heading", { name: "Member invites" })).toBeTruthy();
    await user.type(screen.getByLabelText("Member email"), "created@example.test");
    await user.click(screen.getByRole("button", { name: "Create invite" }));
    expect(await screen.findByText("wp_inv_secret")).toBeTruthy();
    expect(screen.getByText(/also emailed to the member/)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Copy invite ID" }));
    expect(await screen.findByRole("button", { name: "Copied" })).toBeTruthy();
    await user.click(screen.getAllByRole("button", { name: "Revoke" })[0]!);
    expect(await screen.findByText("Revoked")).toBeTruthy();
  });

  it("shows members their profile without the invite manager", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes("/api/auth/session")) return response({ authenticated: true, user: member });
      if (String(input).includes("/api/email/preferences")) return response({ digestUnsubscribed: false });
      return response(dashboard);
    }));
    renderApp("/profile");
    expect(await screen.findByRole("heading", { name: "Profile" })).toBeTruthy();
    expect(screen.getAllByText("Mina Member").length).toBeGreaterThan(0);
    expect(screen.getByRole("link", { name: "Profile" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Member invites" })).toBeNull();
    expect(screen.queryByLabelText("Member email")).toBeNull();
  });

  it("lets any user toggle the weekly digest preference", async () => {
    const user = userEvent.setup();
    let unsubscribed = false;
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/api/auth/session")) return response({ authenticated: true, user: member });
      if (url.includes("/api/email/preferences") && init?.method === "POST") {
        unsubscribed = (JSON.parse(String(init?.body)) as { digestUnsubscribed: boolean }).digestUnsubscribed;
        return response({ digestUnsubscribed: unsubscribed });
      }
      if (url.includes("/api/email/preferences")) return response({ digestUnsubscribed: unsubscribed });
      return response(dashboard);
    }));
    renderApp("/profile");
    const checkbox = await screen.findByLabelText("Send me weekly digest emails");
    expect((checkbox as HTMLInputElement).checked).toBe(true);
    await user.click(checkbox);
    expect(await screen.findByText("You are unsubscribed from weekly digest emails.")).toBeTruthy();
    expect(unsubscribed).toBe(true);
    await user.click(checkbox);
    expect(await screen.findByText("You are subscribed to weekly digest emails.")).toBeTruthy();
    expect(unsubscribed).toBe(false);
  });
});
