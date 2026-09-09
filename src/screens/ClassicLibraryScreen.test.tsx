// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import "../i18n/i18n";
import { ClassicLibraryScreen } from "./ClassicLibraryScreen";
import type { ClassicEntry } from "../lib/classicLibrary";

const navigate = vi.fn();
vi.mock("react-router", async () => {
  const actual = await vi.importActual<typeof import("react-router")>("react-router");
  return { ...actual, useNavigate: () => navigate };
});

const handleSoloPuzzleLoaded = vi.fn(async () => {});
const setSoloTheme = vi.fn();
const setUrlPuzzle = vi.fn();
vi.mock("../contexts/GameContext", () => ({
  useGame: () => ({ handleSoloPuzzleLoaded, setSoloTheme, setUrlPuzzle }),
}));

const auth = { user: { id: "u1" } as { id: string } | null, loading: false };
vi.mock("../contexts/AuthContext", () => ({
  useAuth: () => auth,
}));

vi.mock("../components/Title", () => ({ Title: () => null }));

const manifest = vi.fn<() => Promise<ClassicEntry[]>>();
const loadPuzzle = vi.fn();
vi.mock("../lib/classicLibrary", async () => {
  const actual = await vi.importActual<typeof import("../lib/classicLibrary")>("../lib/classicLibrary");
  return {
    ...actual,
    loadClassicManifest: () => manifest(),
    loadClassicPuzzle: (e: ClassicEntry) => loadPuzzle(e),
  };
});

const bestTimes: Record<string, number> = {};
vi.mock("../lib/soloStats", async () => {
  const actual = await vi.importActual<typeof import("../lib/soloStats")>("../lib/soloStats");
  return { ...actual, loadSoloStats: () => ({ version: 1, bestTimes, streak: actual.EMPTY_STREAK }) };
});

const entries: ClassicEntry[] = [
  { file: "cwpb1.puz", number: 1, title: "A Soft Beginning", author: "Gregorian", width: 11, height: 11, clues: 50, identity: "id-small", blurb: "Easy going." },
  { file: "cwpb3.puz", number: 3, title: "A Simplicity", author: "Isidore Edelstein", width: 15, height: 15, clues: 80, identity: "id-medium", blurb: "" },
  { file: "cwpb49.puz", number: 49, title: "In Words of One Syllable", author: "J. T. Delaney", width: 23, height: 23, clues: 178, identity: "id-giant", blurb: "A monster." },
];

function renderScreen() {
  return render(
    <MemoryRouter>
      <ClassicLibraryScreen />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  manifest.mockResolvedValue(entries);
  loadPuzzle.mockResolvedValue({ title: "A Soft Beginning", width: 11, height: 11, author: "", cells: [], clues: [] });
  for (const k of Object.keys(bestTimes)) delete bestTimes[k];
  auth.user = { id: "u1" };
  auth.loading = false;
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("ClassicLibraryScreen", () => {
  it("lists every manifest entry with number, size, author and blurb", async () => {
    renderScreen();
    expect(await screen.findByText("A Soft Beginning")).toBeTruthy();
    expect(screen.getByText("A Simplicity")).toBeTruthy();
    expect(screen.getByText("In Words of One Syllable")).toBeTruthy();
    expect(screen.getByText(/No\. 49 · 23×23 · 178 clues/)).toBeTruthy();
    expect(screen.getByText("by Gregorian")).toBeTruthy();
    expect(screen.getByText("“Easy going.”")).toBeTruthy();
    expect(screen.getByText(/3 puzzles from/)).toBeTruthy();
  });

  it("filters by size bucket and shows an empty state for a bucket with nothing", async () => {
    renderScreen();
    await screen.findByText("A Soft Beginning");

    fireEvent.click(screen.getByRole("button", { name: "Giant" }));
    expect(screen.queryByText("A Soft Beginning")).toBeNull();
    expect(screen.getByText("In Words of One Syllable")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Large" }));
    expect(screen.getByText(/Nothing left here/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "All sizes" }));
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
  });

  it("shows a solved badge with the personal best and offers 'Play again'", async () => {
    bestTimes["id-medium"] = 272;
    renderScreen();
    const card = (await screen.findByText("A Simplicity")).closest("li")!;
    expect(within(card).getByText("✓ 4:32")).toBeTruthy();
    expect(within(card).getByRole("button", { name: "Play again" })).toBeTruthy();
    expect(screen.getByText("1 of 3 solved")).toBeTruthy();

    // "Hide solved" appears only once something is solved, and hides that card.
    fireEvent.click(screen.getByRole("button", { name: "Hide solved" }));
    expect(screen.queryByText("A Simplicity")).toBeNull();
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
  });

  it("does not offer 'Hide solved' when nothing is solved", async () => {
    renderScreen();
    await screen.findByText("A Soft Beginning");
    expect(screen.queryByRole("button", { name: "Hide solved" })).toBeNull();
  });

  it("'Play solo' loads the puzzle into solo play", async () => {
    renderScreen();
    const card = (await screen.findByText("A Soft Beginning")).closest("li")!;
    fireEvent.click(within(card).getByRole("button", { name: "Play solo" }));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/solo/play"));
    expect(loadPuzzle).toHaveBeenCalledWith(expect.objectContaining({ file: "cwpb1.puz" }));
    expect(handleSoloPuzzleLoaded).toHaveBeenCalledTimes(1);
    expect(setSoloTheme).toHaveBeenCalledWith(null);
    expect(setUrlPuzzle).not.toHaveBeenCalled();
  });

  it("'Race friends' hands the puzzle to the host flow via urlPuzzle", async () => {
    renderScreen();
    const card = (await screen.findByText("A Simplicity")).closest("li")!;
    fireEvent.click(within(card).getByRole("button", { name: /Race friends/ }));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/host-game/name"));
    expect(setUrlPuzzle).toHaveBeenCalledWith(expect.objectContaining({ title: "A Soft Beginning" }));
    expect(handleSoloPuzzleLoaded).not.toHaveBeenCalled();
  });

  it("hides 'Race friends' when there is no user and auth is settled", async () => {
    auth.user = null;
    renderScreen();
    await screen.findByText("A Soft Beginning");
    expect(screen.queryByRole("button", { name: /Race friends/ })).toBeNull();
    expect(screen.getAllByRole("button", { name: "Play solo" })).toHaveLength(3);
  });

  it("'Surprise me' picks an unsolved puzzle from the current filter", async () => {
    bestTimes["id-small"] = 60;
    renderScreen();
    await screen.findByText("A Soft Beginning");
    fireEvent.click(screen.getByRole("button", { name: "Small" }));
    // Only the (solved) small puzzle is visible → falls back to it rather than nothing.
    fireEvent.click(screen.getByRole("button", { name: /Surprise me/ }));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/solo/play"));
    expect(loadPuzzle).toHaveBeenCalledWith(expect.objectContaining({ file: "cwpb1.puz" }));
  });

  it("shows an error and re-enables buttons when a puzzle fails to load", async () => {
    loadPuzzle.mockRejectedValueOnce(new Error("HTTP 404"));
    renderScreen();
    const card = (await screen.findByText("A Soft Beginning")).closest("li")!;
    fireEvent.click(within(card).getByRole("button", { name: "Play solo" }));
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(navigate).not.toHaveBeenCalled();
    expect((within(card).getByRole("button", { name: "Play solo" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("shows the unavailable message when the manifest fails to load", async () => {
    manifest.mockResolvedValue([]);
    renderScreen();
    expect(await screen.findByText(/couldn't be loaded/)).toBeTruthy();
  });
});
