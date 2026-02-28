import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import i18n, { SUPPORTED_LANGS, tStatic } from "./i18n";
import en from "./en.json";
import es from "./es.json";

// Provide a minimal localStorage mock for node environment
const store: Record<string, string> = {};
const localStorageMock = {
  getItem: vi.fn((key: string) => store[key] ?? null),
  setItem: vi.fn((key: string, value: string) => { store[key] = value; }),
  removeItem: vi.fn((key: string) => { delete store[key]; }),
  clear: vi.fn(() => { for (const k in store) delete store[k]; }),
  get length() { return Object.keys(store).length; },
  key: vi.fn((i: number) => Object.keys(store)[i] ?? null),
};

if (typeof globalThis.localStorage === "undefined") {
  Object.defineProperty(globalThis, "localStorage", { value: localStorageMock, writable: true });
}

beforeEach(() => {
  i18n.changeLanguage("en");
});

afterEach(() => {
  localStorageMock.clear();
});

describe("i18n", () => {
  describe("SUPPORTED_LANGS", () => {
    it("includes English and Spanish", () => {
      expect(SUPPORTED_LANGS).toContain("en");
      expect(SUPPORTED_LANGS).toContain("es");
    });

    it("has a resource bundle for every supported language", () => {
      for (const lang of SUPPORTED_LANGS) {
        const bundle = i18n.getResourceBundle(lang, "translation");
        expect(bundle).toBeDefined();
        expect(Object.keys(bundle).length).toBeGreaterThan(0);
      }
    });
  });

  describe("translation key parity", () => {
    function collectKeys(obj: Record<string, unknown>, prefix = ""): string[] {
      const keys: string[] = [];
      for (const [k, v] of Object.entries(obj)) {
        const full = prefix ? `${prefix}.${k}` : k;
        if (typeof v === "object" && v !== null) {
          keys.push(...collectKeys(v as Record<string, unknown>, full));
        } else {
          keys.push(full);
        }
      }
      return keys;
    }

    it("es.json has every key that en.json has", () => {
      const enKeys = collectKeys(en);
      const esKeys = new Set(collectKeys(es));
      const missing = enKeys.filter((k) => !esKeys.has(k));
      expect(missing).toEqual([]);
    });

    it("en.json has every key that es.json has (no extra keys in es)", () => {
      const esKeys = collectKeys(es);
      const enKeys = new Set(collectKeys(en));
      const extra = esKeys.filter((k) => !enKeys.has(k));
      expect(extra).toEqual([]);
    });
  });

  describe("tStatic", () => {
    it("returns the English translation for a simple key", () => {
      expect(tStatic("title.crossword")).toBe("Crossword");
    });

    it("interpolates variables", () => {
      expect(tStatic("scoreboard.cells", { score: 5, total: 10 })).toBe("5/10 cells");
    });

    it("follows language changes", () => {
      i18n.changeLanguage("es");
      expect(tStatic("title.crossword")).toBe("Crucigrama");
    });
  });

  describe("language switching", () => {
    it("defaults to English", () => {
      expect(i18n.language).toBe("en");
    });

    it("switches to Spanish", () => {
      i18n.changeLanguage("es");
      expect(i18n.t("menu.playSolo")).toBe("Jugar solo");
    });

    it("falls back to English for unsupported language", () => {
      i18n.changeLanguage("fr");
      expect(i18n.t("title.clash")).toBe("Clash");
    });

    it("persists language to localStorage", () => {
      i18n.changeLanguage("es");
      expect(localStorage.getItem("crossword-clash:language")).toBe("es");
    });
  });

  describe("translation values", () => {
    it("all en.json leaf values are non-empty strings", () => {
      function checkLeaves(obj: Record<string, unknown>, path = "") {
        for (const [k, v] of Object.entries(obj)) {
          const full = path ? `${path}.${k}` : k;
          if (typeof v === "object" && v !== null) {
            checkLeaves(v as Record<string, unknown>, full);
          } else {
            expect(typeof v).toBe("string");
            expect((v as string).length, `${full} should be non-empty`).toBeGreaterThan(0);
          }
        }
      }
      checkLeaves(en);
    });

    it("all es.json leaf values are non-empty strings", () => {
      function checkLeaves(obj: Record<string, unknown>, path = "") {
        for (const [k, v] of Object.entries(obj)) {
          const full = path ? `${path}.${k}` : k;
          if (typeof v === "object" && v !== null) {
            checkLeaves(v as Record<string, unknown>, full);
          } else {
            expect(typeof v).toBe("string");
            expect((v as string).length, `${full} should be non-empty`).toBeGreaterThan(0);
          }
        }
      }
      checkLeaves(es);
    });
  });
});
