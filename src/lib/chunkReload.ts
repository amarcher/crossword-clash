/**
 * Stale-deploy recovery. After a redeploy an old tab references chunk hashes
 * that no longer exist; the lazy import fails. Reload once (fresh index.html),
 * guarded by a sessionStorage timestamp so a genuinely broken deploy can't
 * loop.
 */

export const CHUNK_RELOAD_KEY = "crossword-clash:chunk-reload";
const WINDOW_MS = 10_000;

const CHUNK_PATTERNS = [
  /Failed to fetch dynamically imported module/i,
  /Importing a module script failed/i,
  /error loading dynamically imported module/i,
  /ChunkLoadError/i,
];

export function isChunkLoadError(err: unknown): boolean {
  if (err == null) return false;
  let text = "";
  if (err instanceof Error) text = `${err.name} ${err.message}`;
  else if (typeof err === "string") text = err;
  else if (typeof (err as { message?: unknown }).message === "string") {
    text = (err as { message: string }).message;
  }
  return CHUNK_PATTERNS.some((re) => re.test(text));
}

/** Returns true if a reload was triggered (false if already reloaded recently). */
export function reloadOnceForChunkError(now = Date.now()): boolean {
  try {
    const last = Number(sessionStorage.getItem(CHUNK_RELOAD_KEY) ?? 0);
    if (now - last < WINDOW_MS) return false;
    sessionStorage.setItem(CHUNK_RELOAD_KEY, String(now));
  } catch {
    // Can't guard against a loop without sessionStorage, so don't reload.
    return false;
  }
  window.location.reload();
  return true;
}
