import {
  chmod,
  mkdir,
  open,
  readdir,
  readFile,
  rename,
  rm,
  stat,
} from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import type { JourneyState } from "../../domain/journey-state.js";
import type {
  JourneyStore,
  Mutation,
  TransactionIntent,
  TransactionResult,
} from "../../ports/journey-store.js";
import { AsyncMutex } from "./async-mutex.js";
import { StoreError } from "./errors.js";
import {
  assertValidState,
  clone,
  deepFreeze,
  parseJson,
  serializeJourneyState,
} from "./state-codec.js";
import { assertJourneyStateTransition } from "./transition-policy.js";
import type {
  JsonJourneyStoreOptions,
  StoreDiagnostics,
  StoreMarker,
} from "./types.js";

export class JsonJourneyStore implements JourneyStore {
  private readonly directory: string;
  private readonly primaryPath: string;
  private readonly backupPath: string;
  private readonly markerPath: string;
  private readonly mutex = new AsyncMutex();
  private diagnostics?: StoreDiagnostics;

  constructor(private readonly options: JsonJourneyStoreOptions) {
    this.directory = resolve(options.directory);
    this.primaryPath = join(this.directory, "journey-state.json");
    this.backupPath = join(this.directory, "journey-state.backup.json");
    this.markerPath = join(this.directory, ".journey-store");
  }

  async initialize(): Promise<StoreDiagnostics> {
    const release = await this.mutex.acquire(this.options.mutexTimeoutMs ?? 5_000);
    try {
      const initialized = !(await this.pathExists(this.directory));
      if (initialized) await this.initializeNewStore();
      const marker = await this.readMarker();
      try {
        await this.loadState();
      } catch (error) {
        if (
          error instanceof StoreError &&
          (error.code === "STORE_CORRUPT" || error.code === "STORE_SCHEMA_UNSUPPORTED") &&
          (await this.hasValidatedBackup())
        ) {
          throw new StoreError(
            error.code,
            `${error.message} A validated backup is available at ${this.backupPath}; it was not restored automatically.`,
            error,
          );
        }
        throw error;
      }
      const cleanedAbandonedTemps = await this.cleanAbandonedCommitTemps();
      let durability: "full" | "reduced" = "full";
      try {
        await this.syncDirectory(this.directory);
      } catch {
        durability = "reduced";
      }
      this.diagnostics = {
        initialized,
        storeId: marker.storeId,
        durability,
        cleanedAbandonedTemps,
      };
      return this.diagnostics;
    } finally {
      release();
    }
  }

  getDiagnostics(): StoreDiagnostics {
    if (!this.diagnostics) throw new Error("The store has not been initialized.");
    return this.diagnostics;
  }

  async read<T>(project: (state: JourneyState) => T): Promise<T> {
    this.assertInitialized();
    const state = deepFreeze(await this.loadState()) as JourneyState;
    return clone(project(state));
  }

  async transact<T>(
    intent: TransactionIntent,
    mutate: (draft: JourneyState) => Mutation<T>,
  ): Promise<TransactionResult<T>> {
    this.assertInitialized();
    const release = await this.mutex.acquire(this.options.mutexTimeoutMs ?? 5_000);
    try {
      const before = await this.loadState();
      const draft = clone(before);
      const mutation = mutate(draft);
      if (mutation.kind === "no-change") {
        return deepFreeze({
          value: clone(mutation.value),
          state: clone(before),
          changed: false,
        }) as TransactionResult<T>;
      }

      draft.storeRevision = before.storeRevision + 1;
      draft.writtenAt = this.options.clock.now().toISOString();
      assertValidState(draft);
      assertJourneyStateTransition(before, draft, intent);
      await this.commit(before, draft);
      return deepFreeze({
        value: clone(mutation.value),
        state: clone(draft),
        changed: true,
      }) as TransactionResult<T>;
    } finally {
      release();
    }
  }

  private assertInitialized(): void {
    if (!this.diagnostics) throw new Error("Call initialize() before using the store.");
  }

  private async initializeNewStore(): Promise<void> {
    const parent = dirname(this.directory);
    const prefix = `.${basename(this.directory)}.init-`;
    await mkdir(parent, { recursive: true, mode: 0o700 });
    const siblings = await readdir(parent);
    const abandoned = siblings.filter((name) => name.startsWith(prefix));
    if (abandoned.length > 0) {
      throw new StoreError(
        "RECOVERY_REQUIRED",
        `Interrupted initialization found: ${abandoned.join(", ")}. Preserve it and recover explicitly.`,
      );
    }

    const instant = this.options.clock.now().toISOString();
    const initDirectory = join(parent, `${prefix}${this.options.idGenerator.generate()}`);
    await mkdir(initDirectory, { mode: 0o700 });
    const marker: StoreMarker = {
      storeId: this.options.idGenerator.generate(),
      createdAt: instant,
    };
    const seed = this.options.seed(instant);
    assertValidState(seed);
    await this.writeFlushedFile(
      join(initDirectory, ".journey-store"),
      `${JSON.stringify(marker, null, 2)}\n`,
    );
    await this.writeFlushedFile(
      join(initDirectory, "journey-state.json"),
      serializeJourneyState(seed),
    );
    await this.syncDirectory(initDirectory);
    try {
      await rename(initDirectory, this.directory);
      await this.syncDirectory(parent);
    } catch (error) {
      if (await this.pathExists(this.directory)) {
        await rm(initDirectory, { recursive: true, force: true });
        return;
      }
      throw new StoreError(
        "RECOVERY_REQUIRED",
        `Initialization stopped before the store became authoritative. Preserve ${initDirectory}.`,
        error,
      );
    }
  }

  private async readMarker(): Promise<StoreMarker> {
    if (!(await this.pathExists(this.markerPath))) {
      throw new StoreError(
        "RECOVERY_REQUIRED",
        "The store directory has no authority marker. Preserve it and recover explicitly.",
      );
    }
    if (!(await this.pathExists(this.primaryPath))) {
      throw new StoreError(
        "RECOVERY_REQUIRED",
        "The marked store has no primary document. Preserve all artifacts and recover explicitly.",
      );
    }
    let marker: unknown;
    try {
      marker = parseJson(await readFile(this.markerPath, "utf8"), "The store marker");
    } catch (error) {
      throw new StoreError("RECOVERY_REQUIRED", "The store authority marker is invalid.", error);
    }
    if (
      !marker ||
      typeof marker !== "object" ||
      !("storeId" in marker) ||
      typeof marker.storeId !== "string" ||
      marker.storeId.length === 0 ||
      !("createdAt" in marker) ||
      typeof marker.createdAt !== "string" ||
      Number.isNaN(new Date(marker.createdAt).valueOf())
    ) {
      throw new StoreError("RECOVERY_REQUIRED", "The store authority marker is invalid.");
    }
    return { storeId: marker.storeId, createdAt: marker.createdAt };
  }

  private async loadState(): Promise<JourneyState> {
    let contents: string;
    try {
      contents = await readFile(this.primaryPath, "utf8");
    } catch (error) {
      throw new StoreError("RECOVERY_REQUIRED", "The primary store document cannot be read.", error);
    }
    const value = parseJson(contents, "The primary store document");
    assertValidState(value);
    return value;
  }

  private async commit(before: JourneyState, candidate: JourneyState): Promise<void> {
    const suffix = this.options.idGenerator.generate();
    const candidateTemp = join(this.directory, `.journey-state.commit-${suffix}.json`);
    const backupTemp = join(this.directory, `.journey-state.backup-${suffix}.json`);
    let primaryRenamed = false;
    try {
      const serialized = serializeJourneyState(candidate);
      const reparsed = parseJson(serialized, "The serialized candidate");
      assertValidState(reparsed);
      await this.writeFlushedFile(candidateTemp, serialized);
      await this.writeFlushedFile(backupTemp, serializeJourneyState(before));
      await rename(backupTemp, this.backupPath);
      this.options.failpoint?.("before-primary-rename");
      await rename(candidateTemp, this.primaryPath);
      primaryRenamed = true;
      this.options.failpoint?.("after-primary-rename");
      await this.syncDirectory(this.directory);
    } catch (error) {
      if (primaryRenamed) {
        throw new StoreError(
          "STORE_DURABILITY_UNCERTAIN",
          "The change may have committed. Retry the identical command key.",
          error,
        );
      }
      throw new StoreError(
        "STORE_WRITE_FAILED",
        "The local store could not be written; the prior primary remains authoritative.",
        error,
      );
    }
  }

  private async writeFlushedFile(path: string, contents: string): Promise<void> {
    const handle = await open(path, "wx", 0o600);
    try {
      await handle.writeFile(contents, "utf8");
      await handle.sync();
    } finally {
      await handle.close();
    }
    await chmod(path, 0o600);
  }

  private async cleanAbandonedCommitTemps(): Promise<string[]> {
    const names = await readdir(this.directory);
    const abandoned = names.filter(
      (name) =>
        name.startsWith(".journey-state.commit-") ||
        name.startsWith(".journey-state.backup-"),
    );
    for (const name of abandoned) await rm(join(this.directory, name));
    return abandoned.sort();
  }

  private async hasValidatedBackup(): Promise<boolean> {
    if (!(await this.pathExists(this.backupPath))) return false;
    try {
      const backup = parseJson(await readFile(this.backupPath, "utf8"), "The rolling backup");
      assertValidState(backup);
      return true;
    } catch {
      return false;
    }
  }

  private async syncDirectory(directory: string): Promise<void> {
    const handle = await open(directory, "r");
    try {
      await handle.sync();
    } finally {
      await handle.close();
    }
  }

  private async pathExists(path: string): Promise<boolean> {
    try {
      await stat(path);
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
      throw error;
    }
  }
}
