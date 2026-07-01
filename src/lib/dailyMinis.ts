import { buildPuzzle, type GridSpec } from "./samplePuzzles";
import type { Puzzle } from "../types/puzzle";

/**
 * Themed 5x5 daily minis — a different theme each day.
 *
 * Original content: fill generated from a public-domain / permissively-licensed
 * word list (ENABLE + a top-frequency list) and validated so every across/down
 * entry is a real word and no answer repeats; clues written for Crossword Clash.
 * 100% original — zero third-party puzzle-copyright. Regenerate/expand with
 * scripts/mini-generator/ (see that dir's README). Grids use "#" for black cells.
 */
export interface DailyMini {
  /** One-word theme for the day, shown to the player. */
  theme: string;
  puzzle: Puzzle;
}

const SPECS: (GridSpec & { theme: string })[] = [
  {
    theme: "Ocean",
    title: "Deep Blue",
    grid: ["#whom", "trace", "holes", "atlas", "neon#"],
    clueTexts: {
      WHOM: "For ___ the bell tolls",
      TRACE: "Tiny amount",
      HOLES: "Golf course targets",
      ATLAS: "Book of maps",
      NEON: "Bright sign gas",
      THAN: "Bigger ___ life",
      WROTE: "Penned",
      HALLO: "Old-fashioned greeting",
      OCEAN: "The Pacific, for one",
      MESS: "Big disorder",
    },
  },
  {
    theme: "Piano",
    title: "Key Notes",
    grid: ["#cart", "order", "piano", "empty", "nets#"],
    clueTexts: {
      CART: "Shopping ___",
      ORDER: "Restaurant request",
      PIANO: "88-key instrument",
      EMPTY: "Vacant",
      NETS: "Soccer goals have them",
      OPEN: "Not closed",
      CRIME: "Illegal act",
      ADAPT: "Adjust to change",
      RENTS: "Pays the landlord",
      TROY: "City of the wooden horse",
    },
  },
  {
    theme: "Space",
    title: "Final Frontier",
    grid: ["#step", "spear", "cargo", "acres", "rear#"],
    clueTexts: {
      STEP: "Stair unit",
      SPEAR: "Pointed weapon",
      CARGO: "Ship's freight",
      ACRES: "Land measures",
      REAR: "Back part",
      SCAR: "Healed-wound mark",
      SPACE: "The final frontier",
      TERRA: "___ firma",
      EAGER: "Keen and excited",
      PROS: "Experts, informally",
    },
  },
  {
    theme: "Beach",
    title: "Shore Thing",
    grid: ["#lest", "beach", "agree", "nanny", "else#"],
    clueTexts: {
      LEST: "For fear that",
      BEACH: "Sandy shore",
      AGREE: "Say yes together",
      NANNY: "Child's caregiver",
      ELSE: "Or ___",
      BANE: "Source of ruin",
      LEGAL: "Allowed by law",
      EARNS: "Works for pay",
      SCENE: "Part of a play",
      THEY: "Those folks",
    },
  },
  {
    theme: "Chess",
    title: "Checkmate",
    grid: ["#chip", "chess", "rails", "asset", "bets#"],
    clueTexts: {
      CHIP: "Poker token",
      CHESS: "Game of kings and pawns",
      RAILS: "Train tracks",
      ASSET: "Valuable resource",
      BETS: "Casino wagers",
      CRAB: "Beach crustacean",
      CHASE: "Pursue",
      HEIST: "Big robbery",
      ISLES: "Small islands",
      PSST: '"Hey, over here!"',
    },
  },
  {
    theme: "Storm",
    title: "Weather Report",
    grid: ["#mama", "polar", "storm", "songs", "tree#"],
    clueTexts: {
      MAMA: "Mother, affectionately",
      POLAR: "___ bear",
      STORM: "Thunder-and-lightning event",
      SONGS: "Playlist items",
      TREE: "Oak or maple",
      PSST: "Quiet attention-getter",
      MOTOR: "Engine",
      ALONE: "By oneself",
      MARGE: "Homer Simpson's wife",
      ARMS: "They have elbows",
    },
  },
  {
    theme: "Candy",
    title: "Sweet Tooth",
    grid: ["#meat", "candy", "actor", "there", "sore#"],
    clueTexts: {
      MEAT: "Butcher's offering",
      CANDY: "Sweet treat",
      ACTOR: "Movie star",
      THERE: "Not here",
      SORE: "Achy",
      CATS: 'Musical with "Memory"',
      MACHO: "Aggressively masculine",
      ENTER: "Go in",
      ADORE: "Love deeply",
      TYRE: "Ancient Phoenician port",
    },
  },
];

export const DAILY_MINIS: DailyMini[] = SPECS.map((s) => ({
  theme: s.theme,
  puzzle: buildPuzzle(s),
}));

/** Local-calendar day number (days since the Unix epoch). */
function dayNumber(date: Date): number {
  return Math.floor(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86_400_000,
  );
}

/**
 * The mini for a given day — deterministic, so everyone gets the same puzzle on
 * the same calendar day, and it rotates through the set (repeating after the
 * set length until we add more).
 */
export function getDailyMini(date: Date = new Date()): DailyMini {
  const n = dayNumber(date);
  const i = ((n % DAILY_MINIS.length) + DAILY_MINIS.length) % DAILY_MINIS.length;
  return DAILY_MINIS[i];
}
