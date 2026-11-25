/**
 * The daily bonus puzzle (docs/plus-expansion-spec.md §1; migration
 * 20261117000000_bonus_puzzles.sql). Not a fourth daily slot: the dailies
 * are public files with their answers, and a bonus is Plus only, so it lives
 * in the database. Everyone sees the card (title, theme, size, the grid's
 * shape); only Plus gets the puzzle, which is then kept on the device so a
 * fetched bonus plays offline.
 */
import { supabase } from "./supabaseClient";
import { normalizeTransferPuzzle, type TransferPuzzle } from "./puzzleNormalizer";
import { dayKey } from "./soloStats";
import type { Puzzle } from "../types/puzzle";

export { blocksOf, clueCount, shapePuzzle } from "./bonusShape";

export interface BonusCard {
  day: string;
  title: string;
  theme: string | null;
  author: string;
  width: number;
  height: number;
  /** One character per square, row by row: '#' black, '.' white. */
  blocks: string;
  /** puzzleIdentity() of the puzzle: solve history and progress are keyed by it. */
  identity: string;
}

// The apps read the site's files from the site, as the daily feed does.
const ART_ORIGIN = import.meta.env?.MODE === "mobile" ? "https://crosswordclash.com" : "";

/**
 * The drawing behind a day's Daily Plus card: a file Andrew picked ahead of
 * time (`public/plus-art/<day>.webp`, trimmed to the ink on white). A day
 * without one has no file, and the card shows its plain layout.
 */
export function bonusArtUrl(day: string, origin: string = ART_ORIGIN): string {
  return `${origin}/plus-art/${day}.webp`;
}

const CARD_COLUMNS = "day, title, theme, author, width, height, blocks, identity";

/** A bonus card for a day (today by default), or null when there is none or it can't be read. */
export async function fetchBonusCard(day: string = dayKey(new Date())): Promise<BonusCard | null> {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase.from("bonus_cards").select(CARD_COLUMNS).eq("day", day).maybeSingle();
    return error || !data ? null : (data as BonusCard);
  } catch {
    return null;
  }
}

/** How many days back the Daily Plus leaderboard's stepper reaches. */
export const BOARD_CARDS = 120;

// The last answer per limit this session: a screen opened again (or after
// `prefetchBonusCards`) draws at once and is corrected by the fresh read.
const cardCache = new Map<number, BonusCard[]>();

/** The cards as last fetched this session, or null when they have not been. */
export function cachedBonusCards(limit = 60): BonusCard[] | null {
  return cardCache.get(limit) ?? null;
}

/** Test seam: forget the cached cards. */
export function clearBonusCardCache(): void {
  cardCache.clear();
}

/** Released bonus cards, newest first (the archive's rows). */
export async function fetchBonusCards(limit = 60): Promise<BonusCard[]> {
  if (!supabase) return [];
  try {
    const { data, error } = await supabase.from("bonus_cards").select(CARD_COLUMNS).order("day", { ascending: false }).limit(limit);
    if (error) return cardCache.get(limit) ?? [];
    const rows = (data ?? []) as BonusCard[];
    cardCache.set(limit, rows);
    return rows;
  } catch {
    return cardCache.get(limit) ?? [];
  }
}

const CACHE_KEY = "crossword-clash:bonus-puzzles";
const MAX_CACHED = 30;

function readCache(): Record<string, TransferPuzzle> {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === "object" ? (parsed as Record<string, TransferPuzzle>) : {};
  } catch {
    return {};
  }
}

function cache(day: string, transfer: TransferPuzzle): void {
  try {
    const all = readCache();
    all[day] = transfer;
    const kept = Object.keys(all).sort().reverse().slice(0, MAX_CACHED);
    localStorage.setItem(CACHE_KEY, JSON.stringify(Object.fromEntries(kept.map((d) => [d, all[d]]))));
  } catch {
    // Storage full or unavailable: the bonus is fetched again next time.
  }
}

/** A puzzle tagged as a bonus: its share link never carries the puzzle (CompletionModal). */
function asBonus(transfer: TransferPuzzle, day: string): Puzzle {
  return { ...normalizeTransferPuzzle(transfer), origin: "bonus", bonusDay: day };
}

/**
 * The day's bonus puzzle for a Plus player: from this device when it was
 * fetched before, else from the server (null when the caller has no Plus,
 * the day has no bonus or isn't out yet, or the request fails).
 */
export async function loadBonusPuzzle(day: string): Promise<Puzzle | null> {
  const kept = readCache()[day];
  if (kept) {
    try {
      return asBonus(kept, day);
    } catch {
      // A damaged copy: fetch it again.
    }
  }
  if (!supabase) return null;
  try {
    const { data, error } = await supabase.rpc("bonus_puzzle", { p_day: day });
    if (error || !data) return null;
    const transfer = data as TransferPuzzle;
    const puzzle = asBonus(transfer, day);
    cache(day, transfer);
    return puzzle;
  } catch {
    return null;
  }
}
