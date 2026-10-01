import type { AuthInviteCreateResponse, AuthInviteList, AuthSessionResponse, AuthUser, TotpSetupResponse } from "../../../../shared/contracts/auth.js";

export type Problem = {
  code?: string;
  title?: string;
  detail?: string;
  errors?: string[];
  status?: number;
};

export class AuthApiError extends Error {
  constructor(readonly status: number, readonly problem: Problem, fallback = "The request could not be completed.") {
    super(problem.detail ?? fallback);
    this.name = "AuthApiError";
  }
}

async function readBody(response: Response): Promise<unknown> {
  try { return await response.json(); } catch { return {}; }
}

async function request<T>(url: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(url, {
    credentials: "same-origin",
    headers: { Accept: "application/json", ...(init.body ? { "Content-Type": "application/json" } : {}), ...init.headers },
    ...init,
  });
  const body = await readBody(response);
  if (!response.ok) throw new AuthApiError(response.status, body as Problem);
  return body as T;
}

export async function getSession(signal?: AbortSignal): Promise<AuthSessionResponse> {
  return request<AuthSessionResponse>("/api/auth/session", signal ? { signal } : undefined);
}

export async function signIn(email: string, password: string, totpCode?: string): Promise<AuthUser> {
  const result = await request<AuthSessionResponse>("/api/auth/login", { method: "POST", body: JSON.stringify({ email, password, totpCode }) });
  if (!result.authenticated || !result.user) throw new AuthApiError(500, {}, "The sign-in response was incomplete.");
  return result.user;
}

export async function prepareTotp(inviteId: string, email: string): Promise<TotpSetupResponse> {
  return request<TotpSetupResponse>("/api/auth/totp/setup", { method: "POST", body: JSON.stringify({ inviteId, email }) });
}

export async function register(input: { inviteId: string; email: string; name: string; timeZone: string; password: string; totpSecret?: string; totpCode?: string }): Promise<AuthUser> {
  const result = await request<AuthSessionResponse>("/api/auth/register", { method: "POST", body: JSON.stringify(input) });
  if (!result.authenticated || !result.user) throw new AuthApiError(500, {}, "The registration response was incomplete.");
  return result.user;
}

export async function signOut(): Promise<void> {
  await request<void>("/api/auth/logout", { method: "POST" });
}

export async function listInvites(): Promise<AuthInviteList> {
  return request<AuthInviteList>("/api/auth/invites");
}

export async function createInvite(email: string): Promise<AuthInviteCreateResponse> {
  return request<AuthInviteCreateResponse>("/api/auth/invites", { method: "POST", body: JSON.stringify({ email }) });
}

export async function revokeInvite(id: string): Promise<void> {
  await request<void>(`/api/auth/invites/${encodeURIComponent(id)}`, { method: "DELETE" });
}
