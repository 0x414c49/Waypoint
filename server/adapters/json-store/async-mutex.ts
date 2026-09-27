import { StoreError } from "./errors.js";

export class AsyncMutex {
  private locked = false;
  private readonly queue: Array<{
    resolve: (release: () => void) => void;
    reject: (error: StoreError) => void;
    timer: ReturnType<typeof setTimeout>;
  }> = [];

  async acquire(timeoutMs: number): Promise<() => void> {
    if (!this.locked) {
      this.locked = true;
      return this.createRelease();
    }

    return new Promise((resolveAcquire, rejectAcquire) => {
      const queued = {
        resolve: resolveAcquire,
        reject: rejectAcquire,
        timer: setTimeout(() => {
          const index = this.queue.indexOf(queued);
          if (index >= 0) this.queue.splice(index, 1);
          rejectAcquire(new StoreError("STORE_BUSY", "The local store is busy. Try again."));
        }, timeoutMs),
      };
      this.queue.push(queued);
    });
  }

  private createRelease(): () => void {
    let released = false;
    return () => {
      if (released) return;
      released = true;
      const next = this.queue.shift();
      if (next) {
        clearTimeout(next.timer);
        next.resolve(this.createRelease());
      } else {
        this.locked = false;
      }
    };
  }
}
