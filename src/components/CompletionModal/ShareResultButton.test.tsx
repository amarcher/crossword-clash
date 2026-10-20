// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { ShareResultButton, displayLink } from "./ShareResultButton";
import { buildShareBlock, type ShareBlock } from "../../lib/shareBlock";
import { buildDailyLink } from "../../lib/dailyChallenge";
import { track } from "../../lib/analytics";

vi.mock("../../lib/analytics", () => ({ track: vi.fn() }));
vi.mock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: () => false } }));

const PUZZLE = {
  title: "Deep Blue",
  width: 2,
  height: 1,
  cells: [[{ row: 0, col: 0, solution: "A" }, { row: 0, col: 1, solution: "B" }]],
};

function blockFor(name: string): ShareBlock {
  return buildShareBlock({
    puzzle: PUZZLE,
    cells: { "0,0": { correct: true, at: 1 }, "0,1": { correct: true, at: 2 } },
    seconds: 102,
    day: "2026-10-20",
    locale: "en-US",
    link: buildDailyLink("https://crosswordclash.com", { day: "2026-10-20", slot: "mini", seconds: 102, name }),
    labels: { brand: "Crossword Clash", daily: "Daily Mini", cta: "Beat my time" },
  });
}

describe("ShareResultButton", () => {
  let shared: ShareData | null;
  let copied: string | null;

  beforeEach(() => {
    shared = null;
    copied = null;
    vi.mocked(track).mockClear();
  });

  afterEach(() => {
    delete (navigator as Partial<Navigator>).share;
    Object.defineProperty(navigator, "clipboard", { value: undefined, configurable: true });
    cleanup();
  });

  function withWebShare(impl?: (data?: ShareData) => Promise<void>) {
    navigator.share = vi.fn(
      impl ??
        ((data?: ShareData) => {
          shared = data ?? null;
          return Promise.resolve();
        }),
    );
  }

  function withClipboard() {
    Object.defineProperty(navigator, "clipboard", {
      value: {
        writeText: vi.fn((text: string) => {
          copied = text;
          return Promise.resolve();
        }),
      },
      configurable: true,
    });
  }

  it("previews the block above the button: header, stats, rows and the link", () => {
    render(<ShareResultButton mode="solo" blockFor={blockFor} challengerName="Alex" hasTime daily />);
    const preview = screen.getByTestId("share-block-preview");
    expect(preview.textContent).toContain("Crossword Clash · Daily Mini · Oct 20");
    expect(preview.textContent).toContain("⏱ 1:42");
    expect(preview.textContent).toContain("🟩🟧");
    expect(preview.textContent).toContain("Beat my time → crosswordclash.com/daily/2026-10-20/mini?beat=102&by=Alex");
    expect(screen.getByRole("button", { name: "Share your time" })).toBeTruthy();
  });

  it("shares the text alone through the Web Share API in one tap when the finisher has a name", async () => {
    withWebShare();
    withClipboard();
    render(<ShareResultButton mode="solo" blockFor={blockFor} challengerName="Alex" hasTime puzzleSize="2x1" />);
    fireEvent.click(screen.getByRole("button", { name: "Share" }));
    await waitFor(() => expect(navigator.share).toHaveBeenCalledTimes(1));
    expect(shared!.text).toBe(blockFor("Alex").text);
    expect(shared!.files).toBeUndefined();
    expect(shared!.url).toBeUndefined();
    expect(copied).toBeNull();
    expect(track).toHaveBeenCalledWith("result_shared", { mode: "solo", method: "webshare" });
    expect(track).toHaveBeenCalledWith("challenge_created", { size: "2x1", method: "webshare" });
  });

  it("copies the block and says so when the Web Share API is missing", async () => {
    withClipboard();
    render(<ShareResultButton mode="solo" blockFor={blockFor} challengerName="Alex" hasTime />);
    fireEvent.click(screen.getByRole("button", { name: "Share" }));
    await waitFor(() => expect(copied).toBe(blockFor("Alex").text));
    expect(screen.getByRole("button").textContent).toContain("Result copied");
    expect(track).toHaveBeenCalledWith("result_shared", { mode: "solo", method: "copy" });
  });

  it("asks a finisher with no real name to sign first, and the preview's link follows the typed name", async () => {
    withWebShare();
    render(<ShareResultButton mode="solo" blockFor={blockFor} challengerName="Player" hasTime />);
    fireEvent.click(screen.getByRole("button", { name: "Share" }));
    expect(navigator.share).not.toHaveBeenCalled();
    const input = screen.getByPlaceholderText("Your name");
    expect(screen.getByTestId("share-block-preview").textContent).toContain("by=A+friend");
    fireEvent.change(input, { target: { value: "Sam" } });
    expect(screen.getByTestId("share-block-preview").textContent).toContain("by=Sam");
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => expect(navigator.share).toHaveBeenCalledTimes(1));
    expect(shared!.text).toContain("by=Sam");
  });

  it("shares as 'A friend' when the signature is left blank, and reports a signed name", async () => {
    withWebShare();
    const onNameSigned = vi.fn();
    render(<ShareResultButton mode="solo" blockFor={blockFor} challengerName="" hasTime onNameSigned={onNameSigned} />);
    fireEvent.click(screen.getByRole("button", { name: "Share" }));
    fireEvent.click(screen.getByRole("button", { name: "Share" }));
    await waitFor(() => expect(navigator.share).toHaveBeenCalledTimes(1));
    expect(shared!.text).toContain("by=A+friend");
    expect(onNameSigned).not.toHaveBeenCalled();
  });

  it("does not ask for a name when no time rides in the link", async () => {
    withWebShare();
    render(<ShareResultButton mode="multiplayer" blockFor={blockFor} challengerName="Player" hasTime={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Share" }));
    await waitFor(() => expect(navigator.share).toHaveBeenCalledTimes(1));
    expect(screen.queryByPlaceholderText("Your name")).toBeNull();
    expect(track).not.toHaveBeenCalledWith("challenge_created", expect.anything());
  });

  it("treats a dismissed sheet as nothing happened", async () => {
    withWebShare(() => Promise.reject(Object.assign(new Error("x"), { name: "AbortError" })));
    withClipboard();
    render(<ShareResultButton mode="solo" blockFor={blockFor} challengerName="Alex" hasTime />);
    fireEvent.click(screen.getByRole("button", { name: "Share" }));
    await waitFor(() => expect(navigator.share).toHaveBeenCalledTimes(1));
    await Promise.resolve();
    expect(copied).toBeNull();
    expect(track).not.toHaveBeenCalled();
  });
});

describe("displayLink", () => {
  it("drops the scheme and shortens a puzzle-payload link", () => {
    expect(displayLink("https://crosswordclash.com/daily/2026-10-20/mini?beat=102&by=Archer")).toBe(
      "crosswordclash.com/daily/2026-10-20/mini?beat=102&by=Archer",
    );
    expect(displayLink(`https://crosswordclash.com/?cf=A&ct=1#puzzle=${"x".repeat(200)}`)).toBe(
      "crosswordclash.com/?cf=A&ct=1#puzzle=xxxxxx…",
    );
  });
});
