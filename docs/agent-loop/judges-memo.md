# Judges' Memo — Crossword Clash

The standing panel's **durable memory**. A long-lived session eventually compacts or restarts; this file is what survives. Each judge **reads its section on spawn** (to rehydrate its taste) and the loop **appends each judge's dated memoNote after every feature** (judges return the note; the loop writes serially to avoid races). Append-only — never rewrite history; the trail of sharpening taste *is* the value.

Andrew can read this anytime to see how the panel sees the app evolving. Read it before drafting the next increment of the queue.

---

## Shipped ledger (append-only)
One line per judged feature: `YYYY-MM-DD · <feature-id> · winner approach + tally (one-line why) · #PR [state]`.
<!-- the loop appends here -->
2026-06-30 · F5 · winner = candidate A (product approach) · 2-0 (judge-correctness + judge-simplicity for A; judge-product delivered no verdict — went idle without transmitting JSON despite repeated requests) · gated PR (billing-sensitive, awaiting owner approval). Applied steal: service-level pricing fallback so model-id drift can't zero out the cap.

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
- 2026-06-30 · F5 · (no verdict transmitted this round — the product lens went unrepresented; follow up on why the agent idled without sending. Restore product-feel coverage next iteration.)

---

## judge-simplicity — evolving taste

**North star.** Smallest clean diff: the full outcome with the least new surface area and no scope creep.

**Observations (append-only)**
<!-- append: YYYY-MM-DD · feature-id · what this taught me -->
- 2026-06-30 · F5 · Billing-sensitive briefs invert my default: the larger diff wins when its extra bulk is the required fail-closed wallet guard the smaller one skipped — "no simpler" beats "smaller" when real money leaks through the cut corner.
