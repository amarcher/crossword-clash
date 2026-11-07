# Solo pause and resume — verification

November 7, 2026. Branch `codex/solo-pause`, based on `29eb5ca`.

## What changed

The solo header now offers Pause. Pausing hides the grid, clues, and keyboard;
Resume continues active-play time and Save & exit preserves the puzzle on the
menu. Continue playing lists unfinished puzzles, including local imports, with
explicit removal confirmation. Daily cards say Resume when an attempt exists.

Each saved attempt includes its puzzle definition, letters, clock, selection,
theme, challenge, and assistance/free-typing history. Saving is checked before
switching puzzles, and reaching 30 unfinished puzzles no longer evicts one.
Reload waits for restoration and opens paused. Browser hidden/pagehide events
and native background/Back listeners stop solo time. Multiplayer clocks and
production deployment are unchanged.

## Checks

- Full production build and TypeScript: passed.
- Full lint: passed with the existing unrelated `useNarrator.ts` dependency warning.
- Unit/API/proxy suite after the web build: **1,941 passed, 2 skipped**. Includes
  the web-bundle check that native plugins stay out of web assets.
- Native-mode lifecycle test: **1 passed** (mocked Capacitor events and cleanup).
- Browser suite: **7 passed**. Includes the original daily completion flow plus
  phone/desktop pause, save/exit, puzzle switching, offline import resume,
  reload, Back/Forward, hidden-page time, failed-save recovery, full-capacity
  removal, and Spanish at 320px.
- Screenshots inspected: `paused-375.png`, `paused-1280.png`, `menu-375.png`,
  `menu-1280.png`, and `paused-es-320.png`.

Local tests use `NODE_OPTIONS=--no-experimental-webstorage` because the host
Node runtime exposes an incomplete global storage object to jsdom otherwise.
Existing locked dependencies were installed in the isolated worktree with user
approval; package versions and the lockfile were not changed.

## Limits

Real iOS/Android lock/unlock, backgrounding, native keyboard behavior, and native
Back have not been exercised on hardware. The native event wiring is unit-tested,
and browser visibility/navigation behavior is covered in Chromium. Cross-device
Plus sync was checked at the merge/store level, not against a live account.

Solo times now exclude breaks. Existing leaderboard results are not rewritten;
live race times remain continuous. Restart remains deferred as specified.
Legacy records without a puzzle definition are retained and resolved through the
daily index when possible; lost import definitions cannot be reconstructed.
