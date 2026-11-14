# Do, re, mi (mini, 5×5)

Day: 2026-11-22 (Santa Cecilia, Día de la Música). No theme; 5A nods to the day.

```
##MAL
#POLO
NOTAS
OSOS#
SER##
```

Blocks: 6 of 25. Entries: 10. 

Entries with Ñ: none.

Weakest entries by list score (below 52): none.

Conjugated verbs (budget 1): none. Same-root pairs: none.

## Not sure of
- **LOS / NOS**: Two short function words; clued with fill-in-the-blank.
- **OSOS**: The 15×15 has OSO and OSA. Three-letter repeats are allowed across the set, but a reader may notice the bears.

## Across
| # | Answer | Score | Clue |
|---|---|---|---|
| 1 | MAL | 62 | Lo contrario de «bien» |
| 4 | POLO | 58 | Extremo norte o sur del planeta |
| 5 | NOTAS | 58 | Hay siete en la escala musical |
| 6 | OSOS | 58 | Los hay pardos, negros y panda |
| 7 | SER | 62 | «___ o no ___», duda de Hamlet |

## Down
| # | Answer | Score | Clue |
|---|---|---|---|
| 1 | MOTOR | 58 | Va bajo el capó |
| 2 | ALAS | 58 | Las baten los pájaros |
| 3 | LOS | 62 | Artículo: «___ músicos» |
| 4 | POSE | 55 | Postura para la foto |
| 5 | NOS | 62 | «___ vemos mañana» |

## How it was built
- Pattern ##.../#..../...../....#/...## (6 blocks, rotational), NOTAS locked in the middle row.
- Rebuilt 2026-11-13 under the new rules. The first mini (CANTO in the middle, kept as scripts/seedgrid/es/puzzles/mini-canto.json) had PUSO and PARE: two conjugated verbs against a budget of one.
- Engine with Ñ as a letter: 300 fills at floor 55 with no conjugated verb allowed gave 25 distinct grids around NOTAS (6 around CANTO, 17 COROS, 2 RITMO, 1 TANGO). 21 of those share no entry of four or more letters with the other three puzzles; this one was chosen by hand over grids with MATON, SATAN, IRAS or COÑA.

## Checks (scripts/seedgrid/es/finish.mts)
```
ok   no entry under 3 letters
ok   every white square in one across and one down entry
ok   every square filled with a letter
ok   rotational symmetry
ok   meetsGridStandards + connected
ok   no duplicate entries
ok   title is not an entry
ok   every entry on the list (themers excepted)
ok   no two entries of one root
note same root only if a noun is read as a verb: none
ok   finite verb forms within the budget of 1
ok   every entry has a clue
ok   no clue for a slot that does not exist
ok   clue length within 41
ok   clue never holds its answer (five-word runs)
ok   repo auditClues (length and giveaway)
ok   no two entries share a clue
ok   ipuz round trip (gridFromIpuz, cluesFromIpuz)
ok   no entry of 4+ letters shared with large, midi, plus
```
