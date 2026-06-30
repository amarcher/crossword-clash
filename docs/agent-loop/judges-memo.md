# Judges' Memo — Crossword Clash

The standing panel's **durable memory**. A long-lived session eventually compacts or restarts; this file is what survives. Each judge **reads its section on spawn** (to rehydrate its taste) and the loop **appends each judge's dated memoNote after every feature** (judges return the note; the loop writes serially to avoid races). Append-only — never rewrite history; the trail of sharpening taste *is* the value.

Andrew can read this anytime to see how the panel sees the app evolving. Read it before drafting the next increment of the queue.

---

## Shipped ledger (append-only)
One line per judged feature: `YYYY-MM-DD · <feature-id> · winner approach + tally (one-line why) · #PR [state]`.
<!-- the loop appends here -->
_(empty — no features judged yet)_

---

## judge-correctness — evolving taste

**North star.** Code health and safety: checks green, sound structure, untouchable layer untouched, gotchas respected.

**Observations (append-only)**
<!-- append: YYYY-MM-DD · feature-id · what this taught me -->

---

## judge-product — evolving taste

**North star.** Product feel: the version the user of Crossword Clash actually wants to live with.

**Observations (append-only)**
<!-- append: YYYY-MM-DD · feature-id · what this taught me -->

---

## judge-simplicity — evolving taste

**North star.** Smallest clean diff: the full outcome with the least new surface area and no scope creep.

**Observations (append-only)**
<!-- append: YYYY-MM-DD · feature-id · what this taught me -->
