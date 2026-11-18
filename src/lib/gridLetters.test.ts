import { describe, expect, it } from "vitest";
import { foldAccents, gridLetter, gridSpelling, gridWords, isGridLetter, puzzleNeedsEnye } from "./gridLetters";

const cells = (rows: string[]) => rows.map((row) => [...row].map((ch) => ({ solution: ch === "#" ? null : ch })));

describe("grid letters", () => {
  it("takes Ñ as its own letter and folds every other accent", () => {
    expect(gridLetter("a")).toBe("A");
    expect(gridLetter("Z")).toBe("Z");
    expect(gridLetter("ñ")).toBe("Ñ");
    expect(gridLetter("Ñ")).toBe("Ñ");
    // Typed as N followed by a combining tilde (how some keyboards compose it).
    expect(gridLetter("ñ")).toBe("Ñ");
    expect(gridLetter("á")).toBe("A");
    expect(gridLetter("É")).toBe("E");
    expect(gridLetter("ü")).toBe("U");
  });

  it("refuses everything that is not one letter", () => {
    for (const key of ["1", " ", ".", "", "ab", "Enter", "Backspace", "Dead", "Unidentified", "ß", "¿"]) {
      expect(gridLetter(key), key).toBeNull();
      expect(isGridLetter(key), key).toBe(false);
    }
  });

  it("spells an entry the way the grid holds it", () => {
    expect(foldAccents("Canción del año")).toBe("CANCION DEL AÑO");
    expect(gridSpelling("Por favor")).toBe("PORFAVOR");
    expect(gridSpelling("pingüino")).toBe("PINGUINO");
    expect(gridSpelling("AÑO")).toBe("AÑO");
    expect(gridSpelling("GOAT cheese!")).toBe("GOATCHEESE");
  });

  it("splits a clue into words that compare with entries", () => {
    expect(gridWords("¿Qué canción suena cada año?")).toEqual(["QUE", "CANCION", "SUENA", "CADA", "AÑO"]);
    expect(gridWords("It's a 3-letter word")).toEqual(["IT", "S", "A", "LETTER", "WORD"]);
  });

  it("asks for the Ñ key on a Spanish puzzle or any grid holding one", () => {
    expect(puzzleNeedsEnye(null)).toBe(false);
    expect(puzzleNeedsEnye({ cells: cells(["CAT", "A#E", "TEN"]) })).toBe(false);
    expect(puzzleNeedsEnye({ language: "es", cells: cells(["SOL"]) })).toBe(true);
    expect(puzzleNeedsEnye({ cells: cells(["AÑO"]) })).toBe(true);
  });
});
