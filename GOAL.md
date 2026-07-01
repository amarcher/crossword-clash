# /goal — Crossword Clash: "Enterprise-feel, viral daily co-op"

> Hand this to Fable as the standing goal. It's one comprehensive goal; the six
> workstreams are numbered by priority. **Ship Workstream 1 fully before moving on** —
> polish is the foundation everything else sits on.

## North star
Take Crossword Clash from "working prototype with real usage" to something that
*feels* like high-grade, modern consumer software — zero-flicker, buttery mobile,
instantly shareable — and lands one genuine virality loop: friends attacking a
daily puzzle together and coming back for the streak/leaderboard.

You (Fable) own the whole arc: identify the gaps, close them, keep the app shippable
at every step. Work in small, reviewable PRs.

## Non-negotiable quality bar (applies to EVERY change)
- **Zero visible flicker** on cell input. Typing a letter must never cause a reflow,
  font-resize jump, layout shift, or repaint flash.
- **Impeccable mobile.** Real-device feel: no tap delay, no scroll-jank, no
  keyboard-covers-the-cell, no accidental zoom on focus, hidden input stays in sync,
  direction toggle + prev/next word thumb-reachable. Test at 375px width.
- Tests stay green (`pnpm test`, ~400 tests) and `pnpm build` type-checks clean.
- i18n parity preserved: every new user-facing string goes in BOTH `en.json` and
  `es.json` (there's a parity test — don't break it).
- Offline-first respected: app must still work with no Supabase env vars (solo path).
- Match existing conventions (named exports, barrel `index.ts`, pure `lib/` fns,
  `React.memo` on hot components). No new state library — the single `useReducer`
  in `usePuzzle.ts` stays.
- Don't regress multiplayer: local-check → `claim_cell` RPC → broadcast, session
  rejoin, room close, TV/narrator paths must keep working.

---

## Workstream 1 — Polish & mobile feel  ⟵ DO THIS FIRST, ship it fully
**Goal:** the app feels enterprise-grade the instant you touch it.

**Known root causes (grounded — start here, verify on a real device, then generalize):**
- **Self-input flicker = the fill animation firing on your own keystrokes.** `.cell-fill`
  (`src/index.css:15`) scales `0.85→1` + fades `opacity 0→1` over 250ms every time a
  letter first appears, applied via `animateFill` in `CrosswordGrid.tsx:333`. It fires
  for the local player's own typing, so a fast solo solve pops every character. Decide
  the right feel: suppress/greatly soften the animation for *self*-input (it's most
  valuable for *remote* players' claims in multiplayer), and honor `prefers-reduced-motion`
  (already wired at `index.css:39`). The letter itself must appear instantly.
- **Extra render churn per fill.** `animatingFills` does two `setState` passes per fill
  (add, then remove after 300ms — `CrosswordGrid.tsx:83-96`). Simplify so a keystroke
  causes the minimum re-render. (`Cell` memo is currently intact — `playerColorMap` is
  `useMemo`'d in `MultiplayerContext.tsx:122` + `HostLayout.tsx:553`, solo passes
  `undefined` — keep it that way; don't introduce a new unstable prop that defeats memo.)
- **Mobile grid resize/jump when the keyboard opens.** Grid sizes off `100dvh`/`100vw`
  (`CrosswordGrid.tsx:257-258`); the virtual keyboard shrinks `dvh` and the whole grid
  visibly resizes. Stabilize sizing so opening the keyboard doesn't reflow the grid
  (e.g. lock to the initial visual viewport / use `svh` semantics / measure once).
- **Selection flickers away on mobile** when the keyboard dismisses
  (`showSelection = !isTouchDevice || inputFocused`, `CrosswordGrid.tsx:66`). Make the
  active cell/word feel persistent rather than blinking in and out.

**Then generalize the polish pass:**
- Micro-interactions (cell fill, word completion, correct/wrong feedback, lockout
  overlay) should feel intentional and smooth, all respecting reduced-motion.
- Consistent modern visual system: spacing, type scale, focus rings, dark surface
  (`#1e1e2e` theme), loading/empty states, no jarring screen-to-screen transitions.

**DoD:** On a real phone, a full solo solve feels flawless — no flicker, no jank, no
layout shift, nothing that reads as "hobby project." Lighthouse mobile performance &
best-practices both ≥90 on the play screen.

## Workstream 2 — Daily co-op + cross-day leaderboard  (the virality bet)
**Goal:** "attack today's puzzle with friends, together, and come back tomorrow."
- Shareable daily-race lobby: friends land on one URL, wait together, host (or a
  countdown) releases everyone into the SAME puzzle at the SAME instant.
- Works for the daily puzzle AND any arbitrary imported puzzle (same lobby mechanic).
- Post-solve result screen with your time + rank; "boast" share (feeds WS4).
- Cross-day leaderboard + personal streak for return appeal. Use the simplest durable
  store (Supabase table) that fits the existing anon-auth model.
- **DoD:** Two people open a link, wait in a lobby, race the same daily at once, see
  who won and their times, and have a reason to return tomorrow (streak/board).

## Workstream 3 — Generator modernization (own content, co-primary source)
**Goal:** a queue of modern, audited dailies we fully control — beyond 5×5.
- Remove the hard 5×5 lock: `scripts/mini-generator/validate-mini.mjs:43` rejects any
  non-5-row grid; `filler.mjs:110` loops `0..5`. Generalize validator + filler to N×N
  with symmetric black-square patterns (target sizes e.g. 5×5, 7×7, 11×11, up to a
  themed 15×15 daily).
- Modern, themed fill and clue quality — lively vocabulary, real themes, no obscure
  crosswordese; an audit gate that rejects weak grids/clues before they ship.
- Pipeline that keeps a week+ of validated dailies queued ahead (`src/lib/dailyMinis.ts`).
- **DoD:** the generator produces a themed, validated N×N daily that passes the audit
  gate; a week of dailies is queued; nothing hard-codes 5.

## Workstream 4 — Dynamic share / OG images
**Goal:** every shared link is inviting; every result is a boast.
- Replace the static `public/og-image.png` (currently generic, wired in `index.html`)
  with dynamic OG cards: per-puzzle (title/size) and per-result ("Solved today's mini
  in 1:42 — beat me"). Consider a Vercel OG image route (`@vercel/og`) rendering on the fly.
- Wire the boast share from WS2's result screen to these cards.
- **DoD:** sharing a daily-race link or a result renders a rich, specific preview card
  in iMessage/Slack/Twitter — not the generic default.

## Workstream 5 — Smoother multiplayer/TV invite UX (lower the entry lift)
**Goal:** the handshake works, but setup is a big lift for a host/client. Make the path
from "I want to play with friends" → "we're all in the grid" obvious.
- Redesign host → share → join → lobby → TV flow: fewer decisions, clearer copy,
  obvious QR/link handoff, less confusion between Host / TV / Join modes.
- **DoD:** a first-time host gets 2 friends + a TV view live without instructions.

## Workstream 6 — Bookmarklet import UX (co-primary external source)
**Goal:** importing an external (e.g. NYT) puzzle is smooth and intuitive.
- Improve the bookmarklet install + import flow (`bookmarklet/`, the static
  `/install-bookmarklet` page, and the PuzzleReady screen): clearer instructions, fewer
  dead ends, better error/empty states when a page has no extractable puzzle.
- **DoD:** a non-technical user installs the bookmarklet and imports a puzzle on first try.

---

## Explicitly OUT of scope (do not attempt)
- **No NYT-subscription-token / account-scraping integration.** Automating puzzle
  retrieval via a user's NYT credentials violates their ToS and creates a security/
  liability surface. Sourcing = our own generator (WS3) + user-initiated bookmarklet
  (WS6) only.
- No new state-management library; no rewrite of the reducer.
- Don't break offline/solo mode or existing multiplayer.

## Working agreement
- Start each workstream by writing down the concrete gaps you find, then close them.
- Keep PRs small and independently shippable; update memory/ROADMAP notes as you land things.
- If a decision is genuinely ambiguous (leaderboard scope, daily grid-size ceiling),
  pick the simplest thing that satisfies the DoD and note the assumption — don't stall.
