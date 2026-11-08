# Solo play: pause, leave, and resume

Status: implemented for staging on `codex/solo-pause`; see [verification](solo-pause/verification.md). Production release remains separate.
Date: November 7, 2026.

## Problem and outcome

A player tapped **New Puzzle** when interrupted, expecting a way to stop playing,
and lost her progress. The current button clears the session, timer, and
per-puzzle progress before returning to the menu. It gives no warning.

**Leaving or choosing another puzzle must preserve unfinished work.** A player
can take a break, see that their puzzle is saved, and return to the same letters
and elapsed time. Clearing a puzzle must be an explicitly destructive action.

## Recommended scope

Ship pause, save and exit, a visible resume path, and safe puzzle switching
together. Apply to solo dailies, archive puzzles, imports, community puzzles,
and solo friend challenges wherever those sources are available.

Local save and resume are available without an account or subscription. Existing
Plus progress sync remains a separate capability; this feature does not promise
that imported puzzle files become available on another device.

Live versus, co-op, async multiplayer races, and the TV host retain their current
room clocks and leave controls. No player can pause a multiplayer race.

## 1. Playing screen

Replace **New Puzzle** on phones and **Load Different Puzzle** on desktop with
**Pause**, next to the elapsed timer. Use a pause icon and a visible text label,
a minimum 44-pixel target, and the existing secondary button style. Keep the
puzzle title, timer, and Pause reachable at narrow widths; truncate the title
before reducing the controls. Do not add another header button.

Pause immediately stops the clock and checkpoints the attempt. It opens an
opaque pause surface that covers the entire puzzle, clues, and keyboard. Blur
alone is insufficient. No grid content is readable through assistive technology,
and no typing, checking, revealing, clue navigation, or selection changes work
while paused. Dismiss the software keyboard and close any open clue sheet.

Pause surface:

```text
Paused
Stage Combat · 10:51
Your progress is saved on this device.

[ Resume ]
[ Save & exit ]
```

**Resume** is the only primary action. It restores the same selection and
direction, starts the clock, and restores the appropriate input focus.
**Save & exit** is secondary and goes to the existing menu at `/menu`, with
the attempt preserved. Choosing a different puzzle happens there; no additional
picker or redundant exit action is needed on the pause surface.

There is no close icon or outside-tap dismissal. Escape and Android Back from
the pause surface perform Save & exit; only Resume reveals the puzzle and starts
the clock. Announce the dialog once, trap focus, and initially focus Resume.

Once solved, show **Choose another puzzle** in place of Pause. It returns to the
menu without deleting the finish or pending leaderboard submission. Preserve the
existing completion presentation and its Share, board, and Up next actions.

## 2. Menu and resuming

Above the daily cards, show a compact **Continue playing** row for the most
recently played unfinished puzzle:

```text
Continue playing
Stage Combat
42 of 169 squares filled · 10:51
[ Resume ]
```

Use the existing list-row treatment; Resume is visually secondary so the menu
does not gain another large primary button. Count filled squares, not only
correct squares. Show a title and time even if no letters have been entered yet.

If more than one unfinished puzzle is saved, add **In progress (N)** to open a
simple list, newest played first. Each row has a title, filled count, time, and
Resume. Include imports and community puzzles, not only known daily titles.
Opening this list must not require sign-in or archive access. Reuse existing
archive/account progress displays where possible, but do not make either the
only route to an unfinished puzzle.

A daily card with a saved attempt says **Resume** instead of Play. Both that
button and the Continue playing row restore the same attempt. Starting puzzle B
preserves puzzle A, and returning to A restores its own letters and time.

An explicit Resume from the menu or a puzzle list opens the grid running, with
no second Resume tap. A passive return (reload, browser Forward, cold launch,
or tab/app foregrounding) restores the unfinished puzzle paused. Save & exit
remembers the menu as the landing destination, so reopening the app does not
immediately undo the exit. Explicit incoming puzzle or room links retain priority
over a saved landing destination.

## 3. Clock and interruptions

**Proposed timing policy: solo elapsed time measures active play.** Time spent
paused, outside the playing screen, or with the app/page hidden does not count.
No inactivity timeout: thinking while looking at a clue is still playing.

| Event | Result |
| --- | --- |
| Tap Pause | Checkpoint and stop; hide puzzle; remain on pause surface. |
| Tap Resume | Reveal puzzle and start exactly one running segment. |
| Save & exit | Checkpoint, preserve attempt, land on menu. |
| Browser/device Back from active solo play | Preserve and stop before navigation; never reset. |
| Open another in-app page or overlay that obscures the puzzle | Pause and checkpoint; returning requires Resume. Ordinary clue/settings controls remain part of active play. |
| Phone locks, app backgrounds, or tab becomes hidden | Pause and checkpoint; return to the pause surface. |
| Window merely loses focus while still visible | Keep counting; a visible puzzle must not become free thinking time. |
| Reload or reopen an unfinished attempt | Restore paused; do not include time away. |
| Finish | Freeze once, record once, and remove only that unfinished attempt. |

Persist milliseconds; round only for the display and existing result submission.
Repeated pause, hide, pagehide, and unmount events must be idempotent. On a
graceful exit save immediately, not at the next periodic checkpoint. A forced
process termination may lose at most the existing five-second clock checkpoint
interval; typed letters should already be saved.

Solo daily leaderboard entries and solo challenge comparisons use this same
active time. Pause does not mark a solve assisted or ineligible. Reveal retains
its existing effect on eligibility. Existing posted times, bests, and streaks
are not recalculated. Live race times remain continuous.

This is an intentional timing-policy change: historical solo times may include
background time, and solo and live-race times share the daily board today. State
the new solo rule in timer help/release notes. Hiding the grid prevents reading
it while paused, but does not make a client-timed game cheat-proof. Separate
competitive timing or leaderboard categories are outside this change.

## 4. Save contract and failure behavior

Preserve the puzzle definition and source metadata, letters (including incorrect
and revealed states), elapsed time, selection, direction, theme, and applicable
solo challenge target. Preserve attempt-level assistance/free-typing history
across pauses and reloads so leaving cannot improve eligibility or change how a
result is described. Do not post a result or advance a streak when pausing.

Save the outgoing attempt before replacing it with another puzzle. Store enough
locally to resume an imported puzzle after playing something else, without
reimporting it, signing in, or fetching it again. Locally saved puzzle definitions
also allow offline resume for previously loaded dailies.

Keep a bound of 30 unfinished attempts, but do not silently evict unfinished
work to make space. At capacity, keep the current attempt safe and offer the
In progress list to resume or explicitly remove an entry before starting another
new puzzle. Removal requires **Remove saved puzzle?** with **Keep puzzle** and
**Remove**; explain that its saved letters and time will be deleted. Completed
history is unaffected. This management action is outside the playing header.

Only show “saved” after the local write succeeds. If storage is unavailable or
full, remain paused with the in-memory attempt intact and show:
**“We couldn't save this puzzle on your device. Keep it open and try again.”**
Offer **Try again** and **Resume**. Do not proceed with an in-app action that
would overwrite the only remaining copy. Browser/app termination cannot be
prevented reliably; lifecycle saving is best effort. Network or sync failure
must never block a successful local save or erase local progress.

Migrate existing valid session, timer, and per-puzzle records without clearing
them. Enrich the current saved puzzle into the new resumable record. Older daily
records can be resolved from their known source when available; keep unresolved
legacy records rather than discarding them. Do not claim that previously lost
import definitions or progress deleted by the old New Puzzle button can be
recovered.

## 5. Restart is separate and deferred

A restart is not needed to take a break or switch puzzles. Do not expose a new
restart control in the first release. No existing navigation action should clear
unfinished work.

If added later, place **Restart puzzle…** under puzzle options, with this exact
confirmation shape:

```text
Restart this puzzle?
This clears your letters and resets the timer. It can't be undone.

[ Keep playing ]  [ Restart puzzle ]
```

Keep playing is the default focus; cancel changes nothing. Restart must affect
only the current attempt and preserve historical finishes. Before shipping it,
define replay eligibility for daily boards, personal bests, and challenges so
resetting the clock cannot silently turn a studied attempt into a fresh record.
The first release does not need to resolve that separate product decision.

## 6. Implementation boundaries and current evidence

The November 7 local source was inspected; production and native builds were
not checked. Existing unrelated working-tree changes must be preserved.

| Current owner | Work implied by this spec |
| --- | --- |
| `src/screens/SoloPlayScreen.tsx` | Split safe navigation from `handleReset`; Pause UI; gate all puzzle interactions; preserve finished-result navigation. |
| `src/hooks/useSoloTimer.ts` | Explicit active/paused/completed lifecycle, immediate checkpoint, hidden-page handling. Today hiding only checkpoints; it does not stop the running segment. |
| `src/contexts/GameContext.tsx` | Restore and checkpoint attempts, retain source/context; distinguish loading another puzzle from discarding this one. |
| `src/lib/soloProgress.ts` | Today records hold cells/time/counts, omit puzzle definitions, skip empty grids, and evict oldest over 30. Extend persistence and make capacity/write failure observable. |
| `src/lib/soloProgressSync.ts` | Preserve local-only metadata when merging remote cells/time; do not emit deletes for pause/exit/switch. Retain existing entitlement and conflict rules. |
| `src/screens/MenuScreen.tsx` | Continue playing, accessible In progress list, daily Resume labels. |
| `src/routes.tsx` and root lifecycle handling | Honor explicit menu exits and passive paused restores without disrupting incoming links or multiplayer rejoin. |
| Grid input, native keyboard, clue sheet, account overlays | One interaction gate; covering the grid alone cannot stop document-level key handlers. |
| `src/hooks/usePlayInsights.ts` | Exclude paused time; avoid duplicate finish reporting or inflated activity on repeated resume. |
| English/Spanish resources | Translate all new labels, statuses, confirmations, and errors; sentence case throughout. |

Prefer extending the existing attempt store over introducing a second competing
save system. Keep the active-session entry as a compatibility pointer, not a
separate source of letters or time. Store puzzle definitions once per identity.
Any storage schema should be versioned and migrated defensively.

## 7. Acceptance scenarios

1. **The reported interruption:** enter letters in Stage Combat, pause at 10:51,
   leave for ten minutes, resume. Same letters and selection; clock continues
   from 10:51. No reset or result submission occurs.
2. **Save and find it:** Save & exit shows the menu with Stage Combat and Resume.
   Reloading the menu keeps that destination and the saved attempt.
3. **Switch twice:** partially play A, choose B from the menu, return to A. Both
   appear in progress with independent letters and clocks. Repeat with A an
   imported puzzle, offline, signed out.
4. **Real interruptions:** verify phone lock/unlock, app background/foreground,
   hidden/visible browser tab, Back/Forward, and reload. Return paused, no time
   away added, no keyboard or accessible clue content behind the pause surface.
5. **No-letter attempt:** pause before typing, exit, and resume. The puzzle and
   elapsed time survive; it does not vanish because its filled count is zero.
6. **Input isolation:** physical letters, Backspace, arrows, Tab, touch grid,
   native keyboard, Check and Reveal cannot change a paused puzzle. Resume
   restores usable focus without an extra tap on the selected cell.
7. **Timing edges:** rapid repeated pause/resume and overlapping lifecycle events
   neither double-count nor reset elapsed time. Switching puzzles checkpoints
   the outgoing key before initializing the incoming key. Completing next to a
   checkpoint cannot overwrite completed state with an unfinished timer.
8. **Save failures/capacity:** simulate rejected storage writes and 30 saved
   attempts. No false saved message, automatic eviction, or replacement of the
   only copy. Retry succeeds after capacity/storage is restored.
9. **Migration and sync:** load an existing saved session and multiple legacy
   progress records; preserve them. A remote progress merge cannot drop the
   local puzzle definition, and pause/exit do not delete the synced record.
10. **Finish and fairness:** wrong/revealed letters and free-typing history survive
    resume; completion is recorded once. Historical stats and pending board
    submissions survive Choose another puzzle. No Pause appears in multiplayer.
11. **Layout/accessibility:** check 320–390px phones, desktop, long titles,
    English/Spanish, keyboard focus, screen readers, native safe areas, and
    reduced motion. Pause, Resume, and Save & exit remain visible and reachable.

Use focused behavioral tests for timer, persistence, transitions, and result
eligibility, followed by browser checks and real iOS/Android lifecycle checks.
Mocked visibility events alone do not verify phone lock and app backgrounding.

## Delivery

Implementation and local browser verification are recorded in the linked verification report. Native hardware verification and production release remain separate work. Completion of the eventual feature
means the interruption and puzzle-switching scenarios pass for both daily and
imported puzzles, and no navigation button silently clears unfinished work.
