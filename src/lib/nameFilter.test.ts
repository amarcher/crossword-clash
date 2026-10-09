import { describe, expect, it } from "vitest";
import { displayableName, isObjectionableName } from "./nameFilter";

describe("isObjectionableName", () => {
  it("passes ordinary names", () => {
    for (const name of ["Andrew", "Kaia 🎉", "Van Dyke", "Cassandra", "Scunthorpe Sam", "Spicy Taco", "Computadora", "José", "Player 2", "Mr. Hancock"]) {
      expect(isObjectionableName(name), name).toBe(false);
    }
  });

  it("catches profanity and slurs, including spacing and leetspeak", () => {
    for (const name of ["fuck you", "F.U.C.K", "sh1t", "xX_b1tch_Xx", "N1gger", "ass", "big dick", "Puta Madre", "hitler"]) {
      expect(isObjectionableName(name), name).toBe(true);
    }
  });
});

describe("displayableName", () => {
  it("keeps clean names and trims them", () => {
    expect(displayableName("  Milo ")).toBe("Milo");
  });

  it("replaces objectionable or empty names with the fallback", () => {
    expect(displayableName("shithead")).toBe("Player");
    expect(displayableName("")).toBe("Player");
    expect(displayableName(null, "Player 1")).toBe("Player 1");
  });
});
