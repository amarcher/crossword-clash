// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useReducer } from "react";
import "../../i18n/i18n";
import { gridFromRows, slotsOf } from "../../lib/seedgrid/grid";
import { initialStudioState, slotKey, studioReducer, type StudioState } from "../../lib/seedgrid/studioState";

const tokenStore = vi.hoisted(() => ({ token: "studio-token" }));
vi.mock("../../hooks/useStudioToken", () => ({ useStudioToken: () => tokenStore.token, setStudioToken: vi.fn() }));

const claude = vi.hoisted(() => ({
  edgeCaller: vi.fn(() => async () => ({})),
  suggestClues: vi.fn(),
  draftClues: vi.fn(),
}));
vi.mock("../../lib/seedgrid/studioClaude", async (importOriginal) => ({ ...(await importOriginal<typeof import("../../lib/seedgrid/studioClaude")>()), ...claude }));

const usage = vi.hoisted(() => ({ fetchStudioAllowance: vi.fn() }));
vi.mock("../../lib/studioUsage", async (importOriginal) => ({ ...(await importOriginal<typeof import("../../lib/studioUsage")>()), ...usage }));

const { CluePanel, MAX_REDRAFTS_IN_FLIGHT } = await import("./CluePanel");

/** A promise the test resolves by hand, so a redraft stays in flight as long as it likes. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

function studio(overrides: Partial<StudioState> = {}): StudioState {
  const grid = gridFromRows(["BAT", "ORE", "WED"]);
  const clues: Record<string, string> = {};
  const text: Record<string, string> = { "1A": "Cave flier", "4A": "Mined rock", "5A": "Tied the knot", "1D": "Curtsy's cousin", "2D": "Exist", "3D": "Talk series" };
  for (const s of slotsOf(grid)) clues[slotKey(s)] = text[s.id];
  return { ...initialStudioState(3, "p-1"), grid, clues, title: "Bats", ...overrides };
}

/** The panel over the real reducer, so a tapped alternative shows up the way it would in the studio. */
function Harness({ initial, access, userId }: { initial: StudioState; access: { admin: boolean; plus: boolean }; userId: string | null }) {
  const [state, dispatch] = useReducer(studioReducer, initial);
  return <CluePanel state={state} dispatch={dispatch} onExport={vi.fn()} access={access} userId={userId} />;
}

function renderPanel(over: { state?: Partial<StudioState>; access?: { admin: boolean; plus: boolean }; userId?: string | null } = {}) {
  return render(<Harness initial={studio(over.state)} access={over.access ?? { admin: true, plus: false }} userId={over.userId ?? null} />);
}

const clueInput = (label: string) => screen.getByLabelText(`Clue for ${label}`) as HTMLInputElement;
const wand = (label: string) => screen.getByRole("button", { name: `Redraft ${label} with AI` });

beforeEach(() => {
  tokenStore.token = "studio-token";
  claude.suggestClues.mockReset();
  claude.draftClues.mockReset();
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

  it("redrafting one row marks only that row busy; the others stay editable", async () => {
    const first = deferred<string[]>();
    claude.suggestClues.mockReturnValueOnce(first.promise);
    renderPanel();
    fireEvent.click(wand("1 across"));
    expect(claude.suggestClues).toHaveBeenCalledTimes(1);
    expect(claude.suggestClues.mock.calls[0][3]).toBe("1A");
    expect(claude.suggestClues.mock.calls[0][4]).toMatchObject({ current: "Cave flier" });
    expect(clueInput("1 across").disabled).toBe(true);
    expect(wand("1 across").getAttribute("aria-busy")).toBe("true");
    // Nothing else is frozen: the next row still takes typing and its own redraft.
    expect(clueInput("4 across").disabled).toBe(false);
    expect((wand("4 across") as HTMLButtonElement).disabled).toBe(false);
    fireEvent.change(clueInput("4 across"), { target: { value: "Lode load" } });
    expect(clueInput("4 across").value).toBe("Lode load");
    expect(screen.getByRole("button", { name: "Redraft AI clues" }).hasAttribute("disabled")).toBe(false);
    await act(async () => {
      first.resolve(["Club for Ruth", "Dugout tool"]);
      await first.promise;
    });
    expect(clueInput("1 across").disabled).toBe(false);
    expect(wand("1 across").getAttribute("aria-busy")).toBeNull();
    expect(clueInput("4 across").value).toBe("Lode load");
  });

  it("offers the alternatives as chips; a tap writes the clue and marks it yours, typing retires them", async () => {
    claude.suggestClues.mockResolvedValueOnce(["Club for Ruth", "Dugout tool"]);
    renderPanel();
    fireEvent.click(wand("1 across"));
    const list = await screen.findByRole("list", { name: "Alternatives for 1 across" });
    expect(list.textContent).toContain("Club for Ruth");
    expect(list.textContent).toContain("Dugout tool");
    fireEvent.click(screen.getByRole("button", { name: "Club for Ruth" }));
    expect(clueInput("1 across").value).toBe("Club for Ruth");
    expect(screen.getByRole("button", { name: "Club for Ruth" }).getAttribute("aria-pressed")).toBe("true");
    // The other alternative stays on offer until the row is typed in.
    expect(screen.getByRole("button", { name: "Dugout tool" })).toBeTruthy();
    const row = clueInput("1 across").closest("li")!;
    expect(row.textContent).toContain("yours");
    fireEvent.change(clueInput("1 across"), { target: { value: "Club for Ruth, say" } });
    expect(screen.queryByRole("list", { name: "Alternatives for 1 across" })).toBeNull();
  });

  it("says so when nothing usable came back, in the row", async () => {
    claude.suggestClues.mockResolvedValueOnce([]);
    renderPanel();
    fireEvent.click(wand("2 down"));
    const row = clueInput("2 down").closest("li")!;
    await waitFor(() => expect(row.textContent).toContain("Nothing usable came back; try again."));
    expect(screen.queryByRole("list", { name: "Alternatives for 2 down" })).toBeNull();
  });

  it("lets a few rows redraft at once and holds the next until one answers", async () => {
    const pending = Array.from({ length: MAX_REDRAFTS_IN_FLIGHT }, () => deferred<string[]>());
    for (const p of pending) claude.suggestClues.mockReturnValueOnce(p.promise);
    renderPanel();
    const labels = ["1 across", "4 across", "5 across", "1 down"];
    for (const label of labels.slice(0, MAX_REDRAFTS_IN_FLIGHT)) fireEvent.click(wand(label));
    expect(claude.suggestClues).toHaveBeenCalledTimes(MAX_REDRAFTS_IN_FLIGHT);
    expect((wand(labels[MAX_REDRAFTS_IN_FLIGHT]) as HTMLButtonElement).disabled).toBe(true);
    expect(clueInput(labels[MAX_REDRAFTS_IN_FLIGHT]).disabled).toBe(false);
    await act(async () => {
      pending[0].resolve(["Club for Ruth"]);
      await pending[0].promise;
    });
    expect((wand(labels[MAX_REDRAFTS_IN_FLIGHT]) as HTMLButtonElement).disabled).toBe(false);
  });

  it("a whole-puzzle draft fills every empty clue and leaves yours alone", async () => {
    claude.draftClues.mockResolvedValueOnce({ "1A": { standard: "Night flier", speed: "Flier" }, "4A": { standard: "Lode load", speed: "Rock" } });
    const empty = studio({ clues: {}, editedClues: [] });
    renderPanel({ state: { ...empty, clues: { [slotKey(slotsOf(empty.grid)[0])]: "" } } });
    fireEvent.click(screen.getByRole("button", { name: /^Draft/ }));
    await waitFor(() => expect(clueInput("1 across").value).toBe("Night flier"));
    expect(clueInput("4 across").value).toBe("Lode load");
    expect(screen.queryByRole("status")).toBeNull();
  });
});
