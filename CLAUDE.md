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
- **Persistence**: Solo mode uses localStorage for puzzle + progress. Multiplayer sessions (`crossword-clash-mp` / `crossword-clash-host`) are persisted to localStorage so players auto-rejoin on page refresh. Supabase handles multiplayer state via `claim_cell` RPC.
- **Multiplayer**: Supabase Broadcast channels for real-time cell claims. Conflict resolution: local check → server `claim_cell` RPC with row lock → broadcast. No deletion in multiplayer — correct letters are permanent. Host can close the room via `room_closed` broadcast, which boots all players back to the menu.

## Game Modes

- **Solo**: Import puzzle → play locally → progress saved to localStorage and Supabase (if connected).
- **Host Game (Player View)**: Import puzzle → enter display name → multiplayer game created with 6-char share code → lobby (with QR code for easy joining) → start when 2+ players joined. Host can close the room at any time from lobby or playing screen. Refreshing the page auto-rejoins.
- **TV / Host View** (`/host`): Read-only spectator display. Creates a game room without joining as a player. Shows grid, clue list with strikethrough for completed words, scoreboard, room code + QR. Host can start game when 2+ players join and close the room at any time. Speech announcements via Web Speech API announce each completed clue (player name, clue number/direction, clue text, answer).
- **Join Game**: Enter share code or scan QR code → join lobby → play when host starts. Refreshing the page auto-rejoins (session persisted to localStorage).

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
    CrosswordGrid/  # Grid + Cell (container query font scaling) + keyboard nav + hidden mobile input
    ClueBar/        # MobileClueBar (prev/next word, direction toggle, active clue display)
    CluePanel/      # Clue list with active highlighting + strikethrough for completed words
    GameLobby/      # GameLobby (share code, QR code, player list, close room) + JoinGame (code input)
    Layout/         # GameLayout (responsive, mobile clue list flex-shrinks behind keyboard) + TVLayout (spectator with clue panel)
    PuzzleImporter/ # File upload/drag-and-drop
    Scoreboard/     # Solo Scoreboard + MultiplayerScoreboard (per-player colored bars)
  hooks/
    usePuzzle.ts    # Core game state reducer (LOAD_PUZZLE, INPUT_LETTER, REMOTE_CELL_CLAIM, HYDRATE_CELLS, ROLLBACK_CELL) + smart cursor advancement
    useClueAnnouncer.ts # Web Speech API announcements for completed clues (TV mode only)
    useMultiplayer.ts # Broadcast channel, cell claiming, player tracking, reconnect, room closure
    useSupabase.ts  # Anonymous auth + client
  lib/
    gridUtils.ts    # Pure navigation/word boundary functions + getCompletedClues
    playerColors.ts # 8-color pool for player assignment
    puzzleNormalizer.ts # Parser output → Puzzle type
    puzzleService.ts    # Supabase CRUD + multiplayer (claimCellOnServer, joinGame, rejoinGame, fetchGameState, startGame)
    sessionPersistence.ts # MP + host session load/save/clear for rejoin on refresh
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
    20260225000000_puzzle_update_policy.sql           # RLS policy for puzzle updates
    20260225100000_player_unique_constraint.sql       # UNIQUE(game_id, user_id) + 'closed' status
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

- `pnpm test` — 150 tests across 9 files
- **gridUtils.test.ts** (37 tests): getCellAt, isBlack, getWordCells, getClueForCell, getNextCell, getPrevCell, getNextWordStart, getPrevWordStart, getCompletedClues, computeCellNumbers
- **usePuzzle.test.ts** (30 tests): All reducer actions (LOAD_PUZZLE, RESET, SELECT_CELL, TOGGLE_DIRECTION, SET_DIRECTION, INPUT_LETTER, DELETE_LETTER, NEXT_WORD, PREV_WORD, MOVE_SELECTION, REMOTE_CELL_CLAIM, HYDRATE_CELLS, ROLLBACK_CELL) + smart cursor advancement (skip filled cells, auto-advance to next word, direction switch on word completion, puzzle complete)
- **puzzleNormalizer.test.ts** (14 tests): Parser output → Puzzle conversion (title/author, dimensions, cell solutions, numbering, clue positions/answers, parser-provided vs computed cell numbers)
- **playerColors.test.ts** (4 tests): Color pool distinctness, wrapping, hex format
- **sessionPersistence.test.ts** (14 tests): MP + host session round-trip, null/missing key, corrupted JSON, missing gameId, clear safety, independence between MP and host sessions
- **CluePanel.test.tsx** (12 tests): Across/Down sections rendering, all clues rendered, active clue highlighting, clue click callback, strikethrough for completed clues (line-through + text-neutral-400), no strikethrough when absent/empty, partial completion, both directions, active+completed coexistence, completed clues still clickable
- **Cell.test.tsx** (15 tests): blendOnWhite color math (alpha 0/1/0.12, opaque output), cell rendering (black cell, white cell, numbers, letters), text classes (text-black for letters, text-neutral-800 for numbers), background priority (selected > highlighted > playerColor > white), player color as opaque inline style, click handler
- **useClueAnnouncer.test.ts** (7 tests): Initial mount skips announcements, new clue triggers speech, multiple clues announced at once, no re-announcement of previous clues, unknown player fallback, answer lowercased for TTS, empty players list
- **GameLobby.test.tsx** (17 tests): QR code rendering/URL encoding, Close Room visibility/callback, host controls (Start Game enable/disable), non-host view, player list, share code display. Uses `@testing-library/react` with per-file `jsdom` environment.

Supabase project requires:
- **Anonymous sign-ins enabled** (Authentication → Providers)
- All migrations applied (`npx supabase db push`)
