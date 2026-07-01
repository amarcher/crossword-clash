/**
 * Rich share links.
 *
 * A shared bare SPA URL always previews as the generic site card, because
 * crawlers read the static index.html and never run JS. These helpers build
 * URLs to the `/share` edge function (api/share.ts), which serves crawlers a
 * per-link OG card (rendered by api/og.ts) and instantly redirects humans to
 * the real app route. Pure and unit-tested in shareLinks.test.ts.
 */

import { formatDuration } from "./soloStats";

/** Path handled by the api/share.ts function (vercel.json rewrite). */
export const SHARE_ENDPOINT = "/share";

const MAX_TITLE = 80;
const MAX_NAME = 40;

function clean(value: string, max: number): string {
  return value.replace(/\s+/g, " ").trim().slice(0, max);
}

function base(origin: string): string {
  return origin.replace(/\/+$/, "");
}

export interface RaceInviteInput {
  /** 6-char room code. */
  code: string;
  /** Puzzle title or daily theme shown on the card. */
  title?: string;
}

/**
 * Invite link for a live race lobby. Crawlers see a "join my race" card with
 * the room code; humans are redirected to `/?join=CODE`.
 */
export function buildRaceInviteUrl(origin: string, input: RaceInviteInput): string {
  const params = new URLSearchParams();
  params.set("t", "race");
  params.set("code", clean(input.code, 6).toUpperCase());
  if (input.title) params.set("title", clean(input.title, MAX_TITLE));
  return `${base(origin)}${SHARE_ENDPOINT}?${params.toString()}`;
}

export interface ResultShareInput {
  /** Puzzle title shown on the card. */
  title?: string;
  /** Finish/race time in whole seconds. */
  seconds?: number;
  /** Multiplayer standing (1-based) among `total` players. */
  rank?: number;
  total?: number;
  /** The finisher's name (optional flavor). */
  name?: string;
}

/**
 * Boast link for a finished puzzle. Crawlers see a "Solved in 1:42 — beat me"
 * card; humans are redirected to the app front door.
 */
export function buildResultShareUrl(origin: string, input: ResultShareInput): string {
  const params = new URLSearchParams();
  params.set("t", "result");
  if (input.title) params.set("title", clean(input.title, MAX_TITLE));
  if (input.seconds !== undefined && Number.isFinite(input.seconds) && input.seconds >= 0) {
    params.set("time", formatDuration(input.seconds));
  }
  if (
    input.rank !== undefined &&
    input.total !== undefined &&
    Number.isInteger(input.rank) &&
    Number.isInteger(input.total) &&
    input.rank >= 1 &&
    input.total >= input.rank
  ) {
    params.set("rank", String(input.rank));
    params.set("total", String(input.total));
  }
  if (input.name) params.set("name", clean(input.name, MAX_NAME));
  return `${base(origin)}${SHARE_ENDPOINT}?${params.toString()}`;
}
