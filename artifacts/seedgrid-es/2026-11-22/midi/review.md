# Música, maestro (midi, 9×9)

Day: 2026-11-22 (Santa Cecilia, Día de la Música). Light theme: the two long acrosses (ACOMPAÑAS, CANCIONES) and TRIOS are musical.

```
ROL#IMPAR
IRE#MIEDO
ACOMPAÑAS
SANAR#ANA
###SEA###
ASA#CRUCE
CANCIONES
TRIOS#AÑO
AISLA#SOS
```

Blocks: 12 of 81. Entries: 32. 

Entries with Ñ: 6D PEÑA, 11A ACOMPAÑAS, 22D CEÑO, 27A AÑO.

Weakest entries by list score (below 52): IMPRECISA 50, AISLA 50.

Conjugated verbs (budget 3): 3: IRÉ, ACOMPAÑAS/ACOMPAÑÁS, AÍSLA. Same-root pairs: none.

## Not sure of
- **SARI**: The Indian garment; in the RAE dictionary, but not an everyday word.
- **MIEDO**: Checked against the content rule (nothing sad): a common neutral word, clued through horror films. Swap if the reviewer finds it off-tone.
- **ADAN / ANA**: Two proper names in one small grid.
- **PEÑA**: Two senses in one clue (a crag; a fan club, mostly Spain and the Río de la Plata).
- **ARO**: Clued as the basketball hoop ('básquet' is the Latin American form; Spain says 'baloncesto').
- **COL**: 'Repollo' is the usual word in much of Latin America, 'col' in Spain and Mexico. The clue relies on both being understood.
- **RIAS**: Clued as the Galician inlets (rías), a Spain-specific geography word; the alternative is the verb form 'rías' (subjunctive of reír).
- **IRE**: Future of ir (iré); common, but a conjugation.

## Across
| # | Answer | Score | Clue |
|---|---|---|---|
| 1 | ROL | 55 | Papel que cumple un actor |
| 4 | IMPAR | 52 | Como el 3, el 5 o el 7 |
| 9 | IRE | 56 | Futuro de «voy» |
| 10 | MIEDO | 62 | Lo provoca una película de terror |
| 11 | ACOMPAÑAS | 52 | Tocas la guitarra mientras otro canta |
| 13 | SANAR | 55 | Recuperar la salud |
| 14 | ANA | 58 | Nombre de mujer que es palíndromo |
| 15 | SEA | 60 | «O ___» (es decir) |
| 17 | ASA | 52 | Por ahí se agarra la taza |
| 20 | CRUCE | 58 | Donde se encuentran dos calles |
| 24 | CANCIONES | 58 | Temas de un disco |
| 26 | TRIOS | 52 | Grupos como Los Panchos |
| 27 | AÑO | 62 | Doce meses |
| 28 | AISLA | 50 | Separa del resto |
| 29 | SOS | 58 | Llamada de auxilio en el mar |

## Down
| # | Answer | Score | Clue |
|---|---|---|---|
| 1 | RIAS | 55 | Entradas del mar típicas de Galicia |
| 2 | ORCA | 52 | Cetáceo blanco y negro |
| 3 | LEON | 58 | Rey de la selva |
| 4 | IMPRECISA | 50 | Poco exacta |
| 5 | MIA | 62 | Que me pertenece, en femenino |
| 6 | PEÑA | 52 | Monte de piedra, o club de aficionados |
| 7 | ADAN | 55 | Compañero de Eva |
| 8 | ROSA | 58 | Flor con espinas |
| 12 | MAS | 62 | Signo de la suma |
| 16 | ARO | 55 | Donde entra el balón en básquet |
| 17 | ACTA | 55 | Registro escrito de una reunión |
| 18 | SARI | 52 | Vestido tradicional de la India |
| 19 | ANIS | 52 | Semilla aromática de ciertos licores |
| 21 | UNAS | 60 | Algunas |
| 22 | CEÑO | 55 | Se frunce al enojarse |
| 23 | ESOS | 62 | Aquellos, pero más cerca |
| 25 | COL | 55 | Repollo |

## How it was built
- Hand pattern, 12 blocks, rotational, every run 3+: .../.../ full row / .....#... / ###...### and its mirror.
- CANCIONES locked in row 7 (locked letters must be ASCII, so a word with Ñ cannot be locked). At floor 52, 120 tries gave 56 distinct fills; several put ACOMPAÑAS in row 3 by themselves, crossing PEÑA at the Ñ.
- Second pass: top half kept, lower-left corner refilled (floor 50, 300 tries, 14 distinct) to drop VIUDA, ENANO, ACNE and CAIN. This fill has TRIOS and two more Ñ crossings (AÑO/CEÑO).
- Did not work: two locked music nines (CANCIONES with GUITARRAS, TROMPETAS, ORQUESTAS or CANTANTES) were unfillable at floor 50; TROMPETAS and ORQUESTAS alone only fit row 7.
- Approving a word for a slot through the engine's `approved` rule returned unfillable where locking the same letters filled. Not investigated.
- Third pass: the upper-left corner was swapped from ORO/VOS/LASER (downs OVAL, ROCA, OSOS, MES) to ROL/IRE/SANAR, another of the engine's fills for the same pattern, because every floor-50 fill of the 15×15 needs OVAL or ORAL and the same-day rule forbids sharing a 4+ entry.

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
ok   finite verb forms within the budget of 3
ok   every entry has a clue
ok   no clue for a slot that does not exist
ok   clue length within 41
ok   clue never holds its answer (five-word runs)
ok   repo auditClues (length and giveaway)
ok   no two entries share a clue
ok   ipuz round trip (gridFromIpuz, cluesFromIpuz)
ok   no entry of 4+ letters shared with large, mini, plus
```
