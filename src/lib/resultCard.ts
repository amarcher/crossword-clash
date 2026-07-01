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

/** Minimal shape needed to rank a player — a scored entry from the scoreboard. */
export interface StandingPlayer {
  userId: string;
  cellsClaimed: number;
}

/** The viewing player's own placement, derived from the ranked scoreboard. */
export interface ViewerStanding {
  /** 1-based placement using standard competition ranking ("1224"). */
  rank: number;
  /** Total number of players in the game. */
  total: number;
  /** Sole leader — finished strictly ahead of everyone else. */
  won: boolean;
  /** Co-leader — shares the top score with at least one other player. */
  tiedForFirst: boolean;
}

/**
 * Compute the viewing player's standing from the SAME scored players the
 * scoreboard shows. Uses standard competition ranking, so a co-leader always
 * reads rank 1 (never 2). Returns `null` when the viewer isn't among the
 * players (e.g. a TV/host spectator) so callers fall back to the winner card.
 */
export function computeViewerStanding(
  players: readonly StandingPlayer[],
  currentUserId: string | undefined | null,
): ViewerStanding | null {
  if (!currentUserId) return null;
  const me = players.find((p) => p.userId === currentUserId);
  if (!me) return null;

  const higher = players.filter((p) => p.cellsClaimed > me.cellsClaimed).length;
  const sameTop = players.filter((p) => p.cellsClaimed === me.cellsClaimed).length;
  const rank = higher + 1;

  return {
    rank,
    total: players.length,
    won: rank === 1 && sameTop === 1,
    tiedForFirst: rank === 1 && sameTop > 1,
  };
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
  /**
   * Multiplayer: the viewing player's own standing. When present, the card and
   * caption brag this personal placement instead of naming the winner. Absent
   * for spectators, who keep the winner/tie card.
   */
  viewerStanding?: ViewerStanding;
  /** Multiplayer co-op: a team finish — no winner, handshake framing. */
  coop?: boolean;
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
  /**
   * Already-interpolated personal standing line, e.g. "Victory! #1 of 4" or
   * "Finished #3 of 5". Used when `viewerStanding` is set on the input.
   */
  standing?: string;
  /** Co-op team-finish line, e.g. "Solved together!". */
  coop?: string;
}

export interface ResultCardText {
  heading: string;
  title: string;
  /** The headline metric — finish time (solo) or outcome (multiplayer). */
  metric: string;
  /** Optional secondary note (best time / new best). */
  detail?: string;
  tag: string;
  /** Outcome glyph drawn on the card — never a trophy for a non-winner. */
  glyph: string;
}

/**
 * The emoji that headlines the card. A trophy only for an actual win (solo
 * finish, or 1st in multiplayer); a handshake for a tie-for-first; a puzzle
 * piece for any other multiplayer placement — so a non-winner's shared card
 * never wears a trophy it didn't earn.
 */
export function resultGlyph(input: ResultCardInput): string {
  if (input.mode !== "multiplayer") return "🏆";
  if (input.coop) return "🤝";
  const s = input.viewerStanding;
  if (s) {
    if (s.won) return "🏆";
    if (s.tiedForFirst) return "🤝";
    return "🧩";
  }
  // Spectator / winner-card fallback (no per-viewer standing).
  return input.isTie ? "🤝" : "🏆";
}

/**
 * Compose the text laid out on the result card. Pure: no DOM, no i18n, no clock.
 */
export function composeCardText(
  input: ResultCardInput,
  labels: ResultCardLabels,
): ResultCardText {
  const title = (input.puzzleTitle ?? "").trim() || "Crossword";

  const glyph = resultGlyph(input);

  if (input.mode === "multiplayer") {
    const metric = input.coop
      ? labels.coop ?? labels.heading
      : input.viewerStanding && labels.standing
        ? labels.standing
        : input.isTie
          ? labels.tie
          : labels.winner;
    // Race time (when measured) rides along as the secondary detail line.
    const detail =
      input.finishSeconds !== undefined
        ? formatDuration(input.finishSeconds)
        : undefined;
    return { heading: labels.heading, title, metric, detail, tag: labels.tag, glyph };
  }

  const metric =
    input.finishSeconds !== undefined ? formatDuration(input.finishSeconds) : "";
  const detail =
    input.isNewBest === true
      ? labels.newBest
      : input.bestSeconds !== undefined
        ? labels.best
        : undefined;

  return { heading: labels.heading, title, metric, detail, tag: labels.tag, glyph };
}
