# Daily Mini queue

Minis are the front-door daily. From 2026-10-16 they come from static feed files,
`public/daily-puzzles/YYYY-MM-DD.json` (`pnpm daily:add <date> <puzzle.ipuz> "<Theme>"`),
which replace the bundled 20-puzzle rotation in `dailyMinis.ts` for every day that has one;
the rotation remains only as the offline fallback. Every puzzle below was built with
`pnpm seedgrid --size 5|7 --difficulty easy` on the production word list, then given a
**timely-clue pass** (dated hooks — holidays, the World Series, Election Day — offered to the
clue writer, who rewrote a clue only where one fit; 13 clues across the 30 took one).

| Day | Date | Title | Size | Longest entries |
|---|---|---|---|---|
| Fri | 2026-10-16 | Pumpkin Spice | 5×5 | ALIAS, MOCHA, STICK |
| Sat | 2026-10-17 | Friday Night Lights | 5×5 | ANNUL, YANNI, TENET |
| Sun | 2026-10-18 | Farmers Market | 7×7 | RECITAL, ACTIONS, CHALLAH |
| Mon | 2026-10-19 | Coffee Break | 5×5 | TRITE, AGILE, YALTA |
| Tue | 2026-10-20 | Taco Tuesday | 5×5 | SPRIG, CARNE, HENCE |
| Wed | 2026-10-21 | Flux Capacitor | 5×5 | PABLO, GREAT, BEBOP |
| Thu | 2026-10-22 | Game Night | 5×5 | HOUSE, ANSEL, LUSTS |
| Fri | 2026-10-23 | Movie Night | 5×5 | AGORA, MAVEN, FLICK |
| Sat | 2026-10-24 | Haunted House | 7×7 | CASPER, CHESTS, THEIST |
| Sun | 2026-10-25 | Fall Classic | 7×7 | SPHERES, CATCHER, REHIRES |
| Mon | 2026-10-26 | Candy Bowl | 5×5 | ACTOR, TRICK, AARON |
| Tue | 2026-10-27 | Black Cat | 5×5 | SORER, CROSS, KNOCK |
| Wed | 2026-10-28 | Carving Night | 5×5 | SPOON, NIMOY, IAMSO |
| Thu | 2026-10-29 | Costume Party | 5×5 | ANGEL, IGLOO, SILVA |
| Fri | 2026-10-30 | Campfire Tales | 5×5 | PABLO, SHEET, SIREN |
| Sat | 2026-10-31 | Trick or Treat | 7×7 | GAMEBOY, NEURONS, FRISBEE |
| Sun | 2026-11-01 | Marigolds | 7×7 | CALGARY, CHURROS, HOMERUN |
| Mon | 2026-11-02 | Extra Hour | 5×5 | FRIAR, DREAM, ANDRE |
| Tue | 2026-11-03 | Ballot Box | 5×5 | ELISE, OLDIE, ELDER |
| Wed | 2026-11-04 | Soup Season | 5×5 | NIECE, BROTH, ENVOY |
| Thu | 2026-11-05 | Sweater Weather | 7×7 | MITTENS, BEEGEES, FLANNEL |
| Fri | 2026-11-06 | Pizza Party | 5×5 | PESTO, STIRS, BASIL |
| Sat | 2026-11-07 | Road Trip | 7×7 | THUNDER, PULSATE, CABRIDE |
| Sun | 2026-11-08 | Lazy Sunday | 7×7 | WAFFLES, REROUTE, SLEEPIN |
| Mon | 2026-11-09 | Desk Drawer | 5×5 | SPECK, ISLES, CIVIC |
| Tue | 2026-11-10 | Liftoff | 5×5 | ORKIN, HIKED, GLENN |
| Wed | 2026-11-11 | Salute | 5×5 | LURES, SERVE, GUARD |
| Thu | 2026-11-12 | Jazz Club | 7×7 | SUTURES, TRUMPET, ROPEIN |
| Fri | 2026-11-13 | Lucky Thirteen | 5×5 | ABATE, SEVEN, PENNY |
| Sat | 2026-11-14 | Bake Sale | 7×7 | BEDROLL, BROWNIE, CONTOUR |
| Sun | 2026-11-15 | Apple Pie | 7×7 | |
| Mon | 2026-11-16 | Cozy Night | 7×7 | |
| Tue | 2026-11-17 | Bread Basket | 5×5 | |
| Wed | 2026-11-18 | Mouse House | 5×5 | |
| Thu | 2026-11-19 | Honest Abe | 7×7 | |
| Fri | 2026-11-20 | Rivalry Week | 7×7 | |
| Sat | 2026-11-21 | Hello There | 7×7 | |
| Sun | 2026-11-22 | Sunday Roast | 7×7 | |
| Mon | 2026-11-23 | By the Numbers | 5×5 | |
| Tue | 2026-11-24 | Grocery Run | 5×5 | |
| Wed | 2026-11-25 | Travel Day | 5×5 | |
| Thu | 2026-11-26 | Turkey Day | 7×7 | |
| Fri | 2026-11-27 | Doorbusters | 5×5 | |
| Sat | 2026-11-28 | Main Street | 7×7 | |

## What we learned building these

- 5×5s with rotational symmetry rarely place two seed words; `--symmetry none` fills them in seconds.
- 7×7s on the production list need `--min-score 60` or the review refuses the fill for junk.
- Hand-picked `--seeds` beat a free brainstorm when a theme keeps failing (BLITZ/PUNT, SCARF/WOOL).
- A title never repeats an entry; the midi of the same day must not reuse the mini's or the large's entries.
- Keep two weeks ahead: stock runs to 2026-11-28; the next batch should start by 2026-11-14.
