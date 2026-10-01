import { AsyncLocalStorage } from "node:async_hooks";
import { AppError } from "../application/app-error.js";
import type { AuthRole } from "../domain/journey-state.js";
import type { JourneyStore } from "../ports/journey-store.js";

export interface AuthenticatedCurrentUser {
  readonly id: string;
  readonly accountId: string;
  readonly name: string;
  readonly email: string;
  readonly timeZone: string;
  readonly role: AuthRole;
  readonly createdAt: string;
}

export class AuthenticatedCurrentUserProvider {
  private readonly context = new AsyncLocalStorage<AuthenticatedCurrentUser | undefined>();
  private readonly requests = new Map<string, AuthenticatedCurrentUser>();
  constructor(private readonly store: JourneyStore) {}

  setCurrentUser(user: AuthenticatedCurrentUser | undefined): void {
    this.context.enterWith(user);
  }

  setRequestUser(requestId: string, user: AuthenticatedCurrentUser | undefined): void { if (user) this.requests.set(requestId, user); else this.requests.delete(requestId); }
  runRequest(requestId: string, callback: () => void): void { this.context.run(this.requests.get(requestId), callback); }

  async getCurrentUserId(): Promise<string> {
    return (await this.getCurrentUser()).id;
  }

  async getCurrentUser(): Promise<AuthenticatedCurrentUser> {
    const current = this.context.getStore();
    if (!current) throw new AppError(401, "AUTHENTICATION_REQUIRED", "Authentication required", "Sign in to use this local resource.");
    return current;
  }

  async readUser(userId: string): Promise<AuthenticatedCurrentUser | undefined> {
    return this.store.read((state) => {
      const account = Object.values(state.records.accounts ?? {}).find((candidate) => candidate.userId === userId && !candidate.disabledAt);
      const user = state.records.users[userId];
      if (!account || !user) return undefined;
      return { id: user.id, accountId: account.id, name: user.name, email: account.email, timeZone: user.timeZone, role: account.role, createdAt: user.createdAt };
    });
  }
}
