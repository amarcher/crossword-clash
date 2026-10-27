/**
 * "Hide puzzles by this author" (docs/community-puzzles-spec.md §3.4, ruled
 * 2026-10-27): a list of author ids in this browser's localStorage, applied to
 * the browse results and the puzzle page on this device. No table, no sync; it
 * dies with the browser's storage like an anonymous player's best times. The
 * store notifies listeners so a screen re-renders when the list changes.
 */
export const HIDDEN_AUTHORS_KEY = "crossword-clash:hidden-authors";
const MAX_HIDDEN = 200;

let cache: readonly string[] | null = null;
const listeners = new Set<() => void>();

function read(): readonly string[] {
  try {
    const raw = localStorage.getItem(HIDDEN_AUTHORS_KEY);
    const list = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(list) ? list.filter((v): v is string => typeof v === "string").slice(0, MAX_HIDDEN) : [];
  } catch {
    return [];
  }
}

function write(list: readonly string[]): void {
  cache = list;
  try {
    if (list.length === 0) localStorage.removeItem(HIDDEN_AUTHORS_KEY);
    else localStorage.setItem(HIDDEN_AUTHORS_KEY, JSON.stringify(list));
  } catch {
    // Kept for this page only.
  }
  listeners.forEach((l) => l());
}

export function loadHiddenAuthors(): readonly string[] {
  if (cache === null) cache = read();
  return cache;
}

export function isAuthorHidden(authorId: string): boolean {
  return loadHiddenAuthors().includes(authorId);
}

export function hideAuthor(authorId: string): void {
  const list = loadHiddenAuthors();
  if (list.includes(authorId)) return;
  write([authorId, ...list].slice(0, MAX_HIDDEN));
}

export function unhideAuthor(authorId: string): void {
  const list = loadHiddenAuthors();
  if (!list.includes(authorId)) return;
  write(list.filter((id) => id !== authorId));
}

export function subscribeHiddenAuthors(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Test hook: forget the cached list so the next read hits storage. */
export function resetHiddenAuthorsMemory(): void {
  cache = null;
}
