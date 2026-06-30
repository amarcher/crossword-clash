# Task Queue — Crossword Clash

The pair loop's cursor (see `PAIR-LOOP.md`). **One feature = one pair build = one PR = one iteration.**

Each entry is a **feature** — a coherent unit each of the 2 builders can fully implement in one sitting and the judges can meaningfully compare — a surface, a flow, a capability. Not a micro-task, not an epic. Full backlog rationale lives in `/ROADMAP.md`.

**Status tokens** (the loop rewrites them):
- `[ ]` — open, not started
- `[wip]` — an iteration is mid-flight
- `[review: #NN]` — winner chosen, PR open, merges on CI green (Andrew's veto can override; 👍 not required)
- `[done: #NN]` — merged
- `[blocked: <reason>]` — needs a decision or unmet dependency; the loop skips these

**Entry format** — token line carries state; indented lines are the builders' brief.

### Open
<!-- loop pulls the topmost [ ] feature; append new features below this comment -->

- [done: #44] F5 — Make the AI gameshow narrator accessible with owner cost controls · slug:narrator-access-budget · winner=A(product) 2-1 · MERGED (needs `supabase functions deploy` + optional NARRATOR_MONTHLY_USD_CAP to enforce in prod)
      outcome: A normal visitor on /host can turn the AI narrator on through clear UI (no hidden
        localStorage devtools gate), and the owner has a hard, env-configurable monthly spend
        ceiling that auto-disables it. Crossword Clash's best feature stops being invisible while
        staying cost-safe.
      done-when: (1) the `crossword-clash-elevenlabs` localStorage gate no longer hides narrator
        opt-in in the TV/host UI — narrator selection is reachable normally; (2) a server-side
        budget guard in the edge functions (narrator-claude, agent-auth, openai-agent-auth, tts)
        queries rolling month-to-date spend from the Neon `api_usage` table and refuses to
        authorize when combined Anthropic+ElevenLabs estimated spend ≥ an env cap
        (NARRATOR_MONTHLY_USD_CAP, default 20), returning a clean machine-readable
        "narrator_unavailable: budget" signal; (3) the client surfaces that signal gracefully
        (friendly message, narrator stays off) instead of erroring; (4) per-session rate limiting
        via _shared/rateLimit.ts; (5) a short demo allowance so a first-time TV user can sample
        the narrator briefly before the gate; (6) the $/cap conversion logic is extracted into a
        PURE, unit-tested function (testable under vitest) — model pricing in, spend estimate out.
      constraints: [GATED — billing-sensitive] Ship as a PR and STOP at [review]; do NOT auto-merge.
        File a wait for Andrew's explicit approval (a 👍/comment on the PR) — this overrides the
        default merge-on-green gate for this one feature. Edge functions are Deno (npm: imports,
        Deno.env) and are NOT covered by `tsc -b`/vitest, so put all verifiable logic in a pure
        TS module the React build typechecks and vitest tests; keep the Deno glue thin. Do not log
        or expose secrets. Default engine should favor the cheapest path. Reuse the existing
        usageLog/api_usage schema; do not change applied migrations.

### Blocked (needs a decision — the loop skips these)

- [blocked: F4 invite model undecided — live-only lobby vs async ghost race] F4 — Challenge link "come play me on this puzzle" · slug:challenge-link
      outcome: From a puzzle or the completion screen, a player generates a link that drops a
        friend straight into a multiplayer room on that exact puzzle, attributed
        ("[Name] challenges you to this crossword"). Builds on the existing #puzzle= transfer +
        ?join= code infra.
      done-when: "Challenge a friend" button → copyable link → opening it lands the invitee in a
        lobby/room on that puzzle with the challenger's name shown; fires challenge_created /
        challenge_accepted analytics events.
      constraints: Decide live-only vs async ghost-race model before building (see ROADMAP Open
        decisions). Likely Supabase/session changes — gated.

### Backlog (ready, not yet queued — promote into Open next increment)

- [done: #45] F3 — Solo timer + personal best + streak · slug:solo-timer-streak · winner=A(product) 3-0 · MERGED
      outcome: Solo play has stakes and a reason to return — an elapsed timer, a per-puzzle best
        time, and a daily-play streak, all persisted and surfaced on the completion modal + menu.
      done-when: timer visible while solving; best time (per puzzle hash) and daily streak persist
        across reloads in localStorage; completion modal shows "Your time: M:SS (best: M:SS)";
        time/streak logic is pure functions in lib/ with unit tests. Feeds F2.

- [review: #47] F2 — Shareable result card · slug:share-result-card · winner=A(minimalist) 2-1 · after F6 #46 (modal overlap)
      outcome: On completion (solo + multiplayer), the player can share a result card —
        "Solved [Puzzle] in M:SS 🏆 crosswordclash.com" — opening the viral loop.
      done-when: Share button on the completion modal renders a card to PNG (canvas), uses Web
        Share API on mobile and copy-link + download on desktop, links back to the site, and fires
        result_shared {mode, method}; graceful fallback when Web Share is unavailable.
      constraints: depends on F3 (time on the card). Don't block if F3 unshipped — degrade to a
        no-time card.

- [review: #46] F6 — Completion celebration polish · slug:completion-celebration · winner=B(product) 2-1 · auto-merges on green
      outcome: Finishing a puzzle feels like a win — confetti + a short sound, with "Play again /
        Rematch" as the prominent next action.
      done-when: celebration fires once per completion; respects prefers-reduced-motion and the
        existing mute setting; reuses existing audio infra (no heavy new deps).

- [ ] F7 — Landing / first-visit onboarding nudge · slug:onboarding-nudge
      outcome: A cold visitor immediately understands what to do — a one-line "how it works" and a
        clear primary action on the menu — cutting bounce. No new routes.
      done-when: first-visit framing renders on the menu, dismissible/non-intrusive, i18n in en+es.

- [ ] F1 — Daily puzzle + built-in free library · slug:daily-puzzle
      outcome: A cold visitor can play instantly with no import — a "Play today's puzzle" CTA loads
        a free puzzle deterministically by date, working fully offline/solo.
      done-when: menu shows a prominent "Play today" tile; clicking loads straight into /solo/play
        with no import step; the same calendar day yields the same puzzle; no Supabase dependency.
      constraints: source = public-domain / CC puzzle pack bundled as static assets normalized to
        the Puzzle type. VERIFY licensing of any bundled puzzle before committing it; if no
        verified pack is available in-session, build the loader + daily-rotation logic against a
        small placeholder set and flag the sourcing as a follow-up rather than committing
        unlicensed content.

### Done (most recent first; trimmed periodically)
_(none yet)_
