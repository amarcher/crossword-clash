# Halftime Show

Football x music

15×15, rotational symmetry, requested score 50, filled at floor 45, model claude-opus-5-5, 121s, tokens 7124 in / 5433 out

## Seeds
| Entry | Letters | Placement |
|---|---|---|
| TOUCHDOWNUNDER | 14 | mirrors GOALPOSTMALONE |
| GOALPOSTMALONE | 14 | mirrors TOUCHDOWNUNDER |
| KICKOFFSPRING | 13 | mirrors GOALLINEDANCE |
| GOALLINEDANCE | 13 | mirrors KICKOFFSPRING |

- GOALPOSTMALONE and GOALLINEDANCE share GOAL (4 letters; the limit is 3). (kept with --allow-shared; the engine's limit binds its own entries only)

## Skeleton
```
...###...###...
.....#.....#...
.....#.....#...
##GOALLINEDANCE
......###.....#
TOUCHDOWNUNDER#
.....#....#...#
####.......####
#...#....#.....
#GOALPOSTMALONE
#.....###......
KICKOFFSPRING##
...#.....#.....
...#.....#.....
...###...###...
```
Fills at floor **45** (requested 50; the list runs thin around stacked themers at 50). Best of 2 layouts by quick-fill quality (1055 at floor 45, 969 at floor 45); this one took 165 legal skeletons in 13s.
70 words, 48 blocks (21%), average length 5.06, 22 three-letter entries. Corners white, no 2×2 black block (grid standards).
Tightest open slots at floor 45: 47D (4 options), 21D (6 options), 34D (9 options), 36D (9 options), 46D (12 options).

## Fills considered
24 distinct fills, each re-filled at 50 everywhere but the slots that need 45. Quality = Σ min(score, 70) − 50 over engine entries; an entry under 50 loses the gap again plus 10; −8 per partial-looking entry, −15 when an entry sits inside another.

| Fill | Quality | Mean score | Weak entries | Verdict |
|---|---|---|---|---|
| 1 | 1017 | 78.6 | ONRIO (scored 45), GMT (scored 47), BTU (scored 47), ITA (scored 47), DDT (scored 47), RON (inside BRONTE), EYE (inside MYEYE) | shortlist |
| 2 | 1020 | 76.5 | ONRIO (scored 45), SONGEUR (scored 47), ITA (scored 47), DDT (scored 47), HADON (partial-looking), EEL (inside PEEL) | shortlist |
| 3 | 980 | 77.8 | ONRIO (scored 45), SSM (scored 46), ANOAR (scored 46), OTU (scored 46), WSP (scored 46), SONGEUR (scored 47), ESE (scored 47), EYE (inside MYEYE) | — |
| 4 | 960 | 75.9 | ONRIO (scored 45), FGN (scored 46), ADLETS (scored 46), SONGEUR (scored 47), ITA (scored 47), DDT (scored 47), NES (inside NINES), HADON (partial-looking), THEDUDE (partial-looking) | — |
| 5 | 919 | 75.0 | ONRIO (scored 45), SONGEUR (scored 47), ALANON (scored 47), ATA (scored 47), NOELS (scored 47), EST (scored 47), ALA (inside ALANON), NES (inside NINES), HADON (partial-looking), NAS (inside GNASH), THEDUDE (partial-looking), NOONE (partial-looking) | — |
| 6 | 876 | 74.9 | OROMO (scored 45), KEPTFIT (scored 45), KUDU (scored 45), ETAI (scored 46), NABAT (scored 46), SONGEUR (scored 47), PST (scored 47), CAESURA (scored 47), TOSCALE (scored 47), EYE (inside MYEYE) | — |
| 7 | 1042 | 77.5 | ONRIO (scored 45), BTU (scored 47), PST (scored 47), HADON (partial-looking), RON (inside BRONTE), NOONE (partial-looking) | shortlist |
| 8 | 871 | 74.7 | ONRIO (scored 45), CCN (scored 46), VOI (scored 46), ADLETS (scored 46), EVINCE (scored 47), ATA (scored 47), EST (scored 47), NES (inside NINES), HADON (partial-looking), THEDUDE (partial-looking), AZINGER (partial-looking), TEN (inside EATEN), NOONE (partial-looking) | — |
| 9 | 824 | 76.0 | ONRIO (scored 45), CCN (scored 46), AUNE (scored 46), VOI (scored 46), ICTIS (scored 46), TOAGREE (scored 46), DPL (scored 46), EVINCE (scored 47), ARIANA (scored 47), ATA (scored 47), EST (scored 47), HADON (partial-looking), THEDUDE (partial-looking), NOONE (partial-looking), AID (inside AIDA) | — |
| 10 | 980 | 77.6 | ONRIO (scored 45), FGN (scored 46), VOI (scored 46), EVINCE (scored 47), ALANON (scored 47), ITA (scored 47), EDT (scored 47), OWN (inside TOUCHDOWNUNDER) | — |
| 11 | 1007 | 78.8 | ONRIO (scored 45), ANI (scored 45), VOI (scored 46), ANSOS (scored 46), EVINCE (scored 47), HADON (partial-looking), AZINGER (partial-looking), OWN (inside TOUCHDOWNUNDER) | — |
| 12 | 857 | 76.4 | ONRIO (scored 45), CITEE (scored 45), MFR (scored 45), TRESA (scored 46), NAACP (scored 47), ROI (scored 47, inside EROICA), PTS (scored 47), IONE (partial-looking), HADON (partial-looking), MEN (inside OMEN), ASH (inside SASH), WOO (inside WOOL) | — |
| 13 | 815 | 75.0 | KUDU (scored 45), GRS (scored 46), ANDE (scored 46), OSATO (scored 46), DHT (scored 46), SONGEUR (scored 47), THETUBA (scored 47, partial-looking), NAGAT (scored 47), TOSCALE (scored 47), ALANON (scored 47), NSA (scored 47), HADON (partial-looking), RAT (inside RATTY) | — |
| 14 | 807 | 74.1 | PSI (scored 45), ONRIO (scored 45), MFR (scored 45), RLA (scored 46), ECCEN (scored 46), EBO (scored 46), BTU (scored 47), ATA (scored 47), EST (scored 47), NES (inside NINES), THEDUDE (partial-looking), ABE (inside ABEL), RON (inside BRONTE), NOONE (partial-looking) | — |
| 15 | 778 | 73.0 | ANDE (scored 46), VOI (scored 46), OSATO (scored 46), ASANOX (scored 46), OTU (scored 46), SSN (scored 47), THETUBA (scored 47, partial-looking), EVINCE (scored 47), NAGAT (scored 47), ESE (scored 47), HADON (partial-looking) | — |
| 16 | 878 | 76.1 | ODAL (scored 45), ONRIO (scored 45), VOI (scored 46), EVINCE (scored 47), ITD (scored 47), ALANON (scored 47), EDT (scored 47), ANO (inside ALANON), HADON (partial-looking), THEDUDE (partial-looking), AZINGER (partial-looking), LED (inside SLED) | — |
| 17 | 1012 | 76.6 | ONRIO (scored 45), ILLGOT (scored 45), SONGEUR (scored 47), PST (scored 47), HADON (partial-looking), AZINGER (partial-looking), NOONE (partial-looking) | — |
| 18 | 859 | 75.0 | ONRIO (scored 45), WSP (scored 46), SPINSA (scored 46), STA (scored 47), SRS (scored 47), PTS (scored 47, inside ADAPTS), ALANON (scored 47), NOELS (scored 47), HADON (partial-looking), ENT (inside ARENT), ARENT (partial-looking), THEDUDE (partial-looking), SHE (inside LEASHES) | — |
| 19 | 993 | 77.3 | ONRIO (scored 45), CCN (scored 46), VOI (scored 46), SPO (scored 46), EVINCE (scored 47), PTS (scored 47), ITME (partial-looking) | — |
| 20 | 864 | 74.3 | ONRIO (scored 45), FGN (scored 46), ADLETS (scored 46), BTU (scored 47), ATA (scored 47), EST (scored 47), BSA (scored 47), NES (inside NINES), HADON (partial-looking), THEDUDE (partial-looking), RON (inside IRON), TEN (inside EATEN) | — |
| 21 | 949 | 77.0 | HHS (scored 45), ONRIO (scored 45), ILLGOT (scored 45), CSK (scored 46), OTU (scored 46), SONGEUR (scored 47), ESE (scored 47), HADON (partial-looking) | — |
| 22 | 942 | 75.2 | ONRIO (scored 45), CSTAR (scored 45), SONGEUR (scored 47), COWGATE (scored 47), MGR (scored 47), PST (scored 47), EPA (scored 47), HADON (partial-looking), PER (inside OPERA) | — |
| 23 | 798 | 73.7 | ONRIO (scored 45), CCN (scored 46), MSA (scored 46), VOI (scored 46), ADLETS (scored 46), EGK (scored 46), EVINCE (scored 47), ATA (scored 47), EST (scored 47), NES (inside NINES), HADON (partial-looking), THEDUDE (partial-looking), TEN (inside EATEN), NOONE (partial-looking) | — |
| 24 | 812 | 74.6 | KUDU (scored 45), SCC (scored 46), OSATO (scored 46), ASANOX (scored 46), SNU (scored 46), THETUBA (scored 47, partial-looking), BTU (scored 47), NAGAT (scored 47), YDS (scored 47), TOSCALE (scored 47), ASA (inside ASANOX), HADON (partial-looking), RON (inside IRON) | — |

## Claude's review, round 1
Picked fill 7. Fill 7 has the cleanest perimeter: OOMPH, OPERA, MYLAR, SKIRT, LOCKE and BRONTE are lively, and it avoids Fill 2's SONGEUR and Fill 1's EYE/MYEYE duplicate and GMT. The shared center (ONRIO, STREWER, NOICANT, TAPSFOR, NEWAT) is the weak spot. ONRIO is the one that truly has to go. Freeing it should let the engine smooth out the rest of the middle.
- [must] ONRIO: Reads as a nonsense partial; racers won't parse it.
- [nice] RANTO: Partial-looking verb phrase (RAN TO); weak fill in a prominent spot.
- [nice] STREWER: Awkward agent noun nobody says.
- [nice] BTU: Technical abbreviation; low appeal.
- [nice] TRA: Filler syllable; tired crosswordese.
- [nice] HADON: Weak verb-particle entry.
- [nice] PST: Abbreviation in a corner that already has ETA; could be cleaner.

Refilled without ONRIO:

| Fill | Quality | Mean score | Weak entries | Verdict |
|---|---|---|---|---|
| 25 | 925 | 75.6 | OBESO (scored 46), YDE (scored 46), ASME (scored 46, partial-looking), KBT (scored 46), GIS (scored 47), SONGEUR (scored 47), STERNER (scored 47), PST (scored 47), ABE (inside ABEL), THEDUKE (partial-looking), NOONE (partial-looking) | — |
| 26 | 818 | 75.0 | ATT (scored 45), REITH (scored 46), OTORO (scored 46), NOGOT (scored 46), ILLGET (scored 46), BTU (scored 47), ENE (scored 47), NSA (scored 47), HADON (partial-looking), AZINGER (partial-looking), THEDUKE (partial-looking), RON (inside BRONTE), ADD (inside ADDS), NOONE (partial-looking), NEW (inside ALLNEW) | — |
| 27 | 753 | 73.2 | KALI (scored 45), APRES (scored 45), ATT (scored 45), VOI (scored 46), OTORO (scored 46), NOGOT (scored 46), ENN (scored 46), ANANNY (scored 46, partial-looking), EVINCE (scored 47), NSA (scored 47), HADON (partial-looking), AZINGER (partial-looking), THEDUKE (partial-looking), OWN (inside TOUCHDOWNUNDER), NOONE (partial-looking) | — |
| 28 | 803 | 76.2 | OBESO (scored 46), ASME (scored 46, partial-looking), ECCEN (scored 46), ALDI (scored 47), BTU (scored 47), STERNES (scored 47), NNE (scored 47), PST (scored 47), NES (inside STERNES), ETA (inside PETA), LEN (inside CLENCH), HAN (inside THANK), RON (inside BRONTE), LEO (inside LEONE), END (inside AMENDS) | — |
| 29 | 910 | 77.4 | ECLAT (scored 45), OBESO (scored 46), ASME (scored 46, partial-looking), AMANTE (scored 46), BTU (scored 47), STERNES (scored 47), ATA (scored 47), EDT (scored 47), HADON (partial-looking), AZINGER (partial-looking), THEDUKE (partial-looking), RON (inside IRON), ANT (inside RANTO) | — |
| 30 | 757 | 74.5 | PCLAB (scored 45), ANI (scored 45, inside SPANIEL), OTORO (scored 46), NOGOT (scored 46), ANSOS (scored 46), ANANDA (scored 46, partial-looking), KINGTUT (scored 47), LTD (scored 47), ATV (scored 47), ROI (scored 47, inside EROICA), GOA (inside GOALLINEDANCE), HADON (partial-looking), AZINGER (partial-looking), THEDUKE (partial-looking), AND (inside ANANDA) | — |
| 31 | 846 | 75.0 | KUDU (scored 45), CCN (scored 46), VOI (scored 46), OSATO (scored 46), ASANOX (scored 46), THETUBA (scored 47, partial-looking), EVINCE (scored 47), NAGAT (scored 47), YRS (scored 47), TOSCALE (scored 47), HADON (partial-looking) | — |
| 32 | 933 | 75.5 | THEMUSE (scored 45, partial-looking), STORMER (scored 45), SPINSA (scored 46), CALI (scored 47), STA (scored 47), PST (scored 47), HADON (partial-looking), ONO (inside ORONO), INS (inside SPINSA), ANN (inside ANNE) | — |
| 33 | 801 | 74.4 | ANI (scored 45), VOI (scored 46), ANSOS (scored 46), ICAL (scored 47), IREFUSE (scored 47), EVINCE (scored 47), SONGEUR (scored 47), MGR (scored 47), THUDS (scored 47), STE (scored 47), NDA (inside FONDA), OWN (inside TOUCHDOWNUNDER), LED (inside LEDON) | — |
| 34 | 1017 | 78.2 | OBESO (scored 46), ASME (scored 46, partial-looking), BTU (scored 47), STERNER (scored 47), PST (scored 47), RON (inside BRONTE) | shortlist |
| 35 | 835 | 74.6 | OROMO (scored 45), KEPTFIT (scored 45), KUDU (scored 45), ETAI (scored 46), NABAT (scored 46), STIGA (scored 46), CAESURA (scored 47), BTU (scored 47), TOSCALE (scored 47), TAT (scored 47), RON (inside BRONTE), ARE (inside CARCARE) | — |
| 36 | 929 | 75.8 | THEMUSE (scored 45, partial-looking), VOI (scored 46), EVINCE (scored 47), ICHAT (scored 47), ARAGON (scored 47, partial-looking), ATA (scored 47), EST (scored 47), HADON (partial-looking), NOONE (partial-looking) | — |

## Claude's review, round 2
Picked fill 34. The four theme puns are fun and well placed. Most of the long down fill is solid, especially LOATHES, PRESUME, REALISM, IGNITES and SLINKY, and NO I CAN'T, UNSEE and NO LIE add some liveliness. The real problems are OBESO and ASME in the center-left, so refilling there should fix both. STERNER and MOONSET are acceptable. Watch the short abbreviation load (BTU, PST, ORD, ETA): none of them cross each other, but trimming a couple would help solvers move faster.
- [must] OBESO: Spanish word for 'obese.' It's obscure for a racing solver, and the meaning is an unpleasant one for a light puzzle.
- [must] ASME: Reads as the partial 'AS ME,' or else as an obscure engineering-society abbreviation. Either way it's weak, and it's the lowest-scoring entry in its section.
- [nice] RANTO: Partial phrase 'RAN TO.' It's gettable but clunky.
- [nice] AIRCARS: Dated, not really in the language.
- [nice] BTU: Technical abbreviation; fine but dull.
- [nice] PST: Abbreviation or interjection with a low score.
- [nice] ORD: Airport code / 'ordnance' abbreviation; weak.

Refilled without OBESO, ASME:

| Fill | Quality | Mean score | Weak entries | Verdict |
|---|---|---|---|---|
| 37 | 840 | 74.4 | MFR (scored 45), SGD (scored 46), VOI (scored 46), OTORO (scored 46), NOGOT (scored 46), TDE (scored 46), EVINCE (scored 47), ATA (scored 47), EST (scored 47), ETA (inside PETA), HADON (partial-looking), THEDUKE (partial-looking) | — |
| 38 | 820 | 74.7 | VOI (scored 46), OSATO (scored 46), YRD (scored 46), INL (scored 46), THETUBA (scored 47, partial-looking), EVINCE (scored 47), NAGAT (scored 47), LANK (scored 47), ALANON (scored 47), NOELS (scored 47), HADON (partial-looking), AMNOT (partial-looking), SHE (inside SHEAR) | — |
| 39 | 566 | 70.6 | USU (scored 45), ATT (scored 45, inside RATTY), KUDU (scored 45), LDG (scored 46), VOI (scored 46), OSATO (scored 46), ADLETS (scored 46), EIG (scored 46), THETUBA (scored 47, partial-looking), DOLCE (scored 47), ANDS (scored 47), EVINCE (scored 47), NAGAT (scored 47), SYD (scored 47), TOSCALE (scored 47), STE (scored 47), HADON (partial-looking) | — |
| 40 | 799 | 75.6 | TSARIST (scored 45), OSATO (scored 46), ENN (scored 46), INL (scored 46), THETUBA (scored 47, partial-looking), BTU (scored 47), NAGAT (scored 47), LANK (scored 47), AMNOT (partial-looking), TSA (inside TSARIST), ABE (inside ABEL), RON (inside BRONTE), OAT (inside LOATHES), ART (inside TEACART), SEE (inside UNSEE), ANT (inside ANTE) | — |
| 41 | 967 | 77.7 | OTORO (scored 46), NOGOT (scored 46), ENR (scored 46), OTU (scored 46), BTU (scored 47), ESE (scored 47), HADON (partial-looking), REY (inside PREY), AZINGER (partial-looking), THEDUKE (partial-looking), RON (inside IRON) | shortlist |
| 42 | 781 | 74.0 | KUDU (scored 45), VOI (scored 46), OSATO (scored 46), CST (scored 47), THETUBA (scored 47, partial-looking), EVINCE (scored 47), NAGAT (scored 47), YDS (scored 47), TOSCALE (scored 47), ALANON (scored 47), NOELS (scored 47), STE (scored 47), ABE (inside ABEL), SHE (inside SHEAR) | — |
| 43 | 915 | 77.2 | FSA (scored 45), ANI (scored 45), OTORO (scored 46), NOGOT (scored 46), ANSOS (scored 46), BTU (scored 47), EATAT (scored 47), HADON (partial-looking), AZINGER (partial-looking), THEDUKE (partial-looking), RON (inside IRON), OFF (inside KICKOFFSPRING) | — |
| 44 | 786 | 74.2 | CCN (scored 46), VOI (scored 46), IREFUSE (scored 47), EVINCE (scored 47), SONGEUR (scored 47), MGR (scored 47), ITA (scored 47), THUDS (scored 47), EST (scored 47), NES (inside NINES), NDA (inside FONDA), ARI (inside DIARIST), PER (inside PERIL), LED (inside LEDON) | — |
| 45 | 889 | 75.4 | THEMUSE (scored 45, partial-looking), OSATO (scored 46), INL (scored 46), SONGEUR (scored 47), SLO (scored 47), LANK (scored 47), ETTE (scored 47), TED (inside FAINTED), AMNOT (partial-looking), AIR (inside AIRCARS) | — |
| 46 | 629 | 72.1 | ISAYNO (scored 45), NOGOT (scored 46), ONGO (scored 46), ARNEE (scored 46), DRAGOUT (scored 47), ITONYA (scored 47), ITA (scored 47), AMTOO (scored 47), TOYGERS (scored 47), ENE (scored 47), SNO (scored 47, inside SNOG), PTS (scored 47), DOASIDO (partial-looking), LAD (inside LADEN), ART (inside START), NOONE (partial-looking) | — |
| 47 | 923 | 77.2 | SGC (scored 46), VOI (scored 46), OTORO (scored 46), NOGOT (scored 46), OTU (scored 46), EVINCE (scored 47), DEA (scored 47), ESE (scored 47), HADON (partial-looking), THEDUKE (partial-looking), AMANDA (partial-looking), OWN (inside TOUCHDOWNUNDER) | — |
| 48 | 607 | 72.1 | WHIGS (scored 45), CCN (scored 46), WSP (scored 46), PRERUPT (scored 46), VOI (scored 46), OSATO (scored 46), STAINTO (scored 46), ATGE (scored 46), OLENKA (scored 46), ATENOR (scored 46, partial-looking), EVINCE (scored 47), XER (scored 47), ITA (scored 47), OKBUT (scored 47), EDT (scored 47), HADON (partial-looking), ENO (inside ATENOR), TEN (inside ATENOR) | — |

## Swaps
No weak entry had an engine-approved alternative that fits its crossings.

## Final fill
```
OAF###RBI###ASP
USUAL#EARTH#ZOO
RANTO#ALOHA#IRS
##GOALLINEDANCE
BRONTE###DODGE#
TOUCHDOWNUNDER#
UNSEE#TOOK#SRY#
####STOOGES####
#ITS#ARLO#OCHER
#GOALPOSTMALONE
#NONOS###APIARY
KICKOFFSPRING##
OTU#SOLAR#ECIGS
BET#ERASE#RHETT
ESE###WHY###SOY
```
Quality 967, mean score 77.7.

## Audit
- [warn] IRON and BRONTE share RON
- [block] RON is inside IRON
- [warn] AZINGER and KICKOFFSPRING share ING
- [warn] POSE and GOALPOSTMALONE share POS
- [warn] POSE and LOOSE share OSE
- [warn] ATONCE and GOALLINEDANCE share NCE
- [warn] LOATHES and THEDUKE share THE
- [warn] ALOHA and GOALPOSTMALONE share ALO
- [warn] GOALLINEDANCE and CLINCH share LIN
- [block] RON is inside BRONTE
- [warn] TOOK and STOOGES share TOO
- [warn] TOOK and TOOCUTE share TOO
- [warn] STOOGES and TOOCUTE share TOO
- [warn] SOAPIER and APIARY share API
- [block] REY is inside PREY

Lowest-scored entries: OTORO (46), NOGOT (46), ENR (46), OTU (46), BTU (47), ESE (47), WOOLS (55), GTO (55)

Flagged for the editor: OTORO (scored 46), NOGOT (scored 46), ENR (scored 46), OTU (scored 46), BTU (scored 47), ESE (scored 47), HADON (partial-looking), REY (inside PREY), AZINGER (partial-looking), THEDUKE (partial-looking), RON (inside IRON)

## Clues
Difficulty medium. Budget: 1349 / 1436 characters.

| Slot | Answer | Standard | Speed |
|---|---|---|---|
| 1A | OAF | Clumsy lummox | Big klutz |
| 1D | OUR | Not yours or theirs | Belonging to us |
| 2D | ASA | Snug ___ bug in a rug | Snug ___ bug |
| 3D | FUNGOUS | Like a mushroomy growth | Mold-like |
| 4A | RBI | Stat for a slugger, briefly | Baseball stat, for short |
| 4D | REAL | Not fake | Genuine |
| 5D | BALI | Indonesian island getaway | Island near Java |
| 6D | IRON | Press shirts | De-wrinkle |
| 7A | ASP | Snake in Cleopatra's story | Egyptian snake |
| 7D | AZINGER | Golfer Paul of Ryder Cup fame | Golfer Paul ___ |
| 8D | SORCERY | Wizard's craft | Magic |
| 9D | POSE | Strike a ___ (Vogue move) | Model's stance |
| 10A | USUAL | "The ___" (regular's order) | Customary |
| 11D | ATONCE | "Right now!" | Immediately |
| 12D | LOATHES | Can't stand | Hates |
| 13A | EARTH | Third rock from the sun | Our planet |
| 14D | THEDUKE | John Wayne's nickname | John Wayne, familiarly |
| 15D | HADON | Was wearing | Wore |
| 16A | ZOO | Place for pandas and penguins | Animal park |
| 17A | RANTO | Hurried toward | Sprinted toward |
| 18A | ALOHA | Maui greeting or goodbye | Hawaiian hello |
| 19A | IRS | April 15 org. | Tax agency |
| 20A | GOALLINEDANCE (theme) | Boot-scootin' in the end zone? | End-zone country dance? |
| 21D | LED | Was ahead | Guided |
| 22D | ADDS | Tacks on | Sums |
| 23A | BRONTE | Charlotte, Emily or Anne | "Jane Eyre" author |
| 23D | BTU | Heat unit: Abbr. | Furnace unit: Abbr. |
| 24D | RON | Harry's red-haired pal | Weasley of Hogwarts |
| 25A | DODGE | Evade, as a question | Avoid |
| 26A | TOUCHDOWNUNDER (theme) | Six points scored in Australia? | Score in Sydney? |
| 27D | OTORO | Fattiest tuna at a sushi bar | Fatty tuna sushi |
| 28D | WOOLS | Merino and cashmere | Sheep fibers |
| 29D | NOGOT | Didn't have, in broken English | Lacked, in pidgin |
| 30A | UNSEE | "I can't ___ that!" | Forget seeing |
| 31A | TOOK | Grabbed | Seized |
| 32A | SRY | "My bad," in a text | Texted apology |
| 33A | STOOGES | Larry, Moe and Curly | Slapstick trio |
| 34D | TAPSFOR | Picks to fill a role | Selects (for) |
| 35D | SOAPIER | More melodramatic | More sudsy |
| 36A | ITS | "___ a deal!" | "___ a deal!" |
| 36D | IGNITES | Sparks, as a fire | Lights |
| 37D | TOOCUTE | Adorable to a fault | Overly adorable |
| 38D | SANK | Made, as a free throw | Went under |
| 39A | ARLO | Guthrie of "Alice's Restaurant" | Folk singer Guthrie |
| 40A | OCHER | Earthy yellow-brown | Brownish yellow |
| 41D | CLINCH | Lock up, as a title | Secure |
| 42D | HOAGIES | Philly deli subs | Sub sandwiches |
| 43D | ENR | Registrar's fig. | Enrollment: Abbr. |
| 44D | REY | Jedi played by Daisy Ridley | "Star Wars" heroine |
| 45A | GOALPOSTMALONE (theme) | Upright rapper of "Circles"? | Rapper at the uprights? |
| 46D | LOOSE | Not tight | Slack |
| 47D | MAR | Scratch up | Damage |
| 48A | NONOS | Things you shouldn't do | Taboos |
| 49A | APIARY | Buzzy workplace? | Beehive site |
| 50A | KICKOFFSPRING (theme) | Punk band that starts the game? | Opening play by a punk band? |
| 50D | KOBE | Laker legend Bryant | Bryant of the NBA |
| 51D | FLAW | Achilles' heel | Defect |
| 52D | SASH | Pageant winner's wear | Window frame |
| 53D | PREY | Hawk's target | Hunted animal |
| 54A | OTU | Taxonomic grouping: Abbr. | Biology unit: Abbr. |
| 55A | SOLAR | Kind of panel on a roof | Sun-powered |
| 56A | ECIGS | Vapes, briefly | Vaping devices |
| 57D | GTO | Classic Pontiac muscle car | Pontiac model |
| 58D | STY | Messy room, so to speak | Pig pen |
| 59A | BET | Wager | Gamble |
| 60A | ERASE | Wipe clean | Delete |
| 61A | RHETT | Scarlett's Butler | Butler of fiction |
| 62A | ESE | Compass point near S | Direction opposite WNW |
| 63A | WHY | Toddler's favorite question | "How come?" |
| 64A | SOY | Tofu source | ___ sauce |

