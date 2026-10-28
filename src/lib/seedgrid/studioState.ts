/**
 * State for the construction studio (/studio): the grid being built, the
 * curator's approvals and rejections, clues and saved versions. Pure, so the
 * screen is a thin shell around it.
 *
 * Approvals are keyed by slot geometry (start cell, direction, length), not
 * by number, so they survive renumbering when blacks move elsewhere, and are
 * dropped only when their own slot changes shape.
 */
import { cloneGrid, emptyGrid, partners, slotsOf, type Grid, type Slot, type Symmetry } from "./grid";
import type { EngineRules } from "./ingrid";
import type { Difficulty } from "./cluePrompt";

export interface StudioVersion {
  name: string;
  at: number;
  grid: Grid;
  /** Clue tiers and hand-edit marks at save time (absent in versions saved before clues were kept). */
  clues?: Record<string, string>;
  speedClues?: Record<string, string>;
  editedClues?: string[];
}

export interface StudioState {
  /** Identifies this puzzle in the "My puzzles" list. */
  id: string;
  grid: Grid;
  symmetry: Symmetry;
  minScore: number;
  /** Slot key → the only words allowed there. */
  approved: Record<string, string[]>;
  rejected: string[];
  cursor: number;
  dir: "across" | "down";
  /** Slot key → clue (the standard tier players see). */
  clues: Record<string, string>;
  /**
   * Slot key → plain "speed" clue. Dormant: no player-facing screen shows it
   * and the clue panel has no field for it, but drafts still fill it and the
   * .ipuz extension key round-trips it, so stored puzzles and the CLI keep theirs.
   */
  speedClues: Record<string, string>;
  /** Slot keys whose clues the constructor wrote or picked; drafting never overwrites them. */
  editedClues: string[];
  title: string;
  /** What the puzzle is about, if anything: an optional note passed to the AI with clue requests. */
  theme: string;
  difficulty: Difficulty;
  versions: StudioVersion[];
}

export type StudioAction =
  | { type: "NEW_GRID"; size: number; id: string }
  | { type: "LOAD"; state: StudioState }
  | { type: "SET_GRID"; grid: Grid }
  | { type: "SELECT"; cell: number }
  | { type: "TOGGLE_DIR" }
  | { type: "MOVE"; dRow: number; dCol: number }
  | { type: "TYPE"; letter: string }
  | { type: "ERASE" }
  | { type: "TOGGLE_BLOCK"; cell?: number }
  | { type: "CLEAR_FILL" }
  | { type: "PLACE_WORD"; word: string }
  | { type: "SET_SYMMETRY"; symmetry: Symmetry }
  | { type: "SET_MIN_SCORE"; minScore: number }
  | { type: "TOGGLE_APPROVE"; key: string; word: string }
  | { type: "CLEAR_APPROVALS"; key: string }
  | { type: "TOGGLE_REJECT"; word: string }
  | { type: "SET_CLUE"; key: string; clue: string }
  | { type: "SET_SPEED_CLUE"; key: string; clue: string }
  | { type: "APPLY_CLUES"; clues: Record<string, { standard: string; speed: string }> }
  | { type: "SET_TITLE"; title: string }
  | { type: "SET_THEME"; theme: string }
  | { type: "SET_DIFFICULTY"; difficulty: Difficulty }
  | { type: "SAVE_VERSION"; name: string; at: number }
  | { type: "RESTORE_VERSION"; index: number };

export const slotKey = (slot: Slot) => `${slot.cells[0]}:${slot.dir}:${slot.cells.length}`;

export function newPuzzleId(): string {
  return `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function initialStudioState(size = 5, id = newPuzzleId()): StudioState {
  return {
    id,
    grid: emptyGrid(size),
    symmetry: "rotational",
    minScore: 50,
    approved: {},
    rejected: [],
    cursor: 0,
    dir: "across",
    clues: {},
    speedClues: {},
    editedClues: [],
    title: "",
    theme: "",
    difficulty: "medium",
    versions: [],
  };
}

/** The entry under the cursor in the current direction (or the other one if there is none). */
export function activeSlot(state: Pick<StudioState, "grid" | "cursor" | "dir">): Slot | null {
  const slots = slotsOf(state.grid).filter((s) => s.cells.includes(state.cursor));
  return slots.find((s) => s.dir === state.dir) ?? slots[0] ?? null;
}

/** Engine rules for the current grid: approvals translated to this grid's slot ids. */
export function rulesFor(state: Pick<StudioState, "grid" | "minScore" | "approved" | "rejected">): EngineRules {
  const approved: Record<string, string[]> = {};
  for (const slot of slotsOf(state.grid)) {
    const words = state.approved[slotKey(slot)];
    if (words?.length) approved[slot.id] = words;
  }
  return { minScore: state.minScore, approved, rejected: state.rejected };
}

/** Typing or picking a clue marks it edited; clearing it hands the slot back to drafting. */
function markEdited(state: StudioState, key: string, text: string | undefined): string[] {
  const rest = (state.editedClues ?? []).filter((k) => k !== key);
  return text?.trim() ? [...rest, key] : rest;
}

/** Keeps only approvals and clues whose slots still exist. */
function prune(state: StudioState, grid: Grid): StudioState {
  const keys = new Set(slotsOf(grid).map(slotKey));
  const keep = <T,>(rec: Record<string, T>) => Object.fromEntries(Object.entries(rec).filter(([k]) => keys.has(k)));
  return {
    ...state,
    grid,
    approved: keep(state.approved),
    clues: keep(state.clues),
    speedClues: keep(state.speedClues),
    editedClues: (state.editedClues ?? []).filter((k) => keys.has(k)),
  };
}

function step(state: StudioState, delta: 1 | -1): number {
  const slot = activeSlot(state);
  if (!slot) return state.cursor;
  const pos = slot.cells.indexOf(state.cursor) + delta;
  return slot.cells[Math.max(0, Math.min(slot.cells.length - 1, pos))];
}

export function studioReducer(state: StudioState, action: StudioAction): StudioState {
  const { grid } = state;
  switch (action.type) {
    case "NEW_GRID":
      return {
        ...initialStudioState(action.size, action.id),
        symmetry: state.symmetry,
        minScore: state.minScore,
        rejected: state.rejected,
        difficulty: state.difficulty,
      };
    case "LOAD":
      // Older saved puzzles may lack newer fields; keep the defaults for those.
      return {
        ...initialStudioState(action.state.grid.width, action.state.id),
        ...Object.fromEntries(Object.entries(action.state).filter(([, v]) => v !== undefined)),
      } as StudioState;
    case "SET_GRID":
      return prune({ ...state, cursor: Math.min(state.cursor, action.grid.cells.length - 1) }, action.grid);
    case "SELECT":
      if (action.cell === state.cursor) return { ...state, dir: state.dir === "across" ? "down" : "across" };
      // Blacks are selectable so they can be toggled back to white.
      return { ...state, cursor: action.cell };
    case "TOGGLE_DIR":
      return { ...state, dir: state.dir === "across" ? "down" : "across" };
    case "MOVE": {
      // One square at a time, blacks included, so the keyboard can reach them to toggle.
      const r = Math.floor(state.cursor / grid.width) + action.dRow;
      const c = (state.cursor % grid.width) + action.dCol;
      if (r < 0 || r >= grid.height || c < 0 || c >= grid.width) return state;
      const dir = action.dCol !== 0 ? "across" : "down";
      return { ...state, cursor: r * grid.width + c, dir };
    }
    case "TYPE": {
      if (grid.cells[state.cursor] === "#") return state;
      const next = cloneGrid(grid);
      next.cells[state.cursor] = action.letter.toUpperCase();
      next.locked[state.cursor] = true;
      return { ...state, grid: next, cursor: step({ ...state, grid: next }, 1) };
    }
    case "ERASE": {
      const target = grid.cells[state.cursor] ? state.cursor : step(state, -1);
      if (grid.cells[target] === "#") return state;
      const next = cloneGrid(grid);
      next.cells[target] = "";
      next.locked[target] = false;
      return { ...state, grid: next, cursor: target };
    }
    case "TOGGLE_BLOCK": {
      const cell = action.cell ?? state.cursor;
      const makeBlack = grid.cells[cell] !== "#";
      const next = cloneGrid(grid);
      for (const i of partners(grid, cell, state.symmetry)) {
        next.cells[i] = makeBlack ? "#" : "";
        next.locked[i] = false;
      }
      return prune({ ...state, cursor: cell }, next);
    }
    case "CLEAR_FILL": {
      const next = cloneGrid(grid);
      next.cells = next.cells.map((c, i) => (c === "#" || next.locked[i] ? c : ""));
      return { ...state, grid: next };
    }
    case "PLACE_WORD": {
      const slot = activeSlot(state);
      if (!slot || slot.cells.length !== action.word.length) return state;
      const next = cloneGrid(grid);
      slot.cells.forEach((cell, i) => {
        next.cells[cell] = action.word[i].toUpperCase();
        next.locked[cell] = true;
      });
      return { ...state, grid: next };
    }
    case "SET_SYMMETRY":
      return { ...state, symmetry: action.symmetry };
    case "SET_MIN_SCORE":
      return { ...state, minScore: action.minScore };
    case "TOGGLE_APPROVE": {
      const list = state.approved[action.key] ?? [];
      const words = list.includes(action.word) ? list.filter((w) => w !== action.word) : [...list, action.word];
      const approved = { ...state.approved, [action.key]: words };
      if (!words.length) delete approved[action.key];
      return { ...state, approved, rejected: state.rejected.filter((w) => w !== action.word) };
    }
    case "CLEAR_APPROVALS": {
      const approved = { ...state.approved };
      delete approved[action.key];
      return { ...state, approved };
    }
    case "TOGGLE_REJECT": {
      if (state.rejected.includes(action.word)) return { ...state, rejected: state.rejected.filter((w) => w !== action.word) };
      const approved = Object.fromEntries(
        Object.entries(state.approved)
          .map(([k, words]) => [k, words.filter((w) => w !== action.word)] as const)
          .filter(([, words]) => words.length),
      );
      return { ...state, approved, rejected: [...state.rejected, action.word] };
    }
    case "SET_CLUE": {
      // The standard clue alone decides ownership: the speed tier has no form
      // field any more, so clearing the clue drops it too and hands the slot
      // back to drafting.
      const speedClues = { ...state.speedClues };
      if (!action.clue.trim()) delete speedClues[action.key];
      return { ...state, clues: { ...state.clues, [action.key]: action.clue }, speedClues, editedClues: markEdited(state, action.key, action.clue) };
    }
    case "SET_SPEED_CLUE":
      return { ...state, speedClues: { ...state.speedClues, [action.key]: action.clue }, editedClues: markEdited(state, action.key, action.clue || state.clues[action.key]) };
    case "APPLY_CLUES": {
      const clues = { ...state.clues };
      const speedClues = { ...state.speedClues };
      const edited = new Set(state.editedClues ?? []);
      for (const [key, c] of Object.entries(action.clues)) {
        // Hand-written clues win: a draft only fills or replaces Claude's own.
        if (edited.has(key)) continue;
        clues[key] = c.standard;
        speedClues[key] = c.speed;
      }
      return { ...state, clues, speedClues };
    }
    case "SET_TITLE":
      return { ...state, title: action.title };
    case "SET_THEME":
      return { ...state, theme: action.theme };
    case "SET_DIFFICULTY":
      return { ...state, difficulty: action.difficulty };
    case "SAVE_VERSION":
      return {
        ...state,
        versions: [
          {
            name: action.name,
            at: action.at,
            grid: cloneGrid(grid),
            clues: { ...state.clues },
            speedClues: { ...state.speedClues },
            editedClues: [...(state.editedClues ?? [])],
          },
          ...state.versions,
        ].slice(0, 20),
      };
    case "RESTORE_VERSION": {
      const version = state.versions[action.index];
      if (!version) return state;
      const restored = version.clues
        ? { ...state, cursor: 0, clues: { ...version.clues }, speedClues: { ...(version.speedClues ?? {}) }, editedClues: [...(version.editedClues ?? [])] }
        : { ...state, cursor: 0 };
      return prune(restored, cloneGrid(version.grid));
    }
  }
}

/** Ids of complete entries whose word appears more than once (the engine refuses dupes). */
export function duplicateEntries(grid: Grid): string[] {
  const seen = new Map<string, string[]>();
  for (const slot of slotsOf(grid)) {
    if (!slot.cells.every((c) => grid.cells[c] && grid.cells[c] !== "#")) continue;
    const word = slot.cells.map((c) => grid.cells[c]).join("");
    seen.set(word, [...(seen.get(word) ?? []), slot.id]);
  }
  return [...seen.values()].filter((ids) => ids.length > 1).flat();
}

/** Option count → heat bucket, as Ingrid colors its grid. */
export function heatLevel(count: number | undefined): "dead" | "tight" | "snug" | "open" {
  if (count === undefined || count >= 20) return "open";
  if (count === 0) return "dead";
  return count <= 5 ? "tight" : "snug";
}

/** Per cell, the fewest options among the entries through it (fixed entries don't count). */
export function cellHeat(grid: Grid, counts: Record<string, number>): (number | undefined)[] {
  const out: (number | undefined)[] = Array(grid.cells.length).fill(undefined);
  for (const slot of slotsOf(grid)) {
    if (slot.cells.every((c) => grid.cells[c] && grid.cells[c] !== "#")) continue;
    const n = counts[slot.id];
    if (n === undefined) continue;
    for (const c of slot.cells) out[c] = out[c] === undefined ? n : Math.min(out[c]!, n);
  }
  return out;
}
