import type { JourneyStore } from "../ports/journey-store.js";

export interface CurrentUserProvider {
  getCurrentUserId(): Promise<string>;
}

export class LocalCurrentUserProvider implements CurrentUserProvider {
  constructor(
    private readonly store: JourneyStore,
    private readonly localUserId = "local-user",
  ) {}

  async getCurrentUserId(): Promise<string> {
    return this.store.read((state) => {
      if (!state.records.users[this.localUserId]) {
        throw new Error("The canonical local user is missing from the validated store.");
      }
      return this.localUserId;
    });
  }
}
