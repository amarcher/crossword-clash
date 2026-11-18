import { describe, expect, it } from "vitest";
import { normalizeTransferPuzzle, puzzleToTransferFormat, type TransferPuzzle } from "./puzzleNormalizer";
import { puzzleReducer, initialState } from "../hooks/usePuzzle";
import { puzzleIdentity } from "./soloStats";

/**
 * A Spanish grid end to end through the parts that never knew a language
 * (docs/spanish-puzzles-spec.md §3): the transfer format, the reducer's
 * judgement of a letter and the puzzle's identity.
 *
 *   A Ñ O
 *   L # S
 *   A S A
 */
const transfer: TransferPuzzle = {
  title: "Año nuevo",
  author: "Prueba",
  size: { rows: 3, cols: 3 },
  grid: ["A", "Ñ", "O", "L", ".", "S", "A", "S", "A"],
  gridnums: [1, 0, 2, 0, 0, 0, 3, 0, 0],
  clues: { across: ["1. Doce meses", "3. Por ahí se agarra la taza"], down: ["1. Parte del ave que vuela", "2. Animal que hiberna, en femenino"] },
  answers: { across: ["AÑO", "ASA"], down: ["ALA", "OSA"] },
  language: "es",
};

describe("a Spanish puzzle", () => {
  it("keeps its language and its Ñ through the transfer format, and English says nothing", () => {
    const puzzle = normalizeTransferPuzzle(transfer);
    expect(puzzle.language).toBe("es");
    expect(puzzle.cells[0][1].solution).toBe("Ñ");
    const back = puzzleToTransferFormat(puzzle);
    expect(back.language).toBe("es");
    expect(back.grid).toEqual(transfer.grid);
    expect(back.answers.across[0]).toBe("AÑO");

    const { language: _dropped, ...english } = transfer;
    const plain = normalizeTransferPuzzle(english);
    expect(plain.language).toBeUndefined();
    expect("language" in puzzleToTransferFormat(plain)).toBe(false);
    expect("language" in puzzleToTransferFormat({ ...plain, language: "en" })).toBe(false);
  });

  it("is a different puzzle from the same grid with N for Ñ", () => {
    const withN: TransferPuzzle = { ...transfer, grid: transfer.grid.map((ch) => (ch === "Ñ" ? "N" : ch)) };
    expect(puzzleIdentity(normalizeTransferPuzzle(transfer))).not.toBe(puzzleIdentity(normalizeTransferPuzzle(withN)));
  });

  it("accepts Ñ on its square and refuses N there under autocheck", () => {
    const puzzle = normalizeTransferPuzzle(transfer);
    let state = puzzleReducer(initialState, { type: "LOAD_PUZZLE", puzzle });
    state = puzzleReducer(state, { type: "SELECT_CELL", row: 0, col: 1 });
    const refused = puzzleReducer(state, { type: "INPUT_LETTER", letter: "N" });
    expect(refused.playerCells["0,1"]).toBeUndefined();
    expect(refused.rejection).toMatchObject({ row: 0, col: 1, letter: "N" });
    const placed = puzzleReducer(state, { type: "INPUT_LETTER", letter: "ñ" });
    expect(placed.playerCells["0,1"]).toMatchObject({ letter: "Ñ", correct: true });
    expect(placed.rejection).toBeNull();
  });
});
