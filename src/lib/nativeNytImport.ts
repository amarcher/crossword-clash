import { Capacitor, registerPlugin } from "@capacitor/core";
import type { Puzzle } from "../types/puzzle";
import { nytPuzzleLocation } from "./nytImport";

export const NATIVE_NYT_INBOX = "crossword-clash:nyt-import";
interface NytImporterPlugin {
  open(options: { url: string; labels: Record<string, string> }): Promise<{ cancelled: boolean; result?: string }>;
}
const NytImporter = registerPlugin<NytImporterPlugin>("NytImporter");
export function nativeNytImportAvailable(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.isPluginAvailable("NytImporter");
}

/** Validate at the native boundary, including data restored from local storage. */
export function validateNativeNytPuzzle(value: unknown): Puzzle {
  const puzzle = value as Puzzle;
  if (!puzzle || puzzle.source?.provider !== "nyt" || typeof puzzle.title !== "string" || typeof puzzle.author !== "string" ||
      !Number.isInteger(puzzle.width) || !Number.isInteger(puzzle.height) || puzzle.width < 2 || puzzle.height < 2 ||
      puzzle.width > 35 || puzzle.height > 35 || !Array.isArray(puzzle.cells) || puzzle.cells.length !== puzzle.height ||
      !Array.isArray(puzzle.clues) || !puzzle.clues.length || puzzle.clues.length > 2450) throw new Error("FORMAT");
  const location = nytPuzzleLocation(puzzle.source.url);
  if (location.kind !== puzzle.source.kind || location.date !== puzzle.source.date) throw new Error("FORMAT");
  for (let r = 0; r < puzzle.height; r++) {
    if (!Array.isArray(puzzle.cells[r]) || puzzle.cells[r].length !== puzzle.width) throw new Error("FORMAT");
    for (let c = 0; c < puzzle.width; c++) {
      const cell = puzzle.cells[r][c];
      if (!cell || cell.row !== r || cell.col !== c || (cell.solution !== null && !/^[A-Z]$/.test(cell.solution))) throw new Error("FORMAT");
    }
  }
  for (const clue of puzzle.clues) {
    if (!clue || (clue.direction !== "across" && clue.direction !== "down") || typeof clue.text !== "string" || !clue.text.trim() ||
        !Number.isInteger(clue.number) || !Number.isInteger(clue.row) || !Number.isInteger(clue.col) ||
        !Number.isInteger(clue.length) || clue.length < 2 || clue.length > 35 ||
        puzzle.cells[clue.row]?.[clue.col]?.number !== clue.number) throw new Error("FORMAT");
    let answer = "";
    for (let i = 0; i < clue.length; i++) {
      const cell = puzzle.cells[clue.row + (clue.direction === "down" ? i : 0)]?.[clue.col + (clue.direction === "across" ? i : 0)];
      if (!cell?.solution) throw new Error("FORMAT");
      answer += cell.solution;
    }
    if (clue.answer !== answer) throw new Error("FORMAT");
  }
  // Drop unknown fields so the importer cannot carry account data into persistence.
  return {
    title: puzzle.title.slice(0, 500), author: puzzle.author.slice(0, 500), width: puzzle.width, height: puzzle.height,
    source: { provider: "nyt", kind: location.kind, date: location.date, url: location.url },
    cells: puzzle.cells.map(row => row.map(cell => ({ row: cell.row, col: cell.col, solution: cell.solution,
      ...(cell.number !== undefined ? { number: cell.number } : {}), ...(cell.circled === true ? { circled: true } : {}) }))),
    clues: puzzle.clues.map(clue => ({ direction: clue.direction, number: clue.number, text: clue.text.slice(0, 10000),
      row: clue.row, col: clue.col, length: clue.length, answer: clue.answer })),
  };
}

export async function importNativeNytPuzzle(url: string, labels: Record<string, string>): Promise<Puzzle | null> {
  if (!nativeNytImportAvailable()) throw new Error("UNAVAILABLE");
  const response = await NytImporter.open({ url: nytPuzzleLocation(url).url, labels });
  if (response.cancelled) return null;
  if (!response.result || response.result.length > 500_000) throw new Error("FORMAT");
  const result = JSON.parse(response.result);
  if (result.status !== "ok") throw new Error("FORMAT");
  const puzzle = validateNativeNytPuzzle(result.puzzle);
  localStorage.setItem(NATIVE_NYT_INBOX, JSON.stringify(puzzle));
  return puzzle;
}

export function loadNativeNytImport(): Puzzle | null {
  try {
    const saved = localStorage.getItem(NATIVE_NYT_INBOX);
    return saved && saved.length <= 500_000 ? validateNativeNytPuzzle(JSON.parse(saved)) : null;
  } catch { return null; }
}
