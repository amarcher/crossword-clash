/**
 * Shareable result card — the testable core.
 *
 * Everything that *decides* something (which share mechanism to use for a given
 * browser, the download filename, and the text laid out on the card) is a PURE
 * function here, unit-tested in resultCard.test.ts. The actual canvas drawing
 * and `navigator.share` plumbing is impure DOM and lives in the component, kept
 * deliberately thin on top of these helpers.
 */

import { formatDuration } from "./soloStats";

/** The canonical link shared alongside the card image. */
export const SHARE_URL = "https://crosswordclash.com";

export type ShareMode = "solo" | "multiplayer";

/** Matches the `method` dimension of the `result_shared` analytics event. */
export type ShareMethod = "webshare" | "copy" | "download";

export interface ShareCapabilities {
  /** `navigator.canShare({ files })` succeeded for an image file. */
  canShareFiles: boolean;
  /** `navigator.clipboard.writeText` is available. */
  canCopy: boolean;
}

/**
 * Pick the best available share mechanism. Native Web Share (with file support)
 * wins on mobile; otherwise we copy the link, falling back to a plain download
 * when even the clipboard is unavailable. Never throws.
 */
export function selectShareMethod(caps: ShareCapabilities): ShareMethod {
  if (caps.canShareFiles) return "webshare";
  if (caps.canCopy) return "copy";
  return "download";
}

/**
 * A filesystem-safe PNG filename derived from the puzzle title, e.g.
 * "Monday Mini" → "crossword-clash-monday-mini.png". Falls back to a generic
 * name when the title is empty or has no usable characters.
 */
export function buildResultFilename(puzzleTitle: string | undefined): string {
  const slug = (puzzleTitle ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return slug ? `crossword-clash-${slug}.png` : "crossword-clash-result.png";
}

export interface ResultCardInput {
  mode: ShareMode;
  puzzleTitle?: string;
  /** Solo: finish time in whole seconds. */
  finishSeconds?: number;
  /** Solo: best time on record, in whole seconds. */
  bestSeconds?: number;
  /** Solo: whether this finish beat a previously-recorded best. */
  isNewBest?: boolean;
  /** Multiplayer: winning player's display name. */
  winnerName?: string;
  /** Multiplayer: whether the game ended tied. */
  isTie?: boolean;
}

/**
 * Localized fragments injected by the caller so this module stays free of i18n
 * yet produces fully-localized output the canvas and share text can use.
 */
export interface ResultCardLabels {
  /** Brand tag drawn on the card, e.g. "crosswordclash.com". */
  tag: string;
  /** Heading, e.g. "Solved!". */
  heading: string;
  /** Note shown when a new personal best was set, e.g. "New best! 🎉". */
  newBest: string;
  /** Already-interpolated best-time note, e.g. "best: 3:10". */
  best: string;
  /** Already-interpolated winner line, e.g. "Alex wins!". */
  winner: string;
  /** Tie line, e.g. "It's a tie!". */
  tie: string;
}

export interface ResultCardText {
  heading: string;
  title: string;
  /** The headline metric — finish time (solo) or outcome (multiplayer). */
  metric: string;
  /** Optional secondary note (best time / new best). */
  detail?: string;
  tag: string;
}

/**
 * Compose the text laid out on the result card. Pure: no DOM, no i18n, no clock.
 */
export function composeCardText(
  input: ResultCardInput,
  labels: ResultCardLabels,
): ResultCardText {
  const title = (input.puzzleTitle ?? "").trim() || "Crossword";

  if (input.mode === "multiplayer") {
    return {
      heading: labels.heading,
      title,
      metric: input.isTie ? labels.tie : labels.winner,
      tag: labels.tag,
    };
  }

  const metric =
    input.finishSeconds !== undefined ? formatDuration(input.finishSeconds) : "";
  const detail =
    input.isNewBest === true
      ? labels.newBest
      : input.bestSeconds !== undefined
        ? labels.best
        : undefined;

  return { heading: labels.heading, title, metric, detail, tag: labels.tag };
}
