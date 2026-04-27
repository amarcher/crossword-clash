import { useEffect, useRef } from "react";
import { getCompletedCluesByPlayer } from "../lib/gridUtils";
import type { Puzzle } from "../types/puzzle";
import type { CellState } from "../types/puzzle";
import type { Player } from "../types/game";

interface UseClueAnnouncerOptions {
  puzzle: Puzzle | null;
  playerCells: Record<string, CellState>;
  players: Player[];
  /** Pre-bound `tts.speak` from useSpeechSettings (already gates on mute). */
  speak: (text: string) => void;
  /**
   * Master gate. Caller composes this from `spokenEvents && narratorEngine === null && !muted`.
   * The hook does no extra gating — it announces whenever `enabled` is true and a new
   * clue completion is detected.
   */
  enabled: boolean;
}

const RATE_LIMIT_WINDOW_MS = 5_000;
const RATE_LIMIT_MAX = 2;

/**
 * Per-clue audio announcer for TV/host view. Watches `playerCells` for newly
 * completed clues and speaks a terse "<num> <dir> by <player>" utterance.
 *
 * Behavior:
 * - Initial mount silently records pre-existing completions so a refresh of
 *   an in-progress game doesn't blast a backlog.
 * - Each clue is announced at most once for the lifetime of the hook.
 * - Rate-capped: at most {@link RATE_LIMIT_MAX} utterances per
 *   {@link RATE_LIMIT_WINDOW_MS} rolling window. Excess clues are skipped
 *   (not queued) to avoid growing backlogs.
 */
export function useClueAnnouncer({
  puzzle,
  playerCells,
  players,
  speak,
  enabled,
}: UseClueAnnouncerOptions): void {
  const announcedRef = useRef<Set<string>>(new Set());
  const recentSpeakTimesRef = useRef<number[]>([]);
  const initializedRef = useRef(false);
  const speakRef = useRef(speak);
  speakRef.current = speak;
  const playersRef = useRef(players);
  playersRef.current = players;

  useEffect(() => {
    if (!puzzle) {
      // Reset on puzzle swap so a new puzzle gets fresh tracking.
      announcedRef.current = new Set();
      initializedRef.current = false;
      return;
    }

    const completedByPlayer = getCompletedCluesByPlayer(puzzle, playerCells);

    // First pass on mount: record what's already done without speaking.
    // Defer until we've seen actual cell data — on rejoin, the puzzle
    // arrives one render before HYDRATE_CELLS populates `playerCells`,
    // and initializing against an empty map would re-announce every
    // pre-completed clue when the cells finally arrive.
    if (!initializedRef.current) {
      if (Object.keys(playerCells).length === 0) return;
      initializedRef.current = true;
      for (const [clueKey] of completedByPlayer) {
        announcedRef.current.add(clueKey);
      }
      return;
    }

    if (!enabled) {
      // Still track what completed while disabled so we don't blast on toggle.
      for (const [clueKey] of completedByPlayer) {
        announcedRef.current.add(clueKey);
      }
      return;
    }

    for (const [clueKey, info] of completedByPlayer) {
      if (announcedRef.current.has(clueKey)) continue;
      announcedRef.current.add(clueKey);

      const now = Date.now();
      const recent = recentSpeakTimesRef.current.filter(
        (t) => now - t < RATE_LIMIT_WINDOW_MS,
      );
      if (recent.length >= RATE_LIMIT_MAX) {
        // Skip — clue stays in announcedRef so we don't double-announce later.
        continue;
      }
      recent.push(now);
      recentSpeakTimesRef.current = recent;

      const clue = puzzle.clues.find(
        (c) => `${c.direction}-${c.number}` === clueKey,
      );
      if (!clue) continue;
      const player = playersRef.current.find((p) => p.userId === info.playerId);
      const playerName = player?.displayName ?? "Unknown";
      speakRef.current(`${clue.number} ${clue.direction} by ${playerName}`);
    }
  }, [puzzle, playerCells, enabled]);
}
