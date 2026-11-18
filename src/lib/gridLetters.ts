/**
 * The letters a grid square can hold, in one place: A–Z and Ñ.
 *
 * Spanish puzzles (docs/spanish-puzzles-spec.md §2.2) treat Ñ as its own
 * letter, crossing as Ñ both ways, and drop every other diacritic in the
 * grid: CANCIÓN is CANCION, PINGÜINO is PINGUINO. So a typed "ñ" is a letter
 * and a typed "á" is an A. The solver's input paths and the construction
 * tooling both read these, so an entry is spelled the same way wherever it
 * is compared.
 */

const ENYE = "Ñ";
/** Stands in for Ñ while the combining marks are stripped; a private-use code point no text holds. */
const ENYE_GUARD = "";

/** Upper-cased with accents and diéresis folded to their plain letters; Ñ and every other character kept. */
export function foldAccents(text: string): string {
  return text
    .toUpperCase()
    .normalize("NFC")
    .replace(/Ñ/g, ENYE_GUARD)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\uE000/g, ENYE);
}

/** The grid letter one typed character stands for ("a" → "A", "ñ" → "Ñ", "á" → "A"), or null when it is not a letter. */
export function gridLetter(ch: string): string | null {
  const folded = foldAccents(ch);
  return /^[A-ZÑ]$/.test(folded) ? folded : null;
}

/** A single character that can go in a square. */
export function isGridLetter(ch: string): boolean {
  return gridLetter(ch) !== null;
}

/** An entry as the grid spells it: grid letters only ("Por favor" → "PORFAVOR", "año" → "AÑO"). */
export function gridSpelling(text: string): string {
  return foldAccents(text).replace(/[^A-ZÑ]/g, "");
}

/** The words of a clue or title as the grid would spell them, for comparing against entries. */
export function gridWords(text: string): string[] {
  return foldAccents(text).split(/[^A-ZÑ]+/).filter(Boolean);
}

/**
 * Whether the in-app keyboard should carry the Ñ key: a Spanish puzzle, or any
 * puzzle with an Ñ in its solution (an imported file says nothing of its language).
 */
export function puzzleNeedsEnye(puzzle: { language?: string; cells: { solution: string | null }[][] } | null | undefined): boolean {
  if (!puzzle) return false;
  return puzzle.language === "es" || puzzle.cells.some((row) => row.some((cell) => cell.solution === ENYE));
}
