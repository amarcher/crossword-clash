import { describe, expect, it } from "vitest";
import { themeParts } from "./ThemeChips";

describe("themeParts", () => {
  it("keeps a plain theme whole", () => {
    expect(themeParts("Coffee shop orders")).toEqual(["Coffee shop orders"]);
  });

  it("splits a mashup into its halves, each capitalised", () => {
    expect(themeParts("Home improvement × rock bands")).toEqual(["Home improvement", "Rock bands"]);
    expect(themeParts("Tex-Mex x jazz")).toEqual(["Tex-Mex", "Jazz"]);
  });

  it("does not split on a letter x inside a word", () => {
    expect(themeParts("Box office hits")).toEqual(["Box office hits"]);
  });
});
