import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { config } from "../../config.ts";
import { errors } from "../../lib/errors.ts";
import { safeFileName } from "./naming.ts";

/**
 * Files live on the local filesystem under a generated key. The key, not the
 * absolute path, is what goes in the database, so the storage root can move
 * between environments without rewriting rows.
 *
 * A blob store would be a drop-in replacement: `put`/`get`/`remove` are the whole
 * surface the rest of the app uses.
 */

const ALLOWED_PREFIXES = [
  "image/",
  "application/pdf",
  "application/zip",
  "text/plain",
  "text/csv",
  "application/msword",
  "application/vnd.openxmlformats-officedocument",
  "application/vnd.ms-excel",
  "application/vnd.ms-powerpoint",
];

function storageRoot(): string {
  return resolve(process.cwd(), config.uploadDir);
}

function assertAllowed(mimeType: string): void {
  if (!ALLOWED_PREFIXES.some((prefix) => mimeType.startsWith(prefix))) {
    throw errors.invalid(
      `Files of type ${mimeType || "unknown"} are not accepted. Upload an image, a PDF, or an office document.`,
    );
  }
}

export interface StoredFile {
  storageKey: string;
  sizeBytes: number;
  mimeType: string;
  originalName: string;
}

export const Storage = {
  async put(file: File): Promise<StoredFile> {
    if (file.size === 0) throw errors.invalid("The file is empty");
    if (file.size > config.maxUploadBytes) {
      const limitMb = Math.round(config.maxUploadBytes / (1024 * 1024));
      throw errors.invalid(`Files are limited to ${limitMb} MB`);
    }

    const mimeType = file.type || "application/octet-stream";
    assertAllowed(mimeType);

    const key = `${randomUUID()}/${safeFileName(file.name)}`;
    const target = join(storageRoot(), key);

    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, Buffer.from(await file.arrayBuffer()));

    return { storageKey: key, sizeBytes: file.size, mimeType, originalName: file.name };
  },

  async get(storageKey: string): Promise<{ data: Buffer; path: string }> {
    // Resolving and re-checking the prefix keeps a crafted key from escaping the
    // upload directory.
    const root = storageRoot();
    const path = resolve(root, storageKey);

    if (!path.startsWith(root)) throw errors.forbidden("That file is not readable");

    try {
      return { data: await readFile(path), path };
    } catch {
      throw errors.notFound("File");
    }
  },

  async remove(storageKey: string): Promise<void> {
    const root = storageRoot();
    const path = resolve(root, storageKey);
    if (!path.startsWith(root)) return;
    await unlink(path).catch(() => undefined);
  },
};
