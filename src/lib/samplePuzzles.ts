import type { Puzzle, PuzzleCell, PuzzleClue, Direction } from "../types/puzzle";

interface GridSpec {
  title: string;
  grid: string[];
  clueTexts: Record<string, string>;
}

function buildPuzzle(spec: GridSpec): Puzzle {
  const height = spec.grid.length;
  const width = spec.grid[0].length;
  const cells: PuzzleCell[][] = [];
  let num = 0;

  interface Entry {
    number: number;
    direction: Direction;
    row: number;
    col: number;
    answer: string;
  }
  const entries: Entry[] = [];

  for (let r = 0; r < height; r++) {
    const row: PuzzleCell[] = [];
    for (let c = 0; c < width; c++) {
      const ch = spec.grid[r][c];
      const isBlack = ch === "#";
      const startsAcross =
        !isBlack &&
        (c === 0 || spec.grid[r][c - 1] === "#") &&
        c + 1 < width &&
        spec.grid[r][c + 1] !== "#";
      const startsDown =
        !isBlack &&
        (r === 0 || spec.grid[r - 1][c] === "#") &&
        r + 1 < height &&
        spec.grid[r + 1][c] !== "#";

      let cellNum: number | undefined;
      if (startsAcross || startsDown) {
        num++;
        cellNum = num;
      }

      if (startsAcross && cellNum !== undefined) {
        let answer = "";
        for (let cc = c; cc < width && spec.grid[r][cc] !== "#"; cc++)
          answer += spec.grid[r][cc].toUpperCase();
        entries.push({ number: cellNum, direction: "across", row: r, col: c, answer });
      }
      if (startsDown && cellNum !== undefined) {
        let answer = "";
        for (let rr = r; rr < height && spec.grid[rr][c] !== "#"; rr++)
          answer += spec.grid[rr][c].toUpperCase();
        entries.push({ number: cellNum, direction: "down", row: r, col: c, answer });
      }

      row.push({
        row: r,
        col: c,
        solution: isBlack ? null : ch.toUpperCase(),
        ...(cellNum !== undefined ? { number: cellNum } : {}),
      });
    }
    cells.push(row);
  }

  const usedKeys = new Map<string, number>();
  const clues: PuzzleClue[] = entries.map((e) => {
    const count = usedKeys.get(e.answer) ?? 0;
    usedKeys.set(e.answer, count + 1);
    const key = count === 0 ? e.answer : `${e.answer}_${count + 1}`;
    const text = spec.clueTexts[key] ?? spec.clueTexts[e.answer] ?? e.answer;

    return {
      direction: e.direction,
      number: e.number,
      text,
      row: e.row,
      col: e.col,
      length: e.answer.length,
      answer: e.answer,
    };
  });

  return {
    title: spec.title,
    author: "Crossword Clash",
    width,
    height,
    cells,
    clues,
  };
}

// All grids solver-generated. No word appears in both across and down.

const roadTrip = buildPuzzle({
  title: "Road Trip",
  grid: ["#DROP", "WROTE", "ROUTE", "ANGEL", "PEER#"],
  clueTexts: {
    DROP: "Let fall",
    WROTE: "Penned",
    ROUTE: "Path or way",
    ANGEL: "Heavenly being",
    PEER: "Look closely",
    WRAP: "Cover a gift",
    DRONE: "Buzzing flyer",
    ROUGE: "Red cosmetic",
    OTTER: "Playful river animal",
    PEEL: "Banana skin",
  },
});

const nightOwl = buildPuzzle({
  title: "Night Owl",
  grid: ["#FAST", "HONOR", "ARGUE", "SCENE", "HELD#"],
  clueTexts: {
    FAST: "Quick",
    HONOR: "Respect deeply",
    ARGUE: "Debate heatedly",
    SCENE: "Part of a play",
    HELD: "Gripped",
    HASH: "Pound sign",
    FORCE: "Push or power",
    ANGEL: "Heavenly figure",
    SOUND: "Something you hear",
    TREE: "Oak or maple",
  },
});

const iceCold = buildPuzzle({
  title: "Ice Cold",
  grid: ["#SLIT", "SCENE", "EAGER", "ALARM", "MELT#"],
  clueTexts: {
    SLIT: "Narrow opening",
    SCENE: "Movie setting",
    EAGER: "Very keen",
    ALARM: "Wake-up buzzer",
    MELT: "Thaw out",
    SEAM: "Fabric join",
    SCALE: "Weigh with",
    LEGAL: "Lawful",
    INERT: "Inactive",
    TERM: "School period",
  },
});

const slamDunk = buildPuzzle({
  title: "Slam Dunk",
  grid: ["#SLAM", "STALE", "LOYAL", "INERT", "TERM#"],
  clueTexts: {
    SLAM: "Shut forcefully",
    STALE: "No longer fresh",
    LOYAL: "Faithful",
    INERT: "Chemically inactive",
    TERM: "Word or phrase",
    SLIT: "Thin cut",
    STONE: "Rock",
    LAYER: "One thickness",
    ALARM: "Warning signal",
    MELT: "Dissolve with heat",
  },
});

export interface SamplePuzzleInfo {
  id: string;
  puzzle: Puzzle;
}

export const SAMPLE_PUZZLES: SamplePuzzleInfo[] = [
  { id: "road-trip", puzzle: roadTrip },
  { id: "night-owl", puzzle: nightOwl },
  { id: "ice-cold", puzzle: iceCold },
  { id: "slam-dunk", puzzle: slamDunk },
];
