# Grid UI audit — solver and studio

Audited 2026-10-16 on `main` (18a2591) in a worktree. Covers the crossword grid
itself: cell chrome, selection (cursor + active word), keyboard/tap navigation,
and the fill / word-complete / reject animations, in the solver
(`src/components/CrosswordGrid/`) and the studio (`src/components/Studio/StudioGrid.tsx`
+ `src/lib/seedgrid/studioState.ts`). Verified in the browser at 1280 px and at
375 px, with animations frozen mid-keyframe where a screenshot could not catch
them.

## Status

Items 1–10 shipped for the solver grid (October 2026; screenshots in
`docs/grid-ui-audit/`). Still open: 11–12 (hover affordance, selection
announcement), 13–17 (studio grid) and 18 (shared hidden input).

## Verdict

The solver grid predates the September facelift and never got its tokens: it
still highlights with Tailwind `yellow-200` / `amber-50` / `#b45309` and pure
`#000`, draws a 2 px inset outline on *every* cell of the active word, and
three of its four animations have paint-order bugs. The studio grid is the
newer, better model (gold tokens, fills only, no outlines) and the solver
should move to it, not the other way round. The studio's own problems are
colour collisions between its heatmap and its selection, and a contrast miss
on the cursor cell.

## Confirmed bugs (fix first)

1. **The wrong-letter flash is invisible.** `cell-reject` draws its red ring as
   a 2 px inset `box-shadow`, but the rejected cell is always the selected cell,
   whose 3 px inset `outline` paints on top of it. Only the 2 px shake
   survives. Verified: computed `box-shadow: rgb(239,68,68) 0 0 0 2px inset`
   present, nothing red on screen. Under `prefers-reduced-motion` the shake is
   also removed, so those users get no feedback at all for a wrong letter.
   — `src/index.css` (`@keyframes cell-reject`), `src/components/CrosswordGrid/Cell.tsx` (outline).
   Fix: flash the background (e.g. `red-100`) and swap the outline colour to red
   for the duration; keep the colour flash under reduced motion and drop only
   the translate.

2. **Remote fills blink black before they pop.** `.cell-fill` animates the
   *cell's* opacity from 0, so for the first frames the white cell is gone and
   the black grid background shows through. Verified at the 0 % keyframe (cell
   fully black). — `src/index.css`, `Cell.tsx` (`animClass`).
   Fix: put the pop on the letter `<span>` only (opacity + scale on the span),
   never on the container.

3. **The word-complete sweep is clipped on two sides.** `scale(1.08)` on a cell
   whose later siblings paint over it: the right and bottom edges of each
   popping cell hide under its neighbours, so the glow only shows top-left.
   Verified at the 50 % keyframe. — `src/index.css` (`word-complete-sweep`).
   Fix: either `z-index: 1` on `.cell-word-complete` (cells are already
   `relative`) or, better, drop the scale and keep just the staggered inset
   glow; a 15×15 of staggered scaling is jittery anyway.

4. **Clicking a square that belongs to one word only strands the cursor.**
   `SELECT_CELL` keeps the current direction even when that direction's "word"
   is the single cell, so you get a one-cell highlight, `activeClue === null`,
   and the clue bar shows nothing. In standard American grids this never
   happens, but 44 of the 46 classic-library puzzles have such squares (1,290
   in total), and imported British/cryptic grids do too. — `src/hooks/usePuzzle.ts`
   (`SELECT_CELL`, also `advanceCursor`'s landing cell).
   Fix: after selecting, if `getWordCells(...direction).length === 1` and the
   other direction's word is longer, flip `direction`.

5. **Arrow keys dead-end at black squares.** `MOVE_SELECTION` returns the same
   state when the next cell is black or off-grid, so a down-arrow into a block
   does nothing and the user has to click. Every mainstream solver skips over
   blocks to the next white cell in that direction (and NYT wraps at the edge).
   — `src/hooks/usePuzzle.ts` (`MOVE_SELECTION`).
   Fix: walk in the arrow's direction until a white cell; stop at the edge (or
   wrap, your call).

## Solver: selection and cell chrome

6. **Per-cell outlines turn the active word into a ladder.** Each highlighted
   cell draws its own 2 px inset outline, and with the 1 px gap that is a 5 px
   dark band between every pair of letters. The `amber-50` fill underneath is
   so close to white that the outline is doing all the work, and on a phone
   (70 px cells) the boxes dominate the grid. Recommendation: fills only, as
   the studio already does — `gold-100` for the word, `gold-400` for the
   cursor, no outline on word cells. If the cursor needs extra weight on
   multiplayer colours, a single 2 px outline on the cursor cell only.

7. **Multiplayer: the active word changes look halfway along.** Cells owned by
   a player keep their 18 % tint and get outline-only; unowned cells get
   `amber-50` + outline. One word, two treatments. Recommendation: render the
   word highlight as a translucent layer *over* whatever the base colour is
   (an `::after` with gold at ~35–40 %, or blend gold on top of the player
   tint in `blendOnWhite`), so the band is continuous across owned and unowned
   cells.

8. **Three colours for one concept.** Grid active word: yellow/amber. Clue
   list active clue: `brand-100` blue. Mobile clue bar direction chip: blue.
   The design tokens in `src/index.css` say gold is *the* highlight colour
   ("the active word"). Pick one: make the clue list's active row `gold-100`
   with `gold-700` text (or keep blue everywhere, but then the grid should be
   blue). The studio's clue panel should follow the same choice.

9. **Grid frame drifts from the rest of the brand.** Solver: `#000` cells,
   `border-2 border-black`, square corners. Studio and `MiniGridThumb`: `ink`
   (#141a26), `rounded-lg`/`rounded-md`. Move the solver to `bg-ink`,
   `border-ink`, `rounded-lg overflow-hidden` so grid, thumbnails and studio
   read as one family.

10. **Clue click lands on the first cell even when it is filled.** NYT lands on
    the first *empty* cell of the word. Small, cheap, nice. — `handleClueClick`
    in the play screens.

11. **No hover affordance on desktop.** `cursor-pointer` only. A faint
    `surface-sunken` tint under `@media (hover: hover)` helps. Keep selection
    changes instant (no transition) — that part is right.

12. **Selection is not announced.** The hidden input has a static `aria-label`
    and the `aria-selected` div is never focused, so a screen-reader user gets
    nothing when the cursor moves. Give cells ids and set
    `aria-activedescendant` on the input; the existing per-cell `aria-label`
    then does the work.

## Studio grid

13. **Heatmap colours collide with selection colours.** `snug` is `amber-50`,
    `tight` `orange-100`, `dead` `red-200`; the active word is `gold-100` and
    the cursor `gold-400`. Same hue family, so a snug run reads as a second
    highlighted word (it fooled me in the first screenshot). Move the heat to a
    different channel: a cool ramp (`surface-sunken` → `brand-100` → a muted
    red for dead) so gold means "yours" only, or show heat as a small count /
    dot in the cell corner. — `HEAT_BG` in `StudioGrid.tsx`.

14. **The active word hides its own heat.** `cursor ? gold-400 : active ?
    gold-100 : heat` — the one entry you are editing is the one whose
    tightness you cannot see. Render the selection as an overlay on the heat
    (as in item 7), or keep the corner-dot idea from item 13 visible on active
    cells.

15. **Engine letters on the cursor cell miss AA contrast.** `text-brand-600`
    (#2456e6) on `gold-400` (#f5bd2c) is about 3.4:1; the letter is 21 px
    medium at 15×15, which needs 4.5:1. On the cursor cell render every letter
    in `ink` and keep the engine/locked distinction by weight only, or add a
    lighter `gold-300` token for the cursor.

16. **Number size has no cap.** `26/w cqi` is ~30 px on a 5×5 (the solver caps
    at 17 px). Wrap it in `min(…, 1rem)`.

17. **Small things.** Black cells are clickable but lack `cursor-pointer`; the
    cursor on a black cell is only a 3 px gold outline on ink, which gets lost
    at 15×15 — consider the same outline plus a gold dot. There is no
    direction cue when the cursor sits on a block (no active word, no clue);
    a tiny ▸/▾ glyph in the cursor cell would settle it.

## Shared

18. **Two hidden-input implementations.** The solver clears the input after
    each change and relies on a Backspace keydown; the studio keeps a
    zero-width sentinel so Android keyboards that only report keyCode 229 still
    produce an erase. The studio's is the more robust one. Extract a
    `useHiddenGridInput` hook (sentinel approach, 16 px font, the iOS
    synchronous-focus rule) and use it in both.

## Checked and fine

- Grid lines stay exactly 1 px at 15 wide (Chrome snaps the `1fr` tracks);
  no sub-pixel unevenness.
- Hidden inputs are 16 px (no iOS zoom); `touch-action: manipulation` on
  cells; no horizontal overflow at 375 px; `svh`-based sizing keeps the grid
  stable when the keyboard opens.
- Tap-same-cell-to-toggle-direction and arrow-sets-direction match in both
  grids.
- Letter / number scaling with `cqi` works at 5×5 through 15×15.
- Fill pops are correctly suppressed for the local player and on hydration.

## Suggested order

1. Items 1–3 (CSS-only, an hour, all three are visibly broken today).
2. Items 4–5 (reducer changes with tests; item 4 matters for every classic).
3. Items 6–9 together as one "solver grid adopts the facelift tokens" change,
   updating `Cell.test.tsx`'s colour assertions.
4. Items 13–15 for the studio.
5. Items 10–12, 16–18 as polish.
