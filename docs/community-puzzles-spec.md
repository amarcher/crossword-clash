# Community puzzles: publishing from the studio, finding and playing them

Written 2026-10-27 on `main` (a0f34cf). Spec only: no application code
changes. Every claim about the current code cites a file. Nothing here was
run against production data.

Context: the construction studio (`/studio`, PR #79 and later) ends at a
play-test link and an `.ipuz` download (`src/screens/StudioScreen.tsx:283-307`);
there is no way for an author to put a puzzle in front of other players, and
Andrew said on 2026-10-27 that it is "unclear how one will publish". His
direction of 2026-10-15: a community repository where anyone can publish and
others find and play; reports instead of an up-front copyright check (reasons:
copied, offensive, nonsense); authors rewarded with compliments and notified;
an admin view of popular puzzles and a public leaderboard; the daily schedule
stays admin-curated. Draft PR #90 already holds the publishing and community
terms (en + es) and promises: agreeing to terms before the first publish, a
Report button, an admin queue acting within 24 hours, "hide this author",
in-app account deletion (exists since #111), unpublish, and privacy text for
published puzzles, reports and compliments. The DMCA side ships separately as
PR #143 (`/copyright` page, designated agent): this spec points at it and does
not restate it.

---

## Decisions needed from Andrew

Each has a recommendation; the reasoning is in the section named.

| # | Decision | Recommendation | Where |
|---|---|---|---|
| 1 | Who may publish, and from where | **Any signed-in account with a username**, not a Plus rule; in phase 1 only from the studio (which the Plus web build already gates), so in practice Plus subscribers and admins. Publishing an uploaded `.puz`/`.ipuz` is a later phase | §1.1 |
| 2 | What a published puzzle is on the server | A **`published_puzzles` row keyed to the author's account**: a snapshot of the puzzle in the transfer format (as `daily_schedule.entry` is), title, notes, difficulty, language, `puzzle_key` (= `puzzleIdentity()`, the badge and insights key), a content hash, play and solve counters. One row per studio puzzle; publishing again updates it (`version` + 1) | §4.1 |
| 3 | Unpublish | **Status, not delete**: the row leaves every public list at once and the page says "unpublished by its author"; the author can publish it again; the sweep deletes it after 30 days unpublished. Rooms already playing keep their own `puzzles` copy; players' solve records and best times survive | §1.3, §4.3 |
| 4 | Where they appear | **`/puzzles`** (browse: search, sort Newest / Popular / Most solved, filters size · difficulty · language, "Load more"), **`/puzzles/:id`** (the page: Play, Race friends, your status, Report, Hide author, Share), **`/puzzles/by/:username`** (an author's list, where the credit links). A "Community puzzles" row on the menu beside "Past puzzles" and "Classic library" | §2 |
| 5 | Who can play | **Everyone, anonymous and apps included**, like the classics. Solo play writes no server rows; a race goes through `uploadPuzzle` as today | §2.4, §2.6 |
| 6 | Report | A **Report** action on the page for anyone, anonymous included (Apple 1.2 wants a report from any user), reasons **Copied · Offensive · Nonsense · Something else** with an optional note; one open report per person per puzzle, 10 a day per person; **3 distinct reporters in 7 days hold the puzzle** (off the lists, "under review") until the admin rules | §3.1, §3.2 |
| 7 | The admin queue | A **Reports panel in `/studio`** (admin only, next to the daily queue) through a new `studio-moderate` edge function: the held and reported puzzles with their reasons and the author's prior removals; actions **Dismiss**, **Remove** (reason shown to the author, a strike), **Remove and stop this author publishing**, **Restore** (after a counter-notice) | §3.3 |
| 8 | How the admin hears about a report | **An email per report** to the legal contact address, sent by a Supabase database webhook → a small `report-alert` edge function → Resend (the project has no email sender today; `RESEND_API_KEY` secret). Alternative: no email, the panel is checked daily, and the terms keep "aim to" | §3.3 |
| 9 | Hide this author | **Ruled 2026-10-27: the lightest thing that satisfies the store rule.** A list of hidden author ids in localStorage (`crossword-clash:hidden-authors`), applied to the browse results and the page on this device; no table, no sync, undo from the author's page. Recommended before the ruling: a `hidden_authors` table for every player | §3.4 |
| 10 | Deleting the author's account | **Everything goes**: `published_puzzles` cascades with `auth.users`, so deleting the account unpublishes and deletes every puzzle; reports keep their row with the reporter set null; a daily made from the puzzle survives (`daily_schedule` stores its own copy, as the terms allow) | §4.3 |
| 11 | The writes | **SQL RPCs under RLS** (`publish_puzzle`, `unpublish_puzzle`, `report_puzzle`, `accept_publishing_terms`), the `record_solves` pattern: the user comes from the JWT, limits are counted in the function, structural checks in SQL; the full puzzle validation and the word filter run in the client (pure, tested). Admin actions only through the edge function with the service role | §4.2 |
| 12 | Terms | **Reuse PR #90's "Publishing puzzles", "Community rules" and "Reports, removal and blocking" sections** (en + es, already written) and its acceptable-use line about titles and clues; **drop its two DMCA sections**, superseded by #143's `/copyright` page and the terms' existing "Copyright complaints and repeat infringers" paragraph. Agreement is a checkbox in the publish dialog, recorded once per account with the terms' version | §4.4 |
| 13 | Launch switch | **`VITE_COMMUNITY=1`** (`communityEnabled()`, like `plusEnabled()`): routes, the menu row and the studio's Publish button appear only with it; the migration and functions are inert without callers, so the PR merges dark and Andrew flips it once the terms are live and the agent is registered | §4.6 |
| 14 | `.puz` export | **Added 2026-10-27 at Andrew's request.** The studio's export menu offers `.puz` beside `.ipuz` (a small writer, `src/lib/seedgrid/puz.ts`, the Across Lite v1.3 layout with its checksums; speed clues cannot ride along). Nothing changes on the puzzle page: a published puzzle is played in the service, not downloaded, which is what the publishing licence covers | §1.5 |
| 15 | Later phases | **Kudos and notifications next** (a "Nice puzzle" on the completion modal, counts on the author's page, an unread badge on `/account`), then promote-to-daily from the admin view, a public "most solved this week" strip, publishing uploaded files, per-puzzle leaderboards once timing is server-stamped (leagues spec) | §5 |

Open questions that are not decisions are in §6.

---

## 0. What exists today (the code the spec builds on)

| Area | Today | Cited |
|---|---|---|
| Studio output | `exportIpuz` downloads a `.ipuz` (`toIpuz`, author hard-coded to "Crossword Clash"); `playTest` opens `toTransferPuzzle` → `normalizeTransferPuzzle` → `compressPuzzleToHash` in a new tab, so a studio puzzle only ever leaves the browser as a link payload. Nothing reaches the server unless the author hosts a room from that tab | `src/screens/StudioScreen.tsx:283-307`; `src/lib/seedgrid/ipuz.ts` (`toIpuz`, `toTransferPuzzle`) |
| Studio state and drafts | `StudioState` holds `id`, grid, `clues` / `speedClues` / `editedClues`, `title`, `theme`, `difficulty` (easy/medium/hard), `versions`. "My puzzles" is localStorage (`crossword-clash:studio-puzzles`, 50 entries, each the whole state; "a shared store comes with the community features") | `src/lib/seedgrid/studioState.ts:14-45`; `src/lib/seedgrid/studioLibrary.ts` |
| Who gets in | Dev and `VITE_STUDIO=1` bypass; the Plus web build renders the editor for a Plus subscriber or a `studio_admins` row, never in `--mode mobile`. `useStudioAccount` exposes the non-anonymous `user`, `admin`, `plus` | `src/lib/studioGate.ts`; `src/hooks/useStudioAccount.ts` |
| The only "publish" that exists | The admin **daily queue**: `scheduleProblems(state)` (full grid, a title, every clue passes `clueOk`) → `scheduleEntry` builds `{ theme?, puzzle: TransferPuzzle }` → `studio-schedule` (token or admin, service role) upserts `daily_schedule (day, slot)` with `title`, `studio_id`. The function shape-checks the entry and caps it at 200 KB | `src/components/Studio/DailyQueue.tsx`; `src/lib/seedgrid/studioSchedule.ts`; `supabase/functions/studio-schedule/index.ts`; `supabase/migrations/20261015000000:68-88` |
| The `puzzles` table | `title, author, width, height, grid jsonb, clues jsonb, file_hash unique, created_at`; public read, any authenticated (anonymous included) insert and update. `uploadPuzzle` dedupes by `puzzleContentHash()` in `file_hash` and is called by every **room** path; solo play never calls it. `retention_sweep()` deletes a row a day after its last game is gone. It is a room's transient copy, not a library | `supabase/migrations/20260223000000_initial_schema.sql:5-15,46-52`; `20260225000000`; `src/lib/puzzleService.ts:30-67`; `src/lib/puzzleHash.ts`; `20261023000000_retention.sql:84-87,120-124` |
| Identity keys | `puzzleIdentity(title, size, solution)` keys best times (`useBestTimes()`), the solo progress store, `solves.puzzle_key` and `play_sessions.puzzle_key`; `puzzleContentHash` (title, author, size, grid, clues) keys `puzzles.file_hash` | `src/lib/soloStats.ts:117-123`; `src/hooks/usePlayInsights.ts:40`; `20261017300000_solves.sql` |
| Accounts | Apple/Google linked to the anonymous user; `profiles.username` (3–20 chars, public read, owner-only writes, **non-anonymous JWT required** via `auth.jwt() ->> 'is_anonymous'`); `accountsAvailable()` is false in the apps until native sign-in is configured | `src/lib/account.ts`; `supabase/migrations/20261017100000_profiles.sql:33-51` |
| Deleting an account | `delete-account` cancels billing, deletes rows from `play_sessions`, `narrator_sessions`, `daily_results`, `players`, nulls `games.host_user_id`, then deletes the auth user; everything else must reference `auth.users ON DELETE CASCADE` (CLAUDE.md rule) | `supabase/functions/delete-account/index.ts:24,61-80` |
| Browse pattern | `ClassicLibraryScreen`: manifest known on first frame, sticky chip filters (size buckets, hide solved), "Surprise me", a card grid (`ClassicList`: eyebrow, solved chip with the best time, title, author, blurb, Play solo as the whole-card target + Race friends). Play → `handleSoloPuzzleLoaded` → `/solo/play`; Race → `setUrlPuzzle` → `/host-game/name` | `src/screens/ClassicLibraryScreen.tsx`; `src/components/ClassicList.tsx` |
| Admin panels | `DailyQueue` and `Insights` render only for `admin || token`; both call an edge function gated by `studioAllowed` (token or `studio_admins`), service role inside | `src/components/Studio/Insights.tsx`; `supabase/functions/_shared/studioAuth.ts:33-36`; `studio-insights/index.ts` |
| Word filter | `isObjectionableName` / `displayableName` (English + Spanish list, leet, Scunthorpe allow-list) screens display names on write and on read | `src/lib/nameFilter.ts` |
| Clue checks | `clueOk` (studio), `CLUE_MAX` + `clueGivesAway` (`audit.ts`, used by `crosscheck.ts`) | `src/lib/seedgrid/cluePrompt.ts`; `src/lib/seedgrid/audit.ts` |
| Play statistics | One `play_sessions` row per visit to a puzzle (`puzzle_key`, `completed`, `cells_filled`, `white_cells`, platform, signed_in), upserted by id on hide/leave/complete; `insights_puzzles` / `insights_clues` aggregate them for the admin | `src/lib/playInsights.ts`; `20261015000000:9-44`; `20261017200000` |
| Legal text | Terms "Puzzles and your content" (studio puzzles "stay in your browser until you host or share them"), "Copyright complaints and repeat infringers" → `/copyright` (PR #143). Draft PR #90: "Publishing puzzles", "Community rules", "Reports, removal and blocking", plus two DMCA sections, en + es | `src/screens/legal/legalContent.ts:256-267`; `origin/legal/community-groundwork` |
| Launch switches | `plusEnabled()` = `VITE_PLUS === "1"` (client) + `PLUS_GATES=1` (server); the studio route exists only where `studioRouteEnabled()` | `src/lib/plus.ts`; `src/lib/studioGate.ts:22-25` |

---

## 1. The author's path: publishing from the studio

### 1.1 Who may publish

**Recommendation (decision 1): a signed-in account with a username.** Not an
anonymous user, and not a Plus rule.

- The author is a person other players can find, credit and hide, and whom
  the admin can warn, strike and stop. That needs a stable identity: the
  anonymous uid is lost with the browser's storage (`retention_sweep()`
  deletes idle anonymous users after 30 days), so a puzzle keyed to it would
  become orphaned and unaccountable. `profiles` already encodes "a real
  account" as a non-anonymous JWT; the new tables use the same predicate.
- The username is the credit ("by @archer") and the author page's URL, so a
  first-time author without one is sent through the existing
  `UsernamePicker` (`openAccount({ view: "username" })`) before the publish
  dialog opens.
- Plus is the price of the **studio**, decided in the monetisation spec
  (decision 3) and enforced by `studioGate.ts`; publishing is what you do
  with a finished puzzle and should not need a second gate. On the Plus web
  build this means Plus subscribers and admins publish; in dev and
  `VITE_STUDIO` builds anyone with an account can. When a later phase lets
  an account publish an uploaded file (§5), the rule does not change.
- Terms: the publish dialog's first use shows "I made this puzzle (or have
  the right to publish it) and I agree to the publishing terms" with a link
  to `/terms#publishing`; ticking it calls `accept_publishing_terms(version)`
  once, and the checkbox is not shown again until the publishing terms'
  version changes (§4.4).

Blocked authors (`publishers.banned_at`, §3.3) see "Publishing is switched
off for this account" with the support address, and nothing else changes for
them.

### 1.2 The publish dialog and its checks

A **Publish** button joins Play test in the grid toolbar
(`StudioScreen.tsx:365`), enabled when the grid is complete. It opens a
dialog (the sheet pattern from `AccountSheet`) with:

- Title (from the studio, editable, 1–80 characters, required).
- Author note (optional, ≤ 280 characters: "A themeless with a few long
  stacks. Wednesday-ish."). Shown on the page and searchable.
- Difficulty: the studio's `difficulty` (easy / medium / hard), the author's
  own rating, shown as a chip and a filter.
- Language: `en` / `es`, defaulting to the UI language. The site is
  bilingual and a Spanish solver should not be served English fill by
  default (§2.1).
- The terms checkbox (first time only).
- The checks, run client-side before the button enables (`publishProblems`,
  a pure function that generalises `scheduleProblems`):
  1. every square filled, the grid connected (`stats.connected`, already
     computed for the status line), 3 ≤ size ≤ 25 on each side;
  2. a title;
  3. every slot has a clue that passes `clueOk`, is ≤ `CLUE_MAX` and does
     not give its answer away (`clueGivesAway`);
  4. the title, note and every clue pass `isObjectionableName` (the display
     name filter, applied to each string); a hit says which field;
  5. not one of ours: the puzzle's `puzzleIdentity()` is not in the daily
     index (`knownPublishedIndex`) or the classic manifest
     (`knownClassicManifest`), both already warmed for other screens.
     Refused as "This is a Crossword Clash puzzle" (the studio can load a
     daily's grid through play-test links; republishing it would be a
     duplicate at best);
  6. not already published by someone else: the server refuses a content
     hash that another author holds (§4.2), surfaced as "Someone has already
     published this exact puzzle".
  Two-letter runs are a warning, not a refusal (the stats line already
  flags them; quality is what reports and, later, kudos are for).
- On success: a toast with the page link ("Published · Copy link") and the
  button becomes **Update** (§1.3). `track("puzzle_published", { size,
  difficulty, lang })`.

The checks are the "method for filtering objectionable material" the app
stores ask for (§3.5); they are deliberately mechanical. Andrew ruled out a
Claude taste pass on 2026-10-15 and this spec does not reintroduce one.

The snapshot sent is `toTransferPuzzle(grid, clues, { title, author:
username })`: the same `TransferPuzzle` the feed, the daily queue and every
`#puzzle=` link use (`puzzleNormalizer.ts:192-206`), so the play paths need
no new parser. Speed clues are not published in phase 1 (the solver does not
use them). `author` is the username at publish time; the page and the card
show the **live** username from `profiles` (a rename follows), and the
puzzle a player loads carries the live name too.

### 1.3 Updating and unpublishing

- **Update**: publishing a puzzle whose `studio_id` the author already
  published updates the row in place (`version` + 1, new snapshot, new
  `puzzle_key` and `content_hash` if the grid or title changed) and keeps
  its URL and counters. A player who solved the old version keeps that
  solve under the old key; the card no longer shows them as solved if the
  grid changed, which is right (it is a different puzzle). The studio's "My
  puzzles" list marks published entries with a chip ("Published · v2") and
  the page link.
- **Unpublish** (decision 3): a button on the author's own puzzle page and
  in the studio dialog. `unpublish_puzzle(id)` sets `status =
  'unpublished'`; the row leaves `/puzzles`, search, the author page and any
  later-phase lists at once; the page shows "This puzzle was unpublished by
  its author" to everyone but the author, who sees it with a **Publish
  again** button. The row is deleted by the nightly sweep 30 days after
  unpublishing unless republished (§4.3). This is the lightest rule that
  satisfies the terms' "you can unpublish at any time" and leaves room for
  an accidental click.
- What survives an unpublish, as the terms already say: rooms in progress
  (they play the `puzzles` copy `uploadPuzzle` made, which the retention
  sweep clears on its own schedule), players' solve records and best times
  (keyed by `puzzle_key`, no reference to the row), `play_sessions`, and a
  daily made from it (`daily_schedule.entry` is its own copy). Nothing is
  reached back into.

### 1.4 What the author sees

- Studio: the chip on "My puzzles" entries, and the dialog's Update /
  Unpublish / Copy link.
- `/account` (the account page, PR #142): a **Your puzzles** card listing
  the account's published puzzles with plays and solves, each linking to its
  page, and the author's held or removed puzzles with the reason ("Removed:
  copied from another publisher · 2026-11-02"). This is where the terms'
  "if we remove a puzzle after a notice, we tell its author" is met in phase
  1 (no email channel exists; §5 adds one).
- The public author page `/puzzles/by/:username` (§2.3).

### 1.5 Exporting a `.puz`

Added at Andrew's request (decision 14). The studio's Export becomes a
two-item menu, **`.ipuz`** (as today) and **`.puz`**: the Across Lite 1.3
binary layout (header, the two checksums over solution and grid, the CIB
and masked checksums, ISO-8859-1 strings: title, author, copyright, clues in
number order across-then-down per number, notes). `src/lib/seedgrid/puz.ts`
is a pure writer tested by round-tripping through `@xwordly/xword-parser`,
the parser the importer already uses, so what the studio writes is what
the importer reads back. Speed clues have no home in `.puz` and are left
out; circles and rebus squares do not occur in studio grids. The author
field is the username when signed in, else "Crossword Clash" as today.

---

## 2. Finding and playing

### 2.1 Browse: `/puzzles`

A `PageShell` screen in the classic library's shape (`ClassicLibraryScreen`),
chunk `communityBrowse` in `screenModules` (warmed on intent from the menu
row like every other screen).

- **Header**: "Community puzzles", subtitle "Crosswords made by players in
  the studio. Play them, race them, report what doesn't belong." A link to
  the studio ("Make your own") for the signed-out curious; it lands on the
  studio gate's pitch.
- **Sticky chip row** (the classics' `chipOn`/`chipOff`): size **Mini**
  (≤ 7) · **Midi** (8–10) · **Full** (11–15) · **Giant** (16+), the daily
  vocabulary rather than the classics' book-era buckets; difficulty Easy ·
  Medium · Hard; **Hide solved**; language **English · Español · All**,
  defaulting to the UI language. A **search box** (title and note; an
  `@name` query switches to the author filter).
- **Sort**: Newest (default), Popular (plays), Most solved (solves). This is
  the "public leaderboard of the most popular" from the direction, in its
  simplest form; a time-windowed "this week" strip is §5.
- **Cards**: the classics' anatomy with community fields: eyebrow `15×15 ·
  78 clues · Medium`, a solved chip with the best time (`useBestTimes()` by
  `puzzle_key`, as the classics do), title, "by @username" (a link to the
  author page), the note clamped to three lines, "Play solo" as the
  whole-card target and "Race friends" beside it, plus a quiet "N plays ·
  M solved" line. In-progress puzzles (the solo progress store, keyed by the
  same identity) get the archive's "In progress" chip.
- **Paging**: 24 per request through PostgREST `range`, a "Load more"
  button (not infinite scroll: the filter row must stay reachable and the
  back button must restore the list). The URL carries the filters and sort
  (`?size=full&sort=popular&q=birds`) so a filtered view is shareable and
  back/forward restore it.
- **Empty states**: nothing published yet ("Be the first: build one in the
  studio"), nothing for this filter, and the hidden-author note ("N puzzles
  by authors you hid aren't shown").
- **Data**: one PostgREST query against a view `community_puzzles` (§4.1)
  that exposes only published rows joined with the author's username;
  the device's hidden list (§3.4), applied to each page of results. No index
  file: unlike dailies and classics the list changes with every publish.

### 2.2 The puzzle page: `/puzzles/:id`

`id` is an 8-character `short_id` (`/puzzles/k7m3x2q9`), so a link fits in a
message. Chunk `communityPuzzle`.

- Title, "by @username" (link), published date, `15×15 · 78 clues ·
  Medium · English`, the author's note, "N plays · M solved".
- **Your status**: "Solved in 4:12" (best time), "In progress · 31 of 189
  filled" (solo progress store), or nothing.
- **Play** (primary) and **Race friends** (secondary), full width on phones.
- A `role="menu"` overflow (the `AccountControl` menu pattern) with **Share
  link** (copies the page URL; `shareText` when the platform has a sheet),
  **Report this puzzle** and **Hide puzzles by @username**. The author sees
  **Update in the studio**, **Unpublish** and **Copy link** instead.
- States: not found (404 copy), unpublished (the sentence in §1.3), held
  ("This puzzle is being reviewed"; the author sees the same with "You'll
  see the outcome on your account page"), removed (the author sees the
  reason; everyone else gets not found).
- Meta: `pageMetaFor` cannot know the title before the fetch; phase 1 sets
  `document.title` once loaded. An unfurl card for shared links (a
  `vercel.json` rewrite of `/puzzles/:id` to an `api/share.ts`-style
  function that splices the title and author into the shell with
  `spliceHead`) is a later phase; the daily link has one, so the pattern is
  ready.

### 2.3 Author pages: `/puzzles/by/:username`

The browse screen with the author filter fixed and a header: the username,
"N puzzles · M solves", and the same **Hide this author** in the overflow.
Nothing else about the person is shown (profiles hold nothing else). An
unknown or hidden username renders the empty list with its note.

### 2.4 Play and Race

Both reuse the classic library's handlers exactly:

- **Play**: fetch the row → `normalizeTransferPuzzle(row.puzzle)` with
  `author` replaced by the live username → `handleSoloPuzzleLoaded(puzzle)`,
  `setSoloTheme(null)` → `/solo/play`. The solo path writes no server rows
  (CLAUDE.md, PR #130); the progress store hydrates by identity, so a
  half-done community puzzle resumes like a daily.
- **Race friends**: `setUrlPuzzle(puzzle)` → `/host-game/name`; the host
  flow calls `uploadPuzzle` (deduped by hash into `puzzles`) and creates the
  room as today. The TV view (`/host`) gains nothing in phase 1; it can be
  handed a puzzle by link as it already can.
- **Solves**: `recordSolve` is called with `source: "community"` (a new
  value in the `solves.source` check, beside `daily` / `nyt` / `other`), so
  the account page's recent-solves list can label it and link to the page.
  It counts for the daily streak like any solo finish
  (`countsForDailyStreak` looks at mode, not source).
- **Completion modal**: unchanged in phase 1 except the share header, which
  uses the title as it does for any non-daily puzzle, and "Up next", which
  can later offer "Another by @username" (§5).
- **Counters**: a trigger on `play_sessions` increments `plays` on insert
  and `solves` when `completed` turns true, matched by `puzzle_key` (§4.1).
  A play is a player-session: a four-player room counts four plays. The
  numbers are "how much was this played", not an audited stat, and need no
  cron.

### 2.5 Menu, picker, Up next

- Menu: a third row in the solo list under "Past puzzles" and "Classic
  library" (`MenuScreen.tsx:311-322`): "Community puzzles · made by players"
  → `/puzzles`, `track("mode_selected", { mode: "community" })`. Hidden
  without `communityEnabled()`.
- The fresh-puzzle picker (`/pick-puzzle`) and "Up next" keep their current
  sources in phase 1. Adding "a community puzzle you haven't played" to
  both is a small later change once there is a stock to draw from.

### 2.6 The apps

Mobile mode reads Supabase directly, so browse, the page, Play, Race, Report
and Hide all work in the apps with no release gating beyond the chunk being
in the bundle. Publishing is web-only because the studio is (the route is
never registered in `--mode mobile`, `studioGate.ts:25`). Hide and Report
use the anonymous uid, so they work before native sign-in exists. A shared
`/puzzles/:id` link opens in the phone's browser, not the app (no universal
links; unchanged).

### 2.7 Phone layout and accessibility

Built with the `mobile-web` skill's rules, as the brief requires:

- One-column cards at phone width, 16 px gutters, no horizontal scroll; the
  chip row scrolls horizontally with hidden scrollbars as the classics' does.
- Every tap target ≥ 44 px: chips (`min-h-11` on phones), the overflow
  button, the Report dialog's radios as full-width rows.
- Inputs at 16 px on phones (`text-base md:text-sm`, the studio's own
  convention) so iOS Safari does not zoom the search box or the note.
- The page's two buttons sit above the fold; the overflow menu is reachable
  with a keyboard (arrow keys, Escape returns focus) exactly as
  `AccountControl`'s.
- No left-border accents anywhere: selected chips are filled (`chipOn`),
  the author's own puzzles get a tinted background, states use chips.
- `aria-live` on the Load more result count; the Report dialog is a labelled
  `dialog` with focus trapped.

---

## 3. Safety: reports, review and hiding

### 3.1 Report

**Recommendation (decision 6).** Anyone who can see the page can report it,
anonymous visitors included: the app stores require a report path for every
user, and most players are anonymous.

- The dialog: "What's wrong with this puzzle?" with four reasons, Andrew's
  three plus a catch-all: **Copied from another publisher**, **Offensive or
  hateful**, **Nonsense or broken**, **Something else**; an optional note
  (≤ 500 characters, 16 px font); Send. Copy under "Copied": "If it's your
  own work, our copyright page explains how to send a formal notice" with a
  link to `/copyright`, so a DMCA notice goes to the agent (PR #143) and a
  casual report goes to the queue.
- `report_puzzle(puzzle_id, reason, details)` (§4.2) refuses the author's
  own puzzle, a second open report by the same person on the same puzzle
  (the dialog then says "You've already reported this"), and more than 10
  reports in 24 hours per reporter. A report never reveals the reporter to
  the author.
- After sending: "Thanks. We review reports within a day." and the puzzle
  stays visible to the reporter unless the hold trips. `track("puzzle_reported",
  { reason })`.

### 3.2 Automatic holds

Three distinct reporters within seven days set `status = 'held'`: the
puzzle leaves every list and its page shows "being reviewed". One report
never hides anything on its own (a single grudge should not take a puzzle
down), and the admin can lower the threshold in the migration's constant
if abuse shows up. A dismissed report batch restores `published`. A hold is
also the only automatic consequence: there is no automatic removal and no
automatic strike.

### 3.3 The admin queue and alerts

**Recommendation (decision 7): a `Reports` panel in `/studio`**, rendered
where `DailyQueue` and `Insights` are (`adminPanels`,
`StudioScreen.tsx:76-77`), backed by a new `studio-moderate` edge function
gated by `studioAllowed` (token or `studio_admins`) with the service role,
like `studio-schedule` and `studio-insights`.

- **List**: open reports grouped by puzzle, held puzzles first, then by
  newest report: title, author, size, the reasons as counts ("copied ×2,
  nonsense ×1"), the notes, the author's prior removals and strikes, links
  to the page and a "Play test" link (the normal `#puzzle=` payload from the
  stored snapshot, so the admin can play a held puzzle that the page no
  longer serves).
- **Actions**: **Dismiss** (resolve every open report on the puzzle,
  `published` again); **Remove** (status `removed`, a reason from the same
  four plus "copyright notice", a note the author sees, `publishers.strikes`
  + 1); **Remove and stop this author** (also `publishers.banned_at`, and
  every other live puzzle of theirs → `removed` with reason "author
  blocked"); **Restore** (a removed puzzle back to `published`, for a
  counter-notice or a mistake). Every action writes `moderated_by`,
  `moderated_at` and `moderation_note` on the row.
- **Strikes**: three removals for "copied" make the next Remove default to
  "Remove and stop this author", the terms' repeat-infringer rule in
  practice. Closing the account itself stays a manual step through the
  Supabase dashboard.
- **Popular puzzles for the admin**: the `Insights` panel already lists every
  puzzle played in a window with opens, attempts and solves by `puzzle_key`;
  phase 1 adds a "community" tag to its rows (a join on
  `published_puzzles.puzzle_key`) so the admin view of what is popular is
  the existing panel, not a new one.

**Alerts (decision 8).** The terms promise action within 24 hours, which the
admin cannot keep without a push. Recommended: a Supabase Database Webhook on
`INSERT` into `puzzle_reports` → `report-alert` edge function (verifies the
webhook secret, reads the puzzle and report with the service role) → one
email per report to `LEGAL_CONTACT_EMAIL` through Resend's REST API
(`RESEND_API_KEY` secret; the sending domain has to be verified in Resend
once). Nothing else in the project sends email, so this is a new vendor.
The alternative is a daily look at the panel and the terms' "aim to",
which is honest but makes the 24 hours a hope.

### 3.4 Hide this author

**Ruled 2026-10-27 (decision 9): a local list, no server table.** Andrew
judged the table too much machinery for a niche use; the store rule (§3.5)
still needs *a* way to block, so the feature stays in its lightest form.

- `hiddenAuthors` in `src/lib/communityPuzzles.ts`: a localStorage list of
  author ids (`crossword-clash:hidden-authors`), read once per screen and
  applied to the browse results on the client (a hidden author's cards are
  dropped from the page of 24 and the result count says "N hidden"), and to
  the puzzle page (which shows "You hid this author" with **Show again**
  instead of the puzzle).
- "Hide puzzles by @name" sits in the page's and the author page's overflow
  menu; the author page's header is where it is undone.
- It is per device and dies with the browser's storage, like an anonymous
  player's best times. If it ever matters, the recommended table
  (`hidden_authors (user_id, author_id)` under `auth.uid() = user_id`) is a
  one-migration upgrade with the same client API.

It hides puzzles, not people: a hidden author can still join the viewer's
rooms by code, which is a different feature and out of scope.

### 3.5 Store rules

Apple App Review Guideline 1.2 (user-generated content) and Google Play's
User Generated Content policy both ask for the same four things; where each
is met:

| Requirement | Met by |
|---|---|
| A method for filtering objectionable material | The publish checks (§1.2): the word filter on title, note and clues; the duplicate and "ours" refusals; structural checks |
| A mechanism to report offensive content, with timely responses | Report (§3.1), the hold (§3.2), the queue and the alert (§3.3), the terms' 24-hour line |
| The ability to block abusive users | Hide this author (§3.4) |
| Published contact information | `/support` and the legal contact address, already on every legal page |

The App Store listing's content rating may need "Infrequent/Mild User
Generated Content" ticked at the next submission; `docs/app-store/README.md`
and `docs/play-store/README.md` get a line each.

### 3.6 Copyright

PR #143's `/copyright` page is the DMCA process: the designated agent, what a
notice must contain, counter-notices, repeat infringers. This spec adds
only: a "copyright notice" removal reason in the queue, **Restore** for a
successful counter-notice, and the 30-day retention of a removed puzzle's
snapshot (§4.3) so a restore has something to restore. The page's "Where
puzzles live" paragraph gains one sentence about published puzzles (§4.4).

---

## 4. Data model, writes, retention, legal text, limits, switch

### 4.1 Tables

```sql
-- 20261028000000_community_puzzles.sql (sketch)

CREATE TABLE publishers (
  user_id            UUID PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  terms_accepted_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  terms_version      TEXT NOT NULL,            -- PUBLISHING_TERMS_VERSION at acceptance
  strikes            INT NOT NULL DEFAULT 0,
  banned_at          TIMESTAMPTZ,
  ban_reason         TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- RLS: select own. Insert only through accept_publishing_terms(); no client update/delete.

CREATE TABLE published_puzzles (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  short_id         TEXT NOT NULL UNIQUE,                   -- 8 chars, the URL; set by publish_puzzle
  author_id        UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  studio_id        TEXT NOT NULL,                          -- StudioState.id; one row per (author, studio puzzle)
  version          INT NOT NULL DEFAULT 1,
  status           TEXT NOT NULL DEFAULT 'published'
                   CHECK (status IN ('published', 'held', 'unpublished', 'removed')),
  title            TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 80),
  notes            TEXT NOT NULL DEFAULT '' CHECK (char_length(notes) <= 280),
  difficulty       TEXT NOT NULL CHECK (difficulty IN ('easy', 'medium', 'hard')),
  lang             TEXT NOT NULL CHECK (lang IN ('en', 'es')),
  width            SMALLINT NOT NULL, height SMALLINT NOT NULL, clue_count SMALLINT NOT NULL,
  puzzle           JSONB NOT NULL,                         -- TransferPuzzle, as daily_schedule.entry.puzzle
  puzzle_key       TEXT NOT NULL,                          -- puzzleIdentity(): badges, progress, solves, play_sessions
  content_hash     TEXT NOT NULL,                          -- puzzleContentHash(): "already published" check
  plays            INT NOT NULL DEFAULT 0,
  solves           INT NOT NULL DEFAULT 0,
  last_played_at   TIMESTAMPTZ,
  published_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  unpublished_at   TIMESTAMPTZ,
  removed_reason   TEXT,                                   -- shown to the author
  moderated_by     UUID, moderated_at TIMESTAMPTZ, moderation_note TEXT,
  search           TSVECTOR GENERATED ALWAYS AS (to_tsvector('simple', title || ' ' || notes)) STORED,
  UNIQUE (author_id, studio_id)
);
CREATE UNIQUE INDEX published_puzzles_live_hash ON published_puzzles (content_hash) WHERE status IN ('published', 'held');
CREATE INDEX published_puzzles_key ON published_puzzles (puzzle_key);
CREATE INDEX published_puzzles_browse ON published_puzzles (status, lang, published_at DESC);
CREATE INDEX published_puzzles_search ON published_puzzles USING GIN (search);
-- RLS: select where status = 'published' OR author_id = auth.uid(). No client insert/update/delete
-- (publish_puzzle / unpublish_puzzle are SECURITY DEFINER and check the JWT themselves).

CREATE VIEW community_puzzles WITH (security_invoker = true) AS
  SELECT p.id, p.short_id, p.author_id, pr.username AS author, p.title, p.notes, p.difficulty, p.lang,
         p.width, p.height, p.clue_count, p.puzzle_key, p.plays, p.solves, p.published_at, p.updated_at, p.search
  FROM published_puzzles p JOIN profiles pr ON pr.user_id = p.author_id
  WHERE p.status = 'published';
-- The list never carries `puzzle` (a 15×15 is ~4 KB; 24 cards would be 100 KB); the page fetches the row by short_id.

CREATE TABLE puzzle_reports (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  puzzle_id    UUID NOT NULL REFERENCES published_puzzles (id) ON DELETE CASCADE,
  reporter_id  UUID REFERENCES auth.users (id) ON DELETE SET NULL,
  reason       TEXT NOT NULL CHECK (reason IN ('copied', 'offensive', 'nonsense', 'other')),
  details      TEXT NOT NULL DEFAULT '' CHECK (char_length(details) <= 500),
  status       TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'dismissed', 'upheld')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at  TIMESTAMPTZ
);
CREATE UNIQUE INDEX puzzle_reports_one_open ON puzzle_reports (puzzle_id, reporter_id) WHERE status = 'open';
-- RLS: no client policies at all (insert through report_puzzle; reads by the admin function with the service role).

-- (No hidden_authors table: decision 9 was ruled a local list, §3.4.)

ALTER TABLE solves DROP CONSTRAINT solves_source_check,
  ADD CONSTRAINT solves_source_check CHECK (source IN ('daily', 'nyt', 'community', 'other'));

-- Counters: a trigger on play_sessions (AFTER INSERT, and AFTER UPDATE OF completed when it turns true)
-- does UPDATE published_puzzles SET plays = plays + 1 [, solves = solves + 1], last_played_at = now()
-- WHERE puzzle_key = NEW.puzzle_key AND status IN ('published', 'held').
```

Why these shapes:

- **`author_id → auth.users ON DELETE CASCADE`** is the CLAUDE.md rule for
  any new user-id column and makes decision 10 a one-liner.
- **`puzzle_key`** is what every existing reader keys on, so solved chips,
  the progress store, the account page and the insights panel work with no
  new identity. **`content_hash`** is the existing `puzzles.file_hash`
  function, so "already published" and "is this room's puzzle a published
  one" are the same computation.
- **A view for the list** keeps the author's username live and the heavy
  `puzzle` column off the list query; `security_invoker` keeps RLS in force.
- **Reports have no client policies**: a reporter must not read other
  reports (or learn who reported them), and the admin reads with the
  service role. The RPC is the only door in.
- **`short_id`** rather than the uuid in URLs: readable in a chat message,
  and not enumerable in practice (8 characters from a 32-letter alphabet).

### 4.2 Writes: RPCs and the admin function

**Recommendation (decision 11): RPCs for users, an edge function for the
admin.** The project already writes user rows through `record_solves(jsonb)`
and admin rows through `studio-*` functions.

| Call | Who | Does |
|---|---|---|
| `accept_publishing_terms(p_version text)` | non-anonymous JWT | upserts the caller's `publishers` row with `terms_version` |
| `publish_puzzle(p_studio_id, p_title, p_notes, p_difficulty, p_lang, p_puzzle jsonb, p_puzzle_key, p_content_hash)` → `(id, short_id, version)` | non-anonymous JWT, a `publishers` row with no `banned_at`, a `profiles` row | checks: `p_puzzle` shape (`size.rows × size.cols` = `grid.length`, 3–25 a side, `clues.across` / `clues.down` arrays, `jsonb_pretty` length ≤ 64 KB), lengths, enums; **limits**: ≤ 10 publishes by this author in 24 h, ≤ 100 live rows per author; **duplicate**: another author's live row with this `content_hash` → `already_published`; **upsert** on `(author_id, studio_id)`: insert with a fresh `short_id`, or update (`version` + 1, status back to `published` from `unpublished`; a `held` or `removed` row is **not** republishable by the author: `under_review` / `removed`) |
| `unpublish_puzzle(p_id uuid)` | the author | `published` → `unpublished`, `unpublished_at` |
| `report_puzzle(p_puzzle_id uuid, p_reason text, p_details text)` | any JWT (anonymous ok) | refuses own puzzle, a non-published puzzle, a second open report (the unique index), > 10 reports by this reporter in 24 h; inserts; then counts distinct open reporters in 7 days and sets `held` at 3 |

All four are `SECURITY DEFINER` with `search_path` pinned and `auth.uid()` /
`auth.jwt()` read inside (the `has_entitlement` precedent), granted to
`authenticated` only. The client's `communityPuzzles.ts` wraps them and maps
the error codes (`not_signed_in`, `no_username`, `terms`, `banned`,
`rate_limited`, `too_many`, `already_published`, `under_review`, `removed`,
`invalid`) to copy.

`studio-moderate` (edge function, `studioAllowed`, service role):
`{ action: "queue" }` → held and reported puzzles with reports and the
author's `publishers` row; `{ action: "dismiss" | "remove" | "ban" |
"restore", puzzleId, reason?, note? }`. `report-alert` (decision 8) is a
second, tiny function.

What the client computes and the server trusts: `puzzle_key` and
`content_hash`. A forged key only breaks the forger's own badges and
counters; a forged hash dodges the duplicate refusal, which reports then
catch. Computing either in SQL would need the canonical JSON rules of
`puzzleHash.ts` reimplemented in PL/pgSQL for no real gain.

### 4.3 Retention and deletion

- **Account deletion (decision 10)**: `published_puzzles` and `publishers`
  cascade with `auth.users`;
  `puzzle_reports.reporter_id` is set null so the audit row stays. Nothing
  is added to `delete-account`'s `OWNED_TABLES`; its doc comment lists the
  new cascades and the migration test checks every new user-id column has
  an `ON DELETE`. A deleted author's puzzles vanish from the site at once;
  a daily already made from one survives in `daily_schedule` (its own
  copy), as the terms' "past daily puzzles may keep it" allows. The
  retention sweep's idle-anonymous-user rule needs no new exclusion: an
  anonymous user owns no published puzzles, and their reports survive the
  deletion with `reporter_id` null.
- **`retention_sweep()`** is redefined (the newest definition wins;
  `retentionMigration.test.ts` reads the newest file) with three steps and
  three named constants: `unpublished` rows older than 30 days deleted;
  `removed` rows older than 30 days get `puzzle` blanked to `'{}'` (the
  stub keeps title, author, reason and strikes for the author's record; 30
  days covers the counter-notice's 10–14 business days); resolved reports
  older than 365 days deleted (open ones never). Held puzzles are never
  touched by the sweep.
- **Live puzzles live until unpublished, removed or the account goes**: the
  one new thing on the server that does not expire on its own, and the
  privacy policy's retention paragraph says so.
- Rooms' `puzzles` copies, `play_sessions` and `solves` keep their existing
  windows; nothing here references them.

### 4.4 Privacy policy, terms and the copyright page

**Terms (decision 12).** Take PR #90's three sections verbatim into
`legalContent.ts` (en + es): "Publishing puzzles" (licence, credit, "we do
not pay", unpublish and what survives), "Community rules" (the four
prohibitions), "Reports, removal and blocking" (report, 24 hours, removal,
hide, appeal by email). Keep its acceptable-use edit ("display names, puzzle
titles, clues or any other text"). Drop its "Copyright complaints (DMCA)"
and "Counter-notices and repeat infringers" sections: PR #143's terms
paragraph already sends readers to `/copyright`, which holds all of it.
Amend "Puzzles and your content": "…stay in your browser until you host,
share or **publish** them". Bump `LEGAL_LAST_UPDATED`. The publish dialog
links `/terms#publishing` (`LegalPage` renders headings; an `id` from the
heading is a small addition).

`PUBLISHING_TERMS_VERSION` (a constant in `legalContent.ts`, the date of the
last change to those sections) is what `accept_publishing_terms` records;
changing it re-shows the checkbox.

**Privacy policy**: a new paragraph in "Information stored on our servers
(Supabase)" (en + es; this is the draft):

> **Published puzzles, reports and hidden authors.** If you publish a puzzle
> from the studio, we store the puzzle (grid, clues, title and your note),
> your account ID, the language and difficulty you chose, when you
> published it, and how many times it was played and solved. The puzzle and
> these counts are public and shown under your username. We keep it until
> you unpublish it (then for 30 more days, in case you change your mind) or
> we remove it (then for 30 days, in case of a counter-notice), or until you
> delete your account. If you report a puzzle, we store the puzzle, your
> reason and note, and your ID (anonymous or account) so we can stop abuse
> of reporting; the author never sees who reported them, and the report is
> kept for a year after it is resolved. If you hide an author, we store that
> choice against your ID so every device you sign in on respects it. When we
> remove a puzzle or stop an account from publishing, we record the reason
> and who decided.

"Retention and your choices" gets the same windows in a clause.

**Copyright page** (`/copyright`, PR #143), "Where puzzles live": add "A
puzzle an author publishes to the community library is stored on our
servers and shown under their username until they unpublish it or we remove
it; a removed puzzle is kept for 30 days in case of a counter-notice, then
deleted."

`legal.test.tsx`'s placeholder check and `i18n.test.ts`'s key parity cover
the new text.

### 4.5 Abuse limits

| Limit | Value | Enforced |
|---|---|---|
| Publishes per author | 10 per 24 h | `publish_puzzle` |
| Live puzzles per author | 100 | `publish_puzzle` (Plus could lift this later; nothing reads Plus here in phase 1) |
| Puzzle size | 3–25 a side; snapshot ≤ 64 KB (a 15×15 transfer is ~4 KB; `studio-schedule` allows 200 KB) | client checks + `publish_puzzle` |
| Title / note / clue | 80 / 280 / `CLUE_MAX` characters | client + SQL `CHECK` (title, note) |
| Reports per reporter | 10 per 24 h; one open per puzzle | `report_puzzle` |
| Hold threshold | 3 distinct reporters in 7 days | `report_puzzle` constant |
| Browse page | 24 rows; search query ≤ 80 chars | client |
| Word filter | `isObjectionableName` over title, note, clues | client (reports and the queue are the backstop) |

No CAPTCHA, no per-IP rule: every write needs a Supabase JWT, which already
costs an anonymous sign-in, and the per-user counts are cheaper than the
`narrator_usage` IP table for this volume.

### 4.6 Launch switch

**Recommendation (decision 13): `VITE_COMMUNITY=1`.** `communityEnabled()`
in `src/lib/community.ts` gates: the `/puzzles` routes in `routes.tsx` (like
`studioRouteEnabled()`), the menu row, the studio's Publish button and the
account page's cards. Off, the build is byte-for-byte today's behaviour
apart from the legal text, which can ship ahead (it describes what a
published puzzle is; nobody can publish until the switch flips). The
migration and the functions are inert without callers, so `db push` and
`functions deploy` can happen with the merge. No server-side switch is
needed: with no route there is no caller, and the RPCs require accounts
that only the studio build offers a Publish button to.

Flip order for Andrew: register the DMCA agent and merge #143 → merge this
PR, push the migration, deploy `studio-moderate` (and `report-alert` with
the Resend key and the database webhook if decision 8 is yes) → set
`VITE_COMMUNITY=1` on Vercel → publish one puzzle from the admin account to
seed the list.

---

## 5. Later phases (not in the first build)

1. **Kudos**: `puzzle_kudos (puzzle_id, user_id, created_at)`, one per
   person per puzzle, any JWT; a "Nice puzzle 👏" on the completion modal
   for community puzzles; a count on the card and the page ("12 👏"); a
   **Most liked** sort. This is Andrew's "compliment on finishing".
2. **Notifications**: an unread count on the account page ("3 new kudos on
   *Birds of a feather*") computed from `puzzle_kudos.created_at >
   publishers.last_seen_kudos_at`; email digests need an address (Apple can
   hide it) and the `report-alert` sender, so they come after decision 8.
3. **Promote to daily**: an admin-only "Schedule as daily" on the queue
   and the puzzle page, calling `studio-schedule` with the stored snapshot
   (the terms licence covers featuring; the author is credited). Keeps the
   daily admin-curated.
4. **A public "this week" strip** on `/puzzles` (most solved in 7 days from
   `play_sessions`), the public leaderboard proper.
5. **Publishing an uploaded file** from the importer (`.puz`/`.ipuz`), the
   same dialog and RPC; raises the copied-puzzle risk, so it waits for the
   queue to have run a while.
6. **Picker and Up next**: "a community puzzle you haven't played", and
   "Another by @username" after a finish.
7. **Unfurl card** for `/puzzles/:id` through a share-style rewrite.
8. **Per-puzzle leaderboards** once `verified_seconds` exists (leagues
   spec), so a public board cannot be gamed by a client-reported time.
9. **Author profiles** beyond the username (a one-line bio) if authors ask.

---

## 6. Open questions (things to find out, not decisions)

1. Resend's free tier and domain verification for `crosswordclash.com` (SPF
   and DKIM records on Vercel DNS); whether Andrew would rather alerts go to
   a personal address than the legal contact.
2. Whether App Store Connect's age rating questionnaire needs a change for
   user-generated content at the next submission.
3. PostgREST `textSearch` with the `simple` configuration on a generated
   column: confirm the view carries the column through (it should; a view
   column of type `tsvector` is filterable).
4. The `solves_source_check` constraint's actual name in production
   (Postgres names it from the table and column; the migration should
   drop by looking it up or use a known name).

---

## 7. Build plan for phase B (after the rulings)

Worktree branch `claude/community-puzzles`, one PR against `main`, stacked
on nothing (it references #143's page by path only).

| Step | Files | Tests |
|---|---|---|
| Migration + RPCs + view + trigger + sweep step | `supabase/migrations/20261028000000_community_puzzles.sql` | `communityMigration.test.ts` reads the SQL: RLS on every table, no client write policies on `published_puzzles` / `puzzle_reports`, cascades, the partial unique hash index, the status vocabulary, the sweep's new constants; `retentionMigration.test.ts` updated to the newest definition |
| Pure helpers + client | `src/lib/community.ts` (switch), `src/lib/communityPuzzles.ts` (`publishProblems`, `toPublishSnapshot`, `sizeBucketOf`, `browseQuery` (filters → PostgREST params), the RPC wrappers, `hiddenAuthors` store) | `communityPuzzles.test.ts`: every refusal of `publishProblems`, the "ours" check against index + manifest, `browseQuery` for each filter/sort, RPC error mapping against a mocked client |
| Studio: Publish dialog, My puzzles chip, `.puz` export | `src/components/Studio/PublishDialog.tsx`, `StudioScreen.tsx`, `PuzzleList`, `src/lib/seedgrid/puz.ts` | `PublishDialog.test.tsx`: terms checkbox once, username step, problems listed, success → link |
| Browse + page + author page | `src/screens/CommunityBrowseScreen.tsx`, `CommunityPuzzleScreen.tsx`, `src/components/CommunityList.tsx` (the classics' card anatomy; `ClassicList` stays as is), routes + `routeModules` chunks, menu row, `pageMetaFor` | `CommunityBrowseScreen.test.tsx` (filters → query, hidden authors excluded, load more, empty states), `CommunityPuzzleScreen.test.tsx` (play → solo path, race → host path, states, author's own view) |
| Report + hide | `ReportDialog.tsx`, overflow menu, the local hidden list | `ReportDialog.test.tsx`, hide/unhide in the screen tests |
| Admin queue | `src/components/Studio/Reports.tsx`, `supabase/functions/studio-moderate/index.ts` (+ `report-alert` if decision 8) | `Reports.test.tsx` against a mocked function; `deno check` |
| Legal + i18n | `legalContent.ts` (en + es, terms from #90, privacy paragraph, copyright sentence), `en.json` / `es.json` `community.*` | existing `legal.test.tsx`, `i18n.test.ts` |
| Docs | CLAUDE.md bullet, `docs/app-store/README.md` + `docs/play-store/README.md` UGC lines, screenshots in `docs/community-puzzles/` at phone and desktop widths | — |

Effort, one engineer: migration and RPCs 1 day; helpers and tests 1 day;
publish dialog ½; browse, page and author page 1½; report and hide ½; admin
queue and function 1; legal, i18n and docs ½; screenshots and a phone pass
½. About six and a half days, kudos excluded.

---

## Decision record

| Date | Decision | Outcome |
|---|---|---|
| 2026-10-15 | Andrew's direction: community repository, reports not an up-front check, kudos and notifications, admin popular view + public leaderboard, daily stays curated, no Claude taste pass | The frame of this spec |
| 2026-10-20 | PR #90 reduced to the publishing/community/DMCA terms, held until publishing ships | §4.4 reuses its three sections |
| 2026-10-27 | DMCA split out as PR #143 (`/copyright`, designated agent) ahead of the Plus flip | §3.6: this spec points at it; #90's DMCA sections are dropped |
| 2026-10-27 | Spec written; decisions 1–14 put to Andrew | Rulings below |
| 2026-10-27 | Andrew: "Hide this author" is too much machinery for a niche use; add a `.puz` export; otherwise accept all | Decision 9 trimmed to a local list (§3.4), decision 14 added (§1.5); phase B started the same day |
| 2026-10-28 | Phase B built (PR `claude/community-puzzles`). Two build-time deviations: retention is a separate `community_sweep()` with its own cron at 04:37 UTC (the `solo_progress_sweep` precedent, so `retention_sweep()` keeps one definition and its test holds), not a third redefinition as §4.3 said; and `published_puzzles.author_id` / `publishers.user_id` reference `profiles (user_id)` (which cascades from `auth.users`), so a username is enforced by the key and PostgREST can join it. The `/copyright` sentence (§4.4) waits for PR #143 to merge; the Insights "community" tag (§3.3) and the `/puzzles/:id` unfurl card are not in this PR | Screenshots in `docs/community-puzzles/` |
