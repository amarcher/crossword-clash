# Mini generator

Generates original themed 5×5 minis for `src/lib/dailyMinis.ts`. 100% original
content (our fill + our clues) — zero third-party puzzle copyright.

## Word lists (download once, not committed)
```
cd wordlists
curl -sfL https://raw.githubusercontent.com/dolph/dictionary/master/enable1.txt -o enable1.txt
curl -sfL https://raw.githubusercontent.com/hermitdave/FrequencyWords/master/content/2018/en/en_50k.txt | awk '{print $1}' | head -20000 > freq20k.txt
```
- `enable1.txt` — ENABLE word list (public domain), used to *validate* every entry is a real word.
- `freq20k.txt` — ~20k most-frequent English words, used as the *fill pool* (keeps fill common/clean).

## Generate a themed grid
```
node filler.mjs ocean      # seeds the theme word, prints a dup-free all-real-words 5×5 grid
```
Curate the fills (reject weak/obscure words — rerun for a better one), then author clues and add a
spec to `SPECS` in `src/lib/dailyMinis.ts`.

## Validate a batch before committing
Put specs in a JSON array (`{title, theme, grid, clueTexts}`) and:
```
node validate-mini.mjs batch.json
```
It checks: 5×5, every across/down entry is a real word, every white cell is checked both ways,
no answer repeats, every answer has a clue, and the theme word appears.
