import { chmod, mkdir, open, readFile, rm, readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { Type } from "@sinclair/typebox";
import type { IdGenerator } from "../ports/id-generator.js";
import type { JourneyStore } from "../ports/journey-store.js";
import type { CurrentUserProvider } from "../adapters/local-current-user-provider.js";
import type { Clock } from "../ports/clock.js";
import type {
  FastifyBaseLogger,
  FastifyInstance,
  RawReplyDefaultExpression,
  RawRequestDefaultExpression,
  RawServerDefault,
} from "fastify";
import type { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";

const ImageBody = Type.Object({
  dataUrl: Type.String({ maxLength: 2_800_000, pattern: "^data:image/(png|jpeg|gif|webp);base64,[A-Za-z0-9+/=]+$" }),
}, { additionalProperties: false });
const ImageParams = Type.Object({
  filename: Type.String({ pattern: "^image-[a-z0-9][a-z0-9._-]{0,126}\\.(png|jpe?g|gif|webp)$" }),
}, { additionalProperties: false });

const mimeExtensions: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/gif": "gif", "image/webp": "webp" };
const extensionTypes: Record<string, "image/png" | "image/jpeg" | "image/gif" | "image/webp"> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp" };

export async function reconcileLegacyMedia(directory: string, store: JourneyStore, createdAt: string): Promise<void> {
  let names: string[];
  try { names = await readdir(directory); } catch { return; }
  const candidates = names.filter((name) => /^image-[a-z0-9][a-z0-9._-]{0,126}\.(png|jpe?g|gif|webp)$/.test(name));
  if (!candidates.length) return;
  const metadata: Array<{ filename: string; byteLength: number; mediaType: "image/png" | "image/jpeg" | "image/gif" | "image/webp" }> = [];
  for (const filename of candidates) {
    const extension = filename.split(".").at(-1)!.toLowerCase();
    try { const info = await stat(join(directory, filename)); if (info.size > 0 && info.size <= 2 * 1024 * 1024) metadata.push({ filename, byteLength: info.size, mediaType: extensionTypes[extension]! }); } catch { /* a concurrent cleanup can leave a listed file absent */ }
  }
  if (!metadata.length) return;
  await store.transact({ kind: "AUTHENTICATION" }, (draft) => {
    draft.records.mediaRecords ??= {};
    let changed = false;
    for (const item of metadata) {
      if (!draft.records.mediaRecords[item.filename]) {
        draft.records.mediaRecords[item.filename] = { id: item.filename, filename: item.filename, userId: "local-user", mediaType: item.mediaType, byteLength: item.byteLength, createdAt };
        changed = true;
      }
    }
    return { kind: changed ? "changed" : "no-change", value: undefined };
  });
}

function imageType(data: Buffer): string | null {
  if (data.length >= 8 && data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return "image/png";
  if (data.length >= 3 && data[0] === 255 && data[1] === 216 && data[2] === 255) return "image/jpeg";
  if (data.length >= 6 && ["GIF87a", "GIF89a"].includes(data.toString("ascii", 0, 6))) return "image/gif";
  if (data.length >= 12 && data.toString("ascii", 0, 4) === "RIFF" && data.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  return null;
}

export function registerMediaRoutes<TLogger extends FastifyBaseLogger>(app: FastifyInstance<RawServerDefault, RawRequestDefaultExpression<RawServerDefault>, RawReplyDefaultExpression<RawServerDefault>, TLogger, TypeBoxTypeProvider>, options: { directory: string; idGenerator: IdGenerator; store: JourneyStore; currentUserProvider: CurrentUserProvider; clock: Clock }): void {
  app.post("/api/media", {
    bodyLimit: 2_800_000,
    schema: { body: ImageBody },
  }, async (request, reply) => {
    const { dataUrl } = request.body as { dataUrl: string };
    const separator = dataUrl.indexOf(",");
    const declaredType = dataUrl.slice(5, dataUrl.indexOf(";"));
    const bytes = Buffer.from(dataUrl.slice(separator + 1), "base64");
    if (bytes.byteLength > 2 * 1024 * 1024) return reply.code(413).send({ error: "Choose an image smaller than 2 MB." });
    const verifiedType = imageType(bytes);
    if (!verifiedType || verifiedType !== declaredType) return reply.code(415).send({ error: "Use a PNG, JPEG, GIF, or WebP image." });

    await mkdir(options.directory, { recursive: true, mode: 0o700 });
    const id = options.idGenerator.generate().toLowerCase().replace(/[^a-z0-9._-]/g, "-").slice(0, 120);
    const filename = `image-${id}.${mimeExtensions[verifiedType]}`;
    const path = join(options.directory, filename);
    const handle = await open(path, "wx", 0o600);
    try {
      await handle.writeFile(bytes);
      await handle.sync();
    } finally {
      await handle.close();
    }
    await chmod(path, 0o600);
    const userId = await options.currentUserProvider.getCurrentUserId();
    try {
      await options.store.transact({ kind: "AUTHENTICATION" }, (draft) => {
        draft.records.mediaRecords ??= {};
        draft.records.mediaRecords[filename] = { id: filename, filename, userId, mediaType: verifiedType as "image/png" | "image/jpeg" | "image/gif" | "image/webp", byteLength: bytes.byteLength, createdAt: options.clock.now().toISOString() };
        return { kind: "changed", value: undefined };
      });
    } catch (error) {
      await rm(path, { force: true });
      throw error;
    }
    return reply.code(201).send({ src: `/api/media/${filename}`, filename });
  });

  app.get("/api/media/:filename", { schema: { params: ImageParams } }, async (request, reply) => {
    const { filename } = request.params as { filename: string };
    const extension = filename.split(".").at(-1)?.toLowerCase();
    const contentType = extension === "jpg" || extension === "jpeg" ? "image/jpeg" : `image/${extension}`;
    try {
      const userId = await options.currentUserProvider.getCurrentUserId();
      const owned = await options.store.read((state) => state.records.mediaRecords?.[filename]?.userId === userId);
      if (!owned) return reply.code(404).type("application/problem+json").send({ error: "That local image does not exist." });
      const bytes = await readFile(join(options.directory, filename));
      return reply.header("Content-Type", contentType).header("Cache-Control", "private, max-age=31536000, immutable").send(bytes);
    } catch {
      return reply.code(404).type("application/problem+json").send({ error: "That local image does not exist." });
    }
  });
}
