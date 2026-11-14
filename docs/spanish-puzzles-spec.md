# Spanish puzzles: dailies, the Daily Plus and the studio in Spanish

Written 2026-11-13. Spec only: no application code changes. Claims about the
current code cite a file (read on `past-board-link` at eab665e); numbers not
read from the code or the research are marked as estimates.

Context: the interface is translated into Spanish (`src/i18n/es.json`), but a
Spanish speaker who switches language is still served English puzzles. Andrew's
read (2026-11-13): there is an untapped market for a daily Spanish crossword
with races, friends and a subscription, and offering the mini, midi, large and
Daily Plus in Spanish every day should not be expensive. The research behind
this spec is in `reports/Spanish crossword conventions and word lists.md`
(with the notes in `research_notes/`), including an addendum of puzzles read
directly at El Debate, El País, PasatiemposWeb and Crosshare.

The principle throughout: **a Spanish puzzle is an original Spanish puzzle**,
built from a Spanish word list and clued in Spanish, never a translation of
the English one. Everything else (the solver, rooms, boards, races, replays,
streaks, Plus) is the same product in another language.

---

## Decisions

None of these is decided yet. Each has a recommendation.

| # | Decision | Recommendation | Where |
|---|---|---|---|
| 1 | Grid format | **American**: fully crossed, numbered, three-letter minimum, rotational symmetry from the midi up. Spanish newspapers' digital puzzles are already fully crossed; the three-letter minimum is our one departure from what they publish | §2.1 |
| 2 | Letters | **27 letters, Ñ its own square.** Accents and diéresis dropped in the grid and kept in clues. CH, LL, RR take two squares | §2.2 |
| 3 | Traditional devices | **None**: no reversed entries, chemical or unit symbols, web domains, "letra repetida" or masked partials | §2.3 |
| 4 | Themes | Title by subject. Wordplay themers allowed in the large, flagged with a "?" clue; the reviewer decides whether they land | §2.4 |
| 5 | Which Spanish | **Neutral, pan-Hispanic.** A word only one country uses is either cut or labelled in its clue | §2.5 |
| 6 | Puzzle language vs. interface language | **A separate setting that starts as the interface language.** The menu offers the other language's set in one tap | §4.1 |
| 7 | Boards | **One board per day, slot and language.** They are different puzzles | §4.3 |
| 8 | Streak | **Either language counts; still one day per day** | §4.4 |
| 9 | Launch order | **Mini and midi first**, then the large and the Daily Plus once the fill trial and the reviewer say the bigger grids are good enough | §7 |
| 10 | Review | **Every Spanish puzzle is read by a fluent reviewer before it is published**, in weekly batches. Nothing ships on the model's word alone | §5.6 |
| 11 | Word list licence | Production list from public-domain, MPL, CC0 and CC BY sources only, published with a NOTICES file like the English one. Have counsel confirm before the list is made public | §5.1 |
| 12 | Rust toolchain | The engine must be rebuilt for Ñ, which needs rustup, the wasm32 target and wasm-bindgen-cli on this machine. **Approved and installed 2026-11-13** (cargo 1.100.0, wasm-bindgen-cli 0.2.129); **the engine was rebuilt the same day** and takes Ñ | §5.2 |
| 13 | Price | Unchanged at launch. Regional pricing is a later question, after there are Spanish players to measure | §6 |
| 14 | Switch | `VITE_SPANISH_PUZZLES=1` (`spanishPuzzlesEnabled()`), off until phase 2 is reviewed, like `plusEnabled()` | §7 |
| 15 | Conjugated verbs | **A budget per grid**: infinitives, participles and gerunds are free; other verb forms are limited to mini 1, midi 3, Plus 4, large 6, and only common third-person and first-person forms. The reviewer may tighten it | §2.6 |
| 16 | Same-root entries | **Never two forms of one word in a grid** (OIR / OIDO, OSO / OSA, AMAS / AMABAS). Checked by the tooling, not by eye | §2.6 |
| 17 | Three-letter words across a day | **At most two shared between the day's puzzles**, and none clued the same way. English allows any number | §2.6 |
| 18 | The Spanish large | **A second project**, not part of the launch: it waits on a phrase-and-names list. If a bigger Spanish grid is wanted sooner, a 13×13 with two or three theme entries | §2.1, §7 |
| 19 | House style for regional words | Written down once with the reviewer (which country's word wins when two are common, and how a clue marks the other), then applied by the prompts | §2.5 |

---

## 0. What exists today (the code this builds on)

| Area | Today | Where |
|---|---|---|
| Interface language | English and Spanish; stored choice, else the browser's language, else English | `src/i18n/i18n.ts` (`detectLanguage`) |
| Clue labels in Spanish | Arrows (→ / ↓), not "Horizontales / Verticales" | `src/i18n/es.json` (`across`, `down`) |
| Puzzle language | **None.** `Puzzle` has no language field | `src/types/puzzle.ts` |
| Daily feed | Keyed by day and slot only: `public/daily-puzzles/{,midi/,large/}<day>.json`, `daily_schedule (day, slot)` | `src/lib/dailyFeed.ts`, `20261017000000_daily_slots.sql` |
| Boards | `daily_results` unique on `(day, slot, user_id)`; the bonus board is slot `bonus` | `20261017000000_daily_slots.sql`, `20261120000000_bonus_board.sql` |
| Daily Plus | `bonus_puzzles` with `day` as the primary key: one per day | `20261117000000_bonus_puzzles.sql` |
| Puzzle identity | Hash of title, size and solution. A Spanish puzzle gets its own identity with no change, so best times, `solves`, progress, recordings and replays already keep the two apart | `src/lib/soloStats.ts` (`puzzleIdentity`) |
| Typing a letter | Physical keys, the hidden input and the keyboard-mode detector accept only `[a-zA-Z]`. **Ñ cannot be typed** | `useGridNavigation.ts:35`, `useHiddenGridInput.ts:71,102,113`, `inputModality.ts:29` |
| In-app keyboard | Three fixed rows, 26 keys | `PuzzleKeyboard.tsx:69` |
| Reducer and server | `INPUT_LETTER` upper-cases whatever it is given and compares with the solution; `claim_cell` takes the letter as TEXT. Neither assumes ASCII | `usePuzzle.ts:352`, `20260224000000_multiplayer.sql` |
| Replays | The replay code stores right / wrong, never the letter | `src/lib/replayCode.ts` |
| .puz export | Latin-1, which has Ñ | `src/lib/seedgrid/puz.ts` |
| Community puzzles | Already carry a language (`lang`) and a language filter | `src/lib/communityPuzzles.ts` |
| Construction engine | TS solver and dictionary loader assume 26 letters (`replace(/[^A-Z]/g, "")`); the Rust wrapper drops non-ASCII from words and refuses non-ASCII grid cells; the vendored `ingrid_core` itself is Unicode | `seedgrid/dictionary.ts:19`, `engine/src/lib.rs:131,302` |
| Clue and title checks | ASCII: the answer-in-clue check splits clues on `[^A-Z]`, so it cannot see "canción" for CANCION or "año" for AÑO | `seedgrid/audit.ts:125`, `seedgrid/crosscheck.ts:78` |
| Clue prompts | English, with English crossword taste written in | `seedgrid/cluePrompt.ts` |
| Hooks | `docs/daily-hooks.json` is a US calendar (Thanksgiving, NFL) | `docs/daily-hooks.md` |
| Push reminder | Already localised by device locale, with the feed's theme in the body | `_shared/pushRules.ts` |

The shape of the work follows from this table: the solver needs one new letter
and a language on the puzzle; the feed, boards and Daily Plus need a language
in their keys; the construction tooling needs the most.

---

## 1. The spike

Before anything is built for players, one day's set was constructed for
the reviewer: a 5×5 mini, a 9×9 midi, an 11×11 Daily Plus and a themed 15×15,
dated Sunday 2026-11-22 (Santa Cecilia, Día de la Música), from a private
Spanish word list, under the rules in §2. Output:
`artifacts/seedgrid-es/2026-11-22/` with a README for the reviewer.

### 1.1 Results (2026-11-13)

All four puzzles were built and pass the mechanical checks (full crossing,
three-letter minimum, symmetry, no duplicates, no 4+ entry shared across the
set, every clue present and not giving its answer away, ipuz round trip).
None has been read by a Spanish speaker or played in the app.

| Puzzle | Blocks | Entries | Ñ crossings | Entries at the floor (50) or below | Verdict |
|---|---|---|---|---|---|
| Mini "Do, re, mi" 5×5 | 6 | 10 | 0 | 0 (lowest 55) | Clean |
| Midi "Música, maestro" 9×9 | 12 | 32 | 2 | 2 | Clean, with regional and conjugation doubts listed for the reviewer |
| Plus "A bailar" 11×11 | 21 | 42 | 1 | 3 (one a theme entry at 47) | Usable; one same-root pair (AMABAS / AMAS) |
| Large "Con la música a otra parte" 15×15 | 42 | 74 | 0 | 17 | **Not clean**: a best attempt |

What it showed:

- **Mini and midi fill easily.** The mini gave 11 grids from 80 tries at
  floor 55; the midi 56 from 120 at floor 52.
- **The Plus fills, with effort.** One corner needed the floor lowered to
  50, and richer theme sets (BACHATA, CUMBIA, BOLERO; an 8/8/9/9 set) would
  not fill or forced poor words.
- **The large is the problem the research predicted.** Five and four theme
  entries gave no usable layout. Three did, at 42 blocks (high for a
  15×15), and the fill has three forms of one verb (OIR, OIA, OIDO), OSO
  with OSA, about fifteen conjugated forms and a rare word (APODERO).
  Excluding every disliked word made it unfillable at floor 50.
- **Why:** Spanish has few real three-letter words (215 were whitelisted
  by hand), so block-heavy layouts starve; and the list has no phrases, so
  nothing long and lively is available as fill.
- **Ñ works as a letter**: it crossed as Ñ both ways in the midi and Plus.
  The route was a workaround (Ñ written as a digit in the list handed to
  the committed engine, decoded on output), which cannot lock or seed a
  word containing Ñ. The engine change in §5.2 removes that limit.
- **Conjugated verbs are the recurring soft spot** in every size above
  the mini.

The spike list: 144,901 entries, 46,068 at score 50 or above, 2,985 with
Ñ; olea/lemarios for validity and FrequencyWords for every score, so it is
private-only. No same-root check exists in the tooling; the pairs above
were found by eye.

What this changes in the plan: the launch order (decision 9) stands, with
more confidence. Before a Spanish large is attempted again, the list needs
phrases and names (§5.1), a same-root rule in the audit (§5.2), and
probably fewer theme entries per grid than the English large carries.

### 1.1b Second pass, the same day

The engine was rebuilt to take Ñ, the list gained lemma and form data,
and the two rules of §2.6 were written (`src/lib/seedgrid/wordForms.ts`)
and run over the set:

| Puzzle | Same root | Conjugated verbs | Result |
|---|---|---|---|
| Mini (first version) | none | 2 against a budget of 1 (PUSO, PARE) | Failed; rebuilt around NOTAS with none |
| Midi | none | within 3 | Passes |
| Plus (first version) | AMABAS / AMAS | within 4 | Corner refilled; passes |
| Large | OIA / OIR / OIDO, OSA / OSO, SER / ERASE | 15 against 6 | Fails both |

- **Ñ can now be placed on purpose.** ACOMPAÑAS locked in a 9×9 fills
  with NIÑO crossing at the Ñ (`scripts/seedgrid/es/enye-proof.mts`).
  The "approved word is unfillable" oddity of the first pass was the Ñ
  workaround, and is gone with it.
- **A 13×13 lays out and fills** (PARTITURA, SERENATAS, MELODIA; a
  skeleton in 12 seconds, 17 fills clean under both rules) but the best
  fill still had words the content rule refuses and weak fill around
  them. It is recorded as a candidate grid, not written up as a puzzle
  (`artifacts/seedgrid-es/2026-11-22/large-13/candidate.md`). So the
  smaller size helps the layout and does not by itself fix the list.
- **Limits of the lemma data.** It is inferred from spelling: about
  1,100 verb forms have no lemma, word families are not linked (AMORES
  beside AMAS passes), and a verb form spelled like a noun is tagged as
  the noun, so the conjugation count runs low (one grid counted 4 by tag
  and 8 by eye). A production list needs real morphological data.
- The rules run in the Spanish spike scripts only; they are not yet in
  `seedgrid:large`, `audit.ts` or the studio.

### 1.2 What the spike taught

A read of the four by Claude as a Spanish reader (the same kind of model
wrote the clues, so this is a second look, not an independent one; the
fluent reviewer is still the test).

| # | Lesson | Evidence | Where it lands |
|---|---|---|---|
| 1 | The format works up to 11×11 | Mini, midi and Plus are ordinary Spanish with full crossing and no two-letter entries; Ñ arose and crossed naturally | Decision 1, 9 |
| 2 | Clue quality was not the problem | No wrong or stiff clue found in 158; the 41-character limit suits the newspaper register | §5.4 |
| 3 | The 15×15 fails on the word list, not the grid rules | With no phrases or names, long slots fill with participles and plurals (DOBLADO, ANOTADO, SEGURAS, NASALES): correct and dull | §5.1, decision 18 |
| 4 | Conjugations need a rule | About 15 of the large's 74 entries; several exist only with the accent the grid drops (ARRASO, APODERO, REI, ORE) | §2.6, decision 15 |
| 5 | Same-root pairs need a check | OIR / OIA / OIDO, OSO / OSA, AMAS / AMABAS, found by eye | §2.6, decision 16 |
| 6 | Three-letter words will repeat | About 215 usable; six recur across this one day's set (SOS, ASA, LEO, MIA, OLA, ARO) | §2.6, decision 17 |
| 7 | Regional splits show in clues as much as in entries | "básquet", "auto", "sí, quiero", PARE as a road sign | §2.5, decision 19 |
| 8 | Themes carry fewer entries than in English | Three or four short theme words laid out; five long ones never did | §5.5 |
| 9 | Build from the smallest size up | The large took most of the hour; the mini would have proven the list in minutes | §5.6 |

### 1.3 What the reviewer is asked

The mini, midi and Plus go to the reviewer as candidates. The large goes
only as an example of the open problem.

1. Is every entry a word or phrase you would expect an ordinary adult solver
   to know? Mark any you would not.
2. Is any entry regional, dated, crude or simply odd?
3. Is each clue correct, natural and fair? Rewrite freely.
4. Do the large's theme entries work as a theme? If they are wordplay, do
   they land?
5. Does the three-letter minimum feel like a loss, or do you not miss the
   two-letter entries?
6. Would you play this daily? Which size?

---

## 2. The format

### 2.1 Grid

Fully crossed, American numbering, the existing grid standards
(`meetsGridStandards`), rotational symmetry from the midi up, **no entry
shorter than three letters**.

What the research and the browser check support: El Debate's mini and 13×13
daily, El País's mini and the product PasatiemposWeb sells as "Crucigrama
Americano" are all fully crossed and numbered the American way. The format is
not foreign. All four use two-letter entries, though, often filled with a
symbol or a domain. Keeping three letters as the minimum is a choice to be
better than the incumbents at the cost of harder fills; one hand-built
15-wide themeless by the constructor elro shows it can be done.

The spike showed the 15×15 cannot yet be filled cleanly at three letters
(§1.1). The answer is a better word list and, if needed, a 13×13 large in
Spanish; it is not two-letter entries.

### 2.2 Letters

- **Ñ is a letter**: its own square, crossing as Ñ both ways. AÑO never
  crosses as ANO.
- **Accents and diéresis are dropped in the grid**: CANCIÓN is CANCION,
  PINGÜINO is PINGUINO. Clues, titles and theme lines keep full spelling.
- **CH, LL, RR are two squares each**, as in every modern Spanish puzzle.
- The post-solve view may show the accented spelling of each entry (a later
  nicety; needs the accented form stored per clue, see §3.1).

Homographs created by dropping accents (SI / SÍ, TE / TÉ, PAPA / PAPÁ) are
fine in the grid; the clue decides which word is meant, so the clue writer
must be given the intended word with its accents (§5.4).

### 2.3 What we refuse

Reversed entries ("al revés"), chemical and unit symbols, country web
domains, licence-plate codes, "letra repetida", fragments of longer words.
Spanish newspapers tolerate all of them; they are what the two-letter
minimum would have forced on us.

Abbreviations and initialisms are allowed only when a solver would say them
aloud as a word or knows them as well as one (ONU, OVNI, FIFA), and are
clued as such.

### 2.4 Clues and themes

- Short definitions in the newspaper register, with the occasional oblique
  or playful clue. No dictionary formulas ("Dícese de…").
- Conjugated forms are clued so the form is unambiguous ("Cantó" → person
  and tense must match the answer).
- A themed puzzle is titled by its subject, which is what "temático" means
  to a Spanish solver. Wordplay theme entries are marked with "?".
- The existing content rule holds (`CONTENT_RULE`): nothing crude, sad or
  gross, no mockery of an accent or a country.
- Clue lists are headed **Horizontales** and **Verticales**; the clue bar
  keeps its arrows.

### 2.5 Which Spanish

The spike's clues leaned on one region or another without a rule
("básquet" and "auto" are Latin American, "sí, quiero" is Spain, PARE as a
road sign is South American). A short house style, agreed once with the
reviewer, settles which word wins when two are common and how a clue
marks a regional answer (decision 19).

Neutral. Vocabulary that all of Spain, Mexico, Argentina, Colombia and the
US Hispanic audience share. Where a good word is regional (ORDENADOR /
COMPUTADORA, COCHE / CARRO), prefer the entry that travels; if a regional
one is used, the clue says so ("…, en España"). No vosotros or voseo forms
as fill unless they are fixed expressions. The word list tags regional
words so the engine can be told to avoid them (§5.1).

### 2.6 Rules Spanish needs and English did not

- **Conjugation budget.** Infinitives, participles and gerunds are words
  like any other. Every other verb form counts against a budget per grid:
  mini 1, midi 3, Plus 4, large 6. Vosotros, voseo and subjunctive forms
  are out unless they are a fixed expression ("Érase una vez"). A form
  that only exists with an accent the grid drops (ARRASÓ) is allowed
  within the budget and its clue must fix the person and tense.
- **Same root.** No two entries in a grid may be forms of one lemma, or a
  masculine and feminine pair of one noun (OSO / OSA).
- **Three-letter words.** Spanish has few good ones, so they recur. Within
  a day's set, at most two may be shared between puzzles, and a shared one
  is never clued the same way. Across days the existing clue-repeat rule
  applies; expect it to bind hardest here, so each three-letter word needs
  a deep bench of clues.
- **Names.** At most two proper names in a mini or midi.

These are enforced by the tooling (§5.2) and need the lemma and form of
each entry, which the word list carries (§5.1).

---

## 3. The solver

### 3.1 A language on the puzzle

`Puzzle.language?: "en" | "es"` (absent = English), carried through the
transfer format (`puzzleToTransferFormat`, the `#puzzle=` link, the feed
file), the ipuz reader and writer, `uploadPuzzle` and the community
snapshot (which already has `lang`). An imported file with an Ñ in its
solution is treated as Spanish for input purposes whatever it says.

Optional per clue: `display?: string`, the entry with its accents and
spaces ("CANCIÓN", "POR FAVOR"), for the post-solve view. Not needed for
launch.

### 3.2 Typing Ñ

| Surface | Change |
|---|---|
| Physical keyboard | The three `[a-zA-Z]` tests accept `ñ` / `Ñ`. On a Spanish layout the key sends "ñ" directly; on a US layout the OS's own method (hold N, or Option-N then N) arrives as a composed "ñ" through the hidden input's `input` event, which the same test then accepts |
| Phone's own keyboard (web) | Same path as above: the composed character arrives in the hidden input |
| In-app keyboard (apps) | For a puzzle that needs it, the middle row becomes ten keys: `ASDFGHJKLÑ`, the Spanish layout's own position. At 375 px ten keys already fit on the top row, so the size is known to work. English puzzles keep 26 keys |
| Keyboard-mode detector | `isPhysicalGridKey` accepts Ñ |
| Reducer, `claim_cell`, replays, share block | No change (see §0) |

"Needs it" is `puzzle.language === "es"` or any Ñ in the solution
(`puzzleNeedsEnye`). An accented vowel typed on any puzzle is folded to
its plain letter (Á → A, `gridLetter`) instead of being refused: the solver's keyboard may produce it, and
refusing it under Autocheck would count a wrong letter for a right answer.

### 3.3 Everything else

- Wrong-letter flash, typed-through letters, Autocheck, Check and Reveal:
  unchanged, they compare strings.
- The TV narrator and per-clue speech read clues in the puzzle's language;
  the browser voice and the ElevenLabs voice must be Spanish ones for a
  Spanish puzzle. The narrator prompt gains "comment in Spanish". (Estimate:
  small, but it needs a listen.)
- The share block's header and the challenge strings already come from the
  translation files; they follow the **interface** language, which is right:
  the sender's words are the sender's.

---

## 4. Product

### 4.1 Which puzzles a player sees

A per-device setting, `puzzleLanguage` (localStorage, later mirrored to the
account), **starting as the interface language**. The menu's daily section
shows that language's set and, under it, one quiet row: "También en
inglés: los diarios de hoy" / "Also in Spanish: today's dailies", which
opens the other set without changing the setting. The language switcher
gains a second line, "Puzzles in: English · Español", so a bilingual
player can read the interface in one language and solve in the other.

Why not tie it to the interface language outright: US Hispanic players are
often bilingual, and Spanish learners are a plausible audience for the
mini. Why not show both sets always: eight tiles on a phone menu.

A day with no Spanish puzzle in a slot shows no tile for it, as the midi
and large do today. There is no English fallback inside the Spanish set.

### 4.2 Feed, schedule, archive

- Static files: `public/daily-puzzles/es/{,midi/,large/}<day>.json`, the
  same shape with `"language": "es"`. English paths do not move, so
  installed apps keep working.
- `pnpm daily:add --lang es …`; `api/daily.ts`, `proxy.ts` (the
  future-day gate), the vercel.json rewrites and the CORS header cover the
  `es/` paths.
- `daily_schedule` gains `lang TEXT NOT NULL DEFAULT 'en'` in its key.
- The daily index gains `lang` per entry (`index/YYYY-MM.json`); the
  archive shows the selected puzzle language's calendar, with the same
  quiet row to the other. Archive locks are unchanged.
- The mini's bundled English rotation is not used for Spanish: a day with
  no Spanish mini has no Spanish mini.
- Up next, the picker, the TV chooser and `nextUpSuggestions` read the
  selected language's dailies.

### 4.3 Boards

`daily_results` gains `lang TEXT NOT NULL DEFAULT 'en'` and its unique key
becomes `(day, slot, lang, user_id)`; the board routes take `?lang=es`
(absent = English, so old links and old app builds are unaffected). The
wide layout shows the selected language's boards. A player who solves both
languages' mini appears on both boards.

Old clients post no `lang` and so land on the English board, which is
correct: they can only have played English.

### 4.4 Streaks, history, races, replays

- **Streak**: a finish in either language counts for the day; one day per
  day, as now. No migration: the rule reads `solves` rows.
- `solves`, `solo_progress`, `solve_traces`, `replay_shares`,
  `race_replies`: keyed by puzzle identity or by day and slot. The ones
  keyed by day and slot (`race_replies`, the `/daily/:day/:slot` link,
  `send_beat`, the beat push) gain a language: the link becomes
  `/daily/2026-11-22/mini?lang=es`. A link without it is English.
- `Puzzle.ref` gains `lang` for dailies.
- Same-day crosscheck and the clue-repeat rule run per language.

### 4.5 Daily Plus

`bonus_puzzles` gains `lang` in its key (`(day, lang)`); `bonus_cards`,
`bonus_puzzle(p_day)` and the bonus board take a language with English as
the default. Plus-only, as in English.

### 4.6 Rooms and the TV

No change beyond §3: a room plays whatever puzzle it was given. The picker
and the TV chooser list the selected language's dailies.

### 4.7 Words to add

Spanish names for the products, to be checked by the reviewer: "Mini
diario", "Midi diario", "Crucigrama del día" (the large), "Plus del día"
(already used). App Store and Play listings in Spanish, a Spanish
`/support` section on how the dailies work, and `pageMetaFor` strings; the
prerendered pages are English-only today, which limits Spanish search
traffic (a later item: prerender `/es/`).

---

## 5. Construction

### 5.1 Word list

One scored list, `WORD;SCORE` on the English list's 0–100 scale, built by
`pnpm seedgrid:dict --lang es`:

| Purpose | Source | Licence | Production list |
|---|---|---|---|
| Valid lemmas and forms | olea/lemarios | Public domain | Yes |
| Valid forms, regional tags | RLA-ES Hunspell | GPL / LGPL / MPL (take MPL) | Yes, with notice |
| Names, titles, places | Wikidata labels ranked by es.wikipedia pageviews | CC0 | Yes |
| Commonness | Google Books Ngrams (Spanish) | CC BY | Yes, with attribution; may only lower a score |
| Lively phrases | Model-proposed, reviewer-approved (`lively-es.dict`) | Ours | Yes |
| Hand overrides, bans | `rescore-es.dict`, `ban-es.dict` | Ours | Yes |
| Commonness for private use | FrequencyWords (OpenSubtitles) | CC BY-SA | **No** (private list only, as `base.dict` is) |
| RAE dictionary, FISE Scrabble lexicon | — | Closed | **Never** |

Scoring rules specific to Spanish:

- **Conjugations.** A regular verb has dozens of forms, and the sources
  hold several hundred thousand. Infinitives, participles and gerunds score
  as words; third-person present and preterite forms score by frequency;
  every other form is capped below the fill floor unless frequency lifts
  it. Vosotros and voseo forms are capped lower still.
- **Plurals and gender** score a step below their singular or masculine
  form, so the engine prefers the base word.
- **Regional words** carry a tag and a cap below the floor by default.
- **Ñ** is kept; every other diacritic is folded before scoring, and the
  list keeps the accented spelling in a third column for the clue writer.

Each entry also carries its **lemma**, a coarse **form tag** (infinitive,
participle, gerund, finite verb, noun or adjective, name) and its
**accented spelling**, for the rules in §2.6 and for the clue writer.

Two things the spike list lacked and the production list must have:

- **Phrases and names.** The English list's lively long entries come from
  the Collaborative Word List; Spanish has no equivalent. Sources: Wikidata
  labels by pageviews for names and titles, and a model-proposed,
  reviewer-approved `lively-es.dict` of everyday phrases (POR FAVOR, DE
  NADA, A VER, BUEN VIAJE). This list is what decides whether a Spanish
  large is possible.
- **A curated three-letter list.** The spike whitelisted 215 by hand and
  rejected every other three. That list is an asset to be reviewed and
  grown, with several clues written per word.

The two-list arrangement is the English one: a private list for building,
a production list (`words-production-es.dict` plus NOTICES) in the
`seedgrid` Storage bucket for the studio.

### 5.2 Engine

Done on 2026-11-13 (branch `spanish-puzzles`):

- `dictionary.ts`, `solver.ts`: 27 letters through one `LETTERS` constant
  (Ñ is index 26).
- `engine/src/lib.rs` accepts Ñ in grid cells and in approved / rejected
  words; the wasm was rebuilt with `engine/build.sh`. The JS bindings did
  not change.
- `audit.ts`, `crosscheck.ts`, `themedLarge.ts` normalise through
  `src/lib/gridLetters.ts`. One change for English: an accented letter in
  a clue or title is now folded instead of dropped ("résumé" compares as
  RESUME, was RSUM).

Still to do:

- `looksPartial` and the ENABLE exemption are English heuristics and are
  skipped or replaced for Spanish.
- The same-root and conjugation rules (`wordForms.ts`) wired into
  `seedgrid:large`, `audit.ts` and the studio; today only the spike
  scripts run them. They report nothing without lemma data, so English
  is unaffected.
- Real morphological data behind them (§1.1b).

### 5.3 Fill trial

Before the large is promised: 20 themed 15×15 attempts and 20 11×11s from
the production list at the English floors, recording for each whether it
filled, the floor it needed, and the count of entries under 50. The bar to
pass, proposed: at least 15 of 20 fill at the standard floor with no more
than four sub-50 entries each (estimate; to be set against the English
figures from the same script).

### 5.4 Clues

A Spanish prompt set in `cluePrompt.ts`, selected by language: written in
Spanish, with the taste notes of §2.4 instead of the English crosswordese
list, and each entry passed with its accented spelling, part of speech
and, for a verb form, its lemma, person and tense. The checks
(`clueProblems`, `clueIssues`) use the shared accent-folding comparison so
"canción" in a clue is caught for CANCION. The content review runs in
Spanish.

Model quality in Spanish is unmeasured. The spike's clues, marked up by
the reviewer, are the first measurement.

### 5.5 Hooks and themes

`docs/daily-hooks-es.json`: a calendar for the Spanish-speaking world
(Reyes, Día del Libro, Día de Muertos, national days, La Liga and the
Liga MX, Santa Cecilia), researched per batch as `docs/daily-hooks.md`
describes. A Spanish theme backlog beside
`docs/large-puzzle-themes.json`.

Theme density is lower than in English. In the spike, four short theme
words (5 to 7 letters) laid out in an 11×11 and three long ones in a
15×15; four or five long ones never did. Plan Spanish themes as three or
four entries until the phrase list changes that.

### 5.6 Review and cost

Every Spanish puzzle is read by the fluent reviewer before publication.
A full Spanish set is four more puzzles a day, 28 a week. Estimates, to be
replaced by the spike's real figures: 3–5 minutes of review for a mini,
10–15 for a large, so roughly 3–4 hours a week for all four slots, about
1 hour for mini and midi alone. Model cost per puzzle should match the
English pipeline's. This is the recurring cost of the project and the
main reason to start with two slots.

Build order within a batch is smallest first: the mini proves the list
and the day's hook in minutes, and each size up shows where the list
strains before the expensive grid is attempted.

The studio's Daily queue and the crosscheck gain the language; a batch
goes to the reviewer as one README per week in the spike's format.

---

## 6. The studio in Spanish

- A language on the studio puzzle (`StudioState.language`), chosen at New
  puzzle, defaulting to the interface language.
- The word list is per language: `wordListStore` already caches by URL, so
  the Spanish list is a second download, on first use only.
- Ñ in the studio grid: the same input change as §3.2, plus the engine
  change of §5.2.
- AI clue drafts and title suggestions use the Spanish prompts.
- Publish already asks for a language; it defaults to the puzzle's.
- `.puz` export is Latin-1 and carries Ñ; `.ipuz` is UTF-8.

Price and Plus are unchanged (decision 13): the studio is a Plus feature
in either language.

---

## 7. Order

| Phase | What | Gate to the next |
|---|---|---|
| 0 | **Spike** (running): private list, one day's set of four, README for the reviewer | The reviewer's read: is the fill ordinary Spanish, are the clues good, is the large worth doing |
| 1 | **Letters**: `Puzzle.language`, Ñ on every input surface, the ten-key row, tests. Lets a Spanish community puzzle or import be solved properly, which was impossible before. **Built 2026-11-13** on branch `spanish-puzzles` (`src/lib/gridLetters.ts`); typed in desktop Chrome on the spike's midi (N refused on the Ñ square, Ñ accepted). Not yet tried on a phone or in the apps | Typed on a phone, an iPad with a keyboard and in an app build |
| 2 | **Tooling**: the production word list with NOTICES, the 27-letter engine (needs decision 12), Spanish prompts and checks, the fill trial | Fill trial passes for the sizes we mean to launch; counsel's view on the list |
| 3 | **Mini and midi daily in Spanish** behind `VITE_SPANISH_PUZZLES`: feed paths, index, boards and links by language, the puzzle-language setting, two weeks stocked and reviewed | Two weeks of real play: do Spanish players come back |
| 4 | **Daily Plus in Spanish** (11×11 filled in the spike) | — |
| 4b | **A Spanish large**, as its own project: the phrase-and-names list, then the fill trial at 15×15 and 13×13 | The fill trial |
| 5 | **Studio in Spanish** | — |

Phase 1 is worth doing whatever the reviewer says: community puzzles
already accept Spanish, and a Spanish grid with an Ñ cannot be finished on
the site today.

Rough size (estimates): phase 1, 2–3 days; phase 2, 4–6 days plus the
trial; phase 3, 4–5 days including the migration; phase 4, 2 days once 3
exists; phase 5, 3–4 days.

---

## 8. Migrations

One migration for phase 3, applied before the client:

- `daily_results.lang`, `daily_schedule.lang` (default `'en'`, CHECK in
  `('en','es')`), the unique keys widened; existing rows are English.
- The board's RLS policies are unchanged (they key on the user).
- `race_replies.lang`, and `send_beat` / `reply_to_race` gain
  `p_lang DEFAULT 'en'`, so older app builds keep working.

One for phase 4: `bonus_puzzles.lang` in the key, `bonus_puzzle(p_day,
p_lang DEFAULT 'en')`, `bonus_cards` with the column.

`puzzle_reports`, `solves`, `solo_progress`, `solve_traces`,
`replay_shares` and `play_sessions` need nothing. `play_sessions` could
take a `lang` column for insights; cheaper is to read it off the puzzle
key in `insights_puzzles`.

---

## 9. Risks

1. **The bigger grids may not fill well at three letters.** The spike and
   the fill trial answer this; the fallback is a 13×13 large.
2. **Clue quality.** A model writing Spanish clues unsupervised will
   produce some that are wrong or stiff. The reviewer is the control, and
   is a single point of failure: no reviewer that week, no Spanish puzzles
   that week.
3. **Solver taste is unknown.** No evidence either way on how Spanish
   solvers take to wordplay themes or to a grid without two-letter fill.
4. **Regional balance.** "Neutral" Spanish satisfies nobody perfectly; the
   first complaints will be about a word one country does not use.
5. **Licence.** The production list's position is reasoned, not confirmed
   by counsel.
6. **Willingness to pay.** Spanish digital puzzles are free everywhere we
   looked, and dollar pricing is high for much of Latin America. Not
   researched beyond that.
7. **Doubling the daily load.** Eight puzzles a day to stock, crosscheck
   and review instead of four.

## 10. Not in this spec

Other languages; translating English puzzles; autodefinidos or any
non-American format; regional editions (a Mexican mini, a Spanish one);
regional pricing; a Spanish prerendered site.
