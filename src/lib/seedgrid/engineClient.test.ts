import { describe, it, expect } from "vitest";
import { studioWordListUrl } from "./engineClient";

describe("studioWordListUrl", () => {
  const supabase = "https://abc.supabase.co/";

  it("uses the local full list in dev", () => {
    expect(studioWordListUrl(undefined, true, supabase)).toBe("/seedgrid/words.dict");
  });

  it("uses the licensable list in Supabase Storage in other builds", () => {
    expect(studioWordListUrl(undefined, false, supabase)).toBe("https://abc.supabase.co/storage/v1/object/public/seedgrid/words-production.dict");
  });

  it("falls back to the local licensable list without Supabase", () => {
    expect(studioWordListUrl(undefined, false, undefined)).toBe("/seedgrid/words-production.dict");
  });

  it("lets VITE_SEEDGRID_WORD_LIST override both", () => {
    expect(studioWordListUrl("/seedgrid/words.dict", false, supabase)).toBe("/seedgrid/words.dict");
    expect(studioWordListUrl("https://cdn.example/list.dict", true, supabase)).toBe("https://cdn.example/list.dict");
  });
});
