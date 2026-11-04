import { compressPuzzleToHash } from "./puzzleUrl";
import type { Puzzle } from "../types/puzzle";

/**
 * The TV's puzzle chooser (`/host/import`) sends the host to the archive and
 * the community pages with `?intent=tv`; those pages then offer one action,
 * "Host on TV", which hands the puzzle back to the TV layout the way a deep
 * link does: `/host#puzzle=<payload>`, which `HostLayout` reads on mount and
 * `HostIndexRedirect` turns into the puzzle-ready screen.
 */
export const TV_INTENT = "tv";

export function isTvIntent(params: URLSearchParams): boolean {
  return params.get("intent") === TV_INTENT;
}

/** `path` with `intent=tv` added to its query (kept if already there). */
export function withTvIntent(path: string): string {
  const [base, query = ""] = path.split("?");
  const params = new URLSearchParams(query);
  params.set("intent", TV_INTENT);
  return `${base}?${params.toString()}`;
}

/** The TV layout's route for a chosen puzzle. */
export function tvHostPath(puzzle: Puzzle): string {
  return `/host${compressPuzzleToHash(puzzle)}`;
}

/** The TV chooser, for a page's back control while it serves the TV. */
export const TV_CHOOSER_PATH = "/host/import";
