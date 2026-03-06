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
- **Multiplayer**: Supabase Broadcast channels for real-time cell claims. Conflict resolution: local check → server `claim_cell` RPC with row lock → broadcast. No deletion in multiplayer — correct letters are permanent. Host can close the room via `room_closed` broadcast, which boots all players back to the menu. Players leaving intentionally broadcast `player_left` so others see them disappear immediately.
- **Exit warnings**: `useBeforeUnload` hook adds browser-native "Leave site?" dialog during active multiplayer sessions (lobby + playing screens for both player and host/TV views). Prevents accidental tab closure during games.
- **Internationalization**: i18next + react-i18next with English and Spanish translations in `src/i18n/`. Language detected from localStorage (`crossword-clash:language`) → `navigator.language` → `'en'`. `LanguageSwitcher` component on menu screens. `tStatic()` for non-React contexts (window.confirm, alert). `<Trans>` component for rich text with embedded links. Spanish uses `→`/`↓` arrows instead of Across/Down.
- **Routing**: React Router with `createBrowserRouter`. `IndexRedirect` and `HostIndexRedirect` components determine initial route based on context state, URL params, and localStorage. **Important**: `extractPuzzleFromUrl()` clears `window.location.hash` as a side effect, so `GameProvider`/`HostLayout` call it during `useState` init and store the result as `urlPuzzle`. Route redirects must check `urlPuzzle` from context, never `window.location.hash`. Deep-linked screens (lobby, spectate, play) redirect to the index route when puzzle is null (triggers rejoin flow).

## Game Modes

- **Solo**: Import puzzle → play locally → progress saved to localStorage and Supabase (if connected).
- **Host Game (Player View)**: Import puzzle → enter display name → multiplayer game created with 6-char share code → lobby (with QR code for easy joining) → start when 2+ players joined. Host can close the room at any time from lobby or playing screen. Refreshing the page auto-rejoins.
- **TV / Host View** (`/host`): Read-only spectator display. Creates a game room without joining as a player. Shows grid, clue list with strikethrough for completed words, scoreboard, room code + QR. Host can start game when 2+ players join and close the room at any time. Per-clue speech announcements via Web Speech API or ElevenLabs TTS. Optional AI narrator mode provides snarky gameshow commentary (see AI Narrator section).
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

## AI Narrator (Multi-Backend)

TV/Host view supports an optional AI narrator that provides live gameshow commentary. The narrator is separate from per-clue TTS announcements — when a narrator is active, `speak()` becomes a no-op and the narrator handles all commentary.

### Narrator Backends

Three backends implement the `NarratorBackend` interface (`src/lib/narrator/types.ts`):

1. **ElevenLabs Agent** (`elevenlabs-agent`): ElevenLabs Conversational AI agent. Voice/personality configured in ElevenLabs dashboard. Edge function `agent-auth` returns signed WebSocket URL. Requires `ELEVENLABS_AGENT_ID` and `ELEVENLABS_API_KEY` env vars.
2. **OpenAI Realtime** (`openai-agent`): OpenAI Realtime API with GPT-4o. Built-in voice synthesis via WebSocket, PCM16 audio playback via `AudioContext`. Edge function `openai-agent-auth` creates ephemeral token. Requires `OPENAI_API_KEY` env var.
3. **Claude + TTS** (`claude`): Claude generates commentary text, then speaks via ElevenLabs TTS. Maintains conversation history client-side. Edge function `narrator-claude` proxies to Claude API. Requires `ANTHROPIC_API_KEY` env var.

### Settings

- `TTSEngine` (`"browser" | "elevenlabs"`) controls per-clue TTS voice when no narrator is active.
- `NarratorEngine` (`"elevenlabs-agent" | "openai-agent" | "claude" | null`) controls the AI narrator. `null` = no narrator (legacy per-clue announcements).
- Legacy `engine: "agent"` in localStorage auto-migrates to `narratorEngine: "elevenlabs-agent"`.
- Settings stored in `src/lib/ttsSettings.ts`, UI in `src/components/TTSControls/TTSControls.tsx`.

### Gating

Requires ElevenLabs localStorage gate (`crossword-clash-elevenlabs`). Only available in TV/Host view (`/host` routes via `HostLayout`). Never spawned for player or host-as-player views.

### Session Lifecycle

`useNarrator` hook (`src/hooks/useNarrator.ts`) manages connection via `createNarratorBackend()` factory. Connection starts when game becomes active, stays alive through game completion so narrator can react to the winner. Auto-disconnects after 30s idle. Immediately disconnects on: room close, back to menu, new puzzle, engine change, mute, unmount, or `gameStatus → "waiting"`.

### Events

`GAME_STARTED` (puzzle metadata + player names), `CLUE_COMPLETED` (player, clue details, scores, remaining), `LEAD_CHANGE` (new/previous leader + scores), `GAME_COMPLETED` (winner + final scores). Event builders are pure functions in `src/lib/narrator/events.ts`.

### ElevenLabs Agent Specifics

- Mic muted via `setMicMuted(true)` — all input is text.
- **Idle chatter prevention**: Dashboard system prompt must include "NEVER ask if the user is still there. NEVER initiate conversation unprompted. Only speak when you receive a game event."
- **Speech interruption prevention**: Events arriving while agent is speaking use `sendContextualUpdate()` instead of `sendUserMessage()` to avoid cutting off the agent. When agent returns to listening, accumulated context is prompted with `sendUserMessage("Please comment on the recent events.")`.

## Project Structure

```
src/
  components/
    CrosswordGrid/  # Grid + Cell (container query font scaling) + keyboard nav + hidden mobile input
    ClueBar/        # MobileClueBar (prev/next word, direction toggle, active clue display)
    CluePanel/      # Clue list with active highlighting + strikethrough for completed words
    GameLobby/      # GameLobby (share code, QR code, player list, timeout selector, close room, non-host leave) + JoinGame (code input) + TimeoutSelector (wrong answer penalty presets)
    Layout/         # GameLayout (responsive, mobile clue list flex-shrinks behind keyboard) + TVLayout (spectator with clue panel)
    PuzzleImporter/ # File upload/drag-and-drop
    TTSControls/    # TTSMuteButton + TTSSettingsModal (narrator engine + TTS engine + voice selectors)
    LanguageSwitcher.tsx # Language select dropdown (English/Spanish)
    LockoutOverlay.tsx # Countdown overlay during wrong answer lockout
    Scoreboard/     # Solo Scoreboard + MultiplayerScoreboard (per-player colored bars)
  hooks/
    usePuzzle.ts    # Core game state reducer (LOAD_PUZZLE, INPUT_LETTER, REMOTE_CELL_CLAIM, HYDRATE_CELLS, ROLLBACK_CELL) + smart cursor advancement
    useNarrator.ts  # AI narrator lifecycle (connect/disconnect/send events, multi-backend via factory)
    useBeforeUnload.ts # Browser "Leave site?" dialog for active multiplayer sessions
    useClueAnnouncer.ts # Web Speech API announcements for completed clues (TV mode only)
    useMultiplayer.ts # Broadcast channel, cell claiming, player tracking, reconnect, room closure, leave game, game settings
    useSupabase.ts  # Anonymous auth + client
  i18n/
    i18n.ts         # i18next initialization, detectLanguage(), tStatic(), SUPPORTED_LANGS
    i18n.d.ts       # TypeScript type declarations for translation key autocomplete
    en.json         # English translations
    es.json         # Spanish translations
  lib/
    narrator/
      types.ts          # NarratorBackend interface, NarratorEngine type, AgentGameEvent
      events.ts         # Event builder functions (buildGameStartedEvent, etc.)
      elevenLabsAgent.ts # ElevenLabs Conversational AI backend (with idle/interruption fixes)
      openaiRealtime.ts  # OpenAI Realtime API backend (WebSocket + AudioContext)
      claudeNarrator.ts  # Claude + ElevenLabs TTS backend
      factory.ts         # createNarratorBackend(engine) factory
      index.ts           # Barrel exports
    agentClient.ts  # Re-exports from narrator/ for backwards compatibility
    gameSettings.ts # Wrong answer timeout presets + DEFAULT_GAME_SETTINGS
    gridUtils.ts    # Pure navigation/word boundary functions + getCompletedClues
    playerColors.ts # 8-color pool for player assignment
    puzzleNormalizer.ts # Parser output → Puzzle type
    puzzleService.ts    # Supabase CRUD + multiplayer (claimCellOnServer, joinGame, rejoinGame, fetchGameState, startGame)
    sessionPersistence.ts # MP + host session load/save/clear for rejoin on refresh
    supabaseClient.ts   # Nullable Supabase client singleton
    ttsSettings.ts  # TTSSettings persistence (TTSEngine + NarratorEngine + voice prefs)
  types/
    puzzle.ts       # Puzzle, CellState, CellCoord types
    game.ts         # Game, Player, GameStatus, GameSettings types
    supabase.ts     # Database types + claim_cell function
supabase/
  functions/
    agent-auth/     # ElevenLabs signed WebSocket URL for Conversational AI agent
    openai-agent-auth/ # OpenAI ephemeral token for Realtime API
    narrator-claude/   # Claude API proxy for narrator commentary
    tts/            # ElevenLabs TTS audio generation
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

- `pnpm test` — 375 tests across 27 files
- **gridUtils.test.ts** (52 tests): getCellAt, isBlack, getWordCells, getClueForCell, getNextCell, getPrevCell, getNextWordStart, getPrevWordStart, getCompletedClues, computeCellNumbers
- **usePuzzle.test.ts** (30 tests): All reducer actions (LOAD_PUZZLE, RESET, SELECT_CELL, TOGGLE_DIRECTION, SET_DIRECTION, INPUT_LETTER, DELETE_LETTER, NEXT_WORD, PREV_WORD, MOVE_SELECTION, REMOTE_CELL_CLAIM, HYDRATE_CELLS, ROLLBACK_CELL) + smart cursor advancement (skip filled cells, auto-advance to next word, direction switch on word completion, puzzle complete)
- **puzzleNormalizer.test.ts** (22 tests): Parser output → Puzzle conversion (title/author, dimensions, cell solutions, numbering, clue positions/answers, parser-provided vs computed cell numbers)
- **playerColors.test.ts** (4 tests): Color pool distinctness, wrapping, hex format
- **sessionPersistence.test.ts** (14 tests): MP + host session round-trip, null/missing key, corrupted JSON, missing gameId, clear safety, independence between MP and host sessions
- **CluePanel.test.tsx** (17 tests): Across/Down sections rendering, all clues rendered, active clue highlighting, clue click callback, strikethrough for completed clues (line-through + text-neutral-400), no strikethrough when absent/empty, partial completion, both directions, active+completed coexistence, completed clues still clickable
- **Cell.test.tsx** (17 tests): blendOnWhite color math (alpha 0/1/0.12, opaque output), cell rendering (black cell, white cell, numbers, letters), text classes (text-black for letters, text-neutral-800 for numbers), background priority (selected > highlighted > playerColor > white), player color as opaque inline style, click handler
- **useClueAnnouncer.test.ts** (8 tests): Initial mount skips announcements, new clue triggers speech, correct completing player attribution (not last positional cell), multiple clues announced at once, no re-announcement of previous clues, unknown player fallback, answer lowercased for TTS, empty players list
- **GameLobby.test.tsx** (24 tests): QR code rendering/URL encoding, Close Room visibility/callback, host controls (Start Game enable/disable), non-host view, non-host leave button (visibility + callback), player list, share code display, timeout selector visibility/callback. Uses `@testing-library/react` with per-file `jsdom` environment.
- **TimeoutSelector.test.tsx** (9 tests): All presets rendered, heading, selected option highlighting, unselected styles, onChange callback, dark/light variant styles
- **LockoutOverlay.test.tsx** (7 tests): Renders nothing when 0 or past, shows countdown, ticks down over time, disappears on expiry, lockout-pulse class, pointer-events-none
- **gameSettings.test.ts** (6 tests): Option count, Off default, increasing values, non-negative integers, non-empty labels, default settings
- **i18n.test.ts** (13 tests): SUPPORTED_LANGS includes en/es, resource bundles exist, en↔es key parity (no missing/extra keys), tStatic simple key + interpolation + language change, language switching (default en, switch to es, fallback for unsupported), localStorage persistence, all leaf values non-empty strings
- **LanguageSwitcher.test.tsx** (5 tests): Renders select element, option for each language, reflects current language, changes language on selection, option values match language codes
- **router.test.tsx** (14 tests): IndexRedirect + HostIndexRedirect routing logic. Bookmarklet regression (urlPuzzle from context, not window.location.hash), import hash redirect, multiplayer/host session rejoin, solo session restore, fallback to menu, redirect priority ordering. Uses mocked contexts + MemoryRouter.
- **useBeforeUnload.test.ts** (5 tests): Adds/removes beforeunload listener based on active flag, cleanup on unmount, toggles on prop change, calls preventDefault on event
- **puzzleUrl.test.ts** (10 tests): Hash extraction, compression round-trip, hash clearing after extraction, corrupted/invalid data handling, regression test documenting hash consumption timing (extractPuzzleFromUrl clears hash, so callers must store the returned puzzle before any subsequent hash check)
- **narrator/events.test.ts** (7 tests): Event builder functions — GAME_STARTED (player names, puzzle metadata, clue counts), CLUE_COMPLETED (clue details, scores, remaining), LEAD_CHANGE (leader names, scores), GAME_COMPLETED (winner, final scores)
- **agentClient.test.ts** (7 tests): Re-export backwards compat — same event builder tests via agentClient re-exports
- **ttsSettings.test.ts** (23 tests): Default values, round-trip, clamping, corrupted JSON, engine persistence, narratorEngine persistence + migration from legacy `engine: "agent"`, unknown value defaults
- **TTSControls.test.tsx** (20 tests): Mute/unmute buttons, modal open/close, voice grouping, engine toggle, narrator engine toggle, ElevenLabs voice dropdown, controls hidden when narrator active
- **useSpeechSettings.test.ts** (19 tests): Default init, persistence, toggleMute, speak with browser/elevenlabs, speak no-op when narrator active or muted, setNarratorEngine, elevenLabsAvailable

Supabase project requires:
- **Anonymous sign-ins enabled** (Authentication → Providers)
- All migrations applied (`npx supabase db push`)
