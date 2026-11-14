"""Show candidates from a work file: python3 -I scripts/seedgrid/es/show.py <name> [n]. Entries sorted weakest first."""
import json, sys
name = sys.argv[1]; n = int(sys.argv[2]) if len(sys.argv) > 2 else 3
d = json.load(open(f"artifacts/seedgrid-es/wordlist/work/{name}.json"))
sc = dict(l.strip().split(";")[:2] for l in open("artifacts/seedgrid-es/wordlist/es.dict", encoding="utf-8"))
def entries(rows):
    out = []
    for lines in (rows, ["".join(c) for c in zip(*rows)]):
        for l in lines: out += [w for w in l.split("#") if len(w) >= 2]
    return out
cs = d["cands"]
bad = set(open("artifacts/seedgrid-es/wordlist/dislike.txt", encoding="utf-8").read().split())
def kin(es):
    es = sorted(set(es)); out = []
    for i, a in enumerate(es):
        for b in es[i+1:]:
            n = 0
            while n < min(len(a), len(b)) and a[n] == b[n]: n += 1
            if n >= 3 and n >= min(len(a), len(b)) - 1 and abs(len(a) - len(b)) <= 2: out.append(f"{a}/{b}")
    return out
for c in cs:
    c["n47"] = sum(1 for e in entries(c["rows"]) if int(sc.get(e, 0)) < 50)
    c["kin"] = kin(entries(c["rows"]))
    c["bad"] = sorted(set(entries(c["rows"])) & bad)
cs.sort(key=lambda c: (len(c["kin"]) * 2 + c["n47"] + 3 * len(c["bad"]), -c["mean"]))
for c in cs[:n]:
    print(f"\n# seed {c['seed']} mean {c['mean']:.1f} below50 {c['n47']}")
    print("\n".join(c["rows"]))
    es = sorted(set(entries(c["rows"])), key=lambda e: (int(sc.get(e, 0)), e))
    print(" ".join(f"{e}:{sc.get(e,'?')}" for e in es ))
    print("DISLIKED:", " ".join(c["bad"]))
    print("kin:", " ".join(c["kin"]))
    print("58+:", " ".join(e for e in es if int(sc.get(e, 0)) >= 58))
