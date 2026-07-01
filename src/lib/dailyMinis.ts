import { buildPuzzle, type GridSpec } from "./samplePuzzles";
import type { Puzzle } from "../types/puzzle";

/**
 * Themed daily minis — a different theme each day, in mixed sizes (5×5 and
 * 7×7 today; the pipeline supports any N×N with symmetric black squares).
 *
 * Original content: fill generated from a public-domain / permissively-licensed
 * word list (ENABLE + a top-frequency list), validated (every across/down entry
 * a real word, no answer repeats) and quality-audited (no obscure crosswordese,
 * clue quality, grid symmetry/connectivity) via scripts/mini-generator/; clues
 * written for Crossword Clash. 100% original — zero third-party
 * puzzle-copyright. Grids use "#" for black cells.
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
  {
    theme: "Dance",
    title: "Cut a Rug",
    grid: ["#veal", "dance", "ultra", "cured", "keys#"],
    clueTexts: {
      VEAL: "Tender cutlet meat",
      DANCE: "Waltz or tango",
      ULTRA: "Extreme, as a marathon",
      CURED: "Preserved, like ham",
      KEYS: "They unlock doors",
      DUCK: "Pond quacker",
      VALUE: "Worth",
      ENTRY: "Diary post",
      ACRES: "Farmland units",
      LEAD: "Be in first place",
    },
  },
  {
    theme: "Novel",
    title: "Page Turner",
    grid: ["#flew", "alive", "novel", "trend", "east#"],
    clueTexts: {
      FLEW: "Traveled by plane",
      ALIVE: "Not dead",
      NOVEL: "Full-length work of fiction",
      TREND: "Current fashion",
      EAST: "Sunrise direction",
      ANTE: "Poker starting bet",
      FLORA: "Plant life",
      LIVES: "Cats supposedly have nine",
      EVENT: "Happening on the calendar",
      WELD: "Fuse metal",
    },
  },
  {
    theme: "Actor",
    title: "On Screen",
    grid: ["#moth", "bathe", "actor", "these", "sore#"],
    clueTexts: {
      MOTH: "Flame-drawn flier",
      BATHE: "Take a soak",
      ACTOR: "Member of a movie cast",
      THESE: "Not those",
      SORE: "Achy",
      BATS: "Baseball clubs",
      MACHO: "Overly manly",
      OTTER: "Playful river mammal",
      THOSE: "Not these",
      HERE: '"Present!" at roll call',
    },
  },
  {
    theme: "Party",
    title: "Let's Celebrate",
    grid: ["#cape", "moral", "users", "state", "easy#"],
    clueTexts: {
      CAPE: "Superhero's cloak",
      MORAL: "Lesson of a fable",
      USERS: "App account holders",
      STATE: "Texas or Ohio",
      EASY: "Not hard",
      MUSE: "Artist's inspiration",
      COSTA: "___ Rica",
      AREAS: "Regions",
      PARTY: "Birthday bash",
      ELSE: "Or ___",
    },
  },
  {
    theme: "Salad",
    title: "Garden Fresh",
    grid: ["#saga", "camel", "alone", "panic", "edge#"],
    clueTexts: {
      SAGA: "Long epic tale",
      CAMEL: "Humped desert animal",
      ALONE: "By oneself",
      PANIC: "Sudden fear",
      EDGE: "Border or rim",
      CAPE: "Point of land",
      SALAD: "Bowl of greens",
      AMONG: "In the middle of",
      GENIE: "Lamp-dwelling wish granter",
      ALEC: "Smart ___ (know-it-all)",
    },
  },
  {
    theme: "Juice",
    title: "Squeeze Play",
    grid: ["#grab", "juice", "eight", "ashes", "nets#"],
    clueTexts: {
      GRAB: "Snatch quickly",
      JUICE: "Orange breakfast drink",
      EIGHT: "Number after seven",
      ASHES: "Fireplace remnants",
      NETS: "Basketball hoops have them",
      JEAN: "Denim, informally",
      GUISE: "Outward form",
      RIGHT: "Opposite of left",
      ACHES: "Dull pains",
      BETS: "Casino wagers",
    },
  },
  {
    theme: "Robot",
    title: "Gear Up",
    grid: ["#prop", "crops", "robes", "abort", "beta#"],
    clueTexts: {
      PROP: "Stage-play set piece",
      CROPS: "Corn and wheat, e.g.",
      ROBES: "Wizard wardrobe staples",
      ABORT: "Cancel mid-mission",
      BETA: "App version for testers",
      CRAB: "Sideways-walking beach dweller",
      PROBE: "Deep-space explorer craft",
      ROBOT: "Vacuum that roams the house solo, e.g.",
      OPERA: "Show full of arias",
      PSST: 'Whispered "over here!"',
    },
  },
  {
    theme: "Magic",
    title: "Now You See It",
    grid: ["#maps", "magic", "arena", "linen", "eats#"],
    clueTexts: {
      MAPS: "Phone app with turn-by-turn directions",
      MAGIC: "Rabbit-from-a-hat stuff",
      ARENA: "Big concert venue",
      LINEN: "Crisp summer fabric",
      EATS: "Grub, informally",
      MALE: "Buck or bull",
      MARIA: "The moon's dark plains",
      AGENT: "Spy, e.g.",
      PINES: "Longs (for)",
      SCAN: "Do to a QR code",
    },
  },
  {
    theme: "Disco",
    title: "Mirror Ball",
    grid: ["#fast", "disco", "union", "madly", "bled#"],
    clueTexts: {
      FAST: "Like lightning",
      DISCO: "Genre danced under a mirror ball",
      UNION: "Workers' organization",
      MADLY: "How the head-over-heels fall in love",
      BLED: "Needed a bandage, maybe",
      DUMB: "Not the sharpest",
      FINAL: "Exam at semester's end",
      ASIDE: "Stage whisper to the audience",
      SCOLD: "Give a stern talking-to",
      TONY: "Broadway's big award",
    },
  },
  {
    theme: "Movie",
    title: "Now Showing",
    grid: ["#more", "dozen", "avoid", "rings", "teen#"],
    clueTexts: {
      MORE: "Oliver Twist's famous request",
      DOZEN: "Baker's ___ (thirteen)",
      AVOID: "Steer clear of",
      RINGS: "Saturn's claim to fame",
      TEEN: "High schooler, usually",
      DART: "Pub-game projectile",
      MOVIE: "Popcorn-and-previews outing",
      OZONE: "Protective atmospheric layer",
      REIGN: "Monarch's rule",
      ENDS: "They justify the means, some say",
    },
  },
  {
    theme: "Comet",
    title: "Tail Blazer",
    grid: ["#snip", "shade", "comet", "areas", "ness#"],
    clueTexts: {
      SNIP: "Quick scissors cut",
      SHADE: "Sly disrespect, in slang",
      COMET: "Icy space wanderer with a tail",
      AREAS: "Zones",
      NESS: "Loch ___ monster",
      SCAN: "Look over quickly",
      SHORE: "Where the waves break",
      NAMES: "Roll-call list",
      IDEAS: "Brainstorm output",
      PETS: "Goldfish and gerbils, e.g.",
    },
  },
  // 7×7s — bigger boards, same daily rotation.
  {
    theme: "Weekend",
    title: "TGIF",
    grid: ["saw#gag", "ole#ego", "blessed", "##kit##", "presume", "ran#ray", "odd#ere"],
    clueTexts: {
      SAW: "Toolbox cutter",
      GAG: "Running joke",
      OLE: "Bullring cheer",
      EGO: "Sense of self",
      BLESSED: "Extremely fortunate",
      KIT: "First-aid ___",
      PRESUME: '"Dr. Livingstone, I ___?"',
      RAN: "Went for a jog",
      RAY: "Beam of sunshine",
      ODD: "Like 3, 5 and 7",
      ERE: "Before, poetically",
      SOB: "Tearful gasp",
      PRO: "Seasoned expert",
      ALL: "The whole enchilada",
      RAD: "Totally awesome, '80s-style",
      WEEKEND: "Saturday and Sunday, together",
      SIS: "Brother's counterpart, familiarly",
      GESTURE: "Wave or nod",
      AGE: "Number of candles on the cake",
      MAR: "Scratch up",
      GOD: "Zeus or Odin",
      EYE: "Storm's calm center",
    },
  },
  {
    theme: "Cookies",
    title: "Fresh Batch",
    grid: ["ifs#coy", "dot#owe", "seasons", "##yak##", "initial", "can#eta", "egg#sew"],
    clueTexts: {
      IFS: "No ___, ands, or buts",
      COY: "Playfully evasive",
      DOT: "The i's little topper",
      OWE: "Be in debt",
      SEASONS: "Winter, spring, summer and fall",
      YAK: "Shaggy Himalayan ox",
      INITIAL: "Like first impressions",
      CAN: "Soda container",
      ETA: "Arrival time, for short",
      EGG: "Dozen-carton item",
      SEW: "Use a needle and thread",
      IDS: "Bouncer's requests",
      ICE: "Rink surface",
      FOE: "Adversary",
      NAG: "Pester nonstop",
      STAYING: "Not going anywhere",
      SAT: "Took a seat",
      COOKIES: "Fresh-from-the-oven batch, often chocolate chip",
      OWN: "Have the deed to",
      ATE: "Polished off dinner",
      YES: "Enthusiastic RSVP",
      LAW: "What attorneys practice",
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
