# Crossword Clash

## Project Overview

Real-time multiplayer crossword puzzle game. Currently single-player with persistence foundation — multiplayer is planned for Phase 4+.

## Stack

- **Frontend**: React 19 + TypeScript + Vite 7 + Tailwind CSS v4
- **Backend**: Supabase (Postgres + Auth)
- **Package manager**: pnpm

## Commands

- `pnpm dev` — start dev server
- `pnpm build` — type-check + production build
- `pnpm preview` — preview production build

## Architecture

- **State management**: Single `useReducer` in `src/hooks/usePuzzle.ts` — no external state library. Derived values (activeClue, highlightedCells) via `useMemo`.
- **Supabase client**: Nullable singleton in `src/lib/supabaseClient.ts` — app works fully offline when env vars aren't set.
- **Puzzle import**: `@xwordly/xword-parser` parses .puz/.ipuz/.jpz/.xd files, then `src/lib/puzzleNormalizer.ts` converts to internal `Puzzle` type.
- **Persistence**: `src/lib/puzzleService.ts` handles Supabase CRUD with SHA-256 dedup on uploads.

## Project Structure

```
src/
  components/     # React components (CrosswordGrid, CluePanel, PuzzleImporter, Scoreboard, Layout)
  hooks/          # usePuzzle (game state), useSupabase (auth + client)
  lib/            # Pure utilities (gridUtils), parsers (puzzleNormalizer), services (puzzleService, supabaseClient)
  types/          # TypeScript types (puzzle, game, supabase)
supabase/
  migrations/     # SQL migrations
```

## Code Conventions

- Strict TypeScript (`strict: true`, `noUnusedLocals`, `noUnusedParameters`)
- Tailwind CSS v4 (using `@import "tailwindcss"` syntax, `@tailwindcss/vite` plugin)
- Components use named exports; `index.ts` barrel files for component directories
- Pure functions in `lib/` — no side effects, easy to test
- `React.memo` for performance-sensitive components (e.g., Cell)

## Environment Variables

Copy `.env.example` to `.env.local` and fill in Supabase credentials. The app runs without them (DB features disabled).

```
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```
