import { describe, it, expect } from "vitest";
import { normalizeUsername, suggestUsername, validateUsername, USERNAME_MAX } from "./username";

describe("validateUsername", () => {
  it("accepts letters, digits and underscores between 3 and 20 characters", () => {
    expect(validateUsername("ada")).toBeNull();
    expect(validateUsername("Ada_Lovelace_1815")).toBeNull();
    expect(validateUsername("a".repeat(USERNAME_MAX))).toBeNull();
  });

  it("names the first rule broken", () => {
    expect(validateUsername("")).toBe("tooShort");
    expect(validateUsername("ab")).toBe("tooShort");
    expect(validateUsername("a".repeat(USERNAME_MAX + 1))).toBe("tooLong");
    expect(validateUsername("ada lovelace")).toBe("invalidChars");
    expect(validateUsername("ada-lovelace")).toBe("invalidChars");
    expect(validateUsername("adá")).toBe("invalidChars");
    expect(validateUsername("ada@x")).toBe("invalidChars");
  });

  it("reserves impersonation-prone names and the anonymous defaults, in any case", () => {
    expect(validateUsername("admin")).toBe("reserved");
    expect(validateUsername("CrosswordClash")).toBe("reserved");
    expect(validateUsername("Player")).toBe("reserved");
    expect(validateUsername("jugador")).toBe("reserved");
    expect(validateUsername("player1")).toBeNull();
  });

  it("matches the database check constraint's shape", () => {
    // Same pattern as supabase/migrations/20261017100000_profiles.sql.
    const sql = /^[A-Za-z0-9_]{3,20}$/;
    for (const name of ["ada", "Ada_Lovelace_1815", "ab", "a".repeat(21), "ada lovelace", "adá"]) {
      const ok = validateUsername(name) === null || validateUsername(name) === "reserved";
      expect(sql.test(name)).toBe(ok);
    }
  });
});

describe("normalizeUsername", () => {
  it("drops whitespace and caps the length just past the limit", () => {
    expect(normalizeUsername(" Ada Lovelace ")).toBe("AdaLovelace");
    expect(normalizeUsername("a".repeat(40))).toHaveLength(USERNAME_MAX + 1);
  });
});

describe("suggestUsername", () => {
  it("builds a valid starting point from a display name", () => {
    expect(suggestUsername("Ada Lovelace")).toBe("AdaLovelace");
    expect(suggestUsername("José Núñez")).toBe("JoseNunez");
    expect(suggestUsername("Dr. Who-42")).toBe("DrWho42");
  });

  it("is empty when nothing usable is left", () => {
    expect(suggestUsername(null)).toBe("");
    expect(suggestUsername("")).toBe("");
    expect(suggestUsername("中文")).toBe("");
    expect(suggestUsername("Player")).toBe("");
  });

  it("caps at the maximum length", () => {
    expect(suggestUsername("Abcdefghijklmnopqrstuvwxyz")).toHaveLength(USERNAME_MAX);
  });
});
