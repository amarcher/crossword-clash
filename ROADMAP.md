# Crossword Clash — Polish & Virality Roadmap

**North-star funnel:** organic solo visitor → engaged solo player → sharer → multiplayer host/challenger → repeat visitor.

The new GA4 funnel events (`puzzle_imported`, `mode_selected`, `puzzle_completed`,
`game_started`, `narrator_enabled`, plus `result_shared` / `challenge_created` /
`challenge_accepted` reserved for items below) measure each hop. Ship a feature →
watch its event in app-traffic → keep or cut.

## The core problem the data will confirm

A cold visitor from organic search has **no puzzle to play** (the bookmarklet needs
an NYT sub) and **no friends present**, so they bounce before seeing multiplayer or
the AI narrator — the two things that make this app special. The roadmap attacks that
in order: give them something to play → give them a reason to share → let them pull a
friend in → let everyone experience the narrator.

---

## Backlog (ordered; `loop` = safe for autonomous engineer+reviewer, `gated` = needs a human decision first)

### F1 — Daily puzzle + built-in free library  ·  size: M  ·  **gated** (content sourcing)
**Problem:** cold visitors have nothing to play instantly.
**Scope:** bundle a set of free-to-distribute puzzles (normalized to the `Puzzle`
type) as static assets; add a primary "Play today's puzzle" CTA on the menu that
deep-loads one deterministically by date; rotate daily; works fully offline/solo.
**Acceptance:** menu shows a prominent "Play today" tile above the fold; clicking
loads straight into `/solo/play` with no import step; the same calendar day always
yields the same puzzle; no Supabase dependency.
**Gate:** decide puzzle source (public-domain set, generated grids, or licensed).
This is the one blocking decision — see Open Decisions.
**Events:** reuse `mode_selected {mode:"daily"}`, `puzzle_completed {mode:"solo"}`.

### F3 — Solo timer + personal best + streak  ·  size: S–M  ·  **loop**
**Problem:** solo play has no stakes or reason to return.
**Scope:** elapsed timer during solo play; persist best time per puzzle hash and a
daily-play streak in localStorage; show both on the completion modal and the menu.
**Acceptance:** timer visible while solving; best/streak persist across reloads;
completion modal shows "Your time: M:SS (best: M:SS)". Pure-function time/streak
logic in `lib/` with unit tests.
**Dependency:** none. Feeds F2.

### F2 — Shareable result card  ·  size: M  ·  **loop**
**Problem:** completions are invisible — no viral loop.
**Scope:** on completion (solo + multiplayer), render a result card to PNG (canvas)
— "Solved *[Puzzle]* in M:SS 🏆 crosswordclash.com" — with Web Share API on mobile
and copy-link + download on desktop.
**Acceptance:** Share button on completion modal produces an image + a link back to
the site; fires `result_shared {mode, method}`; graceful fallback when Web Share
unavailable.
**Dependency:** F3 (for the time on the card).

### F6 — Completion celebration polish  ·  size: S  ·  **loop**
**Scope:** confetti + a short win sound (reuse existing audio infra) on completion;
make "Play again / Rematch" the prominent next action.
**Acceptance:** celebration fires once per completion; respects `prefers-reduced-motion`
and the existing mute setting.

### F5 — Make the AI gameshow narrator accessible, with owner cost controls  ·  size: L  ·  **gated** (budget + billing)
**Problem:** the narrator is hidden behind a localStorage gate + TV view + 2 players,
so effectively no one reaches the app's best feature.
**Scope:**
- Remove the hidden `crossword-clash-elevenlabs` devtools gate; expose a clear
  narrator opt-in in the TV/host UI.
- **Server-side budget guard** in the edge functions (`narrator-claude`,
  `agent-auth`, `openai-agent-auth`, `tts`): before authorizing, query rolling spend
  from the Neon `api_usage` table (already logged) and refuse when over an
  env-configured daily/monthly cap; return a clean "narrator unavailable" signal the
  client shows gracefully.
- Per-session/IP rate limiting (extend existing `_shared/rateLimit.ts`).
- A **demo allowance**: let any TV user sample the narrator for N events / a short
  window, then prompt — so visitors taste it without unbounded cost.
- Owner env switches: global enable/disable + default engine (default to the
  cheapest path, e.g. Claude+TTS or browser TTS).
**Acceptance:** a normal visitor on `/host` can turn the narrator on without
devtools; spend is hard-capped by env config; exceeding the cap disables it with a
friendly message; usage remains visible in app-traffic.
**Gate:** owner must set the daily/monthly $ cap, demo allowance size, and default
engine — see Open Decisions. Security/cost-sensitive: human reviews before deploy.

### F4 — Challenge link: "come play me on this puzzle"  ·  size: L  ·  **gated** (multiplayer/session design)
**Problem:** multiplayer needs friends present *now*; there's no way to invite someone
to a specific puzzle.
**Scope:** from a puzzle or the completion screen, generate a challenge URL that drops
a friend directly into a multiplayer room on that exact puzzle, with attribution
("[Name] challenges you to this crossword"). Builds on existing `#puzzle=` transfer +
`?join=` code infra. Define behavior when the inviter isn't present yet (pre-create
room and wait in lobby, vs. let the invitee start).
**Acceptance:** "Challenge a friend" button → copyable link → opening it lands the
invitee in a lobby/room on that puzzle with the challenger's name shown; fires
`challenge_created` / `challenge_accepted`.
**Gate:** confirm the async model (live-only lobby vs. ghost/async race) and any
Supabase schema/session changes before building.

### F7 — Landing/onboarding nudge  ·  size: S  ·  **loop** (optional)
**Scope:** lightweight first-visit framing on the menu (one-line "how it works" +
"Play today" hero) to cut bounce. No new routes.

---

## Suggested execution order

1. **F1 Daily puzzle** — biggest activation lever (after the content decision).
2. **F3 Timer/streak** — small, unblocks the share card.
3. **F2 Share card** — opens the viral loop.
4. **F6 Celebration polish** — complements F2, cheap.
5. **F5 Narrator accessibility + cost controls** — high personal value; human-gated.
6. **F4 Challenge link** — largest; multiplayer + session work.

`loop`-tagged items (F3, F2, F6, F7) are well-specified frontend work safe to run
through the autonomous engineer+reviewer loop. `gated` items (F1, F5, F4) each need
one human decision first, then their implementation can also go through the loop.

## Decisions (locked 2026-06-30)

- **Harness:** `simple-agent-loop` — pair of builders per feature in worktrees, 3-judge
  blind A/B, winner ships as a PR (human reviews before merge/deploy).
- **Starting feature:** **F5 — narrator accessibility + cost controls.**
- **F5 cost cap:** **~$20/month** hard ceiling on combined Anthropic + ElevenLabs
  spend (queried from Neon `api_usage`); narrator auto-disables for the rest of the
  month when exceeded, with a friendly client message. Because this touches billing,
  it ships as a PR for human review — never auto-deployed.
- **F1 puzzle source:** **public-domain / Creative-Commons pack**, bundled as static
  assets (source + verify licensing during F1).
- **F4 model:** still open — live-only invite vs. async ghost race (decide when F4
  comes up).
