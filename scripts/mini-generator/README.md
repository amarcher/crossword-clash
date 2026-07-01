# Mini generator

Generates original themed N×N dailies for `src/lib/dailyMinis.ts` — 5×5, 7×7,
11×11, up to 15×15, with 180°-rotationally-symmetric black-square patterns
(the crossword standard). 100% original content (our fill + our clues) — zero
third-party puzzle copyright.

## Word lists (download once, not committed)
```
cd wordlists
curl -sfL https://raw.githubusercontent.com/dolph/dictionary/master/enable1.txt -o enable1.txt
curl -sfL https://raw.githubusercontent.com/hermitdave/FrequencyWords/master/content/2018/en/en_50k.txt | awk '{print $1}' > freq50k.txt
```
- `enable1.txt` — ENABLE word list (public domain), used to *validate* every entry is a real word.
- `freq50k.txt` — 50k most-frequent English words (OpenSubtitles corpus). The filler uses the
  top `--pool N` of it (∩ ENABLE) as the fill pool; the audit uses word rank to reject obscure
  entries. (A legacy `freq20k.txt` also works as a fallback if `freq50k.txt` is absent.)

## Generate a themed grid
```
node filler.mjs ocean                  # classic 5×5 black-corner mini
node filler.mjs weekend --size 7       # 7×7 pinwheel pattern, theme-seeded
node filler.mjs --size 11 --pool 30000 --pattern auto
```
Flags:
- `--size N` — grid size, 5..15 (default 5).
- `--pool N` — fill pool = top-N frequency words ∩ ENABLE (default 20000 — the sweet spot for
  4–5-letter fill; use 30000+ for larger grids that need rarer long words).
- `--pattern P` — `auto` derives a random symmetric pattern (re-derives + retries if one won't
  fill), or pass explicit rows joined by commas (`"#....,.....,.....,.....,....#"`). Defaults to
  the built-in pattern for the size (5: black corners, 7: pinwheel), else `auto`.
- `--time-ms N` — wall-clock cap per fill attempt loop (defaults scale with size).
- `--steps N` — backtracking steps per attempt before a randomized restart.

The filler keeps the prefix-feasibility backtracking + step cap + retry-until-dup-free approach
at every size, and orders candidates least-constraining-first (down-prefix counts, forward
checking). Theme words are seeded into a random slot of matching length. 2-letter entries are
allowed only at 5×5; 7×7 and larger require all entries ≥ 3 letters.

**Fill reliability**: 5×5 fills in ~a second, 7×7 in seconds. 9×9+ is currently *experimental*:
patterns (incl. the curated built-in 11×11), validation and the audit gate fully support any
N×N, but the row-major backtracker rarely completes an 11×11 fill even with generous budgets
(`--time-ms 600000 --pool 50000`) — the mirrored bottom rows are fully constrained by the time
the search reaches them. A proper most-constrained-slot filler with constraint propagation is
the known fix (future work).

Curate the fills (reject weak/obscure words — rerun for a better one), then author clues and add
a spec to `SPECS` in `src/lib/dailyMinis.ts`.

## Validate a batch before committing
Put specs in a JSON array (`{title, theme, grid, clueTexts}`) and:
```
node validate-mini.mjs batch.json
```
It checks (any N×N): every across/down entry is a real word, every white cell is checked both
ways, no answer repeats, every answer has a clue, and the theme word appears among the answers.

## Audit gate (quality) — run after the validator
```
node audit-mini.mjs batch.json [--max-rank 30000]
```
Rejects weak grids/clues before they ship. Per puzzle:
- **Entries**: every answer within the top `--max-rank` (default 30000) of the frequency list —
  obscure crosswordese is rejected unless whitelisted (the theme entry is always exempt; add
  `"whitelist": ["word", ...]` to a spec for deliberate exceptions). A small blocklist also
  catches subtitle-corpus junk (`tae`, `rin`, `ain`, ...) that ranks deceptively high.
- **Duplicates**: no duplicate answers (the app keys clues by answer).
- **Clues**: clue exists, is ≥ 3 chars, does not contain its answer (case-insensitive), and no
  two entries share the same clue text.
- **Grid**: square N×N, black squares < 20%, 180° rotational symmetry, white cells fully
  connected, all entries ≥ 3 letters on 7×7+ (2-letter entries allowed only on 5×5).

Both scripts print per-puzzle pass/fail with reasons and exit non-zero on any failure.

## Pipeline
generate (`filler.mjs`) → curate fill → author original clues (LLM or human — no clue may
contain its answer, no copied published clues) → `validate-mini.mjs` → `audit-mini.mjs` →
add to `SPECS` in `src/lib/dailyMinis.ts` (mixed sizes rotate fine — the UI reads dimensions
from the puzzle).
