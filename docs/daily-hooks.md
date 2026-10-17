# Daily hooks (`docs/daily-hooks.json`)

A publish day → one sentence of light, dated hooks the clue writer may use. Two
tools read it:

- `pnpm seedgrid:timely <puzzleDir> <date> [docs/daily-hooks.json] [--max 3] [--dry]`
  offers a finished puzzle its day's hooks and lets Claude rewrite at most a
  few clues, only where a hook is a natural fit; every rewrite passes the clue
  checks before it is written.
- `pnpm seedgrid --context "…"` / `pnpm seedgrid:large --context "…"` /
  `pnpm seedgrid:reclue … --context "…"` take the same sentence while clues are
  first written. Paste the day's value.

The file is a flat JSON object, `"YYYY-MM-DD": "hook; hook; hook"`, sorted by
day. A day with no key, or an empty string, gets no timely pass (the tool says
so and exits 0). Keep it to the days you are about to stock; stale days can be
pruned once published.

## Researching hooks for a batch

Before stocking a fortnight, spend a few minutes per day on the calendar, not
the news:

1. **Sports on the calendar**: the World Series schedule, NFL Sunday / Monday
   night and Thanksgiving games, the NBA tip-off, college rivalry weekends, the
   NYC Marathon. Name the teams only when the fixture is certain (a playoff
   "if needed" game is fine to mark as such).
2. **Holidays and observances**: Halloween, Día de los Muertos, Diwali, Veterans
   Day / Remembrance Day, Thanksgiving, Black Friday, Small Business Saturday,
   clocks changing. Treat remembrance days with care: "respectful,
   non-political" belongs in the hook text so the writer sees it.
3. **Anniversaries and birthdays**: a round-number anniversary (Statue of
   Liberty 140, ARPANET's first message), an artist's or inventor's birthday
   (Monet, Marie Curie, Mickey Mouse), a pop-culture date (Back to the Future
   Day). These make the best clues because they are specific.
4. **Seasonal texture** when a day has nothing else: apple season, sweater
   weather, foliage, bread baking, the grocery run before Thanksgiving.
5. **Food-and-fun "National X Day"s** are fine in moderation (Pumpkin
   Cheesecake Day, Homemade Bread Day, Fibonacci Day).

Write each day as one line, two to four hooks, separated by semicolons, with
the concrete fact in it ("Brewers' first World Series since 1982", not "big
baseball game").

## What never goes in

- **Grim news**: deaths, disasters, wars, crimes, illness, layoffs. If the only
  thing on a day's calendar is sad, give the day seasonal texture instead.
- **Partisan politics.** An election day is civic ("polls, ballots, 'I voted'
  stickers — keep it civic and non-partisan"); candidates and results are not.
- **Anything that needs a trigger warning**, or that mocks a group, accent or
  dialect. The clue content rule (`CONTENT_RULE` in `cluePrompt.ts`) applies
  to hooks too.
- **Speculation**: a game "tonight" that might be rained out is fine to hedge;
  a result is not known when the puzzle is built, so never write one.

The writer is told to use a hook only where an entry fits naturally and never
more than a handful of times, so a full day of hooks is an offer, not a quota.
