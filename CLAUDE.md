# Crossword Clash

## Project Overview

Real-time multiplayer crossword puzzle game. Supports solo play with localStorage persistence and competitive multiplayer via Supabase Realtime Broadcast channels.

## Stack

- **Frontend**: React 19 + TypeScript + Vite 7 + Tailwind CSS v4 + i18next/react-i18next
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
- **Internationalization**: i18next + react-i18next with English and Spanish translations in `src/i18n/`. Language detected from localStorage (`crossword-clash:language`) → `navigator.language` → `'en'`. `LanguageSwitcher` component on menu screens. `tStatic()` for non-React contexts (window.confirm, alert). `<Trans>` component for rich text with embedded links. Spanish uses `→`/`↓` arrows instead of Across/Down.

## Game Modes

- **Solo**: Import puzzle → play locally → progress saved to localStorage and Supabase (if connected).
- **Host Game (Player View)**: Import puzzle → enter display name → multiplayer game created with 6-char share code → lobby (with QR code for easy joining) → start when 2+ players joined. Host can close the room at any time from lobby or playing screen. Refreshing the page auto-rejoins.
- **TV / Host View** (`/host`): Read-only spectator display. Creates a game room without joining as a player. Shows grid, clue list with strikethrough for completed words, scoreboard, room code + QR. Host can start game when 2+ players join and close the room at any time. Speech announcements via Web Speech API announce each completed clue (player name, clue number/direction, clue text, answer).
- **Join Game**: Enter share code or scan QR code → join lobby → play when host starts. Refreshing the page auto-rejoins (session persisted to localStorage).

## Multiplayer Input Flow

```
Keypress → useGridNavigation → wrappedInputLetter
  0. Lockout check: Date.now() < lockedUntil? → skip (letter input only; navigation still works)
  1. Local check: cell already filled? → skip
  2. Correct letter? → no: visual reject + apply lockout timeout (if configured)
  3. Optimistic: dispatch INPUT_LETTER with playerId
  4. Server: claimCellOnServer()
     → success: broadcast cell_claimed to others
     → fail: dispatch ROLLBACK_CELL
```

## Wrong Answer Timeout

Host configures a lockout penalty in the lobby before starting (Off, 1s, 2s, 3s, or 5s). Setting is broadcast to all players via `game_started` event payload. When a player enters a wrong letter, all letter input is blocked for the configured duration. A countdown overlay appears on the grid during lockout. Navigation (arrows, tab) still works. Solo mode is unaffected. Settings are defined in `src/lib/gameSettings.ts`, UI in `src/components/GameLobby/TimeoutSelector.tsx`, overlay in `src/components/LockoutOverlay.tsx`.

## Project Structure

```
src/
  components/
    CrosswordGrid/  # Grid + Cell (container query font scaling) + keyboard nav + hidden mobile input
    ClueBar/        # MobileClueBar (prev/next word, direction toggle, active clue display)
    CluePanel/      # Clue list with active highlighting + strikethrough for completed words
    GameLobby/      # GameLobby (share code, QR code, player list, timeout selector, close room) + JoinGame (code input) + TimeoutSelector (wrong answer penalty presets)
    Layout/         # GameLayout (responsive, mobile clue list flex-shrinks behind keyboard) + TVLayout (spectator with clue panel)
    PuzzleImporter/ # File upload/drag-and-drop
    LanguageSwitcher.tsx # Language select dropdown (English/Spanish)
    LockoutOverlay.tsx # Countdown overlay during wrong answer lockout
    Scoreboard/     # Solo Scoreboard + MultiplayerScoreboard (per-player colored bars)
  hooks/
    usePuzzle.ts    # Core game state reducer (LOAD_PUZZLE, INPUT_LETTER, REMOTE_CELL_CLAIM, HYDRATE_CELLS, ROLLBACK_CELL) + smart cursor advancement
    useClueAnnouncer.ts # Web Speech API announcements for completed clues (TV mode only)
    useMultiplayer.ts # Broadcast channel, cell claiming, player tracking, reconnect, room closure, game settings
    useSupabase.ts  # Anonymous auth + client
  i18n/
    i18n.ts         # i18next initialization, detectLanguage(), tStatic(), SUPPORTED_LANGS
    i18n.d.ts       # TypeScript type declarations for translation key autocomplete
    en.json         # English translations
    es.json         # Spanish translations
  lib/
    gameSettings.ts # Wrong answer timeout presets + DEFAULT_GAME_SETTINGS
    gridUtils.ts    # Pure navigation/word boundary functions + getCompletedClues
    playerColors.ts # 8-color pool for player assignment
    puzzleNormalizer.ts # Parser output → Puzzle type
    puzzleService.ts    # Supabase CRUD + multiplayer (claimCellOnServer, joinGame, rejoinGame, fetchGameState, startGame)
    sessionPersistence.ts # MP + host session load/save/clear for rejoin on refresh
    supabaseClient.ts   # Nullable Supabase client singleton
  types/
    puzzle.ts       # Puzzle, CellState, CellCoord types
    game.ts         # Game, Player, GameStatus, GameSettings types
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

- `pnpm test` — 471 tests across 30 files
- **gridUtils.test.ts** (52 tests): getCellAt, isBlack, getWordCells, getClueForCell, getNextCell, getPrevCell, getNextWordStart, getPrevWordStart, getCompletedClues, computeCellNumbers
- **usePuzzle.test.ts** (30 tests): All reducer actions (LOAD_PUZZLE, RESET, SELECT_CELL, TOGGLE_DIRECTION, SET_DIRECTION, INPUT_LETTER, DELETE_LETTER, NEXT_WORD, PREV_WORD, MOVE_SELECTION, REMOTE_CELL_CLAIM, HYDRATE_CELLS, ROLLBACK_CELL) + smart cursor advancement (skip filled cells, auto-advance to next word, direction switch on word completion, puzzle complete)
- **puzzleNormalizer.test.ts** (22 tests): Parser output → Puzzle conversion (title/author, dimensions, cell solutions, numbering, clue positions/answers, parser-provided vs computed cell numbers)
- **playerColors.test.ts** (4 tests): Color pool distinctness, wrapping, hex format
- **sessionPersistence.test.ts** (14 tests): MP + host session round-trip, null/missing key, corrupted JSON, missing gameId, clear safety, independence between MP and host sessions
- **CluePanel.test.tsx** (17 tests): Across/Down sections rendering, all clues rendered, active clue highlighting, clue click callback, strikethrough for completed clues (line-through + text-neutral-400), no strikethrough when absent/empty, partial completion, both directions, active+completed coexistence, completed clues still clickable
- **Cell.test.tsx** (17 tests): blendOnWhite color math (alpha 0/1/0.12, opaque output), cell rendering (black cell, white cell, numbers, letters), text classes (text-black for letters, text-neutral-800 for numbers), background priority (selected > highlighted > playerColor > white), player color as opaque inline style, click handler
- **useClueAnnouncer.test.ts** (8 tests): Initial mount skips announcements, new clue triggers speech, correct completing player attribution (not last positional cell), multiple clues announced at once, no re-announcement of previous clues, unknown player fallback, answer lowercased for TTS, empty players list
- **GameLobby.test.tsx** (21 tests): QR code rendering/URL encoding, Close Room visibility/callback, host controls (Start Game enable/disable), non-host view, player list, share code display, timeout selector visibility/callback. Uses `@testing-library/react` with per-file `jsdom` environment.
- **TimeoutSelector.test.tsx** (9 tests): All presets rendered, heading, selected option highlighting, unselected styles, onChange callback, dark/light variant styles
- **LockoutOverlay.test.tsx** (7 tests): Renders nothing when 0 or past, shows countdown, ticks down over time, disappears on expiry, lockout-pulse class, pointer-events-none
- **gameSettings.test.ts** (6 tests): Option count, Off default, increasing values, non-negative integers, non-empty labels, default settings
- **i18n.test.ts** (13 tests): SUPPORTED_LANGS includes en/es, resource bundles exist, en↔es key parity (no missing/extra keys), tStatic simple key + interpolation + language change, language switching (default en, switch to es, fallback for unsupported), localStorage persistence, all leaf values non-empty strings
- **LanguageSwitcher.test.tsx** (5 tests): Renders select element, option for each language, reflects current language, changes language on selection, option values match language codes

Supabase project requires:
- **Anonymous sign-ins enabled** (Authentication → Providers)
- All migrations applied (`npx supabase db push`)
