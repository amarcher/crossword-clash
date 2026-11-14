import { describe, expect, it } from "vitest";
import {
  CONJUGATION_BUDGET,
  conjugationBudgetFor,
  conjugationProblem,
  finiteForms,
  parseForms,
  sameRootGroups,
} from "./wordForms";

const SIDECAR = [
  "OIR\tinf\tOIR\tOÍR",
  "OIA\tfinite\tOIR\tOÍA",
  "OIDO\tnoun-adj\tOIDO,OIR?\tOÍDO",
  "OSO\tnoun-adj\tOSO,OSAR?\tOSO,OSÓ",
  "OSA\tnoun-adj\tOSA,OSO,OSAR?\tOSA",
  "AMAS\tnoun-adj\tAMA,AMO,AMAR?\tAMAS,AMÁS",
  "AMABAS\tfinite\tAMAR\tAMABAS",
  "PUSO\tfinite\tPONER\tPUSO",
  "IRE\tfinite\tIR\tIRÉ",
  "CANTO\tnoun-adj\tCANTO,CANTAR?\tCANTO,CANTÓ",
  "CANTANDO\tger\tCANTAR\tCANTANDO",
  "AÑO\tnoun-adj\tAÑO\tAÑO",
  "ANA\tname\tANA\tANA",
  "PEZ\tnoun-adj\tPEZ\tPEZ",
  "ROTO\tbogus\tROMPER\tROTO",
  "",
].join("\n");
const forms = parseForms(SIDECAR);
const lookup = (entry: string) => forms.get(entry);

describe("parseForms", () => {
  it("reads tag, lemmas and spellings by grid spelling and skips malformed lines", () => {
    expect(forms.get("OIDO")).toEqual({ tag: "noun-adj", lemmas: ["OIDO"], maybeLemmas: ["OIR"], spellings: ["OÍDO"] });
    expect(forms.get("OIA")).toEqual({ tag: "finite", lemmas: ["OIR"], maybeLemmas: [], spellings: ["OÍA"] });
    expect(forms.get("AÑO")?.lemmas).toEqual(["AÑO"]);
    expect(forms.get("IRE")?.spellings).toEqual(["IRÉ"]);
    expect(forms.has("ROTO")).toBe(false);
    expect(forms.size).toBe(14);
  });
});

describe("sameRootGroups", () => {
  it("gathers the forms of one verb", () => {
    expect(sameRootGroups(["PEZ", "OIR", "OIA", "OIDO"], lookup)).toEqual([{ lemma: "OIR", entries: ["OIR", "OIA", "OIDO"], certain: true }]);
  });

  it("reports a pair once, though it shares two lemmas, under the one that makes it certain", () => {
    expect(sameRootGroups(["OSO", "OSA"], lookup)).toEqual([{ lemma: "OSO", entries: ["OSO", "OSA"], certain: true }]);
  });

  it("links a noun to the verb it could also be read as, as a question for the editor", () => {
    expect(sameRootGroups(["AMAS", "AMABAS", "ANA"], lookup)).toEqual([{ lemma: "AMAR", entries: ["AMAS", "AMABAS"], certain: false }]);
    expect(sameRootGroups(["CANTO", "CANTANDO"], lookup)).toEqual([{ lemma: "CANTAR", entries: ["CANTO", "CANTANDO"], certain: false }]);
  });

  it("lists certain groups first", () => {
    const groups = sameRootGroups(["AMAS", "AMABAS", "OSO", "OSA"], lookup);
    expect(groups.map((g) => [g.lemma, g.certain])).toEqual([["OSO", true], ["AMAR", false]]);
  });

  it("reports nothing for unrelated entries, an entry written twice, unknown words or a list without forms", () => {
    expect(sameRootGroups(["PEZ", "AÑO", "ANA", "PUSO"], lookup)).toEqual([]);
    expect(sameRootGroups(["OSO", "OSO"], lookup)).toEqual([]);
    expect(sameRootGroups(["QUIZ", "ZEBRA"], lookup)).toEqual([]);
    expect(sameRootGroups(["OIR", "OIA", "OIDO"], undefined)).toEqual([]);
  });
});

describe("conjugation budget", () => {
  it("counts only entries that can be nothing but a conjugated verb", () => {
    expect(finiteForms(["PUSO", "IRE", "CANTO", "CANTANDO", "OIR", "OIDO", "ANA", "PUSO"], lookup)).toEqual(["PUSO", "IRE"]);
  });

  it("is a problem only over the limit", () => {
    const entries = ["PUSO", "IRE", "OIA", "PEZ"];
    expect(conjugationProblem(entries, lookup, 3)).toBeNull();
    expect(conjugationProblem(entries, lookup, 2)).toEqual({ count: 3, limit: 2, forms: ["PUSO", "IRE", "OIA"] });
  });

  it("reports nothing without form data", () => {
    expect(finiteForms(["PUSO", "IRE"], undefined)).toEqual([]);
    expect(conjugationProblem(["PUSO", "IRE"], undefined, 0)).toBeNull();
  });

  it("scales the budget by daily slot", () => {
    expect([5, 7, 9, 11, 13, 15].map(conjugationBudgetFor)).toEqual([
      CONJUGATION_BUDGET.mini,
      CONJUGATION_BUDGET.mini,
      CONJUGATION_BUDGET.midi,
      CONJUGATION_BUDGET.plus,
      CONJUGATION_BUDGET.large,
      CONJUGATION_BUDGET.large,
    ]);
  });
});
