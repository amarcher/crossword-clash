# Leagues: private groups that compete on the dailies

Written 2026-10-23. Spec only: no application code changes. Every claim about
the current code cites a file (line numbers are from `main` at ff40e73);
every number that is not read from the code is marked as an estimate.

Context: three dailies a day (mini, midi, large), each with a public per-slot
leaderboard that the client fills by inserting its own time under an
anonymous Supabase user. Andrew noted on 2026-10-23 that this board is easily
gamed and proposed **leagues**: groups people join to compete with people they
know. `docs/monetization-spec.md` (PR #132) specifies a $3.99/month Plus tier
with an `entitlements` table and a reveal-letter rule that disqualifies a
solve from the daily board; `docs/scalability-audit.md` models row growth and
RLS cost; the nightly `retention_sweep()` (PR #131) deletes idle anonymous
users and old games. This spec builds on all three.

---

## Decisions needed from Andrew

Each has a recommendation; the reasoning is in the section named.

| # | Decision | Recommendation | Where |
|---|---|---|---|
| 1 | Who can create a league | **Any signed-in account creates up to 3 leagues; Plus removes the cap.** Joining is free for every account. Nothing in leagues is Plus-only at launch | §5 |
| 2 | Member cap | **50 per league** (a `max_members` column so the number can change without a migration); Plus leagues 200 later if anyone asks | §2.3, §3.5 |
| 3 | Points rule for the combined tally | **Per daily, rank points among members who finished that puzzle that day: 1st gets *N*, last gets 1, where *N* is the number of finishers; +1 participation point for a non-disqualified finish; a day's three dailies are summed.** Weekly tally Monday–Sunday in the member's local day keys, as the board already uses. Alternative: time-based (sum of seconds, DNF = slowest + 60 s), rejected because it rewards playing fewer puzzles | §2.5 |
| 4 | League time source | **Phase 1 uses `daily_results.seconds` as the public board does. Phase 2 adds a server-stamped `verified_seconds` from `play_sessions` and the league standings prefer it when present, falling back to the client time.** The public board is untouched | §4.2 |
| 5 | Public-board hardening alongside leagues | Ship the cheap server-side checks (one row per account stays, plausibility floor, server stamp) in the same migration, as a `check` on insert through a new RPC rather than RLS | §1.2, §4.1 |
| 6 | Reveal disqualification | Adopt the monetisation spec's decision 7 for leagues too: a reveal makes the solve `disqualified` for the day (it still counts for streaks and still shows in the league with a mark and 0 rank points, 1 participation point) | §4.3 |
| 7 | Visibility to non-members | **Nothing.** A league's name is shown only on its invite page, standings require membership, and there is no league directory | §2.7 |
| 8 | Apps | Phase 1 is web-only in practice because `accountsAvailable()` is false in mobile mode; leagues reach the apps with the native sign-in work the monetisation spec already requires for Plus (its §3.5) | §6.3 |

Open questions that are not decisions yet are in §6.5.

---

## 1. Why: the public daily board is trivially gameable

### 1.1 How a time gets onto the board today

The chain is entirely client-side:

1. **Time measurement.** Solo: `useSoloTimer` reads a wall clock in the
   browser (`src/hooks/useSoloTimer.ts:57`, `getElapsedSeconds`), with the
   accumulated milliseconds kept in localStorage between reloads. Async race:
   `useMultiplayer` computes `Date.now() - startedAtMs` (`src/hooks/useMultiplayer.ts:402`).
   Nothing on the server sees when the solve started.
2. **Submission.** `SoloPlayScreen` (`src/screens/SoloPlayScreen.tsx:142`) and
   `MultiplayerPlayScreen` (`src/screens/MultiplayerPlayScreen.tsx:175`) call
   `submitDailyResult` (`src/lib/dailyLeaderboard.ts:164`), which reads the
   existing row, decides client-side whether the new time is faster
   (`shouldReplace`), then **upserts** `{ day, slot, user_id, display_name, mode,
   seconds, game_id }` straight into `daily_results` over PostgREST (line 191).
3. **Authorisation.** RLS lets any authenticated user, anonymous included,
   insert and update rows where `auth.uid() = user_id`
   (`supabase/migrations/20260701000000_daily_race.sql:44-51`). There is no
   check on `seconds` beyond `>= 0` (line 27), no check that the user has a
   `play_sessions` row for that puzzle, and no check that the `day` is today.
4. **Identity.** Every visitor is an anonymous Supabase user created on first
   load (`src/hooks/useSupabase.ts`); clearing site data and reloading makes a
   new one. `daily_results` is unique on `(day, slot, user_id)`
   (`20261017000000_daily_slots.sql`), so uniqueness is per *browser profile*,
   not per person.

So the attacks are:

| Attack | Effort | What the board shows |
|---|---|---|
| **Fake time.** Any `fetch` to `/rest/v1/daily_results` with the anon key and the user's own JWT, `seconds: 1` | A browser console line | #1 with 0:01, display name of their choice (`display_name` is free text, filtered only by `displayableName`, `src/lib/nameFilter.ts:45`) |
| **Replay from memory.** Solve once, clear storage, solve again with the answers known | Two minutes | A legitimate-looking 0:20 on a 5×5 |
| **Many identities.** Clear site data, re-solve or re-post | One minute each | The top ten under ten names |
| **Backdated rows.** `day` is a client value; a row for any past date can be written | Console | Nothing visible (boards are today-only), but the archive's "solved" state and `solves` are unaffected either way |
| **Any puzzle.** `todaysDailySlot` (`src/lib/dailyLeaderboard.ts:64`) compares puzzle identity client-side, so the server does not know the row describes today's daily | Console | Same as fake time |

None of this is a bug in the sense of unintended behaviour; it is the cost of
a client-written board, which was the right trade when the board had 27 rows
(`docs/scalability-audit.md`, introduction, counted them on 2026-10-23). It stops being
right the day the board has anyone worth beating.

### 1.2 Cheap server-side mitigations

These raise the bar from "console line" to "deliberate effort" without
changing the client's shape. They are listed because leagues should ship with
the ones marked **ship** in the same migration (decision 5); the rest stay as
options.

| Mitigation | How | Cost | Verdict |
|---|---|---|---|
| **Insert through an RPC, not a table write** | `submit_daily_result(day, slot, seconds, mode, game_id)` SECURITY INVOKER, `user_id := auth.uid()`, `day` checked against `(now() at time zone 'utc')::date ± 1` (the same ±1 rule `daily_schedule` RLS uses, `20261015000000_play_insights_and_daily_schedule.sql:83`), keep-best in SQL (`LEAST`). Revoke INSERT/UPDATE policies from the table. The client's `submitDailyResult` becomes one RPC call | Half a day | **Ship.** It is the hook every other check hangs on |
| **Plausibility floor** | Refuse `seconds < floor(slot)`: mini 15 s, midi 45 s, large 120 s (estimates: the fastest honest minis on record are ~25 s; tune from `play_sessions.active_seconds` percentiles once there are a few hundred). The RPC returns `rejected: 'implausible'` and the client shows nothing (the solve still counts locally) | Trivial | **Ship**, with the floors as named constants in the function's DECLARE block like `retention_sweep()` |
| **Server stamp** | The RPC records `submitted_at := now()` and, when a `play_sessions` row exists for `(auth.uid(), puzzle_key)` started today, copies its `started_at` and `elapsed_seconds` into `daily_results.session_elapsed`. A time more than 2× faster than the session's elapsed time is flagged `suspect` (not refused: the session upsert is best-effort and may lag) | A day, including the client passing `puzzle_key` | **Ship the columns; flag, don't refuse** (§4.2) |
| **One result per device** | Already true per `user_id`. Stronger: a device fingerprint. | — | **No.** Fingerprinting is the kind of tracking the privacy policy says we do not do (`src/screens/legal/legalContent.ts:43`), and it is defeated by a second browser anyway |
| **Require an account for the public board** | `is_anonymous = false` in the RPC | Trivial | **No for the public board** (it would empty it; 27 rows today and most players anonymous), **yes for leagues** (§2.1) |
| **Replay detection** | Refuse a result for a puzzle the user already finished (a `solves` or `play_sessions.completed` row) when the new time is faster than the first by more than 50% | Half a day | Option. Fails honest "I reloaded and finished" cases unless `play_sessions.cells_at_start` is consulted; defer |
| **Rate limit** | At most 3 submissions per user per (day, slot) | Trivial in the RPC | **Ship** |

Even with all of these the board stays a board of strangers' client-reported
times, and the memory replay with a second browser is undetectable. That is
why the structural answer is social, not cryptographic.

### 1.3 Why leagues are the better answer

A board among people you know is not worth gaming. If the eight people in a
league are your family, your office or your group chat, a fake 0:01 is not a
win, it is a joke that lasts until the next message. The incentive that makes
the public board gameable (an anonymous rank next to strangers) is absent, and
the incentive that makes a daily habit (someone you know will see whether you
played today) is present. Leagues also give the three dailies a reason to be
three: a combined tally rewards playing all of them, where the public board
rewards one fast mini.

The public board stays, hardened (§1.2), as the "see how you compare to
everyone" view; leagues become the default competitive surface for anyone
signed in.

---

## 2. Product

### 2.1 Accounts are required

A league member is an account (`is_anonymous = false`), never an anonymous
user. Reasons: a league needs a stable identity across devices (the retention
sweep deletes idle anonymous users after 30 days,
`supabase/migrations/20261023000000_retention.sql:132-145`, so an anonymous
member would vanish from a league they stopped visiting), a public username to
show in standings (`profiles`, `20261017100000_profiles.sql`; usernames are
public by design), and a reason to sign in that the monetisation spec's Plus
funnel also wants.

**The sign-in prompt reuses `openAccount`.** `AccountProvider` exposes
`openAccount({ returnTo, placement })` (`src/contexts/AccountContext.tsx:72`),
which opens the one `AccountSheet` with its benefit-led pitch; `placement`
is recorded in the `account_sign_in_started` event
(`src/components/Account/AccountSheet.tsx:68`). Leagues add two placements:

- `placement: "league-join"` from the invite page (`/league/join/:code`,
  §2.2): the sheet's copy for this placement reads "Sign in to join
  *Thursday Crew*" with the league name, and `returnTo` is the invite page so
  the return trip completes the join.
- `placement: "league-create"` from the menu row and the leaderboard tab for
  an anonymous visitor.

When a first sign-in returns, `AccountProvider` already opens the
`UsernamePicker` when there is no profile (`AccountContext.tsx:69`); the join
completes after the username is saved, because standings need one. The copy
for both placements lives under `account.*` beside `sheetTitle` /
`sheetBody` (`src/i18n/en.json:519-520`) in English and Spanish.

### 2.2 Create, invite, join, leave

**Create.** From the menu row or the Leagues tab: a sheet with one field
(name, 2–40 characters, `displayableName`-filtered like display names) and a
Create button. The server (`create_league` RPC, §3.3) generates a 6-character
code from the same alphabet rooms use, `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`
(`supabase/migrations/20260224000000_multiplayer.sql:8`: no 0/O/1/I), makes the
creator the admin and first member, and returns the league. The code is
permanent for the life of the league (a room's code is reused per room,
`createNextGame` in `src/lib/puzzleService.ts:452`; a league's never changes,
but the admin can **regenerate** it, which invalidates the old one).

**Invite.** The league screen shows the code the way `GameLobby` shows a room
code (large letters, Copy, Share, QR; `src/components/GameLobby/GameLobby.tsx:100-160`)
and a share link `https://crosswordclash.com/league/join/ABC123`. The link
is the join flow: it goes through `api/share.ts` like race invites
(`/share?t=race&code=…`, `api/share.ts:4`) so it unfurls with the league name
("Join *Thursday Crew* on Crossword Clash") and then lands on the join page.
A new `t=league` branch, a `vercel.json` rewrite
`/league/join/:code` → `/api/share?t=league&code=:code`, and a `league` card
in `api/og.ts`. The league name in the unfurl is read with the service role
from `leagues` by code (the only thing about a league a non-member can learn,
and only with the code, §2.7).

**Join.** `/league/join/:code` (`LeagueJoinScreen`): shows the league name
and member count, "Join" when signed in, the `openAccount` prompt otherwise
(§2.1). Also reachable by typing a code in the Leagues tab, reusing
`JoinGame`'s six-box code input (`src/components/GameLobby/JoinGame.tsx`).
The `join_league(code)` RPC checks the cap, the member's league count, and
that the code is live.

**Leave.** Any member leaves from the league screen (one confirm). An admin
who leaves hands admin to the longest-standing member; the last member leaving
deletes the league. **Remove.** The admin removes a member from the member
list (one confirm); a removed member can rejoin only with the code again, and
the admin can **block** them (a `league_members.status = 'blocked'` row, so
the code alone does not readmit them). **Rename** and **regenerate code** are
admin actions. **Delete league** is admin-only with a typed confirmation of
the name.

### 2.3 Member cap

50 members (decision 2). Reasons: a standing with more than ~50 rows stops
being "people you know" and starts being the public board again; the
per-league standings query joins `daily_results` to members and 50 keeps that
cheap at any scale (§3.4); and a group chat, a classroom or an office floor
fits. The number is a column (`leagues.max_members`, default 50) so a Plus
league could be given 200 without a migration if decision 1's cap is ever
revisited. A member may belong to **20 leagues** (a constant in
`join_league`); more than that is a sign of a code being passed around
publicly.

### 2.4 Standings: per day, per slot, filtered to members

The league screen (`/league/:id`) has three views, matching the public board's
mental model:

- **Today** (default): one card per slot (mini, midi, large) with the
  members who finished ranked by time, standard competition ranking like
  `rankEntries` (`src/lib/dailyLeaderboard.ts:94`), the viewer's row
  highlighted (`DailyLeaderboardScreen`'s `isMe` treatment), and under each
  card the members who have **not played yet** as muted chips. Play / Race
  buttons per slot behave as on `DailyLeaderboardScreen` (`playToday`,
  `raceFriends`).
- **This week**: the points tally (§2.5) as one ranked table with a column per
  day (Mon…Sun) showing that day's points, and a total. A day picker to look at
  past weeks (kept for 8 weeks, §3.6).
- **This month**: the same tally over the calendar month.

Data comes from one RPC per view (`league_day`, `league_tally`, §3.4), all
filtered to the league's members; nothing about a non-member appears.

### 2.5 Points rule (decision 3)

Per daily (one `(day, slot)`), among the league's members who finished it
without disqualification that day:

- rank points: the fastest gets *N* points, the second *N* − 1, …, the slowest
  1, where *N* is the number of such finishers; ties share the higher value
  (as `rankEntries` ranks "1224");
- participation: +1 for every finish, disqualified finishes included
  (§4.3), so a reveal-assisted solve still counts as showing up;
- a daily nobody in the league finished scores nobody.

A member's day is the sum over the three slots; the week is Monday–Sunday,
the month the calendar month, both in **day keys** (`YYYY-MM-DD`, the local
day the result was keyed on, `todayKey()` in `dailyLeaderboard.ts:53`), so a
league spanning time zones agrees with each member's own board. Ties on total
points break on more first places, then on total seconds across shared
puzzles.

Why this rule: it rewards playing all three dailies (a day with three finishes
can score up to 3 × (*N* + 1)), it makes a league of three as playable as a
league of fifty (points scale with the league), it never punishes a slow
finish more than a non-finish, and it is computable in one SQL window
function per `(day, slot)`. The time-based alternative (sum of seconds, DNF
costs the slowest time plus a minute) was considered and rejected because it
rewards skipping the puzzles you are slow at.

Worked example, four members, one day:

| Member | Mini | Midi | Large | Day |
|---|---|---|---|---|
| Ana | 1st of 4 → 4 + 1 | 2nd of 3 → 2 + 1 | did not play | 8 |
| Ben | 3rd of 4 → 2 + 1 | 1st of 3 → 3 + 1 | 1st of 2 → 2 + 1 | 10 |
| Cy | 2nd of 4 → 3 + 1 | did not play | 2nd of 2 → 1 + 1 | 6 |
| Dee | 4th of 4 → 1 + 1 | 3rd of 3, revealed → 0 + 1 | did not play | 3 |

### 2.6 Group share block for the week

The completion modal's Share sends a spoiler-free text block
(`buildShareBlock`, `src/lib/shareBlock.ts`). Leagues add a second, pure
builder `buildLeagueWeekBlock` in a new `src/lib/leagueShare.ts`:

```
Crossword Clash · Thursday Crew · Week of Oct 20
🥇 Ben 54 · 🥈 Ana 47 · 🥉 Cy 39 · Dee 21
Mon ✅✅✅ · Tue ✅✅⬜ · Wed ✅⬜⬜ · Thu ✅✅✅ · Fri ✅✅✅ · Sat ⬜⬜⬜ · Sun ✅✅⬜
Join us → https://crosswordclash.com/league/join/ABC123
```

Header (brand · league name · week), top three with medals then the rest by
points (names truncated at 12 characters, at most 8 names then "+ *n* more"),
the viewer's own week as three squares per day (mini, midi, large: ✅ finished,
🟥 disqualified, ⬜ not played), then the invite link. Sent through the same
`shareText` mechanics (`src/lib/shareSheet.ts`: native share plugin → web
share → clipboard + toast). It lives on the league screen's week view as its
one primary button, "Share the week", and on Sunday evening the week view
pins it under the table. No per-day group block: the per-finish block already
carries the challenge link, and that link now also credits the league (§2.8).

### 2.7 What non-members see

Nothing (decision 7). The league name is shown only on the invite page, to a
visitor who holds the code. There is no league directory, no search, no
"leagues near you", and the standings RPCs refuse a non-member with an empty
result. A league's existence cannot be enumerated: codes are 32⁶ ≈ 1.07
billion possibilities, and the join RPC is rate-limited to 10 lookups per
user per hour.

### 2.8 Where it lives in the UI

| Surface | Change | Today |
|---|---|---|
| **Menu** | A "Leagues" row under the daily tiles, beside "Past puzzles" (`src/screens/MenuScreen.tsx:305`): for a member, "Thursday Crew · you're 2nd this week" (first league by recent activity, `+n` more); for a signed-in non-member, "Start a league with friends"; for an anonymous visitor, the same row opening `openAccount({ placement: "league-create" })`. Mounted and disabled until auth has a user, following the stable-first-paint rule (CLAUDE.md "Stable first paint") | `AccountMenuRow` at `MenuScreen.tsx:358` is the model |
| **Leaderboard screen** | A segmented control above the board: "Everyone" (the existing public board) and one segment per league the viewer belongs to. A league segment renders that slot's **Today** card from §2.4 in the same table markup. Non-members see a "Start a league" link under the public board | `DailyLeaderboardScreen` fetches one `fetchDailyLeaderboard(day, slot)`; the league segment calls `league_day(league_id, day)` and filters to the slot |
| **Completion modal** | The board row ("Leaderboard" for a daily, CLAUDE.md "After the finish") gains a second line when the viewer is in a league: "Thursday Crew: you're 3rd of 6 today". It links to the league's Today view. The pending-result mechanism (`GameContext.pendingDailyResult`, `DailyLeaderboardScreen` awaits `settled`) is reused so the league line waits for the submission | `CompletionModal.tsx:574` already shows the account hook for anonymous finishers; a league line sits in the same place for members |
| **Challenge link** | `buildDailyLink` (`src/lib/dailyChallenge.ts:44`) gains an optional `league` code: `/daily/2026-10-20/mini?beat=102&by=Archer&league=ABC123`. `DailyPuzzleScreen` passes it to the challenge screen, whose finish then offers "Join Archer's league" if the finisher is not a member | The `?beat=&by=` ghost is unchanged |
| **Archive** | Unchanged. Past days post to no board and no league (boards are today-only, `docs/puzzle-archive-spec.md`); a past day played from the archive counts for the archive and `solves` only | |
| **Apps** | The Leagues row and tab are hidden where `accountsAvailable()` is false (`src/lib/account.ts:43`), as every account surface is today; §6.3 | |

---

## 3. Data

### 3.1 Tables

```sql
-- supabase/migrations/2026MMDD000000_leagues.sql (sketch)

CREATE TABLE IF NOT EXISTS leagues (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL CHECK (char_length(name) BETWEEN 2 AND 40),
  -- 6 chars from the room-code alphabet; regenerable by the admin.
  code          TEXT NOT NULL UNIQUE CHECK (code ~ '^[A-HJ-NP-Z2-9]{6}$'),
  admin_user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE RESTRICT,
  max_members   SMALLINT NOT NULL DEFAULT 50 CHECK (max_members BETWEEN 2 AND 500),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS league_members (
  league_id  UUID NOT NULL REFERENCES leagues (id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  -- 'member' | 'admin' | 'blocked' (removed by the admin; the code alone does not readmit).
  role       TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('member', 'admin', 'blocked')),
  joined_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- The last day key the member opened this league; drives the menu row's "first league".
  last_seen_day DATE,
  PRIMARY KEY (league_id, user_id)
);
CREATE INDEX IF NOT EXISTS league_members_user_idx ON league_members (user_id);

-- Additions to daily_results (§4): server stamp, verified time, disqualification.
ALTER TABLE daily_results
  ADD COLUMN IF NOT EXISTS submitted_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS puzzle_key       TEXT,          -- soloStats.puzzleIdentity(), from the RPC
  ADD COLUMN IF NOT EXISTS session_elapsed  INTEGER,       -- play_sessions.elapsed_seconds at submission, if any
  ADD COLUMN IF NOT EXISTS verified_seconds INTEGER,       -- phase 2 (§4.2)
  ADD COLUMN IF NOT EXISTS disqualified     BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS suspect          BOOLEAN NOT NULL DEFAULT false;
-- The standings join: members' results for a range of days.
CREATE INDEX IF NOT EXISTS daily_results_user_day_idx ON daily_results (user_id, day);
```

No invites table. The code *is* the invite (decision: one code per league,
regenerable), as a room's `short_code` is today. A per-invite table (expiring
links, "invited by") can be added later without touching the two tables above;
nothing in phase 1 needs it. `admin_user_id` is `ON DELETE RESTRICT` so
account deletion must hand admin over first (§3.7), never leave a league
without one.

### 3.2 Row-level security

The rule: **members read, nobody writes directly.** Every mutation goes through
a SECURITY INVOKER RPC that enforces the business rule, so the policies stay
small and the `EXISTS` on `league_members` is the only RLS cost.

```sql
ALTER TABLE leagues ENABLE ROW LEVEL SECURITY;
ALTER TABLE league_members ENABLE ROW LEVEL SECURITY;

-- Membership test, STABLE + SECURITY DEFINER so policies on both tables can
-- call it without recursing through league_members' own policy.
CREATE OR REPLACE FUNCTION is_league_member(p_league UUID, p_user UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM league_members m
                 WHERE m.league_id = p_league AND m.user_id = p_user AND m.role <> 'blocked');
$$;
REVOKE ALL ON FUNCTION is_league_member(UUID, UUID) FROM public;
GRANT EXECUTE ON FUNCTION is_league_member(UUID, UUID) TO authenticated;

CREATE POLICY "Members read their leagues" ON leagues FOR SELECT
  USING (is_league_member(id, (select auth.uid())));
CREATE POLICY "Members read the roster" ON league_members FOR SELECT
  USING (is_league_member(league_id, (select auth.uid())));
-- No INSERT / UPDATE / DELETE policies on either table: the RPCs below write
-- as SECURITY DEFINER after checking auth.uid() and the non-anonymous claim.
```

Why no write policies: the rules (cap, 20-leagues limit, admin-only rename,
blocked cannot rejoin, last member deletes) are multi-row invariants that RLS
cannot express; an RPC can, in one transaction with a row lock on `leagues`.
This is the pattern `claim_cell` already uses for rooms
(`20260426000001_claim_cell_auth_check.sql`), and `record_solves` for history.

`(select auth.uid())` rather than bare `auth.uid()` so Postgres evaluates it
once per query, not per row (Supabase's RLS performance guidance; the
monetisation spec's sketch uses the same form).

### 3.3 RPCs

All `SECURITY DEFINER`, `SET search_path = public`, revoked from `public` and
`anon`, granted to `authenticated`, and every one begins with:

```sql
IF auth.uid() IS NULL OR coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) THEN
  RAISE EXCEPTION 'leagues need a signed-in account' USING ERRCODE = '42501';
END IF;
```

| RPC | Does | Refuses |
|---|---|---|
| `create_league(name) → leagues` | Inserts the league with a fresh code (loop like `generate_short_code`, `20260224000000_multiplayer.sql:17-24`), inserts the admin member row | More than `max_leagues_created` (3) leagues where `admin_user_id = auth.uid()` unless `has_entitlement(auth.uid(), 'plus')` (decision 1; the function exists only once the monetisation migration lands, so phase 1 ships with the constant alone and the Plus clause is one line later) |
| `join_league(code) → leagues` | Upserts a `member` row | Unknown code (`not_found`), `blocked` row (`blocked`), `count(*) >= max_members` (`full`), the caller already in 20 leagues (`too_many`); more than 10 lookups per user per hour (counted in a small `league_join_attempts (user_id, at)` table, or by reusing `narrator_usage`'s shape keyed by user) |
| `leave_league(league_id)` | Deletes the caller's row; if admin, promotes the earliest `joined_at` member; if last, deletes the league | — |
| `remove_member(league_id, user_id, block boolean)` | Admin only; deletes or sets `blocked` | Non-admin caller, removing self (use leave) |
| `rename_league(league_id, name)`, `regenerate_code(league_id)`, `delete_league(league_id)` | Admin only | Non-admin |
| `touch_league(league_id)` | Sets the caller's `last_seen_day` to today | — |
| `league_day(league_id, day) → setof (slot, user_id, username, seconds, verified_seconds, disqualified, mode)` | §3.4 | Non-member → empty |
| `league_tally(league_id, from_day, to_day) → setof (user_id, username, points, firsts, finishes, days jsonb)` | §3.4 | Non-member → empty |
| `my_leagues() → setof (league, member_count, my_rank_this_week)` | The menu row and the leaderboard tabs; one call | — |

Error codes are strings in the exception message (`full`, `blocked`, …) so
the client maps them to copy, as `saveUsername` maps `23505`/`23514`
(`src/lib/account.ts`).

### 3.4 How standings are computed and what it costs

**Per day** (`league_day`):

```sql
SELECT r.slot, r.user_id, p.username, r.seconds, r.verified_seconds, r.disqualified, r.mode
FROM league_members m
JOIN daily_results r ON r.user_id = m.user_id AND r.day = p_day
JOIN profiles p ON p.user_id = m.user_id
WHERE m.league_id = p_league AND m.role <> 'blocked'
  AND is_league_member(p_league, auth.uid());
```

Index path: `league_members (league_id, user_id)` (the primary key) → ≤ 50
member ids → `daily_results (user_id, day)` (the new index) → ≤ 150 rows →
`profiles` by primary key. **Cost is proportional to the league size, not to
the number of leagues or users:** at 10,000 members across 400 leagues of 25
(estimate), one `league_day` call touches ~75 result rows and 25 profile rows,
well under a millisecond of index work on Supabase's Micro instance. The
public board's query (`(day, slot, seconds)` with `LIMIT 50`,
`20261017000000_daily_slots.sql`) is untouched.

**Tally** (`league_tally`): the same join over a 7- or 31-day range (≤ 50 × 3
× 31 ≈ 4,650 rows for a full month in a full league), then one window per
`(day, slot)`:

```sql
WITH finishes AS (
  SELECT r.user_id, r.day, r.slot, r.disqualified,
         coalesce(r.verified_seconds, r.seconds) AS t
  FROM league_members m JOIN daily_results r ON r.user_id = m.user_id
  WHERE m.league_id = p_league AND m.role <> 'blocked' AND r.day BETWEEN p_from AND p_to
), ranked AS (
  SELECT *, count(*) FILTER (WHERE NOT disqualified) OVER w AS n,
         rank() OVER (PARTITION BY day, slot ORDER BY CASE WHEN disqualified THEN NULL ELSE t END NULLS LAST) AS rk
  FROM finishes WINDOW w AS (PARTITION BY day, slot)
)
SELECT user_id,
       sum(CASE WHEN disqualified THEN 0 ELSE n - rk + 1 END) + count(*) AS points,
       count(*) FILTER (WHERE rk = 1 AND NOT disqualified) AS firsts,
       count(*) AS finishes,
       jsonb_object_agg(day, …) AS days
FROM ranked GROUP BY user_id ORDER BY points DESC, firsts DESC;
```

A few thousand rows and two window passes: tens of milliseconds at most
(estimate). Nothing is materialised in phase 1. If `league_tally` ever shows
in `pg_stat_statements` (a 200-member Plus league opening the month view on
every visit), the fix is a nightly `league_points_daily (league_id, user_id,
day, points)` rollup written by the retention cron, as the scalability audit
proposes for insights (`docs/scalability-audit.md` §2). Reads are
proportional to league size; writes are zero (standings are derived, never
stored, the same principle as `solves`: "storing facts rather than counters is
what makes two devices agree", `20261017300000_solves.sql`).

**Client caching.** The league screen fetches on mount and on
`visibilitychange` like `DailyLeaderboardScreen`; `my_leagues()` is fetched
once per app start by a `useLeagues` hook and kept in a module store like
`solveHistory.ts`'s, so the menu row and the leaderboard tabs do not refetch.

**Row growth.** `leagues` and `league_members` are tiny (one row per league,
one per membership, ~100 bytes each). `daily_results` gains six columns
(~30 bytes per row) and one index; its growth stays ≤ 3 rows per active user
per day as the audit modelled (`docs/scalability-audit.md` §2, table).

### 3.5 Caps as data

`max_members` (default 50), `max_leagues_created` (3), `max_leagues_joined`
(20), the join-lookup rate (10/hour) and the plausibility floors (§1.2) are
all named constants in the RPCs' DECLARE blocks, and `max_members` is also a
column so a single league can be widened by hand (or by Plus later) without a
migration. A test in the spirit of `retentionMigration.test.ts` reads the
migration and asserts the constants exist and the policies are as described.

### 3.6 What the retention sweep must preserve

`retention_sweep()` (`20261023000000_retention.sql`) must learn three things:

1. **Members are not idle.** Its anonymous-user delete already excludes
   accounts (`is_anonymous = false`, line 133) so league members, who are
   always accounts, are never swept. No change, but the test that asserts the
   owned-tables list (`retentionMigration.test.ts`) should gain
   `league_members` for the day anonymous membership is ever allowed.
2. **`daily_results` outlive games.** The sweep deletes closed/completed games
   after 90 days and `daily_results.game_id` goes null (`ON DELETE SET NULL`,
   `20260701000000_daily_race.sql:28`), so results survive. `daily_results`
   has **no retention rule** today ("Leaderboard entries are kept until we
   delete them", `legalContent.ts:128`). Leagues need the last 8 weeks for the
   week picker (§2.4) and the current and previous month for the month view;
   the public board needs today. Add a rule: **`daily_results` older than
   400 days deleted** (a named constant `daily_result_ttl`; 400 keeps a full
   year of league history for an anniversary view, and the row is ~150 bytes,
   so this is housekeeping, not a cost measure). The privacy policy's
   "Retention and your choices" paragraph changes "kept until we delete them"
   to "kept for 400 days".
3. **Dormant leagues.** A league whose members have all been absent (no
   `last_seen_day` within 180 days) is deleted, cascading members; a named
   constant `dormant_league_ttl`. Nothing else references leagues, so this is
   one `DELETE … WHERE NOT EXISTS (… last_seen_day > now() - ttl)`.

The sweep's `RETURNS TABLE (step, affected)` gains two rows,
`daily_results_deleted` and `dormant_leagues_deleted`.

### 3.7 Account deletion

`delete-account` (`supabase/functions/delete-account/index.ts:11`) deletes
rows from tables that only store the id, then the auth user, which cascades
the tables that reference `auth.users`. For leagues:

- `league_members` cascades (`ON DELETE CASCADE`), so the member disappears
  from every roster and every standing (standings are derived from
  `daily_results`, which `delete-account` already deletes, line 11).
- `leagues.admin_user_id` is `ON DELETE RESTRICT`, so before `deleteUser` the
  function must, for every league the user administers, run the same
  hand-over `leave_league` does: promote the earliest other member, or delete
  the league when the user is its only member. Add this as a step before
  `OWNED_TABLES`, with the service role; a failure returns `db_error` as the
  other steps do.
- CLAUDE.md's rule for "a new table holding a user id must be added there or
  reference `auth.users ON DELETE CASCADE`" is satisfied by both tables.

The privacy policy's "Accounts (optional)" paragraph (`legalContent.ts:49`)
gains: "If you join a league, we store which leagues you belong to, when you
joined and the day you last opened each; other members see your username,
your daily finish times and your points. Leaving a league removes you from
its standings; deleting your account removes you from every league."

---

## 4. Integrity

### 4.1 One result row per account

`daily_results` stays **one row per `(day, slot, user_id)`**
(`20261017000000_daily_slots.sql`), and leagues read that row; there is no
league-specific result table. Consequences: a member's time is the same in
every league they belong to and on the public board; "keep the best" stays the
rule (`shouldReplace`, `dailyLeaderboard.ts:141`, moved into the RPC as
`LEAST`); and a member cannot post a different time to different leagues.

Moving the write into `submit_daily_result` (§1.2, decision 5) changes the
client in one place: `submitDailyResult` (`dailyLeaderboard.ts:164`) calls
`supabase.rpc("submit_daily_result", { day, slot, seconds, mode, game_id,
puzzle_key })` and returns the row (or the rejection reason) instead of
reading-then-upserting. `updateDailyDisplayName` (line 205) becomes
`sign_daily_result(day, slot, display_name)`, also an RPC, so the UPDATE policy
can go. The INSERT and UPDATE policies on the table are dropped; the SELECT
policy (`USING (true)`) stays, because the public board is public. The RPC is
`SECURITY INVOKER` with an explicit `user_id := auth.uid()`, the shape of
`record_solves` (`20261017300000_solves.sql`).

### 4.2 Server-computed time (decision 4)

The honest question is whether the server can know how long a solve took. The
only server-side witnesses are `play_sessions` rows (`usePlayInsights` sends a
record on first activity, on hide and on completion,
`src/hooks/usePlayInsights.ts:45-90`, upserted by id with a client-provided
`started_at` and `elapsed_seconds`, `20261015000000_play_insights_and_daily_schedule.sql:30-39`).
Those are also client values, but they arrive on a different path, at
different moments, and are gated by analytics consent on the web
(`playInsightsAllowed()`, `src/lib/playInsightsClient.ts:29`), so they cannot
be the only source. What the server does own is the **clock at which each
request arrived**.

**Phase 2 plan**, introduced without breaking the public board:

1. `play_sessions` gains `created_at TIMESTAMPTZ DEFAULT now()` (first
   report) and a trigger-maintained `updated_at` (today's `updated_at` is only
   a default, `20261015000000:39`, so it is the insert time, never refreshed);
   `completed_at TIMESTAMPTZ` set by the trigger when `completed` flips to
   true. These are server stamps the client cannot forge.
2. `usePlayInsights` sends its **first** report on the first letter typed
   (today it waits for hide/leave/complete; `hasActivity` at line 45 already
   knows), so `created_at` is close to the real start. One extra keepalive
   fetch per puzzle visit.
3. `submit_daily_result` finds the caller's `play_sessions` row for
   `puzzle_key` with `created_at` today and computes `verified_seconds :=
   extract(epoch from completed_at - created_at)` minus nothing (idle time is
   not subtracted: the verified number is a ceiling, not a replacement). It
   stores it beside `seconds`; it does **not** reject.
4. `league_tally` and `league_day` rank by `coalesce(verified_seconds,
   seconds)`; the public board keeps ranking by `seconds` until a month of
   data shows how often the two disagree and by how much (a GA4-free check:
   `select percentile_cont(0.5) … (verified_seconds - seconds)` in the SQL
   editor). `suspect` is set when `seconds < verified_seconds / 2` or when
   there is no session row at all for a signed-in web user who had analytics
   consent (an app user always has one); the league screen draws a small
   "unverified" glyph on a suspect row, and the admin can hide suspect rows
   from the tally with a league setting.

Why not require it from day one: consent. An EEA visitor who declined
analytics has no `play_sessions` row and would be shut out of leagues; the
fallback to `seconds` keeps them in, marked unverified. Why leagues first: a
league admin can judge an "unverified 0:14" among friends, where the public
board cannot.

Not proposed: signed timers, WebAssembly attestation, or server-side puzzle
state for solo play. The audit's conclusion that solo play should write no
server rows (`docs/scalability-audit.md` §2 item 2, shipped in PR #130) is
worth more than an unwinnable arms race over a crossword time.

### 4.3 Disqualification, consistent with the reveal rule

`docs/monetization-spec.md` decision 7: a reveal "disqualifies the solve from
the daily leaderboard and shows as 🟥 in the share block"; its §1.1 says the
daily submission is skipped when any cell was revealed. For leagues, skipping
is the wrong shape: a member who revealed a letter still played, and friends
should see that. So:

- `submit_daily_result` takes `disqualified boolean`; the client passes true
  when the solve used a reveal (once reveals exist; false until then).
- A disqualified row **does not appear on the public board** (the public
  board's query adds `AND NOT disqualified`, which honours decision 7 exactly)
  and **does appear in league standings** with a mark, 0 rank points and 1
  participation point (§2.5).
- Keep-best across the day: a clean time replaces a disqualified one at any
  speed; a disqualified time never replaces a clean one. In SQL:
  `ON CONFLICT DO UPDATE WHERE (NOT EXCLUDED.disqualified AND daily_results.disqualified)
  OR (EXCLUDED.disqualified = daily_results.disqualified AND EXCLUDED.seconds < daily_results.seconds)`.
- Streaks and `solves` are unaffected either way (a reveal still finishes the
  puzzle; `recordSolve` is independent of the board,
  `SoloPlayScreen.tsx:169`).

The same `disqualified` flag covers any future rule (check-puzzle, a
plausibility rejection the admin overrides) without a new column.

### 4.4 Names

League standings show the **username** from `profiles`, never
`daily_results.display_name`: the username is unique and account-bound, the
display name is free text per result. The public board keeps showing
`display_name` (anonymous players have no username). A member without a
username cannot exist (§2.1), so the `profiles` join in §3.4 is an inner join.

---

## 5. Free versus Plus (decision 1)

Three options were weighed against the monetisation spec's goal (a Plus tier
whose pitch is "build your own crossword" plus the narrator, §2.2 there) and
the growth goal (leagues exist to make the dailies a shared habit).

| Option | Growth | Revenue | Verdict |
|---|---|---|---|
| **A. Leagues free for every account** | Best: every invite link is a sign-in and a daily habit for the invitee; a league of 8 is 7 new accounts | None directly; indirectly the largest funnel into the archive gate and Plus | Close |
| **B. Create requires Plus, join is free** | Weak: the person most likely to start a league is the keen solver who has not paid yet; a $3.99 wall at that moment loses the whole league, not one subscriber | Some, but each Plus-for-leagues conversion costs ~7 potential members | No |
| **C. Free with caps, Plus lifts them** (recommended) | As A for the first three leagues anyone starts and for every join | Small: Plus removes the 3-created cap and (later) widens a league to 200. Mostly it keeps Plus the place where "more" lives without putting the habit behind a wall | **Yes** |

Recommendation: **C**, with the caps at 3 leagues created per account
(Plus: unlimited), 50 members (a per-league column, Plus 200 only if a real
league asks), joining always free. Reasoning: leagues are a growth feature
first. The monetisation spec's revenue model assumes 1–3% of MAU convert to
Plus (its §2.6, from the audit's §5); the thing that lifts MAU is a reason to
come back daily that involves other people, and that is what a league is. A
league also solves a problem the Plus spec names: it needs accounts to sell
to (web Plus requires an account, monetisation §3.5), and today the only
reasons to sign in are synced history and the archive gate. Putting the
*creation* of a league behind Plus would convert a handful of keen solvers and
lose the people they would have brought. Putting *nothing* behind Plus leaves
no room to say "Plus leagues get more"; the caps leave that room at no cost to
growth, because three leagues is more than almost anyone starts.

Where leagues and Plus touch in the data: `create_league` calls
`has_entitlement(auth.uid(), 'plus')` for the cap (one line, inert until the
monetisation migration ships); `max_members` is a column; nothing else. No
league feature reads `feature_usage` or costs money to serve.

---

## 6. Rollout

### 6.1 Phases

| Phase | Ships by | What | Depends on |
|---|---|---|---|
| **0. Board hardening** | `supabase db push` + web deploy | `submit_daily_result` / `sign_daily_result` RPCs with the ±1-day check, plausibility floors, rate limit, `submitted_at`, `puzzle_key`, `session_elapsed`, `suspect`, `disqualified`; INSERT/UPDATE policies dropped; `submitDailyResult` and `updateDailyDisplayName` call the RPCs; `daily_results` 400-day retention; privacy policy sentence; tests (`dailyLeaderboard.test.ts` against a chainable fake as `puzzleService.test.ts` does, a migration-reading test) | Nothing. Can merge first and alone |
| **1. Leagues (web)** | `db push` + web deploy | Tables, policies, RPCs (§3), `src/lib/leagues.ts` (pure: points rule, week/month ranges, share block; tested), `useLeagues`, `LeagueScreen` (Today / Week / Month), `LeagueJoinScreen`, create sheet, menu row, leaderboard segments, completion-modal line, `?league=` on the challenge link, `api/share.ts` `t=league` + OG card + rewrite, `openAccount` placements and copy (en + es), `delete-account` hand-over step, sweep's dormant-league rule, `pageMetaFor` meta for the two routes, analytics events (§6.4) | Phase 0 (the `disqualified` column and RPC). Flag `VITE_LEAGUES=1` so main can merge before the launch post |
| **2. Verified time** | `db push` + web deploy | `play_sessions` server stamps + trigger, first report on first letter, `verified_seconds` in the RPC, leagues rank by `coalesce`, the "unverified" glyph and admin setting, a month of comparison before the public board follows | Phase 1 |
| **3. Leagues in the apps (1.1.x)** | App Store + Play review | Nothing league-specific: the native sign-in work in `docs/monetization-spec.md` §3.5 (`@capgo/capacitor-social-login`, id-token linking) makes `accountsAvailable()` true in mobile mode and every league surface appears. Deep link `crosswordclash.com/league/join/:code` as a universal link / app link so an invite opens the app when installed (the monetisation spec notes no URL scheme or universal link is configured today, its §0) | Phase 1 and the monetisation spec's phase 1 |

Phase 0 is worth shipping even if leagues never do.

### 6.2 Migrations

Two migrations, one per phase 0 and 1, plus a third for phase 2:

1. `…_daily_results_rpc.sql`: the columns, the two RPCs, the policy drops, the
   retention constant and sweep step (re-running `retention_sweep`'s
   `CREATE OR REPLACE` with the new step and re-scheduling, as the retention
   migration itself does).
2. `…_leagues.sql`: `leagues`, `league_members`, `is_league_member`, the
   policies, the nine RPCs (§3.3), the dormant-league sweep step, the index on
   `daily_results (user_id, day)`.
3. `…_play_sessions_stamps.sql`: `created_at`, `completed_at`, the
   `updated_at` trigger, `verified_seconds` computation in
   `submit_daily_result`.

Deploy with `npx supabase db push` from this Mac (the `supabase-deploy`
memory records that the CLI is logged in) and `npx supabase functions deploy
delete-account` for §3.7. `src/types/supabase.ts` gains the two tables and the
RPC signatures.

### 6.3 What needs an app release

Nothing for phases 0–2: the apps load the web bundle from their own build,
so a mobile build with the new code is needed for the apps to *have* the
RPC-based submission (phase 0), and that is the next ordinary release; until
then the old direct upsert keeps working only if the INSERT/UPDATE policies
stay. **Sequence therefore:** ship phase 0's RPCs and client together, keep
the two old policies for one app release cycle, then drop them in a follow-up
migration once 1.0.3 (or whatever carries phase 0) is the minimum version in
the stores. Leagues themselves need no app release because the apps cannot
show them until native sign-in lands (phase 3).

### 6.4 Effort (estimates, one engineer)

| Phase | Days | Biggest item |
|---|---|---|
| 0 | 2–3 | The RPC's keep-best + disqualified conflict clause and its tests |
| 1 | 8–10 | `LeagueScreen` with three views and the share block; the nine RPCs and their tests against a local Postgres (Docker was not running when the retention migration was written, per its hand-over; budget a day to get `supabase start` working) |
| 2 | 2–3 | The `play_sessions` trigger and first-letter report without breaking the keepalive path |
| 3 | 0 beyond the monetisation spec's phase 1, plus 1 for the universal link | |

### 6.5 First-month metrics

GA4 exists only on the web (`src/lib/analytics.ts`); the apps have none, so
everything below is web until phase 3, plus SQL over the new tables.

- **Creation and join funnel:** `league_create_started`, `league_created`,
  `league_invite_shared { method }`, `league_join_viewed { signed_in }`,
  `league_joined { via: "link" | "code" }`, `account_sign_in_started {
  placement: "league-join" | "league-create" }` and how many of those sign-ins
  complete (`league_join_viewed` with `signed_in: false` → `league_joined`).
  The number that matters: **members per league after 14 days** (target to
  learn, not to hit: ≥ 4, since a league of 2 is a challenge link with extra
  steps) and **sign-ins attributed to a league invite** as a share of all
  sign-ins.
- **Habit:** for members versus non-member accounts, dailies finished per
  active day and 7-day return rate, from `daily_results` joined to
  `league_members` (one SQL query; no new tracking). The hypothesis is that
  members play all three dailies more often; if they do not, the points rule
  (§2.5) is the first thing to revisit.
- **Standings health:** share of `suspect` rows among members versus the
  public board (phase 2), disqualified finishes per league, leagues with a
  blocked member (a proxy for drama).
- **Board hardening:** RPC rejections by reason (`implausible`, `day`, `rate`)
  per day, from a `daily_result_rejections` counter table or Supabase function
  logs; expected near zero, and a spike is either a bug or an attack.
- **Caps:** accounts hitting the 3-created cap (the Plus hook of decision 1)
  and leagues within 5 of `max_members`.
- **Cost:** `league_tally` mean and p95 time in `pg_stat_statements` after a
  month, to decide whether the rollup table (§3.4) is ever needed.

### 6.6 Open questions (not decisions)

1. **Week start.** Monday–Sunday is proposed; a Sunday start matches US
   calendars and the archive's `monthCells` (Sunday-first,
   `src/lib/archive.ts`). One constant either way; pick before copy is
   written.
2. **Day keys across time zones.** A member in Auckland and one in Los
   Angeles solve "today's mini" on different UTC days but the same day key,
   which is what both the public board and `solves` already use. Leagues
   inherit this; it means a tally day closes for the league when its last
   member's local day ends, so "Sunday evening" for the share block is per
   member. Fine for friends, worth stating in the league screen's help text.
3. **Races.** A live race among league members (`mode = 'race'`) posts each
   player's own time (`recordRaceFinish`, `src/lib/puzzleService.ts:331`,
   async mode only). Shared-grid versus/co-op finishes have no personal time
   and post nothing to `daily_results` (`MultiplayerPlayScreen.tsx:168`,
   `isAsync` branch only). Should a shared-grid finish count as a
   participation point? Proposed: not in phase 1.
4. **Display of the public board for members.** Should the public board hide
   suspect rows once phase 2 has data, or only mark them? Decide with the
   month of comparison data.
5. **Spanish.** League names are free text; the share block's labels and the
   invite unfurl need Spanish copy and `formatShareDay`'s locale handling
   (`shareBlock.ts`) for "Week of 20 oct".
6. **Studio admins.** Should `studio_admins` be able to see any league (for
   abuse reports naming a league code)? Proposed: a service-role query in the
   SQL editor is enough; no admin UI.
