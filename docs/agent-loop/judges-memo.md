# Judges' Memo — Crossword Clash

The standing panel's **durable memory**. A long-lived session eventually compacts or restarts; this file is what survives. Each judge **reads its section on spawn** (to rehydrate its taste) and the loop **appends each judge's dated memoNote after every feature** (judges return the note; the loop writes serially to avoid races). Append-only — never rewrite history; the trail of sharpening taste *is* the value.

Andrew can read this anytime to see how the panel sees the app evolving. Read it before drafting the next increment of the queue.

---

## Shipped ledger (append-only)
One line per judged feature: `YYYY-MM-DD · <feature-id> · winner approach + tally (one-line why) · #PR [state]`.
<!-- the loop appends here -->
2026-06-30 · F5 · winner = candidate A (product approach) · 2-1 (correctness + simplicity for A on fail-closed billing safety; product dissented for B because A's demo uses the FREE browser voice, not the premium ElevenLabs voice that is the feature's whole appeal) · gated PR #44 (billing-sensitive, awaiting owner approval). Applied steal: service-level pricing fallback so model-id drift can't zero out the cap. OPEN PRODUCT QUESTION surfaced to owner: should the free demo use the premium (paid, bounded by the fail-closed per-IP counter) voice or the free browser voice?
2026-06-30 · F3 · winner = candidate A (product approach) · 3-0 UNANIMOUS (correctness arrived after ship, confirming A) · PR #45 [auto-merge on green]. A's full-solution-grid identity + accumulated-elapsed timer beat B's title+dims identity (best-time bleed across daily minis) and now−startedAt timer (lies after an overnight tab). Applied steals: previousBest → modal shows the beaten time + skips the hollow first-solve "New best!"; and B's gap<=0 clock-skew guard in rollStreak so a backward clock change can't nuke a streak.
2026-06-30 · F6 · winner = candidate B (product approach) · 2-1 (correctness + product for B; simplicity for A on the leaner diff) · PR #46 [auto-merge on green]. B's pure isFreshCompletion(prevOpen,open) re-arms per completion where A's never-resetting celebratedRef fired once per MOUNT — killing confetti/chime on every in-place rematch win; B also has non-mutating particle steps + a tested mute predicate. Applied steal: removed the dead confetti CSS A had already cleaned. Follow-ups: autoFocus vs useFocusTrap, fold winSound / share one AudioContext, replace the CTA IIFE with a typed sub-component.
2026-06-30 · F2 · winner = candidate A (minimalist approach) · 2-1 (simplicity + correctness for A; product for B) · PR #47 [merged]. A is self-contained, reuses the modal's truthful winner/isTie + existing formatDuration, tests the decision-core; B re-derived MP rank and mis-bragged a tied-for-first player as "#2". CORRECTION: correctness's lead reason (B's toastBus import "missing") was factually wrong — src/lib/toastBus.ts exists on main; verdict stands on B's tie-mis-brag + A's leanness. Applied steal: deferred URL.revokeObjectURL (sync revoke aborts download in Safari/FF). Top follow-up (unanimous interest): graft B's per-viewer MP standing (#K/N) for a personal brag, derived from the modal's winner/isTie, FIXING the tie-for-first case.
2026-07-01 · F2b · winner = candidate A (minimalist) · 2-1 (simplicity + correctness for A; product for B) · PR #48 [auto-merge on green]. Both fixed the tie-safe rank identically (1+count-strictly-higher); A stayed in-scope (share card + caption), B added an out-of-scope on-screen-announcement rework. Applied steals: outcome-varied glyph (🏆 win / 🤝 tie / 🧩 placement) so a non-winner's card/caption never wears a trophy; + a shuffled-input order-independence PROOF (A's tie tests used pre-sorted fixtures).

---

## judge-correctness — evolving taste

**North star.** Code health and safety: checks green, sound structure, untouchable layer untouched, gotchas respected.

**Observations (append-only)**
<!-- append: YYYY-MM-DD · feature-id · what this taught me -->
- 2026-06-30 · F5 · A hard spend ceiling is only as strong as its softest bypass: a server-side, fail-closed, localStorage-proof demo bound beat a smaller, cleaner diff whose demo grace trusted a client header — but it taught me to also distrust exact-model-key pricing, which can silently fail the cap fully open (→ applied the service-fallback steal).
- 2026-06-30 · F3 · Persistence correctness beat a smaller diff: identity must include the solution grid (title+size collide on daily minis), resume must store accumulated active time not startedAt, and the double-count guard must survive reload via a persisted flag — and tests only count when they cover the impure orchestrator, not just the pure helpers. (Caught the rollStreak backward-clock-skew reset → grafted the gap<=0 guard.)
- 2026-06-30 · F6 · A once-only guard must RE-ARM: gating on a never-reset "already celebrated" ref passes the three named tests yet silently kills every subsequent legitimate win (rematch) — worse than the reopen double-burst it prevents; prefer the prevOpen-transition guard. Non-mutating particle steps + a tested mute predicate beat in-place mutation; leftover dead CSS the brief called out is a cheap, real code-health ding.
- 2026-06-30 · F2 · For a viral share, "brag something TRUE" and "checks green from the diff" outrank richer tests + personalization: reuse the existing pure util (formatDuration) and the modal's own derived winner/isTie — re-deriving rank invites drift + wrong metrics (the loser bragged a co-leader as 2nd); and defer object-URL revokes or the download silently fails. (But: I leaned too hard on a "missing toastBus" that actually exists — verify the dependency before docking for it.)
- 2026-07-01 · F2b · When both candidates fix the critical bug identically, correctness stops deciding — prefer the in-scope, smaller diff; extra surface earns its keep only when it buys a correctness property the smaller one LACKS, not polish + unrequested scope. But hold the winner to proving its headline property adversarially: A's order-independence was true by construction yet tested only with sorted fixtures — a shuffled-input assertion is the evidence a tie-safety re-do should carry.

---

## judge-product — evolving taste

**North star.** Product feel: the version the user of Crossword Clash actually wants to live with.

**Observations (append-only)**
<!-- append: YYYY-MM-DD · feature-id · what this taught me -->
- 2026-06-30 · F5 · When a feature's magic is a premium AI voice, the demo MUST use that voice — protect the wallet on the expensive paths and let the cheap taste sing; a "wallet-safest" demo that downgrades to robot TTS defeats the feature's purpose. (Dissented for B 2-1; verdict arrived late after a SendMessage-delivery hiccup.)
- 2026-06-30 · F6 · "Once per completion" is not "once per mount" — a permanent celebrated-ref silently kills every win after the first on in-place rematch; always judge the SECOND win and the rematch path. And when the brief names a "prominent next action," punting on it loses to a candidate that builds the hero CTA.
- 2026-06-30 · F3 · For return-driven features (timer/streak/best), judge the away-and-back scenarios first: a title+size-only identity bleeds daily-mini bests and a startedAt-delta timer lies after a closed tab — robustness in the return path outweighs a smaller diff. Also: don't celebrate a best-of-one; show the time the player beat so the win reads earned.
- 2026-06-30 · F2 · For a viral share the headline metric must be a PERSONAL true brag for everyone who can share — a card that only celebrates the winner (third-person) gives non-winners nothing to post; threading the current user's rank turns every participant into a sharer, and that's the growth lever, not card polish. (Lost 2-1; flagged as the must-do follow-up on the winner.)
- 2026-07-01 · F2b · For a viral share the PUBLIC artifact's tone IS the product: a non-winner's caption/card must never wear a trophy — vary the emoji by outcome (win/tie/placement). Personalizing the on-screen moment too is coherent, but watch that '#2 of 2' doesn't rub a head-to-head loser's face in last.

---

## judge-simplicity — evolving taste

**North star.** Smallest clean diff: the full outcome with the least new surface area and no scope creep.

**Observations (append-only)**
<!-- append: YYYY-MM-DD · feature-id · what this taught me -->
- 2026-06-30 · F5 · Billing-sensitive briefs invert my default: the larger diff wins when its extra bulk is the required fail-closed wallet guard the smaller one skipped — "no simpler" beats "smaller" when real money leaks through the cut corner.
- 2026-06-30 · F6 · On "polish" briefs bigger usually means gilding — credit extra surface only when it fixes a real correctness/resource issue, and dock the larger diff hard when it still skips a required cleanup (dead CSS) the smaller one completed. (Lost this one 2-1: the larger diff's extra surface DID fix a real re-arm bug, so it earned its size.)
- 2026-06-30 · F3 · Data-correctness corners (best-time bleed from a too-weak identity key) behave like billing: the smaller diff loses when it's small because it weakened the key, not because it found real economy.
- 2026-06-30 · F2 · When a brief scopes the pure/tested core to *decisions* (share-method, text, filename) and calls the canvas "thin glue," promoting pixel geometry into its own injected-measureText engine is cost, not value — reward the candidate that tested exactly the decisions and drew the card directly.
- 2026-07-01 · F2b · When a brief names ONE surface ('the share card'), also reworking a sibling surface (the on-screen announcement) is scope creep even when tasteful — credit the in-scope refinements (outcome-varied emoji) and push the rest to a separate follow-up; the smaller diff that fully covers the named scope wins.
