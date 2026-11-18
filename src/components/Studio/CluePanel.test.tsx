// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useReducer } from "react";
import "../../i18n/i18n";
import { gridFromRows, slotsOf } from "../../lib/seedgrid/grid";
import { initialStudioState, slotKey, studioReducer, type StudioState } from "../../lib/seedgrid/studioState";

const tokenStore = vi.hoisted(() => ({ token: "studio-token" }));
vi.mock("../../hooks/useStudioToken", () => ({ useStudioToken: () => tokenStore.token, setStudioToken: vi.fn() }));

const claude = vi.hoisted(() => ({
  edgeCaller: vi.fn(() => async () => ({})),
  draftClueOptions: vi.fn(),
}));
vi.mock("../../lib/seedgrid/studioClaude", async (importOriginal) => ({ ...(await importOriginal<typeof import("../../lib/seedgrid/studioClaude")>()), ...claude }));

const usage = vi.hoisted(() => ({ fetchStudioAllowance: vi.fn() }));
vi.mock("../../lib/studioUsage", async (importOriginal) => ({ ...(await importOriginal<typeof import("../../lib/studioUsage")>()), ...usage }));

const { CluePanel } = await import("./CluePanel");

function studio(overrides: Partial<StudioState> = {}): StudioState {
  const grid = gridFromRows(["BAT", "ORE", "WED"]);
  const clues: Record<string, string> = {};
  const text: Record<string, string> = { "1A": "Cave flier", "4A": "Mined rock", "5A": "Tied the knot", "1D": "Curtsy's cousin", "2D": "Exist", "3D": "Talk series" };
  for (const s of slotsOf(grid)) clues[slotKey(s)] = text[s.id];
  return { ...initialStudioState(3, "p-1"), grid, clues, title: "Bats", ...overrides };
}

/** The panel over the real reducer, so a tapped option shows up the way it would in the studio. */
function Harness({ initial, access, userId, activeKey }: { initial: StudioState; access: { admin: boolean; plus: boolean }; userId: string | null; activeKey?: string }) {
  const [state, dispatch] = useReducer(studioReducer, initial);
  return <CluePanel state={state} dispatch={dispatch} onExport={vi.fn()} access={access} userId={userId} activeKey={activeKey} />;
}

function renderPanel(over: { state?: Partial<StudioState>; access?: { admin: boolean; plus: boolean }; userId?: string | null; activeKey?: string } = {}) {
  return render(<Harness initial={studio(over.state)} access={over.access ?? { admin: true, plus: false }} userId={over.userId ?? null} activeKey={over.activeKey} />);
}

const keyOf = (id: string) => slotKey(slotsOf(studio().grid).find((s) => s.id === id)!);

const clueInput = (label: string) => screen.getByLabelText(`Clue for ${label}`) as HTMLInputElement;

beforeEach(() => {
  tokenStore.token = "studio-token";
  claude.draftClueOptions.mockReset();
  usage.fetchStudioAllowance.mockReset().mockResolvedValue({ used: 3, limit: 40, month: "2026-10-01" });
});
afterEach(cleanup);

describe("CluePanel", () => {
  it("never names the model: the allowance line, buttons and tooltips say AI", async () => {
    tokenStore.token = "";
    const { container } = renderPanel({ access: { admin: false, plus: true }, userId: "u1" });
    await screen.findByText("37 of 40 AI drafts left this month");
    expect(screen.getByText("37 of 40 AI drafts left this month").getAttribute("title")).toMatch(/one draft, however many alternative clues/);
    expect(screen.getByRole("button", { name: "Redraft AI clues" })).toBeTruthy();
    expect(container.innerHTML).not.toMatch(/claude/i);
  });

  it("labels the theme as an optional input the AI never invents, and has no speed-clue field", () => {
    renderPanel();
    const theme = screen.getByLabelText("Theme (optional)") as HTMLInputElement;
    expect(theme.placeholder).toMatch(/^Tell the AI the theme, if there is one/);
    expect(screen.getByText(/the AI never invents one/)).toBeTruthy();
    expect(screen.queryByLabelText(/Speed clue/)).toBeNull();
    expect(screen.queryByPlaceholderText(/race hint/i)).toBeNull();
  });

  it("has no per-entry AI call: drafting is one call for the whole puzzle", () => {
    renderPanel();
    expect(screen.queryByRole("button", { name: /Redraft 1 across/ })).toBeNull();
  });

  it("a whole-puzzle draft writes in each entry's best clue, keeps the rest as options and leaves yours alone", async () => {
    claude.draftClueOptions.mockResolvedValueOnce({ "1A": ["Night flier", "Club for Ruth", "Dugout tool"], "4A": ["Lode load"], "5A": ["Got hitched"] });
    const one = keyOf("1A");
    const four = keyOf("4A");
    renderPanel({ state: { clues: { ...studio().clues, [one]: "", [four]: "" }, editedClues: [keyOf("5A")] }, activeKey: one });
    fireEvent.click(screen.getByRole("button", { name: /^Draft/ }));
    await waitFor(() => expect(clueInput("1 across").value).toBe("Night flier"));
    expect(claude.draftClueOptions).toHaveBeenCalledTimes(1);
    expect(claude.draftClueOptions.mock.calls[0][3]).toMatchObject({ slots: ["1A", "4A"] });
    expect(clueInput("4 across").value).toBe("Lode load");
    // The options show on the selected entry only; a tap writes one in and marks it yours.
    const options = screen.getByRole("list", { name: "AI clues for 1 across" });
    expect(within(options).getAllByRole("button").map((b) => b.textContent)).toEqual(["Night flier", "Club for Ruth", "Dugout tool"]);
    expect(screen.queryByRole("list", { name: "AI clues for 4 across" })).toBeNull();
    fireEvent.click(within(options).getByRole("button", { name: "Club for Ruth" }));
    expect(clueInput("1 across").value).toBe("Club for Ruth");
    expect(within(options).getByRole("button", { name: "Club for Ruth" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("Enter moves to the next clue, across then down", () => {
    renderPanel();
    clueInput("5 across").focus();
    fireEvent.keyDown(clueInput("5 across"), { key: "Enter" });
    expect(document.activeElement).toBe(clueInput("1 down"));
  });

  it("can show only the entries still without a clue", () => {
    const four = slotKey(slotsOf(studio().grid).find((s) => s.id === "4A")!);
    renderPanel({ state: { clues: { ...studio().clues, [four]: "" } } });
    fireEvent.click(screen.getByLabelText(/Missing only \(1\)/));
    expect(screen.getAllByLabelText(/^Clue for /).map((i) => i.getAttribute("aria-label"))).toEqual(["Clue for 4 across"]);
  });

  it("tints the entry selected in the grid and selects an entry whose clue is focused", () => {
    const onSelectSlot = vi.fn();
    const initial = studio();
    const oneAcross = slotKey(slotsOf(initial.grid).find((s) => s.id === "1A")!);
    render(<CluePanel state={initial} dispatch={vi.fn()} onExport={vi.fn()} access={{ admin: true, plus: false }} userId={null} activeKey={oneAcross} onSelectSlot={onSelectSlot} />);
    expect(clueInput("1 across").closest("li")?.className).toContain("bg-brand-50");
    fireEvent.focus(clueInput("1 across"));
    expect(onSelectSlot).not.toHaveBeenCalled();
    fireEvent.focus(clueInput("1 down"));
    expect(onSelectSlot).toHaveBeenCalledWith(expect.objectContaining({ id: "1D" }));
  });
});
