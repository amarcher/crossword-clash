# Daily Bonus queue (Plus)

The bonus is the fourth puzzle of each day, Plus only (docs/plus-expansion-spec.md §1,
`src/lib/bonus.ts`). It is **not a feed file**: it is a row in the `bonus_puzzles` table, which
only Plus can read the puzzle from, so nothing under `public/daily-puzzles/` changes. Free players
see the card (title, theme, the grid's shape under a padlock) and "Unlock with Plus". A day with
no bonus row simply has no card.

## Shape and register

- 11×11, rotational symmetry, built with `pnpm seedgrid --size 11` on the production list.
- The large's weekday register: `--difficulty easy` Monday to Saturday, `medium` on Sunday.
- One free `--theme` per day (a broad subject, not a mashup); `--context` for the day's hooks.
- `--reject` the day's mini, midi and large answers of 4+ letters, and `--day <date>` so the clue
  writer sees the feed's recent clues for each answer (the 14-day no-repeat rule).
- Titles never repeat an entry; the CLI's title is a suggestion — check it against the themers it
  actually placed (the first build's "Knock on Wood" placed MIRROR IMAGE and CRACK OF DAWN and
  shipped as "Tempting Fate").

## Building a batch (with the dailies)

Every daily batch now has a fourth lane. After the day's mini, midi and large exist:

```sh
# rejects: the day's three dailies' answers of 4+ letters
SEEDGRID_WORD_LIST=production pnpm seedgrid --theme "<subject>" --size 11 --day <date> \
  --difficulty easy|medium --reject "<rejects>" [--context "<hooks>"] --out artifacts/bonus/<date>
```

Five lanes in parallel on the Studio take about 2 minutes a puzzle each (one 11×11 is about
10k tokens in and 10k out). Read each `review.md` (the last review should say "ship"; a [must]
left after three refills makes the CLI exit 1 — rebuild with another `--seed` or a narrower theme).

## Publishing

`pnpm bonus:add <date> artifacts/bonus/<date>/<slug>/puzzle.ipuz "<Theme>"` upserts the row
with `SUPABASE_SERVICE_ROLE_KEY` when set; otherwise it writes an SQL file and prints the
`npx supabase db query --remote=rdqdhawlxuclfxpsvdgs -f <file>` command to apply it. Re-running a
day replaces its bonus. A published bonus is cached on Plus devices once played, so fix a
puzzle before its day, not after.

## Stock

Stock runs to 2026-12-26, built 2026-11-13 (five lanes, about 45 minutes with retries). Ten of 43
free-theme builds needed a second try: a fresh `--seed`, a narrower theme (Card games, Sailing), or
for holiday days a hand-picked mirrored `--seeds` pair, which fills an 11×11 far more reliably than a
free brainstorm (Snow Day, Ski Trip, Fairy Tales, Inventions, Sailing, Christmas all shipped first try
that way; seeded builds come out "Untitled", so name them). Pass every themer already in the stock
to `--reject` so no themer repeats across days (Christmas first repeated 20 Dec's BOW AND ARROW).

Keep the bonus as far ahead as the dailies: the next daily batch (due by 2026-12-12, for days
from 2026-12-27) builds the bonus lane with it.

| Date | Title | Theme | Register |
|---|---|---|---|
| 2026-11-13 | Tempting Fate | Superstitions | easy |
| 2026-11-14 | By the Numbers | Card games | easy |
| 2026-11-15 | Turning Over New Leaves | Fall foliage | medium |
| 2026-11-16 | Grande Plans | Coffee shop orders | easy |
| 2026-11-17 | Shuttle Diplomacy | Space missions | easy |
| 2026-11-18 | Young Sleuths | Famous detectives | easy |
| 2026-11-19 | Verbal Instruments | Musical instruments | easy |
| 2026-11-20 | Address Book | Road trips | easy |
| 2026-11-21 | Pregame Spread | Tailgating | easy |
| 2026-11-22 | Shape Shifters | Bread baking | medium |
| 2026-11-23 | Terminal Beginnings | Airports | easy |
| 2026-11-24 | Regional Specialties | Pies | easy |
| 2026-11-25 | Main Street Attractions | Parades | easy, 12×12 |
| 2026-11-26 | Side Dishes | Thanksgiving dinner | easy |
| 2026-11-27 | Deal Days | Shopping | easy |
| 2026-11-28 | Remains of the Day | Leftovers | easy |
| 2026-11-29 | Knitty-Gritty | Knitting | medium |
| 2026-11-30 | Out for Delivery | Online shopping | easy |
| 2026-12-01 | Flurry of Fun | Snow | easy |
| 2026-12-02 | Sea Change | Ocean animals | easy |
| 2026-12-03 | Hitch in the Plans | Classic movies | easy |
| 2026-12-04 | Light Fare | Festival of lights | easy |
| 2026-12-05 | Hitting the Slopes | Ski trip | easy |
| 2026-12-06 | Once Upon a Time | Fairy tales | medium |
| 2026-12-07 | Not Technically Dinosaurs | Prehistoric animals | easy |
| 2026-12-08 | Everyday Jewels | Gemstones | easy |
| 2026-12-09 | Early Birds | Backyard birds | easy |
| 2026-12-10 | Bright Ideas | Great inventions | easy |
| 2026-12-11 | A Very Merry Unbirthday | Tea time | easy |
| 2026-12-12 | All Aboard | Sailing | easy |
| 2026-12-13 | Hidden Arias | Opera | medium |
| 2026-12-14 | Pizza Palette | Pizza toppings | easy |
| 2026-12-15 | Lead Lines | Guitars | easy |
| 2026-12-16 | Hotheads | Volcanoes | easy |
| 2026-12-17 | Frequent Flyers | Flight | easy |
| 2026-12-18 | Book Your Holiday | Holiday movies | easy |
| 2026-12-19 | Personality Batch | Cookie baking | easy |
| 2026-12-20 | Wrapping Up | Gift wrapping | medium |
| 2026-12-21 | Struck by the Night Sky | Night sky | easy |
| 2026-12-22 | Break Time | Hot drinks | easy |
| 2026-12-23 | Out of Time | Last-minute errands | easy |
| 2026-12-24 | Reindeer Games | Christmas Eve | easy |
| 2026-12-25 | Christmas Morning | Christmas morning | easy |
| 2026-12-26 | Light Up the Aisle | Candles and unity | easy |
