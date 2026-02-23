# Crossword Clash

A real-time multiplayer crossword puzzle game built with React, TypeScript, and Supabase.

## Features

- **Interactive crossword grid** — click cells, type letters, navigate with keyboard
- **File import** — upload .puz, .ipuz, .jpz, or .xd crossword files
- **Smart navigation** — arrow keys, Tab/Shift+Tab between words, Space to toggle direction
- **Client-side validation** — correct letters stick, incorrect letters are silently rejected
- **Synced clue panel** — across/down clue lists auto-scroll to the active clue
- **Progress tracking** — scoreboard with progress bar and completion banner
- **Database persistence** — puzzles and game sessions saved to Supabase with automatic deduplication

## Tech Stack

| Layer | Technology |
|-------|-----------|
| UI | React 19, TypeScript, Tailwind CSS v4 |
| Build | Vite 7 |
| Backend | Supabase (Postgres, Auth, Realtime) |
| Puzzle Parsing | @xwordly/xword-parser |
| Package Manager | pnpm |

## Getting Started

### Prerequisites

- Node.js 20+
- pnpm

### Install & Run

```bash
pnpm install
pnpm dev
```

The app works out of the box without Supabase — just upload a crossword file and play.

### Supabase Setup (optional)

To enable persistence:

1. Create a Supabase project at [supabase.com](https://supabase.com)
2. Enable anonymous sign-ins in Authentication settings
3. Run the migration in `supabase/migrations/20260223000000_initial_schema.sql`
4. Copy `.env.example` to `.env.local` and add your credentials:

```bash
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

## How to Play

1. **Upload a puzzle** — drag and drop a crossword file or click to browse
2. **Click a cell** to select it; click the same cell again to toggle between across/down
3. **Type letters** — correct letters are placed; wrong letters are rejected
4. **Navigate** — arrow keys move between cells, Tab/Shift+Tab jump between words
5. **Space** toggles direction (across/down)
6. **Backspace** deletes the current cell's letter, or moves back and deletes

## Project Structure

```
src/
├── components/
│   ├── CrosswordGrid/   # Grid renderer, Cell component, keyboard navigation
│   ├── CluePanel/       # Across/Down clue lists with active clue sync
│   ├── PuzzleImporter/  # Drag-and-drop file upload
│   ├── Scoreboard/      # Progress bar + completion banner
│   └── Layout/          # Responsive game layout
├── hooks/
│   ├── usePuzzle.ts     # Core game state (useReducer)
│   └── useSupabase.ts   # Auth + Supabase client
├── lib/
│   ├── gridUtils.ts     # Pure grid navigation functions
│   ├── puzzleNormalizer.ts  # Parser output → internal types
│   ├── puzzleService.ts # Supabase CRUD operations
│   └── supabaseClient.ts
├── types/               # TypeScript type definitions
└── App.tsx
supabase/
└── migrations/          # Database schema
```

## Roadmap

- [ ] Multiplayer via Supabase Realtime
- [ ] Game lobby and invite links
- [ ] Player colors and claimed cell display
- [ ] Timer and competitive scoring
