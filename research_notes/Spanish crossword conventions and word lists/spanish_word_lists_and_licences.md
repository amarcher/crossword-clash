# Spanish word lists and frequency data for a scored crossword fill list, with licences (as of November 2026)

Method note for the report writer: licence texts marked "read directly" were fetched from the project's own repository or site on 2026-11-13. Counts marked "measured" are line counts I took from the raw files that day. The RAE sites (rae.es, dle.rae.es, corpus.rae.es) and the Leipzig Wortschatz site refused automated fetches (HTTP 403 / bot wall), so their terms are reported from search-result excerpts only and are marked as such. Nothing here is legal advice.

## 1. Lexicons: RAE, Hunspell/RLA-ES, FreeLing, Apertium, Wiktionary/Wikidata, lemarios, Wordle lists, FISE

### Takeaway
The cleanest permissive base is the public-domain `olea/lemarios` set (about 88k lemmas plus a 543k-line conjugation file) combined with Wikidata lexemes (CC0). RLA-ES (the LibreOffice/Firefox Hunspell dictionary) is the best-maintained lexicon with 23 regional variants and can be taken under MPL or LGPL instead of GPL. The RAE dictionary, the FISE Scrabble lexicon and anything scraped from them have no licence permitting reuse and should be treated as off limits.

### Cited Findings

**RAE (Diccionario de la lengua española) and lists scraped from it**
- The RAE's legal notice, as excerpted in search results, says "quedan expresamente prohibidas la reproducción, transformación, distribución, comunicación pública -incluida su modalidad de puesta a disposición-, extracción y/o reutilización de la Web" and that "La RAE, por sí o como cesionaria, es titular de todos los derechos de propiedad intelectual e industrial de su página web". Excerpt only; the page itself returned 403 to me. — [RAE aviso legal](https://www.rae.es/info/aviso-legal), [DLE aviso legal](https://dle.rae.es/contenido/aviso-legal)
- The RAE's "Diccionario del estudiante" app notice claims the databases under the sui generis database right ("bases de datos (derecho suigéneris)") as RAE property (search excerpt). — [RAE aviso legal, Diccionario del estudiante](https://www.rae.es/aviso-legal-diccionario-estudiante)
- A 2011 Global Voices article documents the dispute over the RAE asserting copyright over its dictionary content. I did not read the article body; title and existence only. — [Global Voices](https://globalvoices.org/2011/10/16/whose-language-the-royal-spanish-academy-and-copyright/)

**RLA-ES (Recursos Lingüísticos Abiertos del Español): the Hunspell dictionary in LibreOffice, OpenOffice and Firefox**
- Licence, read directly from `LICENSE.md`: "El proyecto y los diccionarios se distribuyen bajo un triple esquema de licencias disjuntas: GNU GPL versión 3 o posterior, GNU LGPL versión 3 o posterior o MPL versión 1.1 o posterior. Puede seleccionar libremente bajo cuál de estas licencias realizará el uso." The thesaurus is separate, under LGPL v2.1. — [rla-es LICENSE.md](https://raw.githubusercontent.com/sbosio/rla-es/master/LICENSE.md)
- The dictionary README repeats the tri-licence for the `.aff` and `.dic` files and states it "es un desarrollo completamente nuevo, y NO ESTÁ BASADO en el trabajo de Jesús Carretero y Santiago Rodríguez" (the older ispell/MySpell dictionary). Initial author and coordinator: Santiago Bosio. — [LibreOffice dictionaries README_hunspell_es.txt](https://raw.githubusercontent.com/LibreOffice/dictionaries/master/es/README_hunspell_es.txt)
- Regional coverage: a generic `es` plus 23 country variants (es_AR, es_BO, es_CL, es_CO, es_CR, es_CU, es_DO, es_EC, es_ES, es_GQ, es_GT, es_HN, es_MX, es_NI, es_PA, es_PE, es_PH, es_PR, es_PY, es_SV, es_US, es_UY, es_VE); the project notes each variant's coverage "may be more or less complete". — [sbosio/rla-es](https://github.com/sbosio/rla-es)
- Size (measured): the `es_ES.dic` header declares 58,221 stems and `es_MX.dic` 59,093; `es_ES.aff` has 6,841 prefix/suffix rule lines. — [es_ES.dic](https://raw.githubusercontent.com/LibreOffice/dictionaries/master/es/es_ES.dic), [es_ES.aff](https://raw.githubusercontent.com/LibreOffice/dictionaries/master/es/es_ES.aff)
- Maintenance: latest tagged release v2.9 (2 January 2025); earlier v2.8 (August 2023), v2.7 (October 2022); the repository was pushed to on 11 October 2026 (GitHub API). — [rla-es releases](https://github.com/sbosio/rla-es/releases)
- Distribution packagers record the same licence expression (LGPL-3.0-or-later OR GPL-3.0-or-later OR MPL-1.1), and a Mozilla bug records that the main contributor relicensed to the tri-licence at Mozilla's request. — [Mozilla bug 702377](https://bugzilla.mozilla.org/show_bug.cgi?id=702377), [Gentoo myspell-es](https://packages.gentoo.org/package/app-dicts/myspell-es)

**olea/lemarios (public-domain Spanish word lists)**
- Licence, read directly: `COPYRIGHT` says "Todos los contenidos aquí publicados están donados al dominio público. All content published here is under public domain." The README adds that the files are available to developers "sin restricción ninguna" and that all materials "están y serán cedidos al dominio público". — [COPYRIGHT](https://raw.githubusercontent.com/olea/lemarios/master/COPYRIGHT), [README](https://raw.githubusercontent.com/olea/lemarios/master/README.md)
- Contents and sizes (measured line counts): `lemario-general-del-espanol.txt` 87,899; `verbos-espanol.txt` 10,783; `verbos-espanol-conjugaciones.txt` 543,570; `nombres-propios-es.txt` 455; `apellidos-es.txt` 103; plus a `topónimos/` folder. The stated purpose is to feed the RLA-ES spell checker. — [olea/lemarios](https://github.com/olea/lemarios)

**FreeLing Spanish dictionary**
- The FreeLing library is AGPL: it "can not be linked to and used by proprietary software packages", and changes to the library "(or the linguistic data)" must be distributed "under the AGPL (or the original license of each data file)". — [FreeLing, Contributing](https://nlp.lsi.upc.edu/freeling/node/7)
- The repository's `LICENSES/` directory holds twelve licence files (AGPL, Apache, BSD, CC-BY-NC-SA, CC-BY-SA, CC-BY, CeCILL-C, GPL, LGPLLR, MIT, MPL, WordNet), which shows that data components carry differing licences. — [FreeLing LICENSES](https://github.com/TALP-UPC/FreeLing/blob/master/LICENSES)
- Size (measured line counts of the full-form files in `data/es/dictionary/entries/`): `MM.verb` 497,560; `MM.nom` 107,642; `MM.adj` 62,979; plus small closed-class files. Each line is form, lemma and an EAGLES tag (for example `ababa abar VMII1S0`), so every inflected form carries its person, number, tense and mood. — [FreeLing data/es/dictionary/entries](https://github.com/TALP-UPC/FreeLing/tree/master/data/es/dictionary/entries)
- A UPF repository record for the "Spanish LMF FreeLing Lexicon" gives GPL v3 (search excerpt). — [UPF repository](https://repositori.upf.edu/items/a341128c-b759-47c3-95e1-158c956be5c8/full)

**Apertium (apertium-spa)**
- A monolingual Spanish package for morphological analysis and generation; GitHub reports its licence as GPL-2.0, and it was pushed to in September 2026. Debian copyright files list GPL-2 and GPL-2+ for Apertium Spanish data. — [apertium/apertium-spa](https://github.com/apertium/apertium-spa), [Debian copyright, apertium-spa-ast](https://metadata.ftp-master.debian.org/changelogs/main/a/apertium-spa-ast/stable_copyright)

**Wiktionary and Wikidata lexemes**
- Wiktionary text is "dual-licensed to the public under both the Creative Commons Attribution-ShareAlike 4.0 International License (CC-BY-SA) and the GNU Free Documentation License (GFDL)". — [Wiktionary:Copyrights](https://en.wiktionary.org/wiki/Wiktionary:Copyrights)
- The kaikki.org machine-readable extract of English Wiktionary lists 775,464 distinct Spanish word forms. — [kaikki.org Spanish](https://kaikki.org/dictionary/Spanish/index.html)
- Wikidata: "structured data from the main, Property, Lexeme, and EntitySchema namespaces is available under the Creative Commons CC0 License". — [Wikidata:Copyright](https://www.wikidata.org/wiki/Wikidata:Copyright)
- A 2024 ranking of lexicographic coverage in Wikidata puts Spanish at 91.8% (a coverage measure against text, not a lexeme count). — [simia.net](https://simia.net/wiki/Languages_with_the_best_lexicographic_data_coverage_in_Wikidata_2024)

**FISE Scrabble lexicon (Lexicón FISE)**
- A community GitHub repository publishes `spanish/fise-2.txt` with 636,599 words, labelled "Lexicón FISE-2 2009", sourced from redeletras.com; the repository states no licence and has no LICENSE file. — [kamilmielnik/scrabble-dictionaries](https://github.com/kamilmielnik/scrabble-dictionaries)
- FISE-2 is described as the official dictionary of the Federación Internacional de Scrabble en Español, in force in Spain since 2016–2017 (third-party solver site). — [dCode](https://www.dcode.fr/solucionador-scrabble)
- The GPL Scrabble program Eliot says its Spanish dictionary is "based on the word list provided by" FISE. — [Eliot dictionaries](https://www.nongnu.org/eliot/en/dict.html)

**Spanish Wordle-clone lists**
- Clones exist (for example `gabrielcarames/react-wordle`, GPL-3.0 for the code), but none of the sources I found states where their word lists came from or licenses the list separately. — [react-wordle listing](https://awesome.ecosyste.ms/projects/github.com%2Fgabrielcarames%2Freact-wordle)

**Leipzig Corpora Collection**
- The Wortschatz terms (search excerpt; the site blocked my fetch) say the project's data is offered "free of charge for private and scientific use" under CC BY-NC, while "the text corpora offered for download" are under CC BY. Wiktionary's frequency-list page describes the Leipzig downloads as CC BY 4.0. — [Wortschatz terms of usage](https://wortschatz.uni-leipzig.de/en/usage), [Wiktionary:Frequency lists](https://en.wiktionary.org/wiki/Wiktionary%3AFrequency_lists)

### Inferences
- A list scraped from dle.rae.es inherits the RAE's reuse prohibition and, in the EU, a plausible sui generis database claim. Many GitHub "diccionario español" lists are of this kind and carry no usable licence, whatever their repository licence says.
- RLA-ES under MPL 1.1+ or LGPL 3+ is the lexicon whose obligations fit a shipped file best (see section 6), and its README's statement of independent authorship is a provenance point in its favour. Its stems-plus-affixes format means the inflected list must be generated with Hunspell's expansion tools (`unmunch` / `wordforms`); the 6,841 affix rule lines suggest full verb paradigms are encoded, but I did not run the expansion.
- FreeLing's tagged full-form dictionary is technically the most useful for filtering conjugations by tense and person, but its per-file licence is unresolved and the project's default is AGPL/GPL-family. It could be used as an in-house filter (deciding which forms to keep) without its text being shipped, which is a weaker exposure than redistribution; whether that is acceptable is a legal judgement.
- The FISE lexicon is likely derived largely from the RAE dictionary, which would compound the rights problem. This is my understanding, not something I confirmed from a FISE document.
- The measured sizes agree on scale: a full Spanish form list is 550k–780k entries (olea 543k conjugation lines, FreeLing about 670k form lines, FISE 637k, kaikki 775k).

### Gaps
- The full text of the RAE legal notices could not be read (403). The quoted clauses come from search excerpts.
- No FISE licence, terms or rulebook text was found; FISE's own site returned nothing useful. Whether FISE licenses its lexicon to app makers, and at what price, is unknown.
- Which licence applies to each FreeLing Spanish dictionary file was not found (no `data/es/README`).
- The number of forms RLA-ES produces when expanded, and whether its affix rules generate enclitic forms, was not measured.
- COES (the older Spanish spelling tools by Santiago Rodríguez and Jesús Carretero) and aspell-es: not researched beyond the RLA-ES README's mention; their licence (commonly reported as GPL) is unverified. SCOWL itself is English-only; I found no SCOWL-style tiered Spanish list.
- The Leipzig licence for word lists specifically (as opposed to sentence corpora) is ambiguous between CC BY and CC BY-NC.
- No current Spanish lexeme or form count for Wikidata was found.

## 2. Frequency data: SUBTLEX-ESP, EsPal, CREA/CORPES, FrequencyWords, Wikipedia, Google Books Ngrams, wordfreq

### Takeaway
Google Books Ngrams (CC BY 3.0) and Wikimedia pageview data (CC0) are the only frequency sources found with terms that clearly allow commercial redistribution without share-alike. FrequencyWords and wordfreq are CC BY-SA 4.0, and the academic lists (SUBTLEX-ESP, EsPal, CREA/CORPES) have no stated commercial licence.

### Cited Findings
- **FrequencyWords (hermitdave)**: "MIT License for code." and "CC-by-sa-4.0 for content."; built from OpenSubtitles 2016 and 2018. Measured: `es_full.txt` has 941,099 lines (2016) and 1,202,520 lines (2018). — [hermitdave/FrequencyWords](https://github.com/hermitdave/FrequencyWords)
- **wordfreq (Python)**: code under Apache; data files "may be redistributed under a Creative Commons Attribution-ShareAlike 4.0 license". Spanish is a "large" list language with 7 sources. The README says the data is "a snapshot of language usage through about 2021" and "is unlikely to be updated again". — [rspeer/wordfreq](https://github.com/rspeer/wordfreq)
- wordfreq's author takes a strict view of CC BY-SA: asked whether the data can be converted to CSV, the README answers "No. The CSV format does not have any space for attribution or license information, and therefore does not follow the CC-By-SA license." — [wordfreq README](https://raw.githubusercontent.com/rspeer/wordfreq/master/README.md)
- wordfreq's stated upstream terms: Google Books Ngrams "may be freely used for any purpose, although acknowledgement ... would be appreciated"; OPUS OpenSubtitles 2018 "may be used with attribution to OpenSubtitles"; the SUBTLEX lists it includes (US, UK, CH, DE, NL — not ESP) were cleared by e-mail with Marc Brysbaert "for any purpose, not just for academic use" on condition of credit. — [wordfreq README](https://raw.githubusercontent.com/rspeer/wordfreq/master/README.md)
- **Google Books Ngrams**: the dataset page says "This compilation is licensed under a Creative Commons Attribution 3.0 Unported License." Spanish is one of the published corpora (version 20200217). — [Google Books Ngram datasets](https://storage.googleapis.com/books/ngrams/books/datasetsv3.html)
- **SUBTLEX-ESP**: Cuetos, González-Nosti, Barbón and Brysbaert, Psicológica 32 (2011); based on a subtitle corpus of about 41.5 million words. — [Psicológica article](https://www.uv.es/revispsi/articulos2.11/1CUETOS.pdf), [NoRaRe record](https://norare.clld.org/sources/Cuetos2011)
- A later paper notes that the SUBTLEX-ESP corpus is under 3% original Spanish subtitles and over 92% translations from English. — [arXiv 2410.03240](https://arxiv.org/html/2410.03240v2)
- **EsPal**: a web repository of Spanish word properties (Duchon et al. 2013), "freely available" at bcbl.eu, built on a 300-million-token written corpus and a 460-million-token subtitle corpus; offers Castilian and Latin American phonology. Its page states no licence. — [EsPal paper](https://link.springer.com/article/10.3758/s13428-013-0326-1), [EsPal site](https://www.bcbl.eu/databases/espal/)
- **Matthias Buchmeier's subtitle list** (2008; 6,527 subtitle files, 27,417,111 words), republished by Manuel Perea: "This list can be used under the terms of the cc-by-sa, GFDL or LGPL licenses." — [uv.es/mperea](https://www.uv.es/mperea/subtitles.htm)
- **Corpus del Español (Mark Davies)**: a sample commercial purchase agreement prices a 40,000-word list at $295 and restricts products from showing end users a word's exact frequency or rank (search excerpt of the agreement). — [wordfrequency.info agreement](https://www.wordfrequency.info/license/spanish_40k_com.doc)
- **CORPES XXI** is listed at about 175 million words, against nearly 2 billion for Davies's Web/Dialects corpus. — [corpusdelespanol.org comparison](https://www.corpusdelespanol.org/compare_corpes.asp)
- **Wikimedia pageviews**: "All Analytics datasets are available under the Creative Commons CC0 dedication." Wikipedia article text is CC BY-SA 4.0 and GFDL. — [Pageview dumps readme](https://dumps.wikimedia.org/other/pageview_complete/readme.html), [Wikimedia dumps legal](https://dumps.wikimedia.org/legal.html)

### Inferences
- Google Books Ngrams Spanish 1-grams are the strongest permissive commonness signal: attribution only, no share-alike, and counts can be restricted to recent decades. They skew literary and Spain/Latin America are mixed.
- Subtitle-based lists (FrequencyWords, SUBTLEX-ESP) reflect translated English dialogue, so they measure colloquial vocabulary well but under-represent Spanish-speaking culture.
- This project's existing English rule (frequency may only lower a score; CC BY-SA data kept out of the shipped list) transfers directly: Ngrams for the shipped list, FrequencyWords only for a private list.
- Whether a 0–100 score computed from a CC BY-SA frequency list is itself an "adaptation" is contested. The wordfreq author's reading is strict; the CC FAQ's database guidance (section 6) ties share-alike to including "a substantial portion of the licensed database contents".

### Gaps
- The RAE's CREA frequency lists (corpus.rae.es/lfrecuencias.html) could not be fetched; their sizes and terms are unverified here. Given the RAE's general notice, assume no reuse right until checked. CORPES XXI frequency-list terms were not found.
- No licence statement for SUBTLEX-ESP or for EsPal was found. Neither is covered by the Brysbaert e-mail permission that wordfreq quotes.
- The Leeds Internet Corpus and OSCAR/NewsCrawl components of wordfreq were not checked individually.

## 3. Crossword-specific scored Spanish lists (Crossword Compiler, CrossFire, Ingrid, Qxw, Crosserville)

### Takeaway
No scored Spanish list comparable to the English constructor lists was found, free or paid. The only construction tool found offering Spanish lists is Crossword Compiler, and its terms and scoring are not documented on its site.

### Cited Findings
- Crossword Compiler lists Spanish among its "Language word lists" and says "There are also Wikipedia word lists in French, German, Italian, Portuguese and Spanish." — [Crossword Compiler: Word Lists](https://www.crossword-compiler.com/wordlists.html)
- Qxw ships the English UKACD and points users to its FAQ for other dictionaries; no Spanish list is offered on the download page. — [Qxw download](https://www.quinapalus.com/qxwdownload.html)
- Crosserville advertises a "curated 175K word list or upload your own", with no mention of Spanish. — [Crosserville](https://www.crosserville.com/)
- XWord Info's scored list (252,554 entries scored 5–60) is English only. — [XWord Info Word List](https://www.xwordinfo.com/Wordlist)
- Amuse Labs' PuzzleMe supports Spanish as a game language for hand-built puzzles. — [Amuse Labs guide](https://amuselabs.com/resources/guides/create-spanish-crossword/)

### Inferences
- A Spanish scored list will have to be built in-house, as the English one was: lexicon for validity, frequency for commonness, model-proposed entries for liveliness.
- Crossword Compiler's Spanish list is probably an unscored spelling-style list, licensed for use inside that program only; that is a guess from how its other language lists are sold.

### Gaps
- Size, scoring, source and licence of Crossword Compiler's Spanish and Spanish-Wikipedia lists.
- Spanish support in CrossFire and Ingrid was not found. No developer discussions of Spanish fill lists (forums, blogs) surfaced in my searches.
- What Spanish crossword publishers and app makers use internally is undocumented.

## 4. Phrases and proper nouns

### Takeaway
Wikidata labels (CC0) ranked by Wikimedia pageviews (CC0) give a fully permissive route to well-known names and titles in Spanish. Wiktionary's multi-word entries are the best idiom source but are CC BY-SA.

### Cited Findings
- Wikidata's structured data, lexemes included, is CC0. — [Wikidata:Copyright](https://www.wikidata.org/wiki/Wikidata:Copyright)
- Wikimedia analytics datasets, including per-article pageview counts, are CC0. — [Pageview dumps readme](https://dumps.wikimedia.org/other/pageview_complete/readme.html)
- Wikipedia's textual content is CC BY-SA 4.0 and GFDL. — [Wikimedia dumps legal](https://dumps.wikimedia.org/legal.html)
- Wiktionary text is CC BY-SA 4.0 and GFDL; kaikki.org's extract indexes 775,464 distinct Spanish forms, which includes multi-word entries. — [Wiktionary:Copyrights](https://en.wiktionary.org/wiki/Wiktionary:Copyrights), [kaikki.org Spanish](https://kaikki.org/dictionary/Spanish/index.html)
- Public-domain name lists exist in `olea/lemarios` but are small (455 given names, 103 surnames, plus toponyms). — [olea/lemarios](https://github.com/olea/lemarios)
- Google Books Ngrams (CC BY 3.0) includes 2- to 5-grams, usable to test whether a candidate phrase is common. — [Google Books Ngram datasets](https://storage.googleapis.com/books/ngrams/books/datasetsv3.html)

### Inferences
- Joining Spanish-language Wikidata labels and sitelinks to es.wikipedia pageview counts yields a ranked name list with no share-alike exposure, since titles come from Wikidata and counts from CC0 data. Spanish Wikipedia pageviews also reflect both Spain and Latin America by actual readership.
- Article titles taken from the Wikipedia dump itself are short factual strings, but they sit inside a CC BY-SA work; using Wikidata as the source avoids the question.

### Gaps
- No permissively licensed, curated list of Spanish idioms or set phrases was found.
- The share of kaikki's Spanish entries that are multi-word was not measured.

## 5. Verb conjugations: scale and how to stop rare forms flooding the fill

### Takeaway
Inflection multiplies a lemma list of roughly 60k–90k into 550k–780k forms, about three quarters of them verb forms. I found no published convention from Spanish crossword or word-game makers on limiting them, so the method below is inference.

### Cited Findings
- The ULPGC "TIP" conjugator material reports that a typical Spanish verb yields around 90 simple conjugated forms and that its database also recognises enclitic pronouns (search excerpt). — [ULPGC accedaCRIS](https://accedacris.ulpgc.es/bitstream/10553/10233/1/0681480_00000_0000.pdf)
- Measured: `olea/lemarios` has 10,783 verbs and 543,570 lines of conjugations; FreeLing's Spanish dictionary has 497,560 verb-form lines against 107,642 noun and 62,979 adjective lines. — [olea/lemarios](https://github.com/olea/lemarios), [FreeLing data/es/dictionary/entries](https://github.com/TALP-UPC/FreeLing/tree/master/data/es/dictionary/entries)
- FreeLing form lines carry EAGLES tags (for example `VMIP3S0`, `VMII1S0`) encoding mood, tense, person and number. — [FreeLing MM.verb](https://raw.githubusercontent.com/TALP-UPC/FreeLing/master/data/es/dictionary/entries/MM.verb)
- The FISE Scrabble lexicon runs to 636,599 words. — [kamilmielnik/scrabble-dictionaries](https://github.com/kamilmielnik/scrabble-dictionaries)
- The RAE's conjugation models show voseo forms in parentheses beside the second-person singular present and imperative (search excerpt). — [RAE, Modelos de conjugación verbal](https://www.rae.es/dpd/ayuda/modelos-de-conjugacion-verbal)

### Inferences
- Practical controls, in order of leverage: (a) score every inflected form by its own corpus frequency, so unattested forms fall below the fill floor without a rule; (b) tier by morphology using a tagged lexicon — infinitive, participle, gerund and third-person present/preterite at the lemma's score, other persons and tenses demoted, vosotros forms, future subjunctive (-are/-iere) and voseo forms demoted hard or dropped; (c) do not generate enclitic combinations at all, then whitelist the few that are real words to solvers (for example DIME, DAME, VETE) by frequency; (d) exclude forms of verbs whose lemma is itself rare.
- Stripping accents merges many forms (HABLO/HABLÓ, ESTA/ESTÁ/ÉSTA); the merged entry should take the highest score of its sources, and clue writers need the lemma and tag to know which reading is intended.
- Regional balance: vosotros forms are Spain-only and voseo forms Rioplatense, so demoting both keeps the fill neutral for a mixed Spain/Latin America audience.

### Gaps
- No source describing how Spanish crossword constructors, autodefinido publishers or word-game developers treat conjugated forms was found.
- The FISE rule on which verb forms and enclitics are valid was not found.

## 6. What CC BY-SA, GPL, LGPL and MPL imply for a derived word list shipped in a commercial app

### Takeaway
All four permit commercial use; they differ in what must be offered alongside. The authoritative sources agree that a copyleft data file can sit beside proprietary code as a separate work, but a list *derived* from the source must itself stay under that licence, and opinions differ on how far that reaches.

### Cited Findings
- **GPL, aggregation**: the FSF FAQ says "The GPL permits you to create and distribute an aggregate, even when the licenses of the other software are nonfree or GPL-incompatible", and on where one work ends: "This is a legal question, which ultimately judges will decide." — [GNU GPL FAQ, MereAggregation](https://www.gnu.org/licenses/gpl-faq.html#MereAggregation)
- **GPL on non-software**: "You can apply the GPL to any kind of work, as long as it is clear what constitutes the 'source code' for the work." — [GNU GPL FAQ](https://www.gnu.org/licenses/gpl-faq.html#GPLOtherThanSoftware)
- **Precedent for GPL dictionaries**: Apache OpenOffice's legal review records the FSF's view that bundling GPL dictionaries is mere aggregation, with program and each dictionary treated as separate works; the thread notes the reply is not legal advice, and one commenter argued the bundle's mutual benefit could defeat that reading. Apache ships such dictionaries as "merely aggregated" extensions. — [AOO issue 65039](https://bz.apache.org/ooo/show_bug.cgi?id=65039), [AOO LICENSE_aggregated](https://svn-us.apache.org/repos/asf/openoffice/trunk/main/LICENSE_aggregated)
- **MPL**: for unchanged MPL code shipped in a larger work, "You must inform the recipients where they can get the source for the MPLed code ... You may distribute any executables you create under a license of your choosing, as long as that license does not interfere with the recipients' rights to the source under the terms of the MPL." — [MPL 2.0 FAQ, Q8](https://www.mozilla.org/en-US/MPL/2.0/FAQ/)
- **CC BY-SA on databases**: "the SA licenses require you to apply the same or a compatible license to any database you share publicly and in which you include a substantial portion of the licensed database contents. Note that this does not require you to ShareAlike any copyright or other rights you have in the individual contents of the database." Attribution must be given "in a way that is reasonable under the circumstances", which may be a link. — [Creative Commons FAQ](https://creativecommons.org/faq/)
- **A stricter reading of CC BY-SA** from a data maintainer: wordfreq says converting its data to CSV does "not follow the CC-By-SA license" because attribution would be stripped. — [wordfreq README](https://raw.githubusercontent.com/rspeer/wordfreq/master/README.md)
- **LGPL for linguistic data**: a purpose-written variant, the "Lesser General Public License For Linguistic Resources" (LGPLLR), exists and is among FreeLing's licence files; a 2007 Aspell list question on shipping recompiled LGPL word lists with a proprietary application drew no answer in the results. — [LGPLLR text](https://code.tokarch.uk/third_party/gitea/raw/commit/10dfb444deeeb33f0da8456cfd7a0aace72af5b2/options/license/LGPLLR), [aspell-user 2007](https://lists.endsoftwarepatents.org/archive/html/aspell-user/2007-06/msg00001.html)

### Inferences
- Under any of the four, a word list built by expanding and filtering the source is a modified version of it, so the list file itself would be distributed under that licence with source/attribution available, while the app's code stays proprietary if the list is a separate data file. This matches the Apache/FSF aggregation position; it has not been tested in court for word lists.
- For RLA-ES the MPL option is the lightest: file-level copyleft, satisfied by publishing the derived list and saying where to get it. The project already publishes its production list in a public bucket with a NOTICES file, which is the same pattern.
- Mixing sources is the main trap: a single merged list containing MPL/LGPL-derived entries, CC BY-SA-derived scores and CC0 names must satisfy all of them at once, and CC BY-SA 4.0 is one-way compatible with GPLv3 only, not with MPL or LGPL. Keeping CC BY-SA and GPL-only data out of the shipped file, as the English list does, avoids this.
- Where opinions differ: (1) whether scores computed from a frequency list are a derivative of it; (2) whether a word list has copyright at all (individual words and frequencies are facts, selection may be protected, and the EU adds a database right that the US lacks); (3) whether tight coupling between engine and list defeats "mere aggregation". These need counsel if a copyleft source is used.

### Gaps
- No authoritative statement was found on GPL or LGPL applied specifically to a derived word list inside a mobile app, nor any case law.
- LGPL v3's terms are written around libraries and linking; how its "Combined Work" provisions map onto a data file is not addressed by any source found.
- App Store distribution of GPL-licensed data (the known GPL/App Store terms tension) was not researched.
