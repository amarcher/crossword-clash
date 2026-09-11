import type { Puzzle, PuzzleCell, PuzzleClue } from "../types/puzzle";

export type NytPuzzleKind = "daily" | "mini";
export type NytImportErrorCode = "PAGE" | "ACCESS" | "NETWORK" | "FORMAT" | "UNSUPPORTED";

export class NytImportError extends Error {
  constructor(public readonly code: NytImportErrorCode, message: string) {
    super(message);
    this.name = "NytImportError";
  }
}

/** Exact HTTPS origin and dated path; never derive the edition from the device clock. */
export function nytPuzzleLocation(input: string): { kind: NytPuzzleKind; date: string; url: string; endpoint: string } {
  let url: URL;
  try { url = new URL(input); } catch { throw new NytImportError("PAGE", "Open a dated NYT Daily or Mini crossword first."); }
  const match = url.pathname.match(/^\/crosswords\/game\/(daily|mini)\/(\d{4})\/(\d{2})\/(\d{2})\/?$/);
  if (url.origin !== "https://www.nytimes.com" || url.username || url.password || !match) {
    throw new NytImportError("PAGE", "Open a dated NYT Daily or Mini crossword first.");
  }
  const date = `${match[2]}-${match[3]}-${match[4]}`;
  if (!isPuzzleDate(date)) throw new NytImportError("PAGE", "Choose a valid puzzle date.");
  const kind = match[1] as NytPuzzleKind;
  return { kind, date, url: `${url.origin}${url.pathname.replace(/\/$/, "")}`, endpoint: `/svc/crosswords/v6/puzzle/${kind}/${date}.json` };
}

export function isPuzzleDate(date: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const parsed = new Date(`${date}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date;
}

export function nytPuzzleUrl(kind: NytPuzzleKind, date: string): string {
  return nytPuzzleLocation(`https://www.nytimes.com/crosswords/game/${kind}/${date.split("-").join("/")}`).url;
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw formatError();
  return value as Record<string, unknown>;
}

function formatError(): NytImportError {
  return new NytImportError("FORMAT", "This puzzle could not be read. NYT may have changed its format.");
}

function integer(value: unknown, min: number, max: number): number {
  const n = typeof value === "string" && /^\d+$/.test(value) ? Number(value) : value;
  if (typeof n !== "number" || !Number.isInteger(n) || n < min || n > max) throw formatError();
  return n;
}

/** Accept only fields the game needs. Never forward the response envelope, cookies or account data. */
export function parseNytPuzzle(payload: unknown, pageUrl: string): Puzzle {
  const location = nytPuzzleLocation(pageUrl);
  const data = record(payload);
  const body = record(Array.isArray(data.body) ? data.body[0] : data);
  const dimensions = record(body.dimensions);
  const width = integer(dimensions.width, 2, 35);
  const height = integer(dimensions.height, 2, 35);
  if (!Array.isArray(body.cells) || body.cells.length !== width * height) throw formatError();
  // A mismatched response must never silently create a race on the wrong edition.
  for (const date of [data.publicationDate, data.printDate]) {
    if (typeof date === "string" && date.slice(0, 10) !== location.date) throw formatError();
  }
  const flat: PuzzleCell[] = body.cells.map((value, index) => {
    const cell = record(value);
    const answer = cell.answer;
    if (answer == null && Object.keys(cell).length > 0) throw formatError();
    if (answer != null && (typeof answer !== "string" || !/^[a-z]$/i.test(answer))) {
      throw new NytImportError("UNSUPPORTED", "This puzzle uses rebus or special cells that Clash does not support yet. Please choose another puzzle.");
    }
    return {
      row: Math.floor(index / width), col: index % width,
      solution: typeof answer === "string" ? answer.toUpperCase() : null,
      ...(cell.label != null ? { number: integer(cell.label, 1, width * height) } : {}),
      ...(cell.isCircled === true || cell.circled === true ? { circled: true } : {}),
    };
  });
  // NYT v6 returns an indexed array; older exports can use an ID-keyed object.
  // Normalize only this collection, leaving individual clue validation intact.
  const clueMap = Array.isArray(body.clues)
    ? Object.fromEntries(body.clues.map((clue, index) => [String(index), clue]))
    : record(body.clues);
  if (!Array.isArray(body.clueLists)) throw formatError();
  const clues: PuzzleClue[] = [];
  const seen = new Set<string>();
  const covered = new Set<number>();
  for (const rawGroup of body.clueLists) {
    const group = record(rawGroup);
    const direction = typeof group.name === "string" ? group.name.toLowerCase() : "";
    if ((direction !== "across" && direction !== "down") || !Array.isArray(group.clues)) throw formatError();
    for (const id of group.clues) {
      if (typeof id !== "string" && typeof id !== "number") throw formatError();
      const clue = record(clueMap[String(id)]);
      const number = integer(clue.label, 1, width * height);
      const key = `${direction}:${number}`;
      if (seen.has(key) || !Array.isArray(clue.cells) || clue.cells.length < 2 || !Array.isArray(clue.text)) throw formatError();
      seen.add(key);
      const refs = clue.cells.map((ref) => integer(ref, 0, flat.length - 1));
      const first = flat[refs[0]];
      if (first.number !== number) throw formatError();
      for (let i = 0; i < refs.length; i++) {
        const cell = flat[refs[i]];
        if (!cell.solution || refs[i] !== refs[0] + i * (direction === "across" ? 1 : width) ||
          (direction === "across" && cell.row !== first.row)) throw formatError();
        covered.add(refs[i]);
      }
      const text = clue.text.map((part) => typeof part === "string" ? part : record(part).plain)
        .map((part) => { if (typeof part !== "string") throw formatError(); return part; })
        .join("").replace(/<[^>]*>/g, "").trim();
      if (!text || text.length > 10000) throw formatError();
      clues.push({ direction, number, text, row: first.row, col: first.col, length: refs.length,
        answer: refs.map((ref) => flat[ref].solution).join("") });
    }
  }
  if (!clues.length || flat.some((cell, index) => cell.solution && !covered.has(index))) throw formatError();
  const title = typeof data.title === "string" && data.title.trim() ? data.title.trim().slice(0, 500) : `NYT ${location.kind === "daily" ? "Daily" : "Mini"} — ${location.date}`;
  const authors = Array.isArray(data.constructors) ? data.constructors.filter((v): v is string => typeof v === "string") : [];
  return {
    title, author: authors.join(", ").slice(0, 500), width, height,
    cells: Array.from({ length: height }, (_, row) => flat.slice(row * width, (row + 1) * width)), clues,
    source: { provider: "nyt", date: location.date, kind: location.kind, url: location.url },
  };
}

/** Called only in the subscriber's NYT page, following an explicit import action. */
export async function fetchNytPuzzle(pageUrl: string, fetcher: typeof fetch = fetch): Promise<Puzzle> {
  const location = nytPuzzleLocation(pageUrl);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetcher(location.endpoint, { credentials: "include", redirect: "error", signal: controller.signal });
    if (response.status === 401 || response.status === 403) {
      throw new NytImportError("ACCESS", "Sign in to NYT with access to this puzzle, then tap Import again.");
    }
    if (!response.ok) throw new NytImportError("NETWORK", "NYT could not load this puzzle. Try again when the page is available.");
    const text = await response.text();
    if (text.length > 1_000_000) throw formatError();
    let data: unknown;
    try { data = JSON.parse(text); } catch { throw formatError(); }
    return parseNytPuzzle(data, location.url);
  } catch (error) {
    if (error instanceof NytImportError) throw error;
    throw new NytImportError("NETWORK", "The puzzle request did not complete. Check your connection and try again.");
  } finally { clearTimeout(timeout); }
}
