# Plus expansion: bonus puzzles, friend races, deeper stats, streak freeze, the Plus badge

Written 2026-11-12. Spec only: no application code changes. Claims about the
current code cite a file (line numbers are from `main` at 4c70878); numbers not
read from the code are marked as estimates.

Context: Plus today ($3.99/month, $24.99/year, first month free) sells the
archive past 30 days, the studio, the AI host on the TV view and synced
progress (`plus.benefit*` in `src/i18n/en.json:734-737`). Andrew's read
(2026-11-12): someone who only solves has enough free puzzles never to need
Plus. This spec adds four features aimed at the daily solver (bonus puzzles,
friend races, deeper stats, streak freeze and repair) and a Plus badge that
makes membership visible. Host and league perks (team mode, larger leagues,
season history) are deferred: worth doing once rooms and leagues show use,
and the bigger lift.

The principle throughout: Plus **adds** to what free players do every day; it
takes nothing they have today away.

---

## Decisions needed from Andrew

Each has a recommendation; the reasoning is in the section named.

| # | Decision | Recommendation | Where |
|---|---|---|---|
| 1 | Bonus cadence and size | **One themed bonus a week**, published Saturday (local day), 11×11 to 15×15, from the SeedGrid themed pipeline you already review | §1.1 |
| 2 | Free taste of the bonus | **Free players see the card, title, theme and grid shape every week, and may play one bonus a month** (the first of the month); everything else opens the Plus pitch | §1.2 |
| 3 | Who may race a recorded solve | **A friend's daily solves are raceable by their accepted friends**, with a setting "Let friends race my solves" (default on). Ghosts show *which squares* the friend filled and when, never the letters | §2.3 |
| 4 | Friend races free vs Plus | **Free: race a friend on today's three dailies.** Plus: any archive day, your own best as a ghost, up to three friends at once | §2.2 |
| 5 | Deeper stats free vs Plus | **Free: this week's times and your streak (as now). Plus: the full Stats page** (trends, percentiles, head-to-head with friends, slowest clues) | §3.2 |
| 6 | Streak freeze | **Plus earns one freeze a week, banks up to two; a missed day uses one automatically** | §4.2 |
| 7 | Streak repair | **Plus: a missed day can be repaired within 7 days by solving that day's daily.** Free players see the offer and the Plus pitch | §4.3 |
| 8 | Badge design | **Option B, the gold seal**: the Plus pitch and menu already mark Plus with gold, gold is the app's colour for earned things, and it avoids reading as identity verification. Option A (blue seal) is the closest to Instagram's tick if you prefer that | §5.1 |
| 9 | Badge visibility | **On by default, with "Show my Plus badge" in the account page**; the badge appears wherever a signed-in account's name does | §5.2 |
| 10 | Order | **Badge → streak freeze/repair → bonus puzzles → stats → friend races** (smallest and most visible first; races last because they need a new recording) | §7 |

---

## 0. What exists today (the code this builds on)

| Area | Today | Where |
|---|---|---|
| Daily feed | Static JSON per day and slot (`public/daily-puzzles/{day}.json`, `{midi,large}/{day}.json`), or the `daily_schedule` table through `api/daily.ts`; **fully public, solutions included**, `Access-Control-Allow-Origin: *` | `src/lib/dailyFeed.ts:78-84`, `vercel.json`, `proxy.ts:26-47` |
| Slots | `DAILY_SLOTS = ["mini","midi","large"]`, one puzzle per slot per day; a slot list is repeated in `api/daily.ts:20`, `proxy.ts:26`, `dailyIndex.ts:46`, `archive.ts:90`, `nextUp.ts:21`, vercel.json rewrites and SQL CHECKs | `src/lib/dailyFeed.ts:31-32`, `20261018000000_daily_midi_slot.sql:5-9` |
| Puzzle identity | djb2 hash of title + size + solution (`puzzleIdentity`), the key for best times, `solves`, `solo_progress`, `play_sessions` | `src/lib/soloStats.ts:128-134` |
| Plus checks | Client `plusEnabled()` + `usePlusStatus`; server `has_entitlement()` (SECURITY DEFINER), `PLUS_GATES=1`. Server-side gates exist only for metered AI (narrator, studio-claude) and the `solo_progress` RLS | `src/lib/plus.ts`, `supabase/functions/_shared/plusAccess.ts:16-43`, `20261024000000_entitlements.sql:114-131` |
| Archive lock | **UI only**: Play/Race are hidden for locked days, but the JSON is public and `/daily/:day/:slot` does not check the lock | `src/lib/archive.ts:52-68` |
| Streaks | Consecutive local days with a qualifying finish (`countsForDailyStreak`: any solo finish or a daily race); assisted (revealed) finishes don't count; accounts derive the streak from `solves` rows (`streakFromDays`); **no freeze or repair** | `src/lib/solveHistory.ts:106,128,142`, `src/lib/soloStats.ts:192-218,308-319` |
| Stats data | `solves` (owner-only; seconds, source, mode, day), `daily_results` (public; day, slot, seconds), `play_sessions.clues` (owner-only; per-clue first focus, solved at, wrong letters, order; blanked after 180 days; only sent in the apps or with analytics consent) | `20261017300000_solves.sql`, `20260701000000_daily_race.sql:16-51`, `src/lib/playInsights.ts:26-41` |
| Stats UI | Daily streak, NYT streak, solve count, recent solves with times; no history, averages or charts | `src/screens/AccountScreen.tsx:189-212,395-419` |
| Friends | `friendships` + `friend_solves(puzzle_key)` (who solved, never times or letters); the friends spec says friends see no streaks, times or activity, though daily times are public on the board, which has a friends filter | `20261101000000_friends.sql`, `20261104000000_friend_solves.sql:12-34`, `docs/friends-spec.md:160-162`, `src/screens/DailyLeaderboardScreen.tsx:169-181` |
| Ghosts | `challenge.ts` already races a challenger's **finish time** from URL params (`cf`/`ct`), and `?beat=&by=` on dailies; **no solve is recorded move by move anywhere** (rooms broadcast cells without timestamps) | `src/lib/challenge.ts:1-14,117`, `src/lib/dailyChallenge.ts:1-18`, `src/hooks/useMultiplayer.ts:591-640` |
| Names | `profiles.username` (public) for friends; free-text `display_name` copied into `players` and `daily_results` for rooms and the board; **no badge component** | `20261017100000_profiles.sql`, `src/components/Friends/PersonRow.tsx:37` |
| Plus status privacy | `entitlements` rows are owner-only, but `has_entitlement(p_user, …)` is granted to `authenticated`, so any session can ask about any user id | `20261024000000_entitlements.sql:60-62,114-131`, `20261104100000_rpc_anon_revoke.sql:13` |

---

## 1. Bonus puzzles

### 1.1 Product

A weekly themed puzzle that only Plus can play: "This week's bonus" on the
menu beside the dailies, with its title, theme line and grid shape
(`MiniGridThumb`). It publishes on Saturday (the player's local day, like the
dailies) and stays playable for Plus forever; past bonuses get a row per
week in the archive.

Size 11×11 to 15×15, built with `pnpm seedgrid:large` from the themes
backlog (`docs/large-puzzle-themes.json`) and reviewed by you as the dailies
are. A themed weekend puzzle is the format solvers already pay for elsewhere
(the New York Times' bonus puzzles), and it costs one review a week.

### 1.2 Free versus Plus

Free players see the card every week (title, theme, shape, "N solvers this
week") and may play **one bonus a month**: the first one published in each
calendar month, so they taste it. Every other bonus opens the Plus pitch
(`paywall_viewed { placement: "bonus", feature: "bonus" }`, a new
`PlusFeature`).

### 1.3 Delivery: the bonus must not be a public file

The daily feed is public with its solutions (§0), and the archive lock is
only a hidden button. A bonus served the same way would be free to anyone
who reads the network tab. So bonuses live in the database:

```sql
create table bonus_puzzles (
  week      date primary key,          -- the Saturday it publishes
  title     text not null,
  theme     text,
  author    text not null default 'Crossword Clash',
  width     int  not null,
  height    int  not null,
  blocks    text not null,             -- the grid shape only, for the card
  identity  text not null,             -- puzzleIdentity(), for solve history
  puzzle    jsonb not null,            -- the full transfer puzzle, answers included
  created_at timestamptz not null default now()
);
alter table bonus_puzzles enable row level security;
-- No select policy on the table itself: nobody reads `puzzle` directly.

-- The card: metadata for released weeks, for everyone.
create view bonus_cards as
  select week, title, theme, author, width, height, blocks, identity
  from bonus_puzzles where week <= (now() at time zone 'utc')::date + 1;

-- The puzzle: Plus, or the month's free one.
create function bonus_puzzle(p_week date) returns jsonb
  language sql security definer stable as $$
  select puzzle from bonus_puzzles
  where week = p_week and week <= (now() at time zone 'utc')::date + 1
    and (has_entitlement(auth.uid(), 'plus')
         or week = (select min(week) from bonus_puzzles
                    where date_trunc('month', week) = date_trunc('month', p_week)));
$$;
```

Release uses the same "UTC date + 1" rule as the dailies (`proxy.ts:38-47`),
so a player ahead of UTC sees it on their Saturday. The client caches a
fetched bonus in localStorage so it plays offline afterwards.

**Publishing:** `pnpm bonus:add <week> <puzzle.ipuz> ["Theme"]` writes the row
with the service key (the way `daily:add` writes files), and the studio's
daily queue gains a "Bonus" lane for admins. The bonus never enters
`public/daily-puzzles/`, the index files or `proxy.ts`.

**Not a fourth slot.** Adding `bonus` to `DAILY_SLOTS` would touch a dozen
places that assume one puzzle per slot per day (§0) and would make it public
through `daily_schedule`'s "started days are public" policy. It is its own
small module (`src/lib/bonus.ts`) that the menu, archive and Up next read.

### 1.4 History, streaks and boards

- A bonus finish records a `solves` row with `source: 'bonus'` (extend the
  CHECK) and counts for the streak like any solo finish (§0).
- A weekly bonus board reuses `daily_results` with `slot = 'bonus'` and
  `day = week` (extend its CHECK). Times are public as they are for the
  dailies; that is fine because the puzzle is not.
- Analytics: `bonus_viewed`, `bonus_started { free_taste }`,
  `bonus_completed`.

### 1.5 Effort (estimate)

3–5 days: migration and RPC, the `bonus:add` script, the menu card and
archive rows, the paywall placement, tests. Plus about 1 hour a week of your
review per puzzle.

---

## 2. Friend races (racing a recorded solve)

### 2.1 Product

On any daily a friend has finished, "Race Sam's solve" starts the puzzle
with Sam's progress playing beside yours: their clock, a bar for how much of
the grid they've filled, and the squares they fill appearing as a soft tint
on your grid at the moment they filled them, **without their letters**. Beat
their time and the result card says so ("You beat Sam by 0:12"); the friend
gets a "Sam's solve was raced" notice through the existing invites table.

This is the async half of the roadmap's open F4 question (`ROADMAP.md:81-93,
125-126`) and an upgrade of `challenge.ts`, which already races a finish
time from a link.

Entry points:
- the friends filter on the daily board ("Race" beside each friend's time);
- the friend's "Solved" chip on a puzzle (`SolveChip`);
- the completion screen ("Race a friend's solve of this").

### 2.2 Free versus Plus

| | Free account | Plus |
|---|---|---|
| Race a friend on today's mini, midi, large | yes | yes |
| Race a friend on any archive day or bonus | — | yes |
| Race your own best solve | — | yes |
| Several friends at once (up to 3 ghosts) | — | yes |

Free gets the viral part (a friend sees "race me" and plays today); Plus
gets everything that turns it into a habit.

### 2.3 Recording a solve

Nothing records a solve move by move today (§0), so this is the new part.

**What's recorded:** during a solo daily or bonus, append `[ms, cell, letter]`
for every letter written or erased, where `ms` is active time (the solo pause
already stops the clock). A 15×15 is roughly 200–400 events, about 2–4 KB as
compact JSON (estimate). Only finishes without reveals are kept, matching the
streak and board rules.

```sql
create table solve_traces (
  user_id     uuid not null references profiles(user_id) on delete cascade,
  puzzle_key  text not null,
  seconds     int  not null,
  events      jsonb not null,           -- [[ms, cell, letter], …]; letter '' for an erase
  created_at  timestamptz not null default now(),
  primary key (user_id, puzzle_key)     -- your best (fastest) solve replaces a slower one
);
alter table solve_traces enable row level security;
create policy "own traces" on solve_traces for all using (auth.uid() = user_id);
```

**Reading a friend's trace:** `friend_trace(p_friend uuid, p_puzzle_key text)`
(SECURITY DEFINER) returns `{seconds, events}` with the letters **stripped to
"filled" / "erased"** when the caller is an accepted, unblocked friend and
the friend's `race_my_solves` setting (a new `profiles` column, default
true) is on. The server strips the letters so a ghost can never be used to
cheat the board. The board's existing time rule is unaffected.

Retention: traces older than a year are deleted by `retention_sweep()`. Only
accounts record (the trace needs a profile), and the "Let friends race my
solves" setting lives on the account page next to the badge setting (§5.2).

### 2.4 Playing a ghost

A `useGhost(events)` hook advances an index by the player's own active
clock, paints the friend's filled cells into a `ghostCells` set the grid
draws as a tint below the player's letters, and shows the ghost's clock and
fill bar in the header. It pauses with the solo pause. On finish,
`compareToChallenge` (`challenge.ts:117`) produces the result.

### 2.5 Effort (estimate)

1.5–2 weeks: recording in `usePuzzle` / `SoloPlayScreen`, the table and RPC,
the ghost hook and grid tint, three entry points, the result card, the
setting, tests. This is the largest item here.

---

## 3. Deeper stats

### 3.1 Product

A Stats page (from the account page, and the completion screen's "See your
stats") built from data already collected:

1. **Times over time** per slot: a line of your daily times with your
   average and best marked (`solves` + `daily_results`).
2. **By weekday**: average time per weekday and slot (the large is clued at
   an easy register Monday to Saturday and harder on Sunday,
   `docs/daily-large-queue.md:14`; this card shows how much that costs you).
3. **Where you rank**: on each daily, "faster than 82% of solvers", from the
   public `daily_results` for that day and slot.
4. **Head-to-head with friends**: wins and losses against each friend on the
   days you both solved (`daily_results` filtered to friends, as the board's
   friends filter already does).
5. **Slowest clues this month**: the clues that took you longest from first
   focus to solved, with the puzzle and your time on each
   (`play_sessions.clues`). Shown only when that data exists (the apps, or
   web with analytics consent), with a line saying so otherwise.
6. **A solved-days calendar** (a year heatmap), with freezes and repairs
   marked (§4).

### 3.2 Free versus Plus

Free keeps what the account page shows today (streak, count, recent solves)
plus card 1 for the **last 7 days**. The rest of the page renders for free
players as blurred cards with real shapes behind them and a "See all your
stats with Plus" button (`paywall_viewed { placement: "stats", feature:
"stats" }`). Real-but-blurred converts better than an empty lock (estimate,
based on how comparable apps present it).

### 3.3 Server

- `my_stats(p_since date)`: one SECURITY INVOKER RPC returning the aggregates
  for cards 1, 2 and 6 from the caller's own `solves` and `daily_results`
  rows.
- `my_percentiles(p_since date)`: for each of the caller's daily results,
  the share of that day's results in the same slot that were slower, from
  `daily_results` (already public).
- `my_head_to_head()`: for each accepted friend, days both finished and the
  wins of each.
- `my_slow_clues(p_since date)`: the top 10 `play_sessions.clues` entries by
  `s - f`, owner-only by the existing RLS.

The Plus check is in the RPCs (`has_entitlement(auth.uid(), 'plus')` or
return only the free window), not only in the UI.

### 3.4 Effort (estimate)

4–6 days: four RPCs, the page with six cards (the dataviz rules in
`docs/DESIGN.md` and the existing tokens), the blurred free state, tests.

---

## 4. Streak freeze and repair

### 4.1 Today

A streak is consecutive local days with a qualifying finish; one missed day
resets it to zero (`effectiveStreak`, `soloStats.ts:218`; `streakFromDays`,
`solveHistory.ts:128`). Nothing protects or restores it.

### 4.2 Freeze (Plus)

- Plus earns **one freeze a week** (each Monday, local), banking up to two.
- When the streak would break because yesterday has no qualifying finish,
  a banked freeze is used automatically and yesterday counts as kept.
- The menu says "Your streak is safe: a freeze covered Tuesday", once.
- Free players who lose a streak see what a freeze would have done ("Plus
  would have kept your 23-day streak") with the pitch
  (`paywall_viewed { placement: "streak", feature: "streak" }`).

### 4.3 Repair (Plus)

- Within 7 days of a missed day, the missed day's dailies show "Repair your
  streak" in the archive and on the menu. Solving one of them restores that
  day.
- One repair per missed day. A repair can't bridge a gap of more than one
  missing day unless each day is repaired.
- Free players see the offer and the pitch.

### 4.4 Data

Freezes and repairs are rows, so the streak stays derived and syncs as it
does now:

```sql
create table streak_marks (
  user_id    uuid not null,
  day        date not null,             -- the day kept
  kind       text not null check (kind in ('freeze','repair')),
  puzzle_key text,                      -- for a repair, the daily solved
  created_at timestamptz not null default now(),
  primary key (user_id, day)
);
```

- `streakFromDays` takes the union of solve days and mark days.
- The freeze bank is computed from Plus weeks and marks used, not stored.
- `use_streak_freeze()` and `repair_streak(p_day, p_puzzle_key)` are
  SECURITY DEFINER RPCs that check `has_entitlement` and the rules above.
- The local streak (`crossword-clash-solo-stats`) applies the same marks for
  a signed-out Plus session, so the number matches on every screen.

### 4.5 Effort (estimate)

2–3 days: the table, two RPCs, the streak function change on both paths,
menu and archive prompts, the lost-streak pitch, tests.

---

## 5. The Plus badge

### 5.1 Design

A small seal after the name, like Instagram's verified tick. Three directions
are mocked up at real sizes beside leaderboard, friends and profile names in
`docs/plus-expansion/badge-options.jpg` (source:
`docs/plus-expansion/badge-options.html`):

![Plus badge options](plus-expansion/badge-options.jpg)

- **A, blue seal**: a scalloped rosette in the brand blue with a white plus.
  The closest to Instagram, and the one most likely to be read as
  "verified".
- **B, gold seal (recommended)**: the same rosette in the logo's gold, with a
  thin darker rim so it holds on white. The Plus pitch, the account menu row
  and the Plus nudge already mark Plus with a gold sparkles tile
  (`PlusNudge.tsx:31-32`, `AccountMenuRow.tsx:43-44`), and `docs/DESIGN.md`
  keeps gold for earned things (streaks, trophies). It stands out on a
  leaderboard without competing with the blue action colour.
- **C, grid tile**: a blue crossword square with a gold rim. The most
  on-brand, but at 14 px it reads as a button more than a mark.

Component: `src/components/ui/PlusBadge.tsx`, an inline SVG sized in `em`
(default 0.95em) so it follows the name's type size, kept on the name's line
with the name inside one `whitespace-nowrap` span, 0.25em gap. Its props are
`size` and `interactive`. It has `role="img"` and `aria-label="Crossword Clash
Plus member"`.

**Tapping it** opens a small popover: "Crossword Clash Plus member", and for
a viewer without Plus, "Get Plus" (`paywall_viewed { placement: "badge" }`).
That makes every badge on a leaderboard a doorway to the pitch.

### 5.2 Data and privacy

- Add `profiles.plus_badge boolean not null default false`, kept by a
  SECURITY DEFINER trigger on `entitlements` (true while
  `has_entitlement(user_id, 'plus')`, and the owner's
  `profiles.show_plus_badge`, default true, is on). The nightly sweep
  re-derives it for entitlements that expire without a row change.
- `profiles` is already publicly readable, so every surface joins it by
  `user_id`.
- **Close the existing leak in the same migration**: restrict
  `has_entitlement(p_user, …)` so a non-service caller may ask only about
  `auth.uid()`. Otherwise someone who turned the badge off can still be
  looked up.

### 5.3 Where it appears

| Surface | Name source today | Change |
|---|---|---|
| Daily board | `daily_results.display_name` (`DailyLeaderboardScreen.tsx:488`) | join `profiles.plus_badge` on `user_id` in `fetchDailyLeaderboard` |
| Friends, requests, invites, race suggestions | `PersonRow` (`PersonRow.tsx:37`) | add `plus_badge` to the profile fetches in `src/lib/friends.ts:298,394-398` |
| Lobby, in-race scoreboard, results | presence `display_name` (`GameLobby.tsx:205`, `MultiplayerScoreboard.tsx:70`, `CompletionModal.tsx:455,488`) | add `plus` to the presence payload from the client's own status (low stakes if spoofed), confirmed from `profiles` where a `user_id` is known |
| Account header and page | `AccountControl.tsx:92-93` | own status |
| Community "by @author" | `CommunityList`, `Reports.tsx:115` | join on author |
| TV views | `HostLobbyScreen.tsx:109`, `TVScoreboard.tsx:64`, `SpectatorScreen.tsx:95` | phase 2 (the stage colours need their own check) |

Share text and result cards stay plain text: no badge.

### 5.4 Effort (estimate)

2–3 days: the component and popover, the migration (column, trigger, setting,
`has_entitlement` restriction), six surfaces, the account setting, tests.

---

## 6. Gaps found while writing this (outside the five features)

1. **The archive lock is only UI.** Older dailies are public files and
   `/daily/:day/:slot` plays any released day without checking the window
   (`src/lib/archive.ts:52-68`, §0). Shared links rely on that, so fixing it
   means a server-side feed for archive days. Not needed for this spec, but
   the archive is a weaker Plus line than it looks.
2. **The feed index lists future days** (titles, themes, shapes, identities;
   no answers), because `proxy.ts`'s `FEED_PATH` covers day files only
   (`proxy.ts:26`).
3. **Reveals have no free/Plus limit in code.** `docs/monetization-spec.md`
   decision 7 plans "free 1 per puzzle, Plus unlimited"; the reveal button
   (`SoloPlayScreen.tsx:631`) has no counter. Nothing in the pitch promises
   it, so nothing is broken, but it is unbuilt.
4. **`has_entitlement` answers for any user id** (§5.2): fix it with the badge.
5. `gold-800` is used at `src/components/Studio/Reports.tsx:119` but isn't a
   theme token.

---

## 7. Order and the pitch

| Step | Feature | Effort (estimate) | Why this place |
|---|---|---|---|
| 1 | Plus badge | 2–3 days | Smallest; makes Plus visible on every board; fixes the status leak |
| 2 | Streak freeze and repair | 2–3 days | Small; protects the daily habit, Plus's most emotional hook |
| 3 | Bonus puzzles | 3–5 days + weekly review | Recurring new content, the strongest reason to stay subscribed |
| 4 | Deeper stats | 4–6 days | Uses data already collected; the blurred free state sells it |
| 5 | Friend races | 1.5–2 weeks | Needs the new recording; the free tier makes it viral |

When each ships, the Plus pitch (`PlusPitch.tsx`, `plus.benefit*`) gains a
line. The intended final list, most compelling first:

- A new themed bonus puzzle every week
- Race friends on any puzzle, and your own best
- Your full stats: trends, ranks, head-to-heads
- Streak freezes and repairs
- Every daily since the archive began
- The Plus badge
- Build your own crosswords in the studio
- The AI game-show host on the TV view
- Half-finished puzzles follow you to every device

**Measuring:** each feature adds a `paywall_viewed` placement (`bonus`,
`race`, `stats`, `streak`, `badge`). Comparing placements by views and by
`purchase_completed` shows which features are actually selling Plus, and
what to build next.
