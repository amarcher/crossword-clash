// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

type Result = { data: unknown; error: { message: string } | null };
const calls: { method: string; args: unknown[] }[] = [];
let nextResult: Result = { data: [], error: null };
function chain(): Record<string, unknown> {
  const self: Record<string, unknown> = {};
  for (const method of ["select", "eq", "upsert"]) {
    self[method] = (...args: unknown[]) => {
      calls.push({ method, args });
      return self;
    };
  }
  self.then = (resolve: (r: Result) => unknown) => Promise.resolve(nextResult).then(resolve);
  return self;
}
vi.mock("./supabaseClient", () => ({ supabase: { from: () => chain() } }));

import { pullPrefs, resetPrefsSyncForTests, startPrefsSync } from "./accountPrefs";
import { readFriendsOnly, writeFriendsOnly } from "./boardPrefs";
import { hideAuthor, loadHiddenAuthors, resetHiddenAuthorsMemory } from "./hiddenAuthors";
import { loadSoloSettings, resetSoloSettingsForTests, updateSoloSettings } from "./soloSettings";

const UID = "6f1d2c3b-4a5e-4f60-8b7c-9d0e1f2a3b4c";
const upserts = () => calls.filter((c) => c.method === "upsert").map((c) => c.args[0] as { key: string; value: unknown; user_id: string });
const settle = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  localStorage.clear();
  calls.length = 0;
  nextResult = { data: [], error: null };
  resetPrefsSyncForTests();
  resetHiddenAuthorsMemory();
  resetSoloSettingsForTests();
});

describe("account preferences", () => {
  it("saves a preference to the account when it changes", async () => {
    startPrefsSync(UID);
    updateSoloSettings({ autocheck: false });
    hideAuthor("author-1");
    writeFriendsOnly(true);
    await settle();
    expect(upserts().map((u) => [u.user_id, u.key, u.value])).toEqual([
      [UID, "solo_settings", { autocheck: false, haptics: true }],
      [UID, "hidden_authors", ["author-1"]],
      [UID, "board_friends_only", true],
    ]);
  });

  it("takes the account's stored values over the device's, without sending them back", async () => {
    updateSoloSettings({ autocheck: true });
    startPrefsSync(UID);
    nextResult = {
      data: [
        { key: "solo_settings", value: { autocheck: false, haptics: false } },
        { key: "hidden_authors", value: ["a", "b"] },
        { key: "board_friends_only", value: true },
      ],
      error: null,
    };
    await pullPrefs(UID);
    await settle();
    expect(loadSoloSettings()).toEqual({ autocheck: false, haptics: false });
    expect(loadHiddenAuthors()).toEqual(["a", "b"]);
    expect(readFriendsOnly()).toBe(true);
    expect(upserts()).toEqual([]);
  });

  it("gives the account a guest's choices it has never stored, and leaves defaults unsent", async () => {
    hideAuthor("author-1");
    await pullPrefs(UID);
    expect(upserts().map((u) => u.key)).toEqual(["hidden_authors"]);
  });

  it("keeps the device's values when the read fails", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    hideAuthor("author-1");
    nextResult = { data: null, error: { message: "offline" } };
    await pullPrefs(UID);
    expect(loadHiddenAuthors()).toEqual(["author-1"]);
    expect(upserts()).toEqual([]);
    warn.mockRestore();
  });
});
