// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useReducer } from "react";
import { gridFromRows, slotsOf } from "../../lib/seedgrid/grid";
import { initialStudioState, slotKey, studioReducer, type StudioState } from "../../lib/seedgrid/studioState";

const tokenStore = vi.hoisted(() => ({ token: "studio-token" }));
vi.mock("../../hooks/useStudioToken", () => ({ useStudioToken: () => tokenStore.token, setStudioToken: vi.fn() }));

const claude = vi.hoisted(() => ({ edgeCaller: vi.fn(() => async () => ({})), suggestTitles: vi.fn() }));
vi.mock("../../lib/seedgrid/studioClaude", async (importOriginal) => ({ ...(await importOriginal<typeof import("../../lib/seedgrid/studioClaude")>()), ...claude }));

const { TitleField } = await import("./TitleField");

function studio(overrides: Partial<StudioState> = {}): StudioState {
  const grid = gridFromRows(["BAT", "ORE", "WED"]);
  const clues: Record<string, string> = {};
  const text: Record<string, string> = { "1A": "Cave flier", "4A": "Mined rock", "5A": "Tied the knot", "1D": "Curtsy's cousin", "2D": "Exist", "3D": "Talk series" };
  for (const s of slotsOf(grid)) clues[slotKey(s)] = text[s.id];
  return { ...initialStudioState(3, "p-1"), grid, clues, theme: "Night life", ...overrides };
}

function Harness({ initial, access }: { initial: StudioState; access: { admin: boolean; plus: boolean } }) {
  const [state, dispatch] = useReducer(studioReducer, initial);
  return <TitleField state={state} dispatch={dispatch} access={access} />;
}

const renderField = (over: Partial<StudioState> = {}, access = { admin: true, plus: false }) => render(<Harness initial={studio(over)} access={access} />);
const title = () => screen.getByLabelText("Title") as HTMLInputElement;
const suggestButton = () => screen.getByRole("button", { name: "Suggest titles" }) as HTMLButtonElement;

beforeEach(() => {
  tokenStore.token = "studio-token";
  claude.suggestTitles.mockReset();
});
afterEach(cleanup);

describe("TitleField", () => {
  it("asks the AI once with the entries' clues, the theme note and the current title, and offers the answers as chips", async () => {
    claude.suggestTitles.mockResolvedValueOnce(["Night Shift", "After Dark", "Bat Country"]);
    const { container } = renderField({ title: "Draft" });
    expect(suggestButton().title).toMatch(/^Suggest titles with AI/);
    fireEvent.click(suggestButton());
    expect(suggestButton().getAttribute("aria-busy")).toBe("true");
    expect(claude.suggestTitles).toHaveBeenCalledTimes(1);
    const [, , context, clues, opts] = claude.suggestTitles.mock.calls[0];
    expect(context).toContain("Theme: Night life");
    expect(clues).toMatchObject({ "1A": "Cave flier", "3D": "Talk series" });
    expect(opts).toEqual({ current: "Draft" });
    const list = await screen.findByRole("list", { name: "Title suggestions" });
    expect(list.textContent).toContain("Night Shift");
    expect(suggestButton().getAttribute("aria-busy")).toBeNull();
    expect(container.innerHTML).not.toMatch(/claude/i);
  });

  it("a tapped chip becomes the title and stays pressed; typing retires the chips", async () => {
    claude.suggestTitles.mockResolvedValueOnce(["Night Shift", "After Dark"]);
    renderField();
    fireEvent.click(suggestButton());
    await screen.findByRole("list", { name: "Title suggestions" });
    fireEvent.click(screen.getByRole("button", { name: "After Dark" }));
    expect(title().value).toBe("After Dark");
    expect(screen.getByRole("button", { name: "After Dark" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "Night Shift" })).toBeTruthy();
    fireEvent.change(title(), { target: { value: "After Dark, Mostly" } });
    expect(screen.queryByRole("list", { name: "Title suggestions" })).toBeNull();
  });

  it("explains an empty answer, and waits for the grid and for access", async () => {
    claude.suggestTitles.mockResolvedValueOnce([]);
    renderField();
    fireEvent.click(suggestButton());
    await waitFor(() => expect(screen.getByText("Nothing usable came back; try again.")).toBeTruthy());

    cleanup();
    renderField({ grid: gridFromRows(["BA.", "ORE", "WED"]) });
    expect(suggestButton().disabled).toBe(true);

    cleanup();
    tokenStore.token = "";
    renderField({}, { admin: false, plus: false });
    fireEvent.click(suggestButton());
    expect(claude.suggestTitles).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/enter the studio token in the Clues panel/)).toBeTruthy();
  });
});
