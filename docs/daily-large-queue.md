# Daily Large queue

The Daily Large is the second daily: an original themed 15×15 beside the mini.
A day's large is a static file, `public/daily-puzzles/large/YYYY-MM-DD.json`,
written by `pnpm daily:add --slot large <date> <puzzle.ipuz> "<Theme>"` and
served as soon as the commit deploys (a day with no file has no large; the menu
shows no second tile). The studio's Daily queue (`daily_schedule` in Supabase)
can also fill a day, but a static file wins when both exist.

Every puzzle below came out of `pnpm seedgrid:large` (plus the hand-built
Halftime Show; the 16–29 November fortnight was built on 2026-10-17 with
`--context` hooks for Thanksgiving week), passes the grid standards (white corners, no 2×2
black block, no shared letter run over 3), and has a full clue set with speed
clues. Monday–Saturday clues were written at the **easy** register, Sunday at
**medium**: the first two weeks are deliberately gentle, and play insights will
tell us where a steeper weekday gradient belongs. Source folders (grid, review
notes, every fill and clue decision) are in `artifacts/large/` on the
constructor's machine (the 16–29 November set under `2026-10-17-*` and
`retry-*/`, one folder per build attempt).

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
| Mon | 2026-11-02 | Sunken Treasure | Ocean × finance | CURRENT ACCOUNT, UNDERWATER LOAN, SHELL COMPANY, LIQUID ASSETS | easy |
| Tue | 2026-11-03 | Ballot Measures | Elections × food | CAUCUS COUSCOUS, SWING STATE FAIR, PRIMARY RIBS, LANDSLIDERS | easy |
| Wed | 2026-11-04 | Seventh-Inning Stretch | Baseball × music | BULLPENTATONIX, DOUBLE PLAYLIST, HOME RUN DMC, DUGOUT KAST | easy |
| Thu | 2026-11-05 | Working Like a Dog | Dogs × office life | LEASH AGREEMENT, PUPPERFORMANCE, PAWPERWORK, FETCH QUOTA | easy |
| Fri | 2026-11-06 | Stage Combat | Theater × military | THEATER OF WAR, SCENE STEALTH, CASTING CALL SIGN | easy |
| Sat | 2026-11-07 | Forecast: Hits | Weather × music | NOVEMBER RAIN, WIND OF CHANGE, HEAT WAVE, COLDPLAY | easy |
| Sun | 2026-11-08 | Nineteenth Hole | Golf × music | DRIVERS LICENSE, EAGLE EYE CHERRY, FORE FIGHTERS, GREEN DAY PASS | medium |
| Mon | 2026-11-09 | Busy Bees | Bees × business | HIVE MIND SHARE, BUZZKILLER APP, WORKER BEENEFITS | easy |
| Tue | 2026-11-10 | Dinner and a Show | Bands × food | CRANBERRY SAUCE, BREAD AND BUTTER, PEARL JAM JAR, HOT CHIPOTLE | easy |
| Wed | 2026-11-11 | Fur and Games | Cats × sports | PURRFECT GAME, FELINEBACKER, LITTER BOX SCORES | easy |
| Thu | 2026-11-12 | Walk the Plank | Pirates × tech | EYEPATCH UPDATE, PARLEY PROTOCOL, HOOK HANDSHAKE, SCUTTLEBUTTON | easy |
| Fri | 2026-11-13 | Deep Dish Data | Pizza × tech | GLUTEN FREEWARE, EXTRA SAUCE CODE, SICILIAN SILICON | easy |
| Sat | 2026-11-14 | Icing Call | Hockey × food | STANLEY CUPCAKE, FACE OFF THE BONE, SLAPSHOT GLASS | easy |
| Sun | 2026-11-15 | Something Borrowed | Weddings × sports | RECEPTION YARDS, AISLE RUNNERS UP, HONEYMOON SHOT, BOUQUET TOSS UP | medium |
| Mon | 2026-11-16 | Garage Band | Home improvement × rock bands | SHED ZEPPELIN, RADIATORHEAD, FOO FIXTURES, DECK LEPPARD | easy |
| Tue | 2026-11-17 | Breakfast Blotter | Breakfast × crime | CEREAL KILLER, SUNNY SIDE JOB, POACHED EGGS, OMELET YOU GO | easy |
| Wed | 2026-11-18 | Looney Spoons | Cartoons × food | DAFFY DUCK CONFIT, SCOOBY DOUGH, TOM AND JERRY | easy |
| Thu | 2026-11-19 | Sound Investment | Money × musicians | COMMON CENTS, BILL WITHERS, NICKELBACK, JOHNNY CASH | easy |
| Fri | 2026-11-20 | Instant Replay | Football × tech | TOUCHDOWN SCREEN, WIFI RECEIVER, TIGHT END USER | easy |
| Sat | 2026-11-21 | Special Delivery | The post office × idioms | RETURN TO SENDER, LETTER OF THE LAW, PUSH THE ENVELOPE | easy |
| Sun | 2026-11-22 | Rare Groove | Steak cuts × musicians | FLANK SINATRA, BONE IN THE USA, CHUCK BERRY, RUMP SHAKER | medium |
| Mon | 2026-11-23 | Show Your Work | Math × pop culture | ALGEBRACADABRA, SINE OF THE TIMES, MEAN GIRLS, ODD COUPLE | easy |
| Tue | 2026-11-24 | Supermarket Sweep | The supermarket × musicians | BAG BOY GEORGE, LOYALTY CARDI, DAIRY QUEEN, SPICE GIRLS | easy |
| Wed | 2026-11-25 | In-Flight Entertainment | Air travel × music | LAYOVERTURE, COCKPITBULL, COACHELLA, STAND BY ME | easy |
| Thu | 2026-11-26 | Turkey Bowl | Thanksgiving dinner × football | CRANBERRY SACK, APPLE TURNOVER, HAIL MARY PIE, SPIKED CIDER | easy |
| Fri | 2026-11-27 | Opening Weekend | Black Friday × movies | BIG BOX OFFICE, REBATES MOTEL, STORE WARS, SALEM'S LOT | easy |
| Sat | 2026-11-28 | Open for Business | Small businesses × showbiz | FLORIST GUMP, TAILOR SWIFT, LOCKSMITHS, THRIFT SHOP | easy |
| Sun | 2026-11-29 | Second Helpings | Thanksgiving leftovers × idioms | BUTTERFINGERS, SMALL POTATOES, COLD TURKEY, GRAVY TRAIN | medium |

## Keeping the queue filled

1. Pick a theme from `docs/large-puzzle-themes.md` (or add one to the JSON and
   run `scripts/seedgrid/check-themes.mts`), then build it:
   `pnpm seedgrid:large --theme "<A x B>" --title "<Title>" --seeds "<four themers>" [--difficulty easy|medium|hard]`.
   Themers must pair by length (plus at most one centered odd entry); sets with
   two 14s or two 13s stacked need room and sometimes a themer swap. Four themers
   is the sweet spot: every five-entry backlog set (two pairs plus a centered 15)
   failed to find a skeleton on 2026-10-16, and all three filled once the 15 was
   dropped. Some four-sets still fail on their letters alone (cars × anatomy).
   Two flags from the November batch: `--paired` refuses crossing placements
   (without it, steak × music put three themers down and left an unthemed 12
   mirroring FLANK SINATRA), and `--reject "nest, nemo"` keeps the same day's
   mini and midi answers out of the fill from the start (a 4-letter collision
   that the local refill cannot clear usually needs a fresh skeleton). Stacked
   13/13 + 12/12 sets with awkward endings (SHOPPING LISZT, QUARTERBACKUP)
   found no skeleton at 48 and only junk at 45; a centered 15 or a 12/12 +
   10/10 shape filled at 50 every time.
2. Read `review.md`: anything "Flagged for the editor" or "forced by the
   layout" needs a studio pass (import `studio.json`, reject the word, Fill).
3. `pnpm daily:add --slot large <date> <folder>/puzzle.ipuz "<Theme>"`, commit
   the JSON, open a PR. The day goes live on deploy; nothing in the apps changes.
4. A title never repeats one of its own theme entries (Andrew, 2026-10-16): it should hint at the mashup, not hand over an answer.
5. Aim to stay two weeks ahead. Repeat themers or fill words across nearby
   days are worth avoiding; the review notes list every entry. Before
   publishing, compare the day's three puzzles: no entry of 4+ letters may
   appear in two of them, and no title may be one of their entries.

## Daily Midi queue

The midi (9×9) is the third daily, `public/daily-puzzles/midi/YYYY-MM-DD.json` via `pnpm daily:add --slot midi`. Each one bridges the day's mini and large where a large exists (16 Oct – 1 Nov: Pumpkin Spice + gardening×finance → Pumpkin Patch, Taco Tuesday + tennis×romance → Date Night…); from 2 November the midis follow the mini's theme until the larges catch up
(the 16–28 November larges were built after those midis; they were cross-checked
against them rather than re-bridged). From 29 November the table's last column
lists the midi's two seed entries. Built with `pnpm seedgrid --size 9 --difficulty easy --seeds "<mirrored pair>"` — a free brainstorm at 9×9 often loses its theme in the fill, a mirrored seed pair almost never does. A midi must not reuse the large's title or themers, nor the mini's (the cross-check compares all three per day).

| Day | Date | Title | Theme |
|---|---|---|---|
| Sun | 2026-11-01 | Inner Peace | Inner Peace |
| Mon | 2026-11-02 | Clockwork | Clockwork |
| Tue | 2026-11-03 | Civics Class | Civics Class |
| Wed | 2026-11-04 | Comfort Food | Comfort Food |
| Thu | 2026-11-05 | Knit One | Knit One |
| Fri | 2026-11-06 | Delivery | Delivery |
| Sat | 2026-11-07 | Rest Stop | Rest Stop |
| Sun | 2026-11-08 | Brunch | Brunch |
| Mon | 2026-11-09 | Nine to Five | Nine to Five |
| Tue | 2026-11-10 | Moonshot | Moonshot |
| Wed | 2026-11-11 | Parade Day | Parade Day |
| Thu | 2026-11-12 | Big Band | Big Band |
| Fri | 2026-11-13 | Superstitions | Superstitions |
| Sat | 2026-11-14 | Cookie Jar | Cookie Jar |
| Sun | 2026-11-15 | Slice of Life | Slice of Life |
| Mon | 2026-11-16 | Hearth and Home | Hearth and Home |
| Tue | 2026-11-17 | Rise and Shine | Rise and Shine |
| Wed | 2026-11-18 | Cartoon Classics | Cartoon Classics |
| Thu | 2026-11-19 | Penny Wise | Penny Wise |
| Fri | 2026-11-20 | Parking Lot Party | Parking Lot Party |
| Sat | 2026-11-21 | Pen Pals | Pen Pals |
| Sun | 2026-11-22 | Carving Station | Carving Station |
| Mon | 2026-11-23 | Math Class | Math Class |
| Tue | 2026-11-24 | Checkout Line | Checkout Line |
| Wed | 2026-11-25 | Airport Dash | Airport Dash |
| Thu | 2026-11-26 | Giving Thanks | Giving Thanks |
| Fri | 2026-11-27 | Shopping Spree | Shopping Spree |
| Sat | 2026-11-28 | Corner Store | Corner Store |
| Sun | 2026-11-29 | Couch Time | INAMESS, REMOTES |
| Mon | 2026-11-30 | Tracking Number | DOORSTEP, TRACKING |
| Tue | 2026-12-01 | Pay It Forward | SEANPENN, DONATION |
| Wed | 2026-12-02 | All Aglow | STRINGS, TWINKLE |
| Thu | 2026-12-03 | Bundle Up | THERMOS, MITTENS |
| Fri | 2026-12-04 | Eight Nights | MENORAHS, DREIDELS |
| Sat | 2026-12-05 | Trophy Case | CONFETTI, TROPHIES |
| Sun | 2026-12-06 | Candy Counter | CARAMELS, TRUFFLES |
| Mon | 2026-12-07 | Sled Hill | TOBOGGAN, SONGBIRD |
| Tue | 2026-12-08 | Secret Santa | SURPRISE, WISHLIST |
| Wed | 2026-12-09 | Flaky Layers | DANISHES, STRUDELS |
| Thu | 2026-12-10 | Lab Coats | MOLECULE, PRIMECUT |
| Fri | 2026-12-11 | Tacky Knits | REINDEER, SWEATERS |
| Sat | 2026-12-12 | Make a Wish | STARGAZER, TELESCOPE |
