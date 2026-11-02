// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import "../i18n/i18n";
import type { StudioAccount } from "../hooks/useStudioAccount";
import type { LoadEvent } from "../lib/seedgrid/engineClient";
import { initialStudioState } from "../lib/seedgrid/studioState";

/**
 * The studio on a phone: one screen with a bottom tab bar (Grid · Words ·
 * Clues · More), the word-list download step on a first open, the admin
 * panels absent in the apps, and the app's own Play test and Export paths.
 */
const state: {
  account: StudioAccount;
  native: boolean;
  /** How the fake engine answers `load()`: a download with progress, straight away, or a failure (then success). */
  load: "download" | "ready" | "fail-once";
} = { account: null as unknown as StudioAccount, native: false, load: "ready" };
const loads: number[] = [];
let failures = 0;

vi.mock("../lib/seedgrid/engineClient", () => {
  class EngineClient {
    load(onEvent?: (e: LoadEvent) => void) {
      loads.push(Date.now());
      if (state.load === "fail-once" && failures++ === 0) return Promise.reject(new Error("word list 503"));
      if (state.load === "download") {
        return new Promise<number>((resolve) => {
          setTimeout(() => {
            onEvent?.({ kind: "progress", progress: { loaded: 0, total: 7_000_000 } });
            onEvent?.({ kind: "progress", progress: { loaded: 3_500_000, total: 7_000_000 } });
            setTimeout(() => {
              onEvent?.({ kind: "list", source: "network", bytes: 7_000_000, stored: true });
              resolve(5000);
            }, 250);
          }, 0);
        });
      }
      return Promise.resolve(5000);
    }
    restart = () => Promise.resolve(5000);
    dispose = () => undefined;
    options = async () => ({ ok: true, counts: {}, words: [{ word: "ABCDE", score: 50 }] });
    classify = async () => ({});
    fill = async () => ({ ok: false, reason: "timeout", ms: 1 });
    skeleton = async () => ({ grid: null, attempts: 0, minScore: 50 });
  }
  return { EngineClient, STUDIO_WORD_LIST_URL: "https://abc.supabase.co/storage/v1/object/public/seedgrid/words-production.dict" };
});
vi.mock("../hooks/useStudioAccount", () => ({ useStudioAccount: () => state.account }));
vi.mock("../hooks/useStudioToken", () => ({ useStudioToken: () => "", setStudioToken: () => undefined }));
const navigate = vi.fn();
vi.mock("../hooks/useTransitionNavigate", () => ({ useTransitionNavigate: () => navigate }));
vi.mock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: () => state.native, getPlatform: () => (state.native ? "ios" : "web") } }));
const exportNatively = vi.fn(async (_file: unknown) => "shared" as const);
vi.mock("../lib/nativeExport", () => ({ exportNatively: (file: unknown) => exportNatively(file), nativeExportAvailable: () => state.native }));
vi.mock("../lib/communityPuzzles", () => ({ fetchMyPuzzles: async () => [] }));
// The admin panels talk to Supabase; a heading each is all this test needs of them.
vi.mock("../components/Studio/DailyQueue", () => ({ DailyQueue: () => <h2>Daily queue</h2> }));
vi.mock("../components/Studio/Insights", () => ({ Insights: () => <h2>Insights</h2> }));
vi.mock("../components/Studio/Reports", () => ({ Reports: () => <h2>Reports</h2> }));
vi.mock("../components/Studio/StudioAccount", () => ({ StudioAccount: () => null }));

import { StudioScreen } from "./StudioScreen";

const user = { id: "u1", is_anonymous: false } as StudioAccount["user"];
function account(over: Partial<StudioAccount> = {}): StudioAccount {
  return { user, admin: false, ready: true, plus: true, plusReady: true, plusRow: null, refreshEntitlements: vi.fn(async () => {}), ...over };
}

/** A finished 5×5 (every square a letter) saved as the open draft, so Play test and Export are enabled. */
function seedCompleteDraft() {
  const s = initialStudioState(5);
  s.grid = { ...s.grid, cells: Array(25).fill("A"), locked: Array(25).fill(true) };
  s.title = "Test Puzzle";
  localStorage.setItem("crossword-clash:studio", JSON.stringify(s));
}

function matchMedia(desktop: boolean) {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: (query: string) => ({ matches: desktop && query.includes("min-width"), media: query, addEventListener: () => undefined, removeEventListener: () => undefined }),
  });
}

const renderStudio = () =>
  render(
    <MemoryRouter initialEntries={["/studio"]}>
      <StudioScreen />
    </MemoryRouter>,
  );

const panel = (id: string) => document.getElementById(`studio-panel-${id}`) as HTMLElement;

beforeEach(() => {
  localStorage.clear();
  state.account = account();
  state.native = false;
  state.load = "ready";
  loads.length = 0;
  failures = 0;
  navigate.mockClear();
  exportNatively.mockClear();
  matchMedia(false);
});
afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});

describe("StudioScreen on a phone", () => {
  it("shows one tab at a time and switches panels from the bottom bar", async () => {
    renderStudio();
    const tabs = screen.getAllByRole("tab");
    expect(tabs.map((t) => t.textContent)).toEqual(["Grid", "Words", "Clues", "More"]);
    expect(screen.getByRole("tab", { name: "Grid" }).getAttribute("aria-selected")).toBe("true");
    expect(panel("grid").hidden).toBe(false);
    expect(panel("words").hidden).toBe(true);
    expect(panel("clues").hidden).toBe(true);
    expect(panel("more").hidden).toBe(true);
    // The grid, its title and toolbar are on the first tab; Play test and Export are not (they live under More).
    expect(within(panel("grid")).getByRole("grid", { name: "Puzzle grid" })).toBeTruthy();
    expect(within(panel("grid")).getByLabelText("Title")).toBeTruthy();
    expect(within(panel("grid")).getByRole("button", { name: /Fill/ })).toBeTruthy();
    expect(within(panel("grid")).queryByRole("button", { name: /Play test/ })).toBeNull();

    fireEvent.click(screen.getByRole("tab", { name: "Words" }));
    expect(panel("grid").hidden).toBe(true);
    expect(panel("words").hidden).toBe(false);
    expect(screen.getByRole("tab", { name: "Words" }).getAttribute("aria-selected")).toBe("true");
    // A fresh grid has a cursor, so the candidate list for 1 Across is there.
    await waitFor(() => expect(within(panel("words")).getByRole("heading", { name: "1 Across" })).toBeTruthy());

    fireEvent.click(screen.getByRole("tab", { name: "Clues" }));
    expect(panel("clues").hidden).toBe(false);
    expect(within(panel("clues")).getByRole("heading", { name: "Clues" })).toBeTruthy();
    // Export belongs to More on a phone.
    expect(within(panel("clues")).queryByRole("button", { name: /Export/ })).toBeNull();

    fireEvent.click(screen.getByRole("tab", { name: "More" }));
    expect(panel("more").hidden).toBe(false);
    const more = within(panel("more"));
    expect(more.getByRole("heading", { name: "My puzzles" })).toBeTruthy();
    expect(more.getByRole("heading", { name: "Theme entries" })).toBeTruthy();
    expect(more.getByRole("heading", { name: "Rules" })).toBeTruthy();
    expect(more.getByRole("button", { name: /Play test/ })).toBeTruthy();
    expect(more.getByRole("button", { name: /Export \.ipuz/ })).toBeTruthy();
    expect(more.getByRole("button", { name: /Export \.puz/ })).toBeTruthy();
  });

  it("writes a tapped candidate into the grid and returns to the Grid tab", async () => {
    renderStudio();
    fireEvent.click(screen.getByRole("tab", { name: "Words" }));
    const word = await within(panel("words")).findByRole("button", { name: "ABCDE" });
    fireEvent.click(word);
    expect(panel("grid").hidden).toBe(false);
    expect(screen.getByRole("tab", { name: "Grid" }).getAttribute("aria-selected")).toBe("true");
    const cells = within(panel("grid")).getAllByRole("gridcell");
    expect(cells.slice(0, 5).map((c) => c.textContent?.replace(/\d/g, ""))).toEqual(["A", "B", "C", "D", "E"]);
  });

  it("shows the word-list download with progress on a first open, then the word count", async () => {
    state.load = "download";
    renderStudio();
    await waitFor(() => expect(screen.getByRole("progressbar", { name: "Word list download" })).toBeTruthy());
    expect(screen.getByText("Downloading the word list")).toBeTruthy();
    expect(screen.getByText(/7 MB, once per device/)).toBeTruthy();
    await waitFor(() => expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("50"));
    await waitFor(() => expect(screen.queryByRole("progressbar")).toBeNull());
    expect(screen.getByText("5,000 words")).toBeTruthy();
  });

  it("offers a retry when the list cannot be downloaded, and the editor stays on screen", async () => {
    state.load = "fail-once";
    renderStudio();
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("couldn't download its word list");
    expect(alert.textContent).toContain("word list 503");
    // Not a blank screen: the grid is there, Fill just waits for the list.
    expect(screen.getByRole("grid", { name: "Puzzle grid" })).toBeTruthy();
    expect((screen.getByRole("button", { name: /Fill/ }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(within(alert).getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
    expect(loads).toHaveLength(2);
    await waitFor(() => expect((screen.getByRole("button", { name: /Fill/ }) as HTMLButtonElement).disabled).toBe(false));
  });

  it("never renders the admin panels in a mobile build, even for an admin; the web phone layout keeps them under More", () => {
    state.account = account({ admin: true });
    renderStudio();
    fireEvent.click(screen.getByRole("tab", { name: "More" }));
    expect(within(panel("more")).getByRole("heading", { name: "Daily queue" })).toBeTruthy();
    expect(within(panel("more")).getByRole("heading", { name: "Insights" })).toBeTruthy();
    cleanup();

    vi.stubEnv("MODE", "mobile");
    renderStudio();
    fireEvent.click(screen.getByRole("tab", { name: "More" }));
    expect(screen.queryByRole("heading", { name: "Daily queue" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "Insights" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "Reports" })).toBeNull();
    expect(within(panel("more")).getByRole("heading", { name: "My puzzles" })).toBeTruthy();
  });

  it("in the app, Play test hands the puzzle to the solver in place and Export goes through the share sheet", async () => {
    seedCompleteDraft();
    state.native = true;
    renderStudio();
    fireEvent.click(screen.getByRole("tab", { name: "More" }));
    const more = within(panel("more"));
    fireEvent.click(more.getByRole("button", { name: /Play test/ }));
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(navigate.mock.calls[0][0]).toMatch(/^\/#puzzle=/);

    fireEvent.click(more.getByRole("button", { name: /Export \.ipuz/ }));
    await waitFor(() => expect(exportNatively).toHaveBeenCalledTimes(1));
    const file = exportNatively.mock.calls[0][0] as unknown as { name: string; bytes: Uint8Array; title: string };
    expect(file.name).toBe("testpuzzle.ipuz");
    expect(file.title).toBe("Test Puzzle");
    expect(JSON.parse(new TextDecoder().decode(file.bytes)).title).toBe("Test Puzzle");

    fireEvent.click(more.getByRole("button", { name: /Export \.puz/ }));
    await waitFor(() => expect(exportNatively).toHaveBeenCalledTimes(2));
    const puz = exportNatively.mock.calls[1][0] as unknown as { name: string; bytes: Uint8Array };
    expect(puz.name).toBe("testpuzzle.puz");
    expect(new TextDecoder("latin1").decode(puz.bytes.subarray(2, 14))).toBe("ACROSS&DOWN\0");
  });

  it("on the web, Play test opens a new tab and Export downloads a file", () => {
    seedCompleteDraft();
    const open = vi.fn();
    vi.stubGlobal("open", open);
    const createObjectURL = vi.fn(() => "blob:puzzle");
    const revokeObjectURL = vi.fn();
    Object.assign(URL, { createObjectURL, revokeObjectURL });
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    renderStudio();
    fireEvent.click(screen.getByRole("tab", { name: "More" }));
    const more = within(panel("more"));
    fireEvent.click(more.getByRole("button", { name: /Play test/ }));
    expect(open).toHaveBeenCalledWith(expect.stringMatching(/\/#puzzle=/), "_blank", "noopener");
    expect(navigate).not.toHaveBeenCalled();
    fireEvent.click(more.getByRole("button", { name: /Export \.ipuz/ }));
    return waitFor(() => {
      expect(createObjectURL).toHaveBeenCalledTimes(1);
      expect(click).toHaveBeenCalledTimes(1);
      expect(exportNatively).not.toHaveBeenCalled();
      click.mockRestore();
    });
  });
});

describe("StudioScreen on a desktop", () => {
  it("keeps the three-column desk with no tab bar, Play test in the toolbar and Export in the clue panel", () => {
    matchMedia(true);
    renderStudio();
    expect(screen.queryByRole("tablist")).toBeNull();
    expect(screen.queryByRole("tabpanel")).toBeNull();
    const grid = screen.getByRole("region", { name: "Grid" });
    expect(within(grid).getByRole("button", { name: /Play test/ })).toBeTruthy();
    expect(within(screen.getByRole("region", { name: "Clues" })).getByRole("button", { name: /Export \.ipuz/ })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "My puzzles" })).toBeTruthy();
  });
});
