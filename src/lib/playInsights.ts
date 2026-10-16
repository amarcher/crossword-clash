/**
 * Play insights: what a solve looked like, so puzzle difficulty and quality can
 * be inferred instead of asked for. One record per visit to a puzzle, sent to
 * Supabase `play_sessions` (upserted by id, so later reports replace earlier
 * ones): progress, active time, wrong letters, and per clue how long it took
 * and how many of its letters came from crossings rather than the clue itself.
 *
 * The tracker is pure (state in, record out); usePlayInsights wires it to the
 * play screens and sends the record.
 */
import type { CellState, Direction, Puzzle, PuzzleClue } from "../types/puzzle";

/** Input more than this far apart counts as idle, not solving. */
export const IDLE_GAP_SECONDS = 30;

export type PlaySource = "daily" | "nyt" | "other";
export type PlayMode = "solo" | "versus" | "coop" | "async";

export interface ClueRecord {
  /** "12A" / "3D". */
  k: string;
  /** Length. */
  n: number;
  /** Seconds into the visit when the clue was first selected. */
  f?: number;
  /** Seconds into the visit when it was complete. */
  s?: number;
  /** Wrong letters typed while it was selected. */
  w: number;
  /** Letters that came from crossing entries or other players (all of them = solved without the clue). */
  x?: number;
  /** Solve order within the visit. */
  o?: number;
}

export interface PlaySessionRecord {
  id: string;
  puzzle_key: string;
  puzzle_title: string;
  source: PlaySource;
  mode: PlayMode;
  client: "web" | "ios" | "android";
  /** OS + browser family ("iOS Safari", "Android app"), see playInsightsClient.platformLabel. */
  platform: string;
  /** Playing as an account, not the anonymous default. */
  signed_in: boolean;
  width: number;
  height: number;
  white_cells: number;
  cells_at_start: number;
  cells_filled: number;
  completed: boolean;
  wrong_letters: number;
  active_seconds: number;
  elapsed_seconds: number;
  clues: ClueRecord[];
  started_at: string;
}

const clueKey = (c: Pick<PuzzleClue, "number" | "direction">) => `${c.number}${c.direction === "across" ? "A" : "D"}`;

function clueCells(clue: PuzzleClue): string[] {
  return Array.from({ length: clue.length }, (_, i) =>
    clue.direction === "across" ? `${clue.row},${clue.col + i}` : `${clue.row + i},${clue.col}`,
  );
}

/** Where a letter came from: typed while solving across, down, by another player, or already there. */
type Origin = "across" | "down" | "other" | "before";

export class PlaySessionTracker {
  readonly id: string;
  private readonly startedAt: number;
  private readonly clues: PuzzleClue[];
  private readonly records = new Map<string, ClueRecord>();
  private readonly origin = new Map<string, Origin>();
  private readonly cellsAtStart: number;
  private filled: number;
  private wrong = 0;
  private active = 0;
  private lastInput: number | null = null;
  private solvedCount = 0;
  private completed = false;
  private interactions = 0;

  constructor(
    private readonly puzzle: Puzzle,
    initialCells: Record<string, CellState>,
    private readonly meta: { puzzleKey: string; source: PlaySource; mode: PlayMode; client: PlaySessionRecord["client"]; platform?: string; signedIn?: boolean },
    now: number,
    id: string = crypto.randomUUID(),
  ) {
    this.id = id;
    this.startedAt = now;
    this.clues = puzzle.clues.filter((c) => c.length > 0);
    for (const clue of this.clues) this.records.set(clueKey(clue), { k: clueKey(clue), n: clue.length, w: 0 });
    for (const [key, cell] of Object.entries(initialCells)) if (cell.correct) this.origin.set(key, "before");
    this.cellsAtStart = this.origin.size;
    this.filled = this.cellsAtStart;
    // Clues already complete when the visit began are left without a solve time.
    for (const clue of this.clues) if (this.isComplete(clue)) this.records.get(clueKey(clue))!.x = clue.length;
  }

  private at(now: number): number {
    return Math.max(0, Math.round((now - this.startedAt) / 1000));
  }

  private touch(now: number) {
    if (this.lastInput !== null) this.active += Math.min(IDLE_GAP_SECONDS, Math.max(0, (now - this.lastInput) / 1000));
    this.lastInput = now;
    this.interactions++;
  }

  private isComplete(clue: PuzzleClue): boolean {
    return clueCells(clue).every((k) => this.origin.has(k));
  }

  /** The player moved to a clue. */
  selectClue(clue: Pick<PuzzleClue, "number" | "direction"> | null, now: number) {
    if (!clue) return;
    const record = this.records.get(clueKey(clue));
    if (record && record.f === undefined) record.f = this.at(now);
    this.touch(now);
  }

  /** A wrong letter was rejected while `clue` was selected. */
  wrongLetter(clue: Pick<PuzzleClue, "number" | "direction"> | null, now: number) {
    this.wrong++;
    const record = clue && this.records.get(clueKey(clue));
    if (record) record.w++;
    this.touch(now);
  }

  /**
   * The grid changed. New correct letters are attributed to the local player's
   * current direction, or to another player when `localPlayerId` doesn't match.
   */
  cellsChanged(cells: Record<string, CellState>, direction: Direction, localPlayerId: string | null, now: number) {
    let changed = false;
    for (const [key, cell] of Object.entries(cells)) {
      if (!cell.correct || this.origin.has(key)) continue;
      const mine = !cell.playerId || !localPlayerId || cell.playerId === localPlayerId;
      this.origin.set(key, mine ? direction : "other");
      if (mine) changed = true;
      this.filled++;
    }
    if (changed) this.touch(now);
    for (const clue of this.clues) {
      const record = this.records.get(clueKey(clue))!;
      if (record.s !== undefined || record.x !== undefined || !this.isComplete(clue)) continue;
      record.s = this.at(now);
      record.o = ++this.solvedCount;
      // Anything not typed along this clue (crossings, other players, earlier visits).
      record.x = clueCells(clue).filter((k) => this.origin.get(k) !== clue.direction).length;
    }
  }

  complete(now: number) {
    if (!this.completed) this.touch(now);
    this.completed = true;
  }

  /** Worth sending: the player did something this visit. */
  get hasActivity(): boolean {
    return this.interactions > 0 || this.completed;
  }

  record(now: number): PlaySessionRecord {
    const white = this.puzzle.cells.flat().filter((c) => c.solution !== null).length;
    return {
      id: this.id,
      puzzle_key: this.meta.puzzleKey,
      puzzle_title: (this.puzzle.title || "").slice(0, 200),
      source: this.meta.source,
      mode: this.meta.mode,
      client: this.meta.client,
      platform: (this.meta.platform ?? "").slice(0, 60),
      signed_in: this.meta.signedIn ?? false,
      width: this.puzzle.width,
      height: this.puzzle.height,
      white_cells: white,
      cells_at_start: this.cellsAtStart,
      cells_filled: Math.min(white, this.filled),
      completed: this.completed,
      wrong_letters: this.wrong,
      active_seconds: Math.round(this.active),
      elapsed_seconds: this.at(now),
      clues: [...this.records.values()].filter((r) => r.f !== undefined || r.s !== undefined || r.w > 0),
      started_at: new Date(this.startedAt).toISOString(),
    };
  }
}
