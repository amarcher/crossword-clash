import { describe, expect, it } from "vitest";
import { engineErrorHelp } from "./EngineError";

describe("engineErrorHelp", () => {
  it("asks for a build when the list is local", () => {
    expect(engineErrorHelp("/seedgrid/words.dict")).toMatchObject({ title: expect.stringMatching(/isn't built/), command: expect.stringMatching(/seedgrid:studio-dict/) });
  });

  it("blames the download, naming the host, when the list is remote", () => {
    const help = engineErrorHelp("https://abc.supabase.co/storage/v1/object/public/seedgrid/words-production.dict");
    expect(help.title).toMatch(/couldn't download/);
    expect(help.fix).toContain("abc.supabase.co");
    expect(help.command).toMatch(/seedgrid:upload-dict/);
  });
});
