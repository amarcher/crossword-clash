import { useMemo } from "react";
import type { TraceEvent } from "../../lib/race";
import type { RaceSolve } from "../../lib/friendRace";
import { FriendRaceDialog } from "./FriendRaceDialog";
import type { Puzzle } from "../../types/puzzle";

/** One solve to play back: who, in which colour, how long it took, and its letters. */
export interface ReplaySolve {
  name: string;
  color: string;
  seconds: number;
  events: TraceEvent[];
}

interface ReplayDialogProps {
  puzzle: Puzzle;
  /** One solve, or a race: two on one clock, watched by either side. */
  solves: ReplaySolve[];
  onClose: () => void;
}

/**
 * Recorded solves played back, sped up (race.ts): one solve or a race, in
 * the race dialog either way (Andrew, 2026-11-17: every Watch opens the same
 * thing). Letters show only when every recording came with them (the viewer
 * has finished the puzzle); otherwise colour alone, so nothing is given away.
 */
export function ReplayDialog({ puzzle, solves, onClose }: ReplayDialogProps) {
  const racers = useMemo<RaceSolve[]>(() => solves.map((s, i) => ({ id: `solve-${i}`, ...s })), [solves]);
  const letters = solves.every((s) => s.events.every((e) => typeof e[2] === "string"));
  return <FriendRaceDialog puzzle={puzzle} solves={racers} letters={letters} onClose={onClose} />;
}
