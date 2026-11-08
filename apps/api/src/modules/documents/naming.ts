/**
 * Turning a user's file name into something a filesystem will accept.
 *
 * Kept out of `storage.ts` so it is a pure string function with no I/O: the rule
 * ("no path separators, no leading dots, never empty, never longer than 120
 * characters") is the part worth testing directly.
 *
 * It uses `replace` with global regexes rather than `replaceAll`, because
 * `replaceAll` throws `TypeError` when handed a non-global pattern — a class of
 * bug that is invisible until the first upload and then fails every one of them.
 */

const UNSAFE = /[^\w.\-]+/gu;
const LEADING_DOTS = /^\.+/u;
const MAX_LENGTH = 120;

export function safeFileName(name: string): string {
  const cleaned = name.replace(UNSAFE, "_").replace(LEADING_DOTS, "");
  return cleaned.length > 0 ? cleaned.slice(-MAX_LENGTH) : "file";
}
