# A bailar (plus, 11×11)

Day: 2026-11-22 (Santa Cecilia, Día de la Música). Four dances, placed symmetrically: TANGO, CORRIDO, MILONGA, SALSA. Straight clues; one wordplay clue (37A).

```
TANGO##SACA
AGUILA#UÑAS
LIBRAR#BASE
#LEO#CAIDAS
####CORRIDO
APICE#PARAR
MILONGA####
OCULAR#ORA#
RASO#ULTIMA
EROS#AEREAS
SOSO##SALSA
```

Blocks: 21 of 121. Entries: 42. Theme entries: TANGO, CORRIDO, MILONGA, SALSA.

Entries with Ñ: 7D AÑADIR, 12A UÑAS.

Weakest entries by list score (below 52): ILUSOS 50.

Conjugated verbs (budget 4): 1: SUBIRÁ. Same-root pairs: none.

## Not sure of
- **MILONGA**: List score 47 (rare in the frequency data) but a real, well-known word; it is a theme entry.
- **CORRIDO**: The Mexican song form: a genre more than a dance, so the 'four dances' label is loose.
- **CAIDAS**: Falls: checked against the content rule, clued lightly.
- **CASADA**: Clue assumes 'sí, quiero' (the wedding answer in Spain; Latin America often says 'sí, acepto').
- **GRUA**: Clue uses 'auto' (Latin America) rather than 'coche'.
- **ILUSOS**: Fine as a word; the clue is a little loose.
- **AMORES / AMAS**: Not forms of one word (amor, ama), so the rule passes, but both come from amar. AMAS is clued as the noun 'dueñas'. A strict editor may still want one of them gone.
- **SUBIRA / ORA / SACA / LEO**: Conjugations; all common forms. Only SUBIRA cannot be read as anything else.
- **EROS**: A proper name from mythology, as fill.

## Across
| # | Answer | Score | Clue |
|---|---|---|---|
| 1 | TANGO | 55 | Se baila de a dos en Buenos Aires |
| 6 | SACA | 58 | Extrae |
| 10 | AGUILA | 58 | Ave del escudo de México |
| 12 | UÑAS | 58 | Se pintan con esmalte |
| 13 | LIBRAR | 55 | Salvar de un peligro |
| 14 | BASE | 62 | Parte de abajo que sostiene |
| 15 | LEO | 62 | «___ el diario cada mañana» |
| 16 | CAIDAS | 52 | Tropezones que acaban en el suelo |
| 18 | CORRIDO | 55 | Canción norteña que cuenta una historia |
| 19 | APICE | 52 | Punta más alta de algo |
| 23 | PARAR | 62 | Detenerse |
| 24 | MILONGA | 47 | Baile rioplatense y lugar donde se baila |
| 26 | OCULAR | 55 | Relativo a los ojos |
| 27 | ORA | 52 | Reza |
| 30 | RASO | 52 | Tela lisa y brillante |
| 31 | ULTIMA | 60 | La que llega al final |
| 34 | EROS | 52 | Cupido, para los griegos |
| 35 | AEREAS | 55 | Como las líneas que venden vuelos |
| 36 | SOSO | 52 | Falto de sal |
| 37 | SALSA | 58 | ¿Ritmo caribeño que se sirve en la mesa? |

## Down
| # | Answer | Score | Clue |
|---|---|---|---|
| 1 | TAL | 62 | «___ vez»: quizás |
| 2 | AGIL | 55 | Rápido y ligero al moverse |
| 3 | NUBE | 58 | Algodón del cielo |
| 4 | GIRO | 58 | Vuelta sobre uno mismo |
| 5 | OLA | 58 | La montan los surfistas |
| 6 | SUBIRA | 52 | Irá hacia arriba |
| 7 | AÑADIR | 58 | Agregar |
| 8 | CASADA | 58 | Que ya dio el «sí, quiero» |
| 9 | ASESOR | 55 | Da consejos por oficio |
| 11 | ARCO | 58 | Con él se toca el violín |
| 17 | ARPA | 52 | Instrumento de cuerdas típico de Paraguay |
| 18 | CENA | 62 | Comida de la noche |
| 19 | AMORES | 55 | Los hay de verano y a primera vista |
| 20 | PICARO | 52 | Astuto y travieso |
| 21 | ILUSOS | 50 | Soñadores que se engañan solos |
| 22 | COLOSO | 52 | Estatua gigante, como la de Rodas |
| 25 | GRUA | 55 | Se lleva el auto mal estacionado |
| 27 | OTRA | 60 | «¡___, ___!», pide el público al final |
| 28 | RIEL | 52 | Carril del tren |
| 29 | AMAS | 60 | Dueñas de casa |
| 32 | LES | 62 | A ellos |
| 33 | ASA | 52 | Agarradera |

## How it was built
- findSkeleton with seeds MILONGA, CORRIDO, SALSA, TANGO at floor 52: five of six random seeds gave a skeleton (20 to 25 blocks); this one has 21.
- Three curation rounds of 400 to 500 fills at floor 52 (174 to 411 distinct each), ranked by disliked words, same-root pairs and entries below 50.
- Lower-left corner refilled three times. First at floor 52 (6 distinct) to remove OLER beside OLORES and AMAMOS beside AMAS; then at floor 50 with ORAL rejected, because the 15×15 needs ORAL, which left AMABAS in 19D beside AMAS. On 2026-11-13, with the rebuilt engine and the same-root rule: 1,500 fills at floor 50 with every form of amar rejected gave 6 clean grids; this one (AMORES, PICARO, COLOSO, APICE, OCULAR) keeps ILUSOS and SOSO at list score 50 to 52.
- Did not work: BACHATA + MILONGA in a hand-made 18-block pattern filled only at floor 50 and forced DESHARE/TRIDENTES/CAERAS; CUMBIA and BOLERO as extra seeds were unfillable; an 8/8/9/9 set (MARIACHI, SERENATA, BANDONEON, PASODOBLE) gave no layout.

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
ok   finite verb forms within the budget of 4
ok   every entry has a clue
ok   no clue for a slot that does not exist
ok   clue length within 41
ok   clue never holds its answer (five-word runs)
ok   repo auditClues (length and giveaway)
ok   no two entries share a clue
ok   ipuz round trip (gridFromIpuz, cluesFromIpuz)
ok   no entry of 4+ letters shared with large, midi, mini
```
