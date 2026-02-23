# Crossword Clash

## Project Overview

Real-time multiplayer crossword puzzle game. Supports solo play with localStorage persistence and competitive multiplayer via Supabase Realtime Broadcast channels.

## Stack

- **Frontend**: React 19 + TypeScript + Vite 7 + Tailwind CSS v4
- **Backend**: Supabase (Postgres + Auth + Realtime Broadcast)
- **Testing**: Vitest
- **Package manager**: pnpm

## Commands

- `pnpm dev` — start dev server
- `pnpm build` — type-check + production build
- `pnpm preview` — preview production build
- `pnpm test` — run unit tests (vitest)
- `pnpm test:watch` — run tests in watch mode

## Architecture

- **State management**: Single `useReducer` in `src/hooks/usePuzzle.ts` — no external state library. Derived values (activeClue, highlightedCells) via `useMemo`.
- **Supabase client**: Nullable singleton in `src/lib/supabaseClient.ts` — app works fully offline when env vars aren't set (only "Play Solo" available).
- **Puzzle import**: `@xwordly/xword-parser` parses .puz/.ipuz/.jpz/.xd files, then `src/lib/puzzleNormalizer.ts` converts to internal `Puzzle` type.
- **Persistence**: Solo mode uses localStorage for puzzle + progress. Supabase handles multiplayer state via `claim_cell` RPC.
- **Multiplayer**: Supabase Broadcast channels for real-time cell claims. Conflict resolution: local check → server `claim_cell` RPC with row lock → broadcast. No deletion in multiplayer — correct letters are permanent.

## Game Modes

- **Solo**: Import puzzle → play locally → progress saved to localStorage and Supabase (if connected).
- **Host Game**: Import puzzle → multiplayer game created with 6-char share code → lobby → start when 2+ players joined.
- **Join Game**: Enter share code → join lobby → play when host starts.

## Multiplayer Input Flow

```
Keypress → useGridNavigation → wrappedInputLetter
  1. Local check: cell already filled? → skip
  2. Correct letter? → no: silent reject
  3. Optimistic: dispatch INPUT_LETTER with playerId
  4. Server: claimCellOnServer()
     → success: broadcast cell_claimed to others
     → fail: dispatch ROLLBACK_CELL
```

## Project Structure

```
src/
  components/
    CrosswordGrid/  # Grid + Cell (container query font scaling) + keyboard nav
    CluePanel/      # Clue list with active highlighting
    GameLobby/      # GameLobby (share code, player list) + JoinGame (code input)
    Layout/         # GameLayout with optional sidebar slot
    PuzzleImporter/ # File upload/drag-and-drop
    Scoreboard/     # Solo Scoreboard + MultiplayerScoreboard (per-player colored bars)
  hooks/
    usePuzzle.ts    # Core game state reducer (LOAD_PUZZLE, INPUT_LETTER, REMOTE_CELL_CLAIM, HYDRATE_CELLS, ROLLBACK_CELL)
    useMultiplayer.ts # Broadcast channel, cell claiming, player tracking, reconnect
    useSupabase.ts  # Anonymous auth + client
  lib/
    gridUtils.ts    # Pure navigation/word boundary functions
    playerColors.ts # 8-color pool for player assignment
    puzzleNormalizer.ts # Parser output → Puzzle type
    puzzleService.ts    # Supabase CRUD + multiplayer (claimCellOnServer, joinGame, fetchGameState, startGame)
    supabaseClient.ts   # Nullable Supabase client singleton
  types/
    puzzle.ts       # Puzzle, CellState, CellCoord types
    game.ts         # Game, Player, GameStatus types
    supabase.ts     # Database types + claim_cell function
supabase/
  migrations/
    20260223000000_initial_schema.sql  # puzzles, games, players tables
    20260224000000_multiplayer.sql     # claim_cell RPC, short_code column + trigger
    20260223231555_fix_claim_cell_player_id_type.sql  # Fix p_player_id TEXT→UUID
```

## Code Conventions

- Strict TypeScript (`strict: true`, `noUnusedLocals`, `noUnusedParameters`)
- Tailwind CSS v4 (using `@import "tailwindcss"` syntax, `@tailwindcss/vite` plugin)
- Components use named exports; `index.ts` barrel files for component directories
- Pure functions in `lib/` — no side effects, easy to test
- `React.memo` for performance-sensitive components (e.g., Cell)
- Cell font/number sizing uses CSS container query units (`cqi`) for responsive scaling

## Environment Variables

Copy `.env.example` to `.env.local` and fill in Supabase credentials. The app runs without them (DB features disabled, only solo mode).

```
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```

## Testing

- `pnpm test` — 68 unit tests across 4 files
- **gridUtils.test.ts** (29 tests): getCellAt, isBlack, getWordCells, getClueForCell, getNextCell, getPrevCell, getNextWordStart, getPrevWordStart, computeCellNumbers
- **usePuzzle.test.ts** (26 tests): All reducer actions (LOAD_PUZZLE, RESET, SELECT_CELL, TOGGLE_DIRECTION, SET_DIRECTION, INPUT_LETTER, DELETE_LETTER, NEXT_WORD, PREV_WORD, MOVE_SELECTION, REMOTE_CELL_CLAIM, HYDRATE_CELLS, ROLLBACK_CELL)
- **puzzleNormalizer.test.ts** (9 tests): Parser output → Puzzle conversion (title/author, dimensions, cell solutions, numbering, clue positions/answers)
- **playerColors.test.ts** (4 tests): Color pool distinctness, wrapping, hex format

Supabase project requires:
- **Anonymous sign-ins enabled** (Authentication → Providers)
- All migrations applied (`npx supabase db push`)
