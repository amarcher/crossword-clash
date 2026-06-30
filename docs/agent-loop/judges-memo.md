# Judges' Memo — Crossword Clash

The standing panel's **durable memory**. A long-lived session eventually compacts or restarts; this file is what survives. Each judge **reads its section on spawn** (to rehydrate its taste) and the loop **appends each judge's dated memoNote after every feature** (judges return the note; the loop writes serially to avoid races). Append-only — never rewrite history; the trail of sharpening taste *is* the value.

Andrew can read this anytime to see how the panel sees the app evolving. Read it before drafting the next increment of the queue.

---

## Shipped ledger (append-only)
One line per judged feature: `YYYY-MM-DD · <feature-id> · winner approach + tally (one-line why) · #PR [state]`.
<!-- the loop appends here -->
2026-06-30 · F5 · winner = candidate A (product approach) · 2-1 (correctness + simplicity for A on fail-closed billing safety; product dissented for B because A's demo uses the FREE browser voice, not the premium ElevenLabs voice that is the feature's whole appeal) · gated PR #44 (billing-sensitive, awaiting owner approval). Applied steal: service-level pricing fallback so model-id drift can't zero out the cap. OPEN PRODUCT QUESTION surfaced to owner: should the free demo use the premium (paid, bounded by the fail-closed per-IP counter) voice or the free browser voice?
2026-06-30 · F3 · winner = candidate A (product approach) · 2-0 (simplicity + product for A; correctness verdict still pending at ship time — append when it lands) · PR #45 [auto-merge on green]. A's full-solution-grid identity + accumulated-elapsed timer beat B's title+dims identity (best-time bleed across daily minis) and now−startedAt timer (lies after an overnight tab). Applied steal: previousBest → modal shows the beaten time and skips the hollow first-solve "New best!".

---

## judge-correctness — evolving taste

**North star.** Code health and safety: checks green, sound structure, untouchable layer untouched, gotchas respected.

**Observations (append-only)**
<!-- append: YYYY-MM-DD · feature-id · what this taught me -->
- 2026-06-30 · F5 · A hard spend ceiling is only as strong as its softest bypass: a server-side, fail-closed, localStorage-proof demo bound beat a smaller, cleaner diff whose demo grace trusted a client header — but it taught me to also distrust exact-model-key pricing, which can silently fail the cap fully open (→ applied the service-fallback steal).

---

## judge-product — evolving taste

**North star.** Product feel: the version the user of Crossword Clash actually wants to live with.

**Observations (append-only)**
<!-- append: YYYY-MM-DD · feature-id · what this taught me -->
- 2026-06-30 · F5 · When a feature's magic is a premium AI voice, the demo MUST use that voice — protect the wallet on the expensive paths and let the cheap taste sing; a "wallet-safest" demo that downgrades to robot TTS defeats the feature's purpose. (Dissented for B 2-1; verdict arrived late after a SendMessage-delivery hiccup.)
- 2026-06-30 · F3 · For return-driven features (timer/streak/best), judge the away-and-back scenarios first: a title+size-only identity bleeds daily-mini bests and a startedAt-delta timer lies after a closed tab — robustness in the return path outweighs a smaller diff. Also: don't celebrate a best-of-one; show the time the player beat so the win reads earned.

---

## judge-simplicity — evolving taste

**North star.** Smallest clean diff: the full outcome with the least new surface area and no scope creep.

**Observations (append-only)**
<!-- append: YYYY-MM-DD · feature-id · what this taught me -->
- 2026-06-30 · F5 · Billing-sensitive briefs invert my default: the larger diff wins when its extra bulk is the required fail-closed wallet guard the smaller one skipped — "no simpler" beats "smaller" when real money leaks through the cut corner.
- 2026-06-30 · F3 · Data-correctness corners (best-time bleed from a too-weak identity key) behave like billing: the smaller diff loses when it's small because it weakened the key, not because it found real economy.
