# Navigation audit — finishing, sharing, leaderboard, and the way back

Audited 2026-10-20 on `main` (3e6f9a8). Covers what happens after a puzzle is
finished (the completion modal and its actions), what "Share" actually sends,
the daily leaderboard round trip, the "race a friend" paths, and where every
back control lands. Code paths were read in full; the finish → leaderboard →
back sequence was also walked headlessly on the dev build at phone and
desktop widths (screenshots in the session scratchpad). The native app was
not run; its differences are derived from the code's platform branches and
the Capacitor plugin list, and are called out as such.

## Verdict

The finish screen is built around "do it again" when the player's actual
impulse is "show someone". The primary button is **New puzzle** (which opens
the file importer), sharing is a small secondary that on the native app
degrades to a silent clipboard copy, the one spoiler-free brag format people
already know (Wordle's result block) does not exist, and two of the four
follow-on paths put the finisher back on the puzzle they just solved: the
multiplayer **Play again** rematches the *same* `puzzle_id`, and the daily
leaderboard's primary button is **Play Today's Mini** even when you came
from finishing it. Underneath, every "Back to menu" points at `/`, which is
the cold-start resolver, not the menu: after a finished daily it re-opens
the finished puzzle (measured), and with a stale room session on the device
it drops the player into that room's lobby, which is the "host the game
screen" you hit on the phone.

## Status

- **§2 (items 5–8) and §3 (items 9–11)** shipped (this PR): the modal is
  Share-first with an "Up next" list and a fresh-puzzle race; the multiplayer
  "Next puzzle, same room" and the board's race go through the new picker
  (`/pick-puzzle`), never the solved puzzle; the board awaits the pending
  submission, shows the finisher's own row at once, refetches on
  `visibilitychange`, and replaces "Play Today's Mini" with "Solved in … · #n
  today" once the viewer has solved the slot; one `BoardSignForm` serves the
  modal and the board. Screenshots in `docs/navigation-finish/`.
- **§4** (back targets, session expiry, finished-state return) is in a
  sibling branch (below).
- **§1 (items 1–4)** shipped (PR "Share: the result block, one share with the
  daily date link, native share sheet", 2026-10-20): `buildShareBlock`
  (`src/lib/shareBlock.ts`, pure, tested) — header, stats line, emoji rows
  (pace thirds from the new `CellState.at`; 🟥 from
  `MultiplayerContext.wrongCells`, a per-puzzle set — the audit's
  "`wrongLetters` set" was in fact a counter), a 15-block pace bar above 9
  wide, claimant colours in a live race. `/daily/:day/:slot`
  (`DailyPuzzleScreen`) loads the day from the feed and lands on
  `ChallengeScreen` with `?beat=&by=`; `api/share.ts` answers the same path
  for crawlers with the result's OG tags spliced into the real index.html.
  `ShareResultButton` is the one Share (preview + sign-first prompt +
  button); `ChallengeFriendButton` is gone; `SaveImageButton` keeps the
  canvas card (hidden in the apps). `shareText` picks `@capacitor/share` in
  the app, `navigator.share({ text })` on the web, else clipboard + "Result
  copied". Still open: the PNG in the apps (`@capacitor/filesystem`).

## 1. Sharing — the viral loop

### What happens today

- **Web, desktop**: `ShareResultButton` draws a 1200×630 PNG on a canvas,
  downloads it, and copies a caption ("I solved today's Daily Mini "X" in
  1:42 on Crossword Clash 🏆 https://crosswordclash.com/share?t=result&…")
  to the clipboard. The link unfurls into an OG card and then redirects to
  the front door. — `src/components/CompletionModal/ShareResultButton.tsx`,
  `src/lib/shareLinks.ts`.
- **Web, phone browser**: `navigator.share({ files: [png], text })`. iOS
  drops the text in most targets when a file is attached (Messages keeps
  it, WhatsApp/Instagram/Notes do not), so what arrives is usually the
  image alone.
- **Native app**: there is no `@capacitor/share` plugin, and WKWebView
  reports `navigator.canShare({files})` as false, so `selectShareMethod`
  falls to **copy**: the caption is written to the clipboard, a blob
  download is triggered (a no-op in the WebView), and the button flashes
  "Link copied!". No share sheet opens. That is the "it just shares a link"
  you saw. — `src/lib/resultCard.ts` (`selectShareMethod`), `package.json`.
- **Challenge a friend** is a second button that builds a *different* link
  (`#puzzle=…` with your name and time) so the recipient races your ghost
  on the same puzzle. That is the right mechanic, but it is split from
  "Share", and it embeds the whole puzzle in the URL even for the daily,
  which the recipient's app could fetch by date.

### Recommendations

1. **Text first, image optional.** Share a text block the way Wordle does;
   it pastes into any chat, survives every share target, and the link still
   unfurls to the OG card. Keep "Save image" as a secondary action.

2. **One share, and its link is the challenge.** Merge "Share result" and
   "Challenge a friend": the shared link always carries your time as the
   ghost. For a daily, link by date and slot (`/daily/2026-10-20/mini?beat=102&by=Archer`,
   a new route that loads that day's puzzle from the feed — past days are
   already served by `api/daily.ts`, and the static files stay) so the URL
   is short and the recipient plays the *same* daily against your time; for
   imported and classic puzzles keep the existing `#puzzle=` payload. The
   recipient lands on the existing `ChallengeScreen`.

3. **A structured, spoiler-free result block.** Proposed format (mini):

   ```
   Crossword Clash · Daily Mini · Oct 20
   ⏱ 1:42 · 🔥 5-day streak
   ⬛🟩🟩🟩🟩
   🟩🟩🟨🟨🟩
   🟩🟨🟨🟧🟧
   🟩🟩🟧🟧🟥
   🟩🟩🟩🟧⬛
   Beat my time → crosswordclash.com/daily/2026-10-20/mini?beat=102
   ```

   Rows are the grid's rows; ⬛ blocks; 🟩/🟨/🟧 the cell was filled in
   the first/middle/last third of your solve; 🟥 a cell you got wrong at
   least once. No letters, so nothing is spoiled, and the shape plus the
   pace tells a story the way Wordle's rows do. Midis (7×7) fit a message;
   for the 15×15 large, emit a single 15-block pace bar instead of 15 rows.
   For a live race, colour cells by who claimed them (the player colours
   map to 🟦🟥🟩🟨🟪🟧) and headline the standings. Needs one reducer
   change: stamp `at` (ms since start) on each `CellState` in `INPUT_LETTER`
   and remote claims; the wrong-letter set already exists (`wrongLetters`).
   Keep it a pure function (`buildShareBlock` in `src/lib/`) with tests.

4. **Native: use the share sheet.** Add `@capacitor/share` and route the
   native path through `Share.share({ text, url })` (the PNG can go via
   `@capacitor/filesystem` later). The web path keeps `navigator.share` with
   `{ text }` only, no file, so the text is never dropped.

## 2. After the finish — which actions make sense

### What the modal offers today

Solo / daily: **New puzzle** (primary, → `/solo/import`, the importer),
Share result, Challenge a friend, Daily leaderboard, Play live (only when
Supabase is up; → `/host-game/name` → importer), Back to menu.
Multiplayer: **Play again** (primary) → `createNextGame(prev.puzzle_id, …)`,
i.e. the *same puzzle* in the same room; New puzzle → `/host-game/import`.
— `src/components/CompletionModal/CompletionModal.tsx`,
`src/screens/SoloPlayScreen.tsx`, `src/screens/MultiplayerPlayScreen.tsx:252`.

### Findings

5. **The primary action is the least likely one.** After a daily the player
   wants to brag, see where they stand, and maybe do the next thing; the
   importer is none of those, and on the native app it is a page of
   options that mostly don't apply.

6. **Multiplayer "Play again" rematches a solved puzzle.** Everyone in the
   room has just seen every answer. It should pick a fresh puzzle (today's
   other daily, a classic, or the host's choice) and keep the room code.

7. **"Play live" is fair (fresh puzzle) but lands on the importer**, so the
   fresh puzzle is whatever file you have, which on a phone is nothing.

8. **There is no "what's next".** Today's other dailies (mini → midi →
   large) and the classic library exist, but the finish screen never offers
   them. That is the retention loop, and it costs one query of local solve
   state.

### Recommended modal (solo / daily)

- Headline: time, best, streak (as now); the result block preview (the
  emoji grid) as the hero, since it is what gets shared.
- **Primary: Share** (text block + challenge link). Label after a daily:
  "Share your time".
- Secondary row: **Daily leaderboard** (daily only), **Save image**.
- **Up next** list (two rows max): the unsolved dailies for today in order
  mini → midi → large with their size and theme; if all are solved, one
  classic you haven't played ("Next classic: #7, 13×13"); last resort
  "Browse the library".
- **Race a friend live**: host a fresh puzzle — goes to a puzzle *picker*
  (today's unsolved dailies + classics, reusing the library list with a
  "race" intent), never the importer. The host flow then continues as
  today (name → lobby).
- Quiet exits: "Back to menu" (→ `/menu`). Drop "New puzzle"; the header
  already has "Load different puzzle" for people who want the importer.

### Recommended modal (multiplayer)

- Standings + race time as now; result block coloured by claimant.
- **Primary: Share**. Secondary: **Next puzzle, same room** → the picker
  (the room code is preserved by `createNextGame`, just with a new
  `puzzle_id`); never the solved one.

## 3. The daily leaderboard round trip

9. **The board can be empty right after you post to it.** `submitDailyResult`
   is a select then an upsert (two round trips) fired from an effect; the
   leaderboard screen fetches on mount. Tap "Daily leaderboard" quickly, or
   on a slow connection, and the fetch beats the insert — the first
   finisher of the day sees "No results yet today". Fix: hold the pending
   submission in context (a promise) and have the board await it before
   fetching; render your own row optimistically from the finish you just
   made; refetch on `visibilitychange`. — `SoloPlayScreen.tsx` (submit
   effect), `DailyLeaderboardScreen.tsx` (fetch effect).

10. **The board's primary button replays the puzzle you came from.** "Play
    Today's Mini" is the primary CTA, and "Race friends live" hosts *that*
    puzzle. When the viewer has solved today's slot (local stats know),
    show "Solved in 1:42 · #4 today" instead, and make the race button a
    fresh-puzzle race (the picker from §2). Keep the play button only for
    viewers who have not solved it.

11. **Name signing is in two places with two looks** (the modal's
    `LeaderboardSignForm`, the board's inline form). Fine functionally;
    make them one component so the copy and behaviour stay in step, and
    show the signed name on the board immediately (it does) *and* in the
    modal's share block (it should: the block's "by Archer" is the name).

## 4. Back navigation

12. **"Back to menu" does not go to the menu.** `SiteBar`'s default
    `backTo` is `/`, and `/` is `IndexRedirect`: it checks a URL puzzle,
    an import hash, `?join=`, a saved multiplayer session, then a saved
    solo session, and only then renders the menu. Measured on the dev
    build: finish the daily → leaderboard → bar "Back to menu" → you are
    back on `/solo/play` with the finished puzzle and the modal re-opened.
    With a stale room in `crossword-clash-mp` (a lobby you left by closing
    the app, which `rejoinGame` still accepts because the room is
    "waiting"), the same tap goes `/` → `/rejoin` → that room's lobby:
    the "host the game screen" you hit on the phone. The device-level
    history back from the leaderboard lands on `/solo/play` too (correct),
    but then the modal shows again because `completionModalDismissed` was
    never set on this path.
    Fix: every in-app "menu" link and `navigate("/")` that means "the
    menu" becomes `/menu`; `/` stays the cold-start resolver only. The
    screens that *do* reset state before going home (HostName, Lobby,
    PuzzleReady, Solo's handleReset) already clear their sessions; the
    leaderboard, legal pages, classics and the account sheet's returnTo
    should go to `/menu`.

13. **Room sessions never expire.** `MpSession` has no timestamp;
    `rejoinGame` accepts any "waiting" or "active" room. Add `savedAt`,
    ignore sessions older than 12 h on cold start, and clear the session
    when the room closes, when the game finishes, and when the host leaves
    a lobby. Auto-rejoin should also require that the room was *started*
    or that the session is younger than an hour; an old waiting lobby is
    never what the player wants on launch.

14. **Returning to a finished puzzle.** Coming back to `/solo/play` from
    the leaderboard should show the finished grid with the modal *closed*
    and a slim "Solved in 1:42 · Share · Leaderboard" bar in the header,
    not the full celebration again. Set `completionModalDismissed` when
    the modal navigates away, and give the header that finished state.

15. **Challenge and puzzle-ready back paths are right** (they clear
    `urlPuzzle` before going home). `/solo/play` with no puzzle redirects
    to the importer rather than the menu; on the native app the importer
    is the wrong fallback, so make that redirect `/menu`.

### Status (§4, 2026-10-20)

Items 12–15 shipped together (branch `claude/blissful-lalande-17c062`):

- **12** — `SiteBar`'s default `backTo` and its logo link are `/menu`; so are
  the error/not-found screens, the importing screen's "Back to menu", and
  every `navigate("/")` that had already cleared its own state (host name,
  lobby close/leave, join back, puzzle-ready back, solo and multiplayer
  reset, the room-closed handlers). The account sheet's `returnTo` from the
  play screens is `/menu`. `/` is now only the cold-start resolver; the
  deep-linked screens' `<Navigate to="/">` guards (no puzzle → resolve) are
  unchanged. Router test: the bar's back lands on `/menu` with both a saved
  solo session and a saved room session armed.
- **13** — `MpSession.savedAt` (`SESSION_VERSION` 2; a v1 payload is parsed
  but counts as expired). `loadMpSession()` returns null past 12 h, so the
  cold-start resolver, `GameProvider` and the rejoin effect all ignore it.
  Re-saving the *same* room keeps its stamp (a cold start cannot refresh the
  session it is judging); `touchMpSession()` renews it every minute and on
  hide/pagehide while the player is in the room. The rejoin effect refuses
  a `waiting` room unless the session was touched within the hour. Clearing
  on room close / game finish / host leaving the lobby already existed; a
  finished game is no longer re-saved when the display name changes.
- **14** — `completionModalDismissed` starts true when the restored solo
  puzzle's timer record says it was finished, and is set before the modal
  navigates to the leaderboard or the sign-in sheet. The game header shows
  `FinishedBar` ("Solved in 1:42" chip + Share, which re-opens the modal,
  + Leaderboard for a daily, which goes straight to the board) in place of
  the running clock (solo) / the room code (multiplayer). Loading a new solo
  puzzle resets the flag (previously a dismissed celebration also hid the
  next puzzle's).
- **15** — `/solo/play` with no puzzle redirects to `/menu`.

## 5. Native app specifics (from code)

- `MODE === "mobile"` swaps the importer's copy but still shows the file
  tile; the finish modal's "New puzzle" → that importer. With §2 the
  modal no longer links there.
- `shareOrigin()` already rewrites links to `https://crosswordclash.com`
  for the WebView; the §1 changes keep using it.
- No `@capacitor/app` back-button listener: Android back is the WebView's
  history back, so §4's fixes apply unchanged.

## Suggested order

1. §4 (back targets, session expiry, finished-state return): small,
   mechanical, fixes the two bugs you hit.
2. §2 + §3 together: modal re-ordered around Share and Up next, multiplayer
   rematch on a fresh puzzle, the puzzle picker, leaderboard awaits the
   submission and stops offering the solved puzzle.
3. §1: the result block, merged share/challenge with the daily date link,
   native share sheet. Builds on §2's modal.
