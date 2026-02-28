import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from "lz-string";
import { normalizeTransferPuzzle } from "./puzzleNormalizer";
import type { TransferPuzzle } from "./puzzleNormalizer";
import type { Puzzle } from "../types/puzzle";

const HASH_PREFIX = "#puzzle=";
const IMPORT_HASH = "#import";

/**
 * Extract a Puzzle from the URL hash fragment (`#puzzle=<compressed>`).
 * Returns null if no puzzle hash is present or if parsing fails.
 * Clears the hash on success or failure.
 */
export function extractPuzzleFromUrl(): Puzzle | null {
  try {
    const hash = window.location.hash;
    if (!hash.startsWith(HASH_PREFIX)) return null;

    const compressed = hash.slice(HASH_PREFIX.length);
    const json = decompressFromEncodedURIComponent(compressed);
    if (!json) {
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
      return null;
    }

    const transfer: TransferPuzzle = JSON.parse(json);
    const puzzle = normalizeTransferPuzzle(transfer);

    // Clear the hash to keep the URL clean
    window.history.replaceState(null, "", window.location.pathname + window.location.search);

    return puzzle;
  } catch {
    // Clear hash even on failure
    try {
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
    } catch {
      // ignore
    }
    return null;
  }
}

/**
 * Convert an internal Puzzle to the TransferPuzzle format for URL transport.
 */
export function puzzleToTransferFormat(puzzle: Puzzle): TransferPuzzle {
  const grid: string[] = [];
  const gridnums: number[] = [];
  const circles: number[] = [];
  let hasCircles = false;

  for (let r = 0; r < puzzle.height; r++) {
    for (let c = 0; c < puzzle.width; c++) {
      const cell = puzzle.cells[r][c];
      grid.push(cell.solution === null ? "." : cell.solution);
      gridnums.push(cell.number ?? 0);
      const circled = cell.circled ? 1 : 0;
      circles.push(circled);
      if (circled) hasCircles = true;
    }
  }

  const acrossClues = puzzle.clues.filter((c) => c.direction === "across");
  const downClues = puzzle.clues.filter((c) => c.direction === "down");

  return {
    title: puzzle.title,
    author: puzzle.author,
    size: { rows: puzzle.height, cols: puzzle.width },
    grid,
    gridnums,
    ...(hasCircles ? { circles } : {}),
    clues: {
      across: acrossClues.map((c) => `${c.number}. ${c.text}`),
      down: downClues.map((c) => `${c.number}. ${c.text}`),
    },
    answers: {
      across: acrossClues.map((c) => c.answer),
      down: downClues.map((c) => c.answer),
    },
  };
}

/**
 * Compress a Puzzle into a URL hash string (`#puzzle=<compressed>`).
 */
export function compressPuzzleToHash(puzzle: Puzzle): string {
  const transfer = puzzleToTransferFormat(puzzle);
  const json = JSON.stringify(transfer);
  const compressed = compressToEncodedURIComponent(json);
  return HASH_PREFIX + compressed;
}

/**
 * Check if the current URL hash indicates an import is pending (`#import`).
 */
export function hasImportHash(): boolean {
  return window.location.hash === IMPORT_HASH;
}

/**
 * Decode compressed puzzle data into a Puzzle object.
 */
function decompressPuzzle(compressed: string): Puzzle | null {
  try {
    const json = decompressFromEncodedURIComponent(compressed);
    if (!json) return null;
    const transfer: TransferPuzzle = JSON.parse(json);
    return normalizeTransferPuzzle(transfer);
  } catch {
    return null;
  }
}

/**
 * Listen for puzzle data via postMessage from the bookmarklet (cross-origin).
 * Sends a "ready" signal to window.opener, then waits for puzzle data.
 * Resolves with the Puzzle on success, or null on timeout.
 */
export function listenForImportedPuzzle(timeoutMs = 5000): Promise<Puzzle | null> {
  return new Promise((resolve) => {
    let resolved = false;

    const handler = (event: MessageEvent) => {
      if (resolved) return;
      if (event.data?.type === "crossword-clash-puzzle" && typeof event.data.puzzle === "string") {
        resolved = true;
        window.removeEventListener("message", handler);
        clearHash();
        resolve(decompressPuzzle(event.data.puzzle));
      }
    };

    window.addEventListener("message", handler);

    // Signal to the opener that we're ready to receive puzzle data
    if (window.opener) {
      try {
        window.opener.postMessage({ type: "crossword-clash-ready" }, "*");
      } catch {
        // opener may be closed or cross-origin restricted
      }
    }

    // Timeout fallback
    setTimeout(() => {
      if (!resolved) {
        resolved = true;
        window.removeEventListener("message", handler);
        resolve(null);
      }
    }, timeoutMs);
  });
}

/**
 * Read compressed puzzle data from the clipboard (requires user gesture).
 * Returns the Puzzle on success, or null if clipboard is empty/invalid.
 */
export async function readPuzzleFromClipboard(): Promise<Puzzle | null> {
  try {
    const text = await navigator.clipboard.readText();
    if (!text) return null;
    return decompressPuzzle(text.trim());
  } catch {
    return null;
  }
}

function clearHash() {
  try {
    window.history.replaceState(null, "", window.location.pathname + window.location.search);
  } catch {
    // ignore
  }
}
