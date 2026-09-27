// @vitest-environment node
import { describe, expect, it } from "vitest";
import { AsyncMutex } from "./async-mutex.js";

describe("AsyncMutex", () => {
  it("returns STORE_BUSY when serialized write authority times out", async () => {
    const mutex = new AsyncMutex();
    const release = await mutex.acquire(50);
    await expect(mutex.acquire(1)).rejects.toMatchObject({ code: "STORE_BUSY" });
    release();
    const releaseNext = await mutex.acquire(50);
    releaseNext();
  });
});
