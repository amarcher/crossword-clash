import { describe, it, expect, vi } from "vitest";
import { fetchNytPuzzle, nytPuzzleLocation, nytPuzzleUrl, parseNytPuzzle } from "./nytImport";

const url = "https://www.nytimes.com/crosswords/game/daily/2026/09/10";
function fixture() {
  return {
    title: "Synthetic test puzzle", constructors: ["Test Constructor"], publicationDate: "2026-09-10",
    account: { secret: "must-not-transfer" },
    body: [{ dimensions: { width: 2, height: 2 },
      cells: [{ answer: "A", label: "1", circled: true }, { answer: "T", label: "2" }, { answer: "N", label: "3" }, { answer: "O" }],
      clues: {
        "0": { label: "1", cells: [0, 1], text: [{ plain: "Located " }, { plain: "at" }] },
        "1": { label: "3", cells: [2, 3], text: [{ plain: "Negative" }] },
        "2": { label: "1", cells: [0, 2], text: [{ plain: "An article" }] },
        "3": { label: "2", cells: [1, 3], text: [{ plain: "Toward" }] },
      }, clueLists: [{ name: "Across", clues: [0, 1] }, { name: "Down", clues: [2, 3] }],
    }],
  };
}

describe("subscriber-directed NYT extraction", () => {
  it("keeps edition, attribution, all clue runs and circles; drops account data", () => {
    const puzzle = parseNytPuzzle(fixture(), url + "?tracking=private#private");
    expect(puzzle.source).toEqual({ provider: "nyt", date: "2026-09-10", kind: "daily", url });
    expect(puzzle.author).toBe("Test Constructor");
    expect(puzzle.clues[0]).toMatchObject({ text: "Located at", length: 2, answer: "AT" });
    expect(puzzle.cells[0][0].circled).toBe(true);
    expect(JSON.stringify(puzzle)).not.toContain("secret");
    expect(JSON.stringify(puzzle)).not.toContain("private");
  });

  it("imports the indexed clue array returned by NYT v6", () => {
    const data = fixture();
    const payload = { ...data, body: [{ ...data.body[0], clues: Object.values(data.body[0].clues) }] };
    const puzzle = parseNytPuzzle(payload, url);
    expect(puzzle).toEqual(parseNytPuzzle(data, url));
    expect(puzzle.clues.map(({ direction, number }) => [direction, number])).toEqual([
      ["across", 1], ["across", 3], ["down", 1], ["down", 2],
    ]);
  });

  it("still rejects missing and malformed entries in an indexed clue array", () => {
    const data = fixture();
    const clues: unknown[] = Object.values(data.body[0].clues);
    const payload = { ...data, body: [{ ...data.body[0], clues }] };
    clues.pop();
    expect(() => parseNytPuzzle(payload, url)).toThrow();
    clues.push(null);
    expect(() => parseNytPuzzle(payload, url)).toThrow();
    clues[3] = { ...data.body[0].clues["3"], cells: [1, 2] };
    expect(() => parseNytPuzzle(payload, url)).toThrow();
  });

  it.each([
    "https://www.nytimes.com.evil.test/crosswords/game/daily/2026/09/10",
    "http://www.nytimes.com/crosswords/game/daily/2026/09/10",
    "https://www.nytimes.com/crosswords/game/daily",
    "https://www.nytimes.com/crosswords/game/daily/2026/02/30",
    "https://user:password@www.nytimes.com/crosswords/game/daily/2026/09/10",
    "https://www.nytimes.com/crosswords/game/daily/2026/09/10/other",
  ])("rejects ambiguous or untrusted location %s", (input) => {
    expect(() => nytPuzzleLocation(input)).toThrow();
  });

  it("constructs the exact selected edition without local-time guessing", () => {
    expect(nytPuzzleUrl("mini", "2024-02-29")).toBe("https://www.nytimes.com/crosswords/game/mini/2024/02/29");
    expect(nytPuzzleLocation(url).endpoint).toBe("/svc/crosswords/v6/puzzle/daily/2026-09-10.json");
  });

  it("rejects an edition mismatch", () => {
    const data = fixture(); data.publicationDate = "2026-09-11";
    expect(() => parseNytPuzzle(data, url)).toThrow();
  });

  it("rejects rebus cells until the keyboard supports them", () => {
    const data = fixture(); data.body[0].cells[0].answer = "CAT";
    expect(() => parseNytPuzzle(data, url)).toThrow(/rebus/);
  });

  it("rejects missing solutions instead of making white squares black", () => {
    const data = fixture(); delete (data.body[0].cells[0] as { answer?: string }).answer;
    expect(() => parseNytPuzzle(data, url)).toThrow();
  });

  it("rejects malformed, duplicate and noncontiguous clues", () => {
    const data = fixture(); data.body[0].clues["0"].cells = [0, 3];
    expect(() => parseNytPuzzle(data, url)).toThrow();
    const duplicate = fixture(); duplicate.body[0].clueLists[0].clues.push(0);
    expect(() => parseNytPuzzle(duplicate, url)).toThrow();
  });

  const STATUS_URL = "https://a.nytimes.com/svc/nyt/data-layer?sourceApp=games-crosswords";
  const subscriber = () => ({
    session: { isLoggedIn: true },
    user: { type: "sub", subInfo: { subscriptions: [{ status: "ACTIVE", entitlements: ["XWD"] }] } },
  });
  /** Answers the status check with `status`, and the puzzle request with `puzzle`. */
  const nyt = (status: unknown, puzzle: () => Response = () => new Response(JSON.stringify(fixture()))) =>
    vi.fn<typeof fetch>().mockImplementation(async (input) =>
      String(input) === STATUS_URL ? new Response(JSON.stringify(status)) : puzzle());

  it("confirms the subscription, then makes one same-origin puzzle request with the browser's credentials", async () => {
    const request = nyt(subscriber());
    const puzzle = await fetchNytPuzzle(url, request);
    expect(puzzle.clues).toHaveLength(4);
    const options = { credentials: "include", redirect: "error", signal: expect.any(AbortSignal) };
    expect(request.mock.calls).toEqual([
      [STATUS_URL, options],
      ["/svc/crosswords/v6/puzzle/daily/2026-09-10.json", options],
    ]);
  });

  it.each([
    ["a signed-out visitor", { session: { isLoggedIn: false }, user: { type: "anon", subInfo: { modified: 0 } } }],
    ["a signed-in account with no subscription", { session: { isLoggedIn: true }, user: { type: "regi", subInfo: {} } }],
    ["a lapsed subscription", { session: { isLoggedIn: true }, user: { subInfo: { subscriptions: [{ status: "CANCELLED", entitlements: ["XWD"] }] } } }],
    ["a subscription without the crossword", { session: { isLoggedIn: true }, user: { subInfo: { subscriptions: [{ status: "ACTIVE", entitlements: ["MM"] }] } } }],
    ["an unreadable status", "nonsense"],
  ])("refuses %s without requesting the puzzle", async (_label, status) => {
    const request = nyt(status);
    await expect(fetchNytPuzzle(url, request)).rejects.toMatchObject({ code: "ACCESS" });
    expect(request).toHaveBeenCalledExactlyOnceWith(STATUS_URL, expect.anything());
  });

  it("fails closed when the status check cannot be completed", async () => {
    const unavailable = vi.fn<typeof fetch>().mockResolvedValue(new Response("", { status: 503 }));
    await expect(fetchNytPuzzle(url, unavailable)).rejects.toMatchObject({ code: "ACCESS" });
    const offline = vi.fn<typeof fetch>().mockRejectedValue(new TypeError("network"));
    await expect(fetchNytPuzzle(url, offline)).rejects.toMatchObject({ code: "ACCESS" });
    expect(unavailable).toHaveBeenCalledTimes(1);
    expect(offline).toHaveBeenCalledTimes(1);
  });

  it("refuses on NYT's paywall screen before making any request", async () => {
    const request = nyt(subscriber());
    const paywall = { querySelector: (selector: string) => (selector === ".pz-error" ? ({} as Element) : null) };
    await expect(fetchNytPuzzle(url, request, paywall)).rejects.toMatchObject({ code: "ACCESS" });
    expect(request).not.toHaveBeenCalled();
  });

  it.each([401, 403])("stops on access denial %s without alternate endpoints or retries", async (status) => {
    const request = nyt(subscriber(), () => new Response("", { status }));
    await expect(fetchNytPuzzle(url, request)).rejects.toMatchObject({ code: "ACCESS" });
    expect(request).toHaveBeenCalledTimes(2);
  });

  it("does not expose server response bodies in errors", async () => {
    const request = nyt(subscriber(), () => new Response("private-account-data"));
    await expect(fetchNytPuzzle(url, request)).rejects.toMatchObject({ code: "FORMAT" });
  });
});
