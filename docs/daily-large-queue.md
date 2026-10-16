# Daily Large queue

The Daily Large is the second daily: an original themed 15×15 beside the mini.
A day's large is a static file, `public/daily-puzzles/large/YYYY-MM-DD.json`,
written by `pnpm daily:add --slot large <date> <puzzle.ipuz> "<Theme>"` and
served as soon as the commit deploys (a day with no file has no large; the menu
shows no second tile). The studio's Daily queue (`daily_schedule` in Supabase)
can also fill a day, but a static file wins when both exist.

Every puzzle below came out of `pnpm seedgrid:large` on 2026-10-16 (plus the
hand-built Halftime Show), passes the grid standards (white corners, no 2×2
black block, no shared letter run over 3), and has a full clue set with speed
clues. Monday–Saturday clues were written at the **easy** register, Sunday at
**medium**: the first two weeks are deliberately gentle, and play insights will
tell us where a steeper weekday gradient belongs. Source folders (grid, review
notes, every fill and clue decision) are in `artifacts/large/` on the
constructor's machine.

| Day | Date | Title | Theme | Themers | Clues |
|---|---|---|---|---|---|
| Thu | 2026-10-16 | Seed Money | Gardening × finance | BRANCH MANAGER, ROOT OF ALL EVIL, HEDGE FUND, MONEY TREE | easy |
| Fri | 2026-10-17 | Economic Forecast | Weather × economics | FLOOD THE MARKET, BALLOON PAYMENT, RAINY DAY FUND, HIRING FREEZE | easy |
| Sat | 2026-10-18 | Prime Time Nap | Sleep × TV | PILLOW TALK SHOW, SNOOZEFESTIVAL, SLEEPWALK-ONS, SIESTA FIESTA | easy |
| Mon | 2026-10-19 | Grounds for Arrest | Coffee × crime | SPILL THE BEANS, CAFFEINE FIEND, AFFOGATO AWAY, PRESS CHARGES | easy |
| Tue | 2026-10-20 | Mixed Doubles | Tennis × romance | BREAK POINT, DOUBLE DATE, COURTSHIP, LOVE MATCH | easy |
| Wed | 2026-10-21 | Star Anise | Astronomy × cooking | CRESCENT ROLLS, ECLAIR ECLIPSE, MARS BARBECUE, SUNSPOT OF TEA | easy |
| Thu | 2026-10-22 | Split Decision | Boxing × politics | ON THE ROPE LINE, CORNER MANDATE, LOW BLOWHARD, UPPERCUT TAX | easy |
| Fri | 2026-10-23 | Much Ado About Nothing Burger | Shakespeare × tech | SHYLOCK SCREEN, OTHELLO WORLDS, AS YOU LIKE IT, MACBOOK BETH | easy |
| Sat | 2026-10-24 | Halftime Show | Football × music | TOUCHDOWN UNDER, KICKOFFSPRING, GOAL LINE DANCE, GOAL POST MALONE | easy |
| Sun | 2026-10-25 | Star System | Space × Hollywood | RED CARPET GIANT, MOON WALK OF FAME, DARK MATTER DAMON | medium |
| Mon | 2026-10-26 | Sweat Equity | Fitness × finance | BENCHMARK PRESS, RUNNING BALANCE, FLEX SPENDING, SPOTTER PRICE | easy |
| Tue | 2026-10-27 | Open Positions | Chess × the office | PAWN SHOP TALK, BOARD MEETING, RANK AND FILE, KNIGHT SHIFT | easy |
| Wed | 2026-10-28 | Full-Court Jams | Basketball × music | LAYUPTOWN FUNK, FREE THROWBACK, TURNOVERTURE, TIPOFFSPRING | easy |
| Thu | 2026-10-29 | Extinction Event | Dinosaurs × the office | RAPTOR RAPPORT, TRICERATOP TEN, T-REXT MESSAGE, IGUANODONUTS | easy |
| Fri | 2026-10-30 | Full Stack Kitchen | Cooking × programming | KERNEL SANDERS, SPAGHETTI CODE, HASH BROWNIES, COOKIE BANNER | easy |
| Sat | 2026-10-31 | Table Stakes | Poker × startups | POKER FACEBOOK, SHOWDOWN ROUND, BURN RATE, DEAL FLOW | easy |
| Sun | 2026-11-01 | Flow State | Yoga × tech | NAMASTE AT HOME, CHAKRA CHARGER, YOGA MATRIX, ZENDESKTOP | medium |

## Keeping the queue filled

1. Pick a theme from `docs/large-puzzle-themes.md` (or add one to the JSON and
   run `scripts/seedgrid/check-themes.mts`), then build it:
   `pnpm seedgrid:large --theme "<A x B>" --title "<Title>" --seeds "<four themers>" [--difficulty easy|medium|hard]`.
   Themers must pair by length (plus at most one centered odd entry); sets with
   two 14s or two 13s stacked need room and sometimes a themer swap. Four themers
   is the sweet spot: every five-entry backlog set (two pairs plus a centered 15)
   failed to find a skeleton on 2026-10-16, and all three filled once the 15 was
   dropped. Some four-sets still fail on their letters alone (cars × anatomy).
2. Read `review.md`: anything "Flagged for the editor" or "forced by the
   layout" needs a studio pass (import `studio.json`, reject the word, Fill).
3. `pnpm daily:add --slot large <date> <folder>/puzzle.ipuz "<Theme>"`, commit
   the JSON, open a PR. The day goes live on deploy; nothing in the apps changes.
4. A title never repeats one of its own theme entries (Andrew, 2026-10-16): it should hint at the mashup, not hand over an answer.
5. Aim to stay two weeks ahead. Repeat themers or fill words across nearby
   days are worth avoiding; the review notes list every entry.
