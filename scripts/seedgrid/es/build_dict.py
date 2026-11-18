"""Private spike: a scored Spanish fill list (WORD;SCORE, 0-100 like the English lists).

Sources (downloaded to artifacts/seedgrid-es/wordlist/downloads, treated as data):
  olea/lemarios (public domain): lemario general, verb conjugations, infinitives, given names
  hermitdave/FrequencyWords es_full 2018 (code MIT, data CC BY-SA: private use only)
  LDNOOBW es (CC BY 4.0): words never to place
Writes es.dict (WORD;SCORE, Ñ as itself: the engine takes it since 2026-11-13) and es.forms.tsv
(tag, lemmas and accented spellings per word, for the same-root and conjugation rules).
Grid form: accents and dieresis dropped, N-tilde kept as its own letter.
Run: python3 -I scripts/seedgrid/es/build_dict.py
"""
import os, sys, unicodedata, collections

root = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../.."))
out_dir = os.path.join(root, "artifacts/seedgrid-es/wordlist")
src = os.path.join(out_dir, "downloads")

def fold(w):
    w = w.strip().lower().replace("ñ", "\0")
    w = "".join(c for c in unicodedata.normalize("NFD", w) if unicodedata.category(c) != "Mn")
    return w.replace("\0", "ñ").upper()

def lines(name):
    with open(os.path.join(src, name), encoding="utf-8", errors="replace") as f:
        return [l.strip() for l in f if l.strip()]

OK = set("ABCDEFGHIJKLMNOPQRSTUVWXYZÑ")
valid = lambda k: 3 <= len(k) <= 15 and set(k) <= OK

rank = {}
for i, l in enumerate(lines("es_full.txt")):
    w = l.split(" ")[0]
    rank.setdefault(w, i)
INF = 10**9
r = lambda w: rank.get(w.lower(), INF)

def tier(n):
    for lim, s in ((2000, 62), (8000, 58), (20000, 55), (50000, 52), (100000, 50), (200000, 47), (400000, 44)):
        if n < lim: return s
    return 35

lemmas = [w for w in lines("lemario-general-del-espanol.txt") if w.isalpha()]
lemma_set = set(lemmas)
infinitives = set(lines("verbos-espanol.txt"))
conj = [w for w in lines("verbos-espanol-conjugaciones.txt") if w.isalpha()]
names = [w for w in lines("nombres-propios-es.txt") if w.isalpha()]
blocked = {fold(w) for w in lines("ldnoobw-es.txt") if " " not in w}

best = {}  # key -> (score, kind)
def put(word, score, kind):
    k = fold(word)
    if not valid(k) or k in blocked: return
    if k not in best or score > best[k][0]: best[k] = (score, kind)

# 1. Lemmas: scored by their own frequency.
for w in lemmas:
    put(w, tier(r(w)), "lemma")

# 2. Plural and feminine forms of lemmas, admitted only when the form itself is in the frequency list.
def forms(w):
    out = []
    if w[-1] in "aeiouáéíóú": out.append(w + "s")
    else: out.append(w + "es")
    if w.endswith("z"): out.append(w[:-1] + "ces")
    if w.endswith("o"): out += [w[:-1] + "a", w[:-1] + "as"]
    if w.endswith(("or", "ón", "án", "ín", "és")):
        base = unicodedata.normalize("NFC", w)
        plain = base[:-2] + {"ó": "o", "á": "a", "í": "i", "é": "e"}.get(base[-2], base[-2]) + base[-1]
        out += [plain + "a", plain + "as", plain + "es"]
    return out
for w in lemmas:
    for f in forms(w):
        n = r(f)
        if n < 200000: put(f, min(tier(n), 60), "form")

# 3. Verbs. Infinitives count as lemmas already. Participles and gerunds score as words;
# other conjugations must be common themselves, and vosotros forms very common.
def vosotros(w):
    return w.endswith(("áis", "éis", "ais", "eis", "ís", "steis", "ad", "ed", "id")) and w not in lemma_set
for w in conj:
    n = r(w)
    if w in lemma_set: continue
    if w.endswith(("ado", "ido", "ada", "ida", "ados", "idos", "adas", "idas", "ando", "iendo", "yendo")):
        if n < 200000: put(w, min(tier(n), 58), "participle")
        elif len(w) <= 9: put(w, 35, "participle")
        continue
    if vosotros(w):
        if n < 5000: put(w, 50, "conj")
        continue
    if n < 6000: put(w, 56, "conj")
    elif n < 20000: put(w, 52, "conj")
    elif n < 50000: put(w, 50, "conj")
    elif n < 100000: put(w, 45, "conj")
    elif n < 200000: put(w, 38, "conj")

# 4. Given names that people actually use.
for w in names:
    n = r(w)
    if n < 20000: put(w, 52, "name")
    elif n < 60000: put(w, 48, "name")

# 5. Hand additions and overrides (WORD;SCORE), kept beside this script.
extra = os.path.join(os.path.dirname(__file__), "extra.dict")
if os.path.exists(extra):
    for l in open(extra, encoding="utf-8"):
        l = l.split("#")[0].strip()
        if not l: continue
        w, s = l.split(";")[:2]
        k = fold(w)
        if valid(k): best[k] = (int(s), "extra")

# 6. Words a curation pass disliked: kept, but below the free-fill floor so a grid uses them only when it must.
dislike = os.path.join(out_dir, "dislike.txt")
if os.path.exists(dislike):
    for w in open(dislike, encoding="utf-8").read().split():
        if w in best and best[w][0] > 45: best[w] = (45, "disliked")

with open(os.path.join(out_dir, "es.dict"), "w", encoding="utf-8") as f:
    for k in sorted(best): f.write(f"{k};{best[k][0]}\n")

# 7. Sidecar for the audit rules and the clue writer (the engine never reads it):
#    WORD <tab> tag <tab> lemmas (comma separated, grid spelling) <tab> spellings with accents
#    tag: inf | part | ger | finite | noun-adj | name | other. A word that is a noun or adjective
#    as well as a verb form is noun-adj (it can be clued as the noun); the verb it could also be read
#    as is listed with a trailing "?" (ARO: ARO,ARAR?), a reading the clue may or may not use.
plain_inf = {}
for w in infinitives:
    base = w[:-2] if w.endswith("se") and len(w) > 4 else w
    plain_inf.setdefault(fold(base).lower(), fold(base))
ENDINGS = sorted({e for e in """
o as a amos ais an aba abas abamos abais aban e es emos eis en aste asteis aron
are aras ara aremos areis aran aria arias ariamos ariais arian arais ase ases asemos aseis asen
ares aren ad ado ada ados adas ando
imos is ia ias iamos iais ian i iste io isteis ieron ere eras era eremos ereis eran
ire iras ira iremos ireis iran eria erias eriamos eriais erian iria irias iriamos iriais irian
iera ieras ieramos ierais ieran iese ieses iesemos ieseis iesen iere ieres ieremos iereis ieren
ed id ido ida idos idas iendo yo yeron yendo yera yeras yeramos yerais yeran yese yeses yesemos yeseis yesen
ye yes yen ya yas yamos yais yan
""".split()}, key=len, reverse=True)
STRONG = {"tuv": "tener", "estuv": "estar", "anduv": "andar", "pud": "poder", "pus": "poner", "sup": "saber",
          "hic": "hacer", "hiz": "hacer", "quis": "querer", "vin": "venir", "dij": "decir", "traj": "traer",
          "cup": "caber", "hub": "haber", "duj": "ducir", "tendr": "tener", "pondr": "poner", "saldr": "salir",
          "vendr": "venir", "podr": "poder", "sabr": "saber", "habr": "haber", "cabr": "caber", "querr": "querer",
          "dir": "decir", "har": "hacer", "valdr": "valer"}
STRONG_END = sorted({e for e in "e iste o imos isteis ieron eron iera ieras ieramos ierais ieran era eras eramos erais eran iese ieses iesemos ieseis iesen ese eses esemos eseis esen iere ieres ieren a as an emos eis ia ias iamos iais ian".split()}, key=len, reverse=True)
IRREG = {}
for inf, fs in {
    "ser": "soy eres es somos sois son era eras eramos erais eran fui fuiste fue fuimos fuisteis fueron sea seas seamos seais sean fuera fueras fueramos fuerais fueran fuese fueses fuesen se sed siendo sido erase",
    "ir": "voy vas va vamos vais van iba ibas ibamos ibais iban fui fuiste fue fuimos fuisteis fueron vaya vayas vayamos vayais vayan fuera fueras fueran fuese ve id yendo ido ire iras ira iremos iran iria irias iriamos irian",
    "haber": "he has ha hemos habeis han hay haya hayas hayamos hayais hayan",
    "estar": "estoy estas esta estan este estes esten",
    "dar": "das da dan damos daba dabas daban dare dara daran daria dado dando doy di dio dimos disteis dieron diste diera dieras dieran diese de des den",
    "ver": "ves ve ven vemos vere vera veran veria viendo veo vi vio viste vimos visteis vieron veia veias veiamos veian vea veas veamos vean visto",
    "saber": "se sepa sepas sepamos sepan", "caber": "quepo quepa quepas quepan",
    "hacer": "hago haz haga hagas hagamos hagan hecho", "decir": "digo di diga digas digamos digan dice dices dicen dicho diciendo",
    "poner": "puesto pon", "tener": "ten tiene tienes tienen", "venir": "ven viene vienes vienen viniendo", "salir": "sal",
    "oir": "oigo oye oyes oyen oia oias oiamos oian oi oiste oimos oido oyo oyeron oyendo oiga oigas oigan",
    "reir": "rio rie ries rien rei reia reias reian rii rieron ria rias rian riendo reido",
    "poder": "pudiendo", "morir": "muerto", "volver": "vuelto", "abrir": "abierto", "escribir": "escrito", "romper": "roto",
}.items():
    for f in fs.split(): IRREG.setdefault(f, set()).add(inf.upper())
def stem_variants(st, suf):
    """Infinitive stems a conjugated stem may come from. e>i and o>u only happen in -ir verbs (pide, durmió)."""
    out = {st}
    changes = (("ie", "e"), ("ue", "o"), ("hue", "o"), ("ye", "e")) + ((("i", "e"), ("u", "o")) if suf == "ir" else ())
    for a, b in changes:
        i = st.rfind(a)
        if i >= 0: out.add(st[:i] + b + st[i + len(a):])
    for v in list(out):
        # caigo, oigo, salgo, pongo and oye, cayó only happen in -er and -ir verbs.
        drops = (("ig", ""), ("g", ""), ("y", "")) if suf != "ar" else ()
        for a, b in (("qu", "c"), ("gu", "g"), ("c", "z"), ("j", "g"), ("zc", "c"), ("z", "c"), ("g", "gu")) + drops:
            if v.endswith(a): out.add(v[: len(v) - len(a)] + b)
    return out
lemma_cache = {}
def verb_lemmas(form):
    f = fold(form).lower()
    if f in lemma_cache: return lemma_cache[f]
    found = set(IRREG.get(f, ()))
    if f in plain_inf: found.add(plain_inf[f])
    for e in ENDINGS:
        if not f.endswith(e) or len(f) <= len(e): continue
        if len(f) - len(e) < 2: continue  # one-letter stems (dar, ver, ir) are in IRREG; guessing them invents lemmas
        for suf in ("ar", "er", "ir"):
            for st in stem_variants(f[: len(f) - len(e)], suf):
                if st + suf in plain_inf: found.add(plain_inf[st + suf])
    for e in STRONG_END:
        if not f.endswith(e): continue
        st = f[: len(f) - len(e)]
        for k, inf in STRONG.items():
            if st.endswith(k):
                cand = st[: len(st) - len(k)] + inf
                if cand in plain_inf: found.add(plain_inf[cand])
    lemma_cache[f] = found
    return found

info = {}  # key -> {"kinds": set, "lemmas": set (noun, adjective, name), "verbs": set (verb readings), "spell": set}
def note(word, kind, lemmas=()):
    k = fold(word)
    if k not in best: return
    d = info.setdefault(k, {"kinds": set(), "lemmas": set(), "verbs": set(), "spell": set()})
    d["kinds"].add(kind); d["spell"].add(word.upper())
    d["lemmas" if kind in ("noun-adj", "name") else "verbs"].update(fold(l) for l in lemmas)
for w in lemmas:
    note(w, "inf" if w in infinitives or (w + "se") in infinitives else "noun-adj", [w])
    for f in forms(w):
        if r(f) < 200000: note(f, "noun-adj", [w])
unresolved = 0
for w in conj:
    k = fold(w)
    if k not in best: continue
    ls = verb_lemmas(w)
    if not ls: unresolved += 1
    if w.endswith(("ado", "ido", "ada", "ida", "ados", "idos", "adas", "idas")): kind = "part"
    elif w.endswith(("ando", "iendo", "yendo")): kind = "ger"
    elif fold(w).lower() in plain_inf: kind = "inf"
    else: kind = "finite"
    note(w, kind, ls)
for w in names: note(w, "name", [w])
# A form inherits its lemma's verb reading: AMADAS is a form of AMADO, which is also the participle of AMAR.
for d in info.values():
    for l in list(d["lemmas"]):
        if l in info: d["verbs"] |= info[l]["verbs"]
ORDER = ["inf", "noun-adj", "part", "ger", "name", "finite"]
with open(os.path.join(out_dir, "es.forms.tsv"), "w", encoding="utf-8") as f:
    for k in sorted(best):
        d = info.get(k)
        if not d: f.write(f"{k}\tother\t\t{k}\n"); continue
        tag = next(t for t in ORDER if t in d["kinds"])
        if tag in ("noun-adj", "name"):
            ls = sorted(d["lemmas"]) + sorted(v + "?" for v in d["verbs"] - d["lemmas"])
        else:
            ls = sorted(d["lemmas"] | d["verbs"])
        f.write(f"{k}\t{tag}\t{','.join(ls)}\t{','.join(sorted(d['spell']))}\n")
print("verb forms in the list without a lemma:", unresolved)
tags = collections.Counter(next(t for t in ORDER if t in d["kinds"]) for d in info.values())
print("form tags", dict(tags))

kinds = collections.Counter(v[1] for v in best.values())
print("entries", len(best), dict(kinds))
print("score>=50", sum(1 for v in best.values() if v[0] >= 50), "with Ñ", sum(1 for k in best if "Ñ" in k))
by_len = collections.Counter(len(k) for k, v in best.items() if v[0] >= 50)
print("50+ by length", sorted(by_len.items()))
