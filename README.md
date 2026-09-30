# Crossword Clash

Real-time multiplayer crossword puzzles: solve solo, race friends, or put the grid on a TV. Live at **https://crosswordclash.com**.

<!-- TODO: add a screenshot or short GIF, e.g. docs/images/screenshot.png -->

## Features

- **Solo play** with progress saved locally (and to Supabase when configured).
- **Multiplayer rooms** with a 6-character share code and QR join. Cell claims are validated server-side, so correct letters are permanent and the first player to place a letter wins the cell. Rejoin on refresh is automatic.
- **Race modes**: versus, co-op, and async (each player solves in isolation, fastest time wins). The host can set a wrong-answer lockout penalty (off, 1s, 2s, 3s, 5s).
- **TV / host view** (`/host`): a read-only spectator display with grid, clue list, scoreboard, room code and QR, plus spoken clue announcements (Web Speech API or ElevenLabs TTS).
- **AI narrator** on the TV view: live gameshow commentary through ElevenLabs Agents, OpenAI Realtime, or Claude + ElevenLabs TTS, with a monthly spend cap.
- **Daily mini puzzle** with a daily leaderboard, and one-tap "race friends" on the daily.
- **Classic library** (`/classics`): 46 public-domain puzzles from the 1924 *Cross Word Puzzle Book*.
- **Import** `.puz`, `.ipuz`, `.jpz` and `.xd` files, or pull a puzzle in with the NYT bookmarklet (`/install-bookmarklet`).
- **Shareable result cards** with dynamic Open Graph images.
- **English and Spanish** UI.
- **Mobile app**: a Capacitor wrapper for iOS and Android with native NYT import and a native crossword keyboard.

## Tech stack

| Layer | Technology |
|-------|-----------|
| UI | React 19, TypeScript, Tailwind CSS v4, React Router 7, i18next |
| Build | Vite 7, pnpm |
| Backend | Supabase (Postgres, anonymous Auth, Realtime Broadcast, Edge Functions) |
| Serverless | Vercel (`api/` for OG images and share pages) |
| Puzzle parsing | `@xwordly/xword-parser` |
| Voice / AI | ElevenLabs, OpenAI Realtime, Anthropic Claude |
| Mobile | Capacitor |
| Tests | Vitest, Testing Library |

## Getting started

Requirements: Node 24 and pnpm (via corepack).

```bash
corepack enable
pnpm install
cp .env.example .env.local   # optional, see below
pnpm dev
```

The app runs fully offline without Supabase: leave the `VITE_SUPABASE_*` variables unset and solo play still works. Multiplayer, the daily leaderboard and the narrator need a Supabase project.

## Scripts

| Command | Purpose |
|---------|---------|
| `pnpm dev` | Build the bookmarklet, then start the dev server |
| `pnpm build` | Build the bookmarklet, type-check, production build |
| `pnpm preview` | Preview the production build |
| `pnpm test` | Run unit tests once (Vitest) |
| `pnpm test:watch` | Run tests in watch mode |
| `pnpm build:bookmarklet` | Generate `public/install-bookmarklet/index.html` from `bookmarklet/install-page.html` |
| `pnpm build:classics` | Regenerate `public/classic-puzzles/manifest.json` (never edit it by hand) |

Agent worktrees live under `.claude/`; run `pnpm exec vitest run --dir src` to test only the main tree.

## Project layout

```
src/
  components/   UI (grid, clue panel, lobby, scoreboard, layouts, narrator controls)
  hooks/        usePuzzle (game reducer), useMultiplayer, useNarrator, ...
  lib/          pure logic, Supabase services, narrator backends
  i18n/         English and Spanish strings
  types/        shared types
api/            Vercel functions: OG images and share pages
bookmarklet/    NYT bookmarklet source and install page
public/         static assets, classic puzzles
scripts/        build scripts and the daily-mini generator
supabase/       migrations and edge functions
docs/           roadmap notes and design docs
fixtures/       sample puzzle files for manual testing
agent_configs/  ElevenLabs CLI project files (agent definitions)
```

See `CLAUDE.md` for architecture notes and conventions.

## Supabase setup

1. Create a project and enable **anonymous sign-ins** (Authentication, Providers).
2. Link it and apply the migrations:
   ```bash
   npx supabase link --project-ref <ref>
   npx supabase db push
   ```
3. Put the project URL and anon key in `.env.local` as `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.

### Edge functions and secrets

Deploy with `npx supabase functions deploy <name>` and set secrets with `npx supabase secrets set KEY=value`.

| Function | Purpose | Secrets |
|----------|---------|---------|
| `agent-auth` | Signed WebSocket URL for the ElevenLabs agent narrator | `ELEVENLABS_AGENT_ID`, `ELEVENLABS_API_KEY` |
| `openai-agent-auth` | Ephemeral token for OpenAI Realtime | `OPENAI_API_KEY` |
| `narrator-claude` | Claude proxy for narrator commentary | `ANTHROPIC_API_KEY` |
| `tts` | ElevenLabs text-to-speech | `ELEVENLABS_API_KEY` |

The narrator endpoints are rate-limited per IP and guarded by a monthly budget cap (`NARRATOR_MONTHLY_USD_CAP`, default 20). Spend is read from an `api_usage` table through `DASHBOARD_DATABASE_URL`.

Optional client variables (ads, affiliate link) are listed in `.env.example`.

## Mobile app

The iOS and Android apps wrap the web build with Capacitor. Native project directories, sync scripts and the TestFlight release notes are documented alongside the mobile work in the repository docs.
<!-- TODO: fill in exact `pnpm mobile:*` commands once the native branch is merged. -->

## Testing

```bash
pnpm test
```

Unit tests cover the reducer, grid utilities, puzzle parsing, session persistence, routing, i18n, narrator events and the main components. Component tests use jsdom per file.

## Deployment

The web app and `api/` functions deploy to Vercel (`vercel.json` holds rewrites). Supabase migrations and edge functions are deployed separately with the Supabase CLI.
