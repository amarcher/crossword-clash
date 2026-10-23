# Puzzle archive — audit, spec and prototypes

Audited 2026-10-23 on `main` (6c7caab). Question: can a player reach a
puzzle from a previous day and see their own history on it, and if not,
what should the feature be? Code paths were read in full; nothing here was
run against production data. Prototypes live on the branch
`claude/puzzle-archive` at the dev route `/prototype/archive` (section 3).

## Verdict

**Partly possible.** Every past daily is already *playable* — by URL only —
and the classics are the one list in the app that shows solved state and a
personal best per puzzle. There is no list or calendar of past dailies
anywhere (menu, leaderboard, picker, "Up next" are all today-only), no view
of one's own history across days, and "in progress" is knowable for exactly
one puzzle: the solo game the home route would resume. The archive needs
building; most of the pieces it needs (a per-day fetch, identity-keyed
history, the two load paths) exist.

## 1. What exists today

### 1.1 Reaching a puzzle from a previous day

| Surface | What it offers | Past days? |
|---|---|---|
| Menu `src/screens/MenuScreen.tsx:164-245` | Three `DailyHero` tiles from `useDailyMini()` / `useDailyPuzzle("midi")` / `useDailyPuzzle("large")`, each with Play, Race friends and Leaderboard | No. The hooks resolve today only. |
| Daily feed `src/lib/dailyFeed.ts` | `resolveDailyPuzzle(slot)` is keyed by `dayKey(now)` and cached per slot in localStorage (`crossword-clash:daily-feed[:slot]`). `fetchDailyForDay(day, slot)` (line 208) fetches **any** date with no cache; the mini falls back to the bundled rotation `getDailyMini(date)` (`dailyMinis.ts`, 23 puzzles), the midi and large resolve `null`. | Yes, by date — one caller. |
| `/daily/:day/:slot` → `DailyPuzzleScreen` `src/screens/DailyPuzzleScreen.tsx` | The only caller of `fetchDailyForDay`. Built as the short share link (`buildDailyLink` in `dailyChallenge.ts`): loads the day, sets `urlPuzzle` (+ `urlChallenge` when `?beat=`) and lands on `/challenge` or `/puzzle-ready`. Shows "never published" for a missing midi/large. | Yes — if you know the URL. Nothing in the app links to one except a shared result. |
| Static files `public/daily-puzzles/` | 58 minis (2026-10-16 → 2026-12-04), 58 midis (→ 2026-12-12), 45 larges (`large/`, → 2026-11-29), ~0.8–4.3 KB each. The first feed file is 2026-10-16 (commit b67e714). | Served as plain files, so every past *and future* day is fetchable. Only the schedule table gates the future (below). |
| `api/daily.ts` + `daily_schedule` | Days with no static file are answered from Supabase; RLS `"Started days are public"` (`20261015000000`, line 82: `day <= utc date + 1`) keeps future rows hidden but leaves past rows readable. The table has `day, slot, entry, title, studio_id`. | Yes, and the table is listable through PostgREST with the anon key (select is allowed), which nothing does today. |
| Daily leaderboard `/daily/leaderboard/:slot?` | Today's board per slot (`todayKey()`), "Solved in … · #n today" once solved | No day parameter. |
| "Up next" `src/lib/nextUp.ts` | Today's unsolved dailies, else one unplayed classic, else the library | No. |
| Picker `/pick-puzzle?intent=race|next` `src/screens/PuzzlePickerScreen.tsx` | Today's unsolved dailies (`unsolvedDailies`) plus the classic grid | No. |
| Classics `/classics` `src/screens/ClassicLibraryScreen.tsx`, `src/lib/classicLibrary.ts` | All 46 book puzzles from the generated `manifest.json`; each card shows a solved chip with the personal best (`useBestTimes()` keyed by the manifest's `identity`); filters by size, hide-solved, "Surprise me"; Play solo → `handleSoloPuzzleLoaded` → `/solo/play`; Race friends → `setUrlPuzzle` → `/host-game/name`. Shared card grid `src/components/ClassicList.tsx`. | n/a — this is the model the archive should follow. |

So: there is **no list, calendar or index of past dailies**; only direct links by date, and those are produced only by sharing a finish.

Two side findings worth knowing before building an index:

- **Future days are already public as static files.** `public/daily-puzzles/2026-11-05.json` is fetchable today. The schedule table hides the future; the files do not. An index must filter to days ≤ today on the client (the file is built once and served for weeks), and the spoiler exposure that already exists is a separate decision for Andrew (section 2.8).
- **The mini's fallback rotation makes every past date "have" a mini**, including days before the feed existed, with repeating puzzles. The archive needs an explicit start date rather than "whatever `fetchDailyForDay` returns".

### 1.2 Where solve history lives

| Store | Who | Per-puzzle facts | Missing |
|---|---|---|---|
| `localStorage` `crossword-clash-solo-stats` — `src/lib/soloStats.ts` (`SoloStats`) | Everyone (anonymous play; the fallback for accounts while loading/offline) | `bestTimes[puzzleIdentity] = seconds` (min across attempts); `streak`, `nytStreak` (`current`, `longest`, `lastPlayedDay`) | No day, title, mode or slot per puzzle; no attempt history (only the minimum); "new best" is computed at finish time (`SoloCompletionResult.isNewBest`) and not stored |
| Supabase `solves` — `20261017300000_solves.sql`, `src/lib/solveHistory.ts`, `src/hooks/useSolveHistory.ts` | Signed-in accounts only (RLS requires a non-anonymous JWT) | One row per (user, `puzzle_key`, `completed_day`): `title`, `source` daily/nyt/other, `mode` solo/versus/coop/async/import, nullable `seconds`, `completed_at`. `summarizeSolves` derives best times and streaks; `useBestTimes()` returns the account's map when loaded, else the local one | No slot, and `completed_day` is the day it was *solved*, not the daily's day (yesterday's mini solved today → today's row). Replays on different days are separate rows, so an account does have attempt history per day; local play does not |
| Supabase `daily_results` — `20260701000000_daily_race.sql` (+ `slot`, `20261017000000`), `src/lib/dailyLeaderboard.ts` | **Every finisher, anonymous included** (keyed by the anonymous `auth.uid()`); public read | One row per (day, slot, user): best `seconds` that day, `mode` solo/race, `display_name`, `game_id`. This is the only store that knows **which day's daily** a finish was | Only read back for the day's board. Tied to the anonymous uid, which survives as long as the Supabase session in localStorage does; lost on a cleared browser or a different device |
| Solo progress `localStorage` `crossword-clash-solo` + `crossword-clash-solo-timer` — `src/contexts/GameContext.tsx:21-35,224-229`, `src/hooks/useSoloTimer.ts` | Everyone | `{ puzzle, playerCells, gameId }` for the **one** puzzle currently loaded in solo mode, plus `{ key, elapsedMs, completed }` for its clock | Loading any other puzzle overwrites both (`handleSoloPuzzleLoaded`). "In progress" is knowable for at most one puzzle, and only on this device |
| Supabase `games.cells` (solo) — `GameContext.tsx:232-236` → `updateGame` | Players with Supabase configured | Per solo *game* (one `games` row per load, `puzzle_id` → `puzzles`), cells + status | Keyed by game id, never queried per user; the puzzle's identity is not on the row. Possible source for cross-device "in progress" later, not designed for it |

Consequences for the archive:

- **Solved / best time** per past puzzle is answerable for everyone today by
  the same trick the classics use: ship each day's `puzzleIdentity()` in the
  index and look it up in `useBestTimes()`. No puzzle parsing on the client.
- **"Solved on its day" vs "solved later"** is answerable for accounts
  (`solves.completed_day` vs the daily's day) and for anonymous players only
  via `daily_results` for their current anonymous uid.
- **"In progress"** is answerable for exactly one puzzle (the resumable solo
  game) by comparing its identity. Anything more needs new persistence —
  per-puzzle progress keyed by identity — which is an open question (2.8).
- **Personal best** as a badge means "this is your best time"; the index
  can show the time, and for accounts the per-day rows allow "best 1:42 ·
  first 2:10". A "PB" flag at the moment of the finish is not stored.

### 1.3 What the native apps can reach

- `src/lib/dailyFeed.ts:49`: `FEED_ORIGIN` is `https://crosswordclash.com`
  in `--mode mobile`, and `fetchDailyForDay` builds its URL through
  `dailyFeedUrl(day, slot)`, so **past days are fetchable in the apps** by
  the same code path as the web.
- CORS: `vercel.json` sets `Access-Control-Allow-Origin: *` on
  `/daily-puzzles/(.*)` (static files, including a 404), and `api/daily.ts`
  sets the same header itself. An index file published **under
  `/daily-puzzles/`** inherits the header; anywhere else needs a new header
  rule and an app release is not required either way.
- Classics are bundled with the app (`/classic-puzzles/…` is fetched
  relative to the webview origin), so they work offline but new classics
  need a release. Past dailies do not.
- `/daily/:day/:slot` is a React route and works inside the webview, but a
  shared link opens in the phone's browser, not the app (no universal links
  configured) — unchanged by this feature.
- Not run: the apps themselves. The above is read from the mode branches.

## 2. Spec: the archive

One screen, **`/archive`**, that lists every published daily (mini, midi,
large) from the feed's first day to today, plus the classics, each with the
viewer's own status, and that plays or races a puzzle through the two load
paths that already exist. Working name "Archive"; the menu label is Andrew's
call (2.8).

### 2.1 What a row knows

Each archive item is a `DailyIndexEntry`:

```ts
interface DailyIndexEntry {
  day: string;          // "2026-10-20" — the daily's own day
  slot: DailySlot;      // mini | midi | large
  title: string;
  theme: string;        // "" when none or when it repeats the title (displayTheme)
  author: string;
  width: number;
  height: number;
  clues: number;
  identity: string;     // puzzleIdentity() — the key into useBestTimes()
  blocks: string;       // grid shape for the thumbnail, "." white / "#" black, rows joined — optional, see 2.3
}
```

Status is derived on the client, never stored in the index:

| Status | Rule | Source |
|---|---|---|
| **Solved** · time | `identity in useBestTimes()` | local stats or the account's `solves` |
| **Solved on the day** vs **solved late** | account: a `solves` row with `completed_day === day`; anonymous: a `daily_results` row for `(day, slot, uid)` | optional refinement, 2.8 |
| **In progress** | the saved solo session's `puzzleIdentity(puzzle) === identity` and not complete | `loadSavedSession()` + `loadSoloTimer()`; at most one item |
| **Unsolved** | none of the above | |
| **Best** | shown as the time itself; for accounts, "best 1:42" differs from the day's own time when a replay beat it | |

Streak and totals on top of the list (variant C) come from `useStreaks()`
and a count over the index × best times — no new math.

### 2.2 Actions

- **Play** → `fetchDailyForDay(day, slot)` (existing) → `handleSoloPuzzleLoaded(puzzle)` + `setSoloTheme(theme)` → `/solo/play`. Identical to the menu's `playDaily`. Loading a past daily replaces the resumable solo game, exactly as today; the row's "In progress" state makes that visible for the first time.
- **Race a friend** → `fetchDailyForDay` → `setUrlPuzzle(puzzle)` → `/host-game/name` (the picker's `race` intent and the classics' `raceFriends`). The picker itself can later list past dailies too, since it already imports `ClassicList`.
- **Leaderboard**: not offered for past days — boards are today-only and a late solve does not post (`todaysDailySlot` matches today's puzzles only). Suggest showing nothing rather than a dead link; a per-day board is a separate feature.
- **Classics**: the existing `ClassicList` with its two actions, unchanged.

### 2.3 Data source for the list of days

**Recommended: a generated static index under `/daily-puzzles/`, like the classics' manifest.**

- `pnpm build:daily-index` (new `scripts/build-daily-index.mts`, run by `pnpm build` and by `pnpm daily:add`) reads every file under `public/daily-puzzles/{,midi/,large/}` with `parseDailyFeedEntry`, computes `puzzleIdentity`, and writes `public/daily-puzzles/index/YYYY-MM.json` per month plus `public/daily-puzzles/index.json` with `{ first, months: ["2026-10", …] }`. A unit test checks the index against the files, like `classicLibrary.test.ts` does.
- Living under `/daily-puzzles/` it inherits the `Access-Control-Allow-Origin: *` header (apps), is excluded from the SPA rewrite (a missing month is a real 404), and is served as a static file before the `/daily-puzzles/:day.json` rewrite can send it to `api/daily.ts`.
- **The client filters to `day ≤ dayKey(today)`.** The file is built once and served for weeks, and the static files already include future days (1.1). The filter is the only thing keeping tomorrow's puzzle off the list, which is the same exposure the feed has today.
- **Admin-scheduled days** (rows in `daily_schedule` with no static file) are not in a build-time index. Two options: (a) the client also asks PostgREST for `daily_schedule?select=day,slot,title&day=lte.<today>` (RLS already allows it) and merges — identity would need either an `identity`/`theme`/`width`/`height` column written by the `studio-schedule` edge function (recommended, one migration) or fetching each entry; (b) the build script queries the table at build time, which misses anything scheduled after the deploy. Today every published day is a static file, so **v1 can ship with the static index alone** and add (a) when the queue is used for real.
- Rejected: a Vercel function that lists days (another cold path, no CDN caching benefit over a file); an edge-config store (the files are the source of truth already).

Thumbnails: `blocks` lets the row draw `MiniGridThumb`'s shape (the design system's "signature element") without fetching the puzzle. It costs ~25/81/225 bytes per entry; the per-month split keeps it cheap. Drop it if the chosen variant has no thumbnails.

### 2.4 How far back

- **Start: 2026-10-16**, the first feed file. Before that the mini was the 23-puzzle bundled rotation, repeated every 23 days; `fetchDailyForDay` would happily serve those but listing them is listing reruns. The index simply begins where the files begin; no code needs a constant.
- **Depth**: everything, paged by month. Measured on the generated files: ~170 B/entry without `blocks`, ~300 B with them (a 15×15 shape is 240 B), so three entries a day is ~0.9 KB/day raw with thumbnails — a full month ~27 KB raw / ~5 KB gzipped, a year ~330 KB raw / ~60 KB gzipped, fetched one month at a time. Infinite scroll or "Earlier" per month keeps the DOM small on phones.
- Whether anonymous visitors should see all of it or the last N days (a sign-in or a future premium hook, the way NYT gates its archive) is Andrew's call (2.8). Technically a gate is a client-side slice of the same index.

### 2.5 Anonymous vs signed in

| | Anonymous | Signed in |
|---|---|---|
| List | full | full |
| Solved + best | from `localStorage` (this device only) | from `solves` (every device) — `useBestTimes()` already picks |
| Solved on the day / late | only via `daily_results` for the current anonymous uid (optional) | from `solves.completed_day` |
| In progress | the one resumable solo game | same (local); cross-device later via `games.cells` if ever wanted |
| Streak header | `useStreaks()` local | `useStreaks()` account |
| Benefit-led row | "Sign in to keep your history on every device" — the same `AccountMenuRow` copy the menu uses, only for anonymous visitors | hidden |

Nothing in the archive writes anything. The data model for accounts changes only if the "solved on its day" refinement wants `slot`/`daily day` on `solves` rows (2.8).

### 2.6 Mobile layout (phones first)

`mobile-web` skill rules applied; the prototypes were checked at 390 px.

- Page column `max-w-md` with the 16 px gutter (`PageShell`), site bar with "Back to menu". Rows are `min-h-16` and whole-row tap targets (like `ListRow`), buttons `min-h-11`.
- Sticky slot filter (All · Mini · Midi · Large · Classics) and a "Hide solved" chip, the classics screen's sticky-chip pattern, so the filter stays reachable while scrolling months.
- No form controls, so no 16 px input rule to trip; `<select>` only if a month jumper is wanted (`text-base`).
- Heights in `dvh`, no `100vh`; no nested scrollers, so no `overscroll-behavior` needed; the page scrolls as one.
- Calendar variant: 7 cells across at 390 px are ~46 px squares, above the 44 px target; each day cell is one button that opens a day sheet with its three puzzles (three buttons in one 46 px cell would be ~15 px each — too small). Month navigation by swipe is not needed; prev/next buttons suffice.
- Desktop uses the width (two columns: list + detail, or a wider calendar), per DESIGN.md rule 4; the prototypes focus on the phone.
- Hover states are paired with `active:`; no `hover:`-only affordances.
- Not verifiable in emulation: safe-area insets and real toolbar collapse. The archive has no bottom bar, so the only inset that matters is the one `index.html` already handles.

### 2.7 Accessibility

- The list is a `<ul>` of rows; each row's one button names the puzzle and its status in text (`aria-label` = "Daily Mini, Oct 20, Taco Tuesday, solved in 1:42") so status is never colour-only. Solved/in-progress/unsolved use an icon + text chip, not a bar (DESIGN.md rule 8).
- Calendar grid: `role="grid"` with `aria-label` per cell ("Oct 20: mini solved, midi unsolved, large not published"), arrow-key movement between days, `aria-current="date"` on today, and a visible focus ring. Days with no puzzle are `aria-disabled`.
- Filters are `aria-pressed` chips (the classics pattern). Month headings are real `<h2>`s so screen readers jump by heading.
- Loading: `aria-busy` on the list while the index fetches, with reserved heights so nothing shifts (the menu's placeholder-tile rule).
- Times are `tabular-nums`; the streak number has its label in the same element.
- Reduced motion: any sheet/expand transition is gated on `prefers-reduced-motion`.

### 2.8 Requests and cost

| Action | Requests | Notes |
|---|---|---|
| Open `/archive` | 1 route chunk (prefetched on intent) + 1 `index.json` (84 B) + 1 month file (~5 KB gzipped) | all static, CDN-cached, 304 after the first visit |
| Scroll to an earlier month | 1 month file | |
| History | 0 | local stats are in memory; an account's `solves` are already loaded by `AccountProvider` |
| "Solved on the day" for anonymous (optional) | 1 PostgREST query `daily_results?user_id=eq.<uid>&select=day,slot,seconds,mode` | a few KB; only if that refinement is wanted |
| Admin-scheduled days (optional, 2.3a) | 1 PostgREST query on `daily_schedule` | |
| Play / race | 1 feed fetch (existing path) | |

No new Supabase tables, functions or RLS for v1. The build gets one more script; `pnpm daily:add` regenerates the index so a published day appears in the archive on the same deploy.

### 2.9 Open questions for Andrew

1. **Shape**: calendar, grouped list, or stats-first (the prototypes, section 3) — or a mix.
2. **Name and entry point**: a menu tile ("Past puzzles" / "Archive"), a tab inside the classics screen (renamed "Library"), or both? And should "Up next" after a finish offer yesterday's unsolved daily?
3. **Gating**: everyone sees everything, or anonymous visitors see the last 7/30 days with sign-in for the rest (a premium hook later)?
4. **Late solves**: a past daily solved today counts toward the streak (it is a solo finish) but posts to no leaderboard. Label it "solved late" / show both times for accounts, or treat every solve the same?
5. **In progress**: fine as "the one resumable game", or build per-puzzle progress keyed by identity (localStorage, capped) so an abandoned past puzzle resumes where it was? That is the one piece that needs new persistence.
6. **Future days**: the static files for upcoming days are publicly fetchable now. Leave it (nobody guesses URLs), or move future days behind the schedule table?
7. **Thumbnails**: worth ~350 bytes/day in the index, or text-only rows?
8. **Classics in the same screen** as a filter chip, or left on `/classics`?
9. **Spanish**: the strings are few (titles, "Solved", "In progress", "Play", "Race a friend", month names via `Intl`), but the puzzles themselves are English — fine for v1?

## 3. Prototypes

Branch `claude/puzzle-archive`, dev-only route **`/prototype/archive`**
(`src/prototypes/archive/`, gated on `import.meta.env.DEV` in
`src/routes.tsx`; the floating switcher renders nothing in a production
build). Throwaway code per the prototype skill: no tests, English strings
inline, no i18n keys added. What is *not* throwaway: `src/lib/dailyIndex.ts`
and `scripts/build-daily-index.mts` (`pnpm build:daily-index`), which
generate the real index the spec describes — `public/daily-puzzles/index.json`
plus `index/2026-10.json`, `2026-11.json`, `2026-12.json` (161 entries).

Run:

```bash
pnpm exec vite --port 5290
```

then open `http://localhost:5290/prototype/archive?variant=A` (`B`, `C`).
`?fake=1` (or the bar's toggle) swaps in a deterministic fake history so
every state shows: ~60% of past days solved, today's mini solved,
yesterday's large in progress, a 5-day streak. Without it the page shows the
device's real history and the resumable solo game. Play and Race go through
the real paths (`fetchDailyForDay` → `handleSoloPuzzleLoaded` → `/solo/play`;
`setUrlPuzzle` → `/host-game/name`). Screenshots (iPhone 14 viewport, fake
history unless named otherwise) are in `docs/puzzle-archive/`; regenerate
with `node --experimental-strip-types scripts/prototype-archive-screenshots.mts`
while the server runs.

### A · Calendar (`VariantCalendar.tsx`)

A month grid, Sunday start, ‹ › between months (bounded by the first feed
day and today). Each day cell carries one dot per published daily — filled
blue solved, gold in progress, hollow unsolved — and is the single ~46 px
target; tapping it lists that day's puzzles under the grid (thumbnail,
slot, title, status chip, Play/Resume/Play again + Race) and scrolls them
into view. Selected day is a filled tint, today a ring. "Dailies | Classics"
chips at the top swap in the existing `ClassicList`.

- **For**: the strongest "did I play every day?" picture; streak gaps are visible at a glance; one screen per month scales forever; matches how NYT/Wordle players already think about archives.
- **Against**: three slots per cell is the ceiling (a fourth daily would not fit); the puzzle rows live under the fold on a phone, so every pick is tap + glance down; a month with a handful of published days (October now) is mostly grey; no "catch up" affordance — the user has to hunt for hollow dots.

### B · Weeks (`VariantWeeks.tsx`)

An agenda: every published daily as one row, newest first, grouped under
"This week / Last week / Oct 5 – 11" headings; a sticky chip bar filters by
slot and hides solved; the first row of a day carries the weekday + date.
The whole row is the Play target, the status chip (time / In progress /
Play) sits at the right, and Race is a quiet trailing icon button. "Earlier
weeks" loads four more groups.

- **For**: the densest and most scannable on a phone (3 puzzles per 72 px); every action is one tap; filters make "unsolved larges" a two-tap question; the shape is the classics screen's, so it would read as one product.
- **Against**: 3 rows a day × 365 days is a long scroll with no overview — the calendar's "shape of the month" is lost; weeks are a weaker mental unit than months for a daily; thumbnails repeat (minis all look alike at 40 px).

### C · Stats first (`VariantStats.tsx`)

Status is the hierarchy, not date. A header card with the daily streak,
"Solved 15 / 24" and the fastest time per slot; a gold "Pick up where you
left off" card when a game is in progress; then **Catch up** (unsolved,
newest first, "Show all") and **Your solves** (with a trophy on each slot's
best), and a `ListRow` to the classic library. Dates are secondary text.

- **For**: it answers the two questions people actually arrive with ("what's left?" and "how am I doing?") without any browsing; it is the only variant that surfaces the in-progress game as a resume card; it doubles as the profile/stats page the account feature has no home for yet.
- **Against**: no way to find "the one from October 20" except scrolling a flat list; a new or lapsed player sees an empty header and a long Catch up list (a wall of debt); the stats block duplicates what the menu's streak chip and the leaderboard already say.

### Mixes worth considering

- **B with C's header**: the agenda list under a compact streak/solved
  strip and the in-progress card. Keeps one-tap density and adds the
  "what's left" answer.
- **A as a tab inside B**: a "Month" view toggle on the agenda screen, like
  a calendar app, for the people who want the overview.
- **C's "Catch up" as a row on the menu** regardless of which archive ships:
  "2 dailies you missed this week →" is the retention hook the archive is
  really for.

### What the prototypes do not answer

- Desktop layout (phone column only; DESIGN.md rule 4 wants a two-column
  desktop); the real screen should use the width.
- Spanish copy and `Intl` month/weekday names in `es` (the helpers already
  take the locale).
- "Solved late" vs "on the day" (2.1) — not derived, since it needs either
  the account's rows or the `daily_results` query.
- Per-puzzle progress for more than the one resumable game (2.9 #5).
- Index cost numbers (2.4) were updated from the generated files: with
  `blocks`, October's 48 entries weigh 14.3 KB raw (~300 B/entry; a 15×15's
  shape alone is 240 B), November's 89 entries 26.4 KB raw / 4.7 KB gzipped;
  without `blocks` ~170 B/entry.

## 4. What shipped (2026-10-23)

Andrew picked **A, the calendar**, with two pieces from C: the resume row
for the in-progress game and the "solved · to catch up on" count, both above
the grid and sized so the whole month stays above the fold on a phone. The
prototype switcher and variants B and C were removed; the full set is
preserved on this branch at commit 85acd1b (the prototype skill's "primary
source"), with the three phone screenshots kept in `docs/puzzle-archive/`
as the decision record. `archive-phone.png` and `archive-desktop.png` are the
shipped screen.

Defaults taken from §2.9, none of which changed the build: everyone sees
everything (no gating); a past daily solved today is an ordinary solve
(streak counts, no leaderboard, no "late" label); "in progress" is the one
resumable solo game; future days stay as static files and are filtered on
the client; thumbnails are in the index; the classics stay on `/classics`
with a row linking there; Spanish strings are translated. Entry point: a
"Past puzzles" row in the menu's solo list, above the classic library.

Built: `src/lib/dailyIndex.ts` (+ cache and `prefetchDailyIndex`, warmed by
the route's `lazy` like the classics' manifest), `scripts/build-daily-index.mts`
(`pnpm build:daily-index`, run by `pnpm build`, `pnpm dev` and `pnpm daily:add`),
`src/lib/archive.ts` (status derivation + calendar math), `src/screens/ArchiveScreen.tsx`
(route `/archive`, two columns from `lg`), tests `dailyIndex.test.ts`,
`archive.test.ts`, `ArchiveScreen.test.tsx`, strings under `archive.*`,
`menu.pastPuzzles*`, `meta.archive`.

Still open for Andrew (nothing blocks on them): gating anonymous visitors
(§2.9 #3), per-puzzle progress beyond the one resumable game (#5), moving
future days behind the schedule table (#6), and offering yesterday's
unsolved daily in "Up next" (#2).

## 5. Follow-ups Andrew decided (2026-10-23, afternoon)

Decisions on §2.9: **(1)** anonymous visitors play the last 7 days
(today included) and see older days on the calendar locked, with a
benefit-led sign-in prompt; accounts see everything. **(2)** yes to
per-puzzle progress for every solo puzzle a player has started. **(4)** yes
to yesterday's unsolved daily in "Up next". **(3)** future-day files: still
undecided, left alone.

(1) and (4) landed in PR #126 (below). (2) is its own PR after #126 merges,
because it changes persistence; its design follows.

### 5.1 Gate (shipped in #126)

`isLockedDay(day, today, unlocked)` in `archive.ts`: locked once the day is
`ANONYMOUS_ARCHIVE_DAYS` (7) or more behind today, never when `unlocked`.
The screen unlocks for a signed-in account, and also wherever no account
can be offered (`accountsAvailable()` false: the native apps, builds
without Supabase), since a lock with no key would be a dead end there. A
locked day keeps its place and its status dots on the calendar but shows a
lock glyph, and its panel shows the puzzles with a sign-in card instead of
Play / Race; the card opens the shared `AccountSheet`
(`openAccount({ placement: "archive" })`), the menu row's entry point.

### 5.2 Yesterday in "Up next" (shipped in #126)

`nextUpSuggestions` takes `yesterday` (yesterday's index entries) and
offers them after today's unsolved dailies, before a classic, as
`{ kind: "archive", entry }` rows ("Yesterday's Daily Mini · 5×5 · Tacos").
`useNextUp` reads them from the index only when today's dailies leave a
row free, and holds the list until they are known so a classic never shows
ahead of a daily. `SoloPlayScreen` loads the pick with `fetchDailyForDay`.

### 5.3 Per-puzzle progress (design for the follow-up PR)

**Goal.** Every solo puzzle a player has started shows "in progress" on the
calendar and can be resumed where it was, not only the one game the home
route resumes.

**What exists.** Solo progress is one localStorage record,
`crossword-clash-solo` (`{ puzzle, playerCells, gameId }`), plus the clock
`crossword-clash-solo-timer` (`{ key, elapsedMs, completed }`), both
overwritten by `handleSoloPuzzleLoaded`. `GameContext` also upserts the
cells into `games.cells` per solo game when Supabase is configured, keyed
by game id, never read back.

**Store (local, both anonymous and accounts).** A new module
`src/lib/soloProgress.ts`, pure helpers + a thin localStorage wrapper like
`soloStats.ts`:

```ts
interface SoloProgressRecord {
  key: string;            // puzzleIdentity()
  cells: Record<string, CellState>;  // the non-empty player cells only
  elapsedMs: number;
  updatedAt: number;      // ms epoch
  filled: number;         // correct cells, for a "12 / 25" hint
  total: number;          // white cells
}
// localStorage "crossword-clash:solo-progress" → Record<key, SoloProgressRecord>
```

- Written from the same effect that saves `crossword-clash-solo`
  (`GameContext`), debounced to once per second, only while the game is not
  complete; deleted on completion (`recordSoloCompletion` path) and on
  "Reset puzzle".
- **Bounded:** at most 30 records; evict the oldest `updatedAt` first; skip
  records with no filled cell; cap stored cells at the grid size (a 15×15
  is ≤ 225 small objects, ~8 KB). Worst case ~250 KB, well under the
  localStorage budget the daily-feed cache already shares.
- Resume: `handleSoloPuzzleLoaded(puzzle)` looks the identity up and, when
  a record exists, hydrates `HYDRATE_CELLS` with its cells and seeds the
  timer with `elapsedMs` (the timer already does this for the one saved
  key; the lookup generalizes it). The existing single-session record stays
  as the "what does `/` resume" pointer, unchanged.
- Archive: `deriveArchiveItems` takes the set of in-progress identities
  instead of one; `resumableItem` picks the newest `updatedAt`; the resume
  row shows "12 / 25 filled · 3:10".

**Synced for accounts: not in this PR, and here is why.** The `solves`
machinery stores one row per finished (puzzle, day) and derives everything
from facts about finishes; partial grids are neither finishes nor small
(a 15×15 is ~8 KB of cells against a 7-field row), and `record_solves`'
conflict rule (keep the best time, let a finish replace an import) has no
meaning for progress. Carrying progress cleanly would be a separate
`solo_progress` table (user_id, puzzle_key, cells jsonb, elapsed_ms,
updated_at; owner-only RLS; delete on finish) with last-write-wins across
devices and a delete in the `delete-account` function. That is a reasonable
phase 2, but it is new schema, a new RLS surface and a new sync conflict
story, so the follow-up ships **local-only** and says so in the privacy
copy only if the local record outlives the puzzle (it does not: it is
deleted on completion).

**Tests to add.** `soloProgress.test.ts` (record shape, eviction order,
cap, delete on finish, cells cap), `GameContext` save effect (debounce,
no write when complete), `usePuzzle` hydrate from a record, archive
derivation with several in-progress identities, `ArchiveScreen` resume
row showing the newest one.

**Mobile/native.** The store is per device; the apps get it for free. A
cleared browser loses it, same as every other anonymous record today.

## 6. Per-puzzle progress (shipped, 2026-10-23)

Built as §5.3 described, in its own PR after #126 merged, with three
deliberate departures:

- **No debounce.** `GameContext`'s solo save effect already rewrites the
  whole puzzle to `crossword-clash-solo` on every keystroke; the progress
  write beside it is smaller, so a debounce would add state for nothing.
- **A record only once a letter is typed, and never wiped by an empty grid.**
  Loading a puzzle resets the cells for one tick before hydration; if that
  tick deleted the record, every resume would erase what it was resuming.
  Deletion happens only on finish (`useSoloTimer` + the save effect once
  `isComplete`) and on Reset.
- **The legacy pointer stays.** `crossword-clash-solo` is still what `/`
  resumes; `inProgressFrom` merges it with the store so a game started
  before this shipped still shows as in progress.

Synced progress for accounts remains a later phase (§5.3's reasoning
stands): the record is per device and dies with the browser's storage,
like every other anonymous record. The resume row now reads
"Daily Large · Oct 22 · 12 of 76 filled · 3:10".
