// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "../../i18n/i18n";

const rows = vi.hoisted(() => ({ byId: [] as unknown[], byName: [] as unknown[], calls: [] as string[] }));
vi.mock("../../lib/supabaseClient", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        in: async (column: string, values: string[]) => {
          rows.calls.push(`${column}:${values.join(",")}`);
          return { data: column === "user_id" ? rows.byId : rows.byName, error: null };
        },
      }),
    }),
  },
}));
vi.mock("../../lib/plus", async (orig) => ({ ...(await orig<typeof import("../../lib/plus")>()), plusEnabled: () => true }));
const account = vi.hoisted(() => ({ value: null as null | { available: boolean; plusReady: boolean; plus: boolean; openPaywall: ReturnType<typeof vi.fn> } }));
vi.mock("../../contexts/AccountContext", () => ({ useMaybeAccount: () => account.value }));

const { PlusName, PlusBadgeFor } = await import("./PlusBadge");
const { resetPlusBadges } = await import("../../lib/plusBadges");

const ADA = "0a1b2c3d-4e5f-6789-abcd-ef0123456789";
const BEN = "1a1b2c3d-4e5f-6789-abcd-ef0123456789";

beforeEach(() => {
  resetPlusBadges();
  rows.calls = [];
  rows.byId = [{ user_id: ADA, username_lower: "ada", plus_badge: true }, { user_id: BEN, username_lower: "ben", plus_badge: false }];
  rows.byName = [{ user_id: ADA, username_lower: "ada", plus_badge: true }];
  account.value = { available: true, plusReady: true, plus: false, openPaywall: vi.fn() };
});
afterEach(cleanup);

describe("PlusBadge", () => {
  it("badges only the names that wear it, looking every name on screen up in one query", async () => {
    render(
      <ul>
        <li><PlusName userId={ADA}>Ada</PlusName></li>
        <li><PlusName userId={BEN}>Ben</PlusName></li>
      </ul>,
    );
    expect(await screen.findAllByRole("button", { name: "Crossword Clash Plus member" })).toHaveLength(1);
    expect(rows.calls).toEqual([`user_id:${ADA},${BEN}`]);
    expect(screen.getByText("Ada").closest("span.whitespace-nowrap")).toBeTruthy();
    expect(screen.getByText("Ben").closest("span.whitespace-nowrap")).toBeNull();
  });

  it("finds a badge by username too, case-insensitively", async () => {
    render(<PlusBadgeFor username="Ada" />);
    expect(await screen.findByRole("button", { name: "Crossword Clash Plus member" })).toBeTruthy();
    expect(rows.calls).toEqual(["username_lower:ada"]);
  });

  it("says what it is on a tap, and offers Plus to a viewer without it", async () => {
    render(<PlusBadgeFor userId={ADA} />);
    fireEvent.click(await screen.findByRole("button", { name: "Crossword Clash Plus member" }));
    expect(screen.getByRole("dialog", { name: "Crossword Clash Plus member" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Get Plus" }));
    expect(account.value!.openPaywall).toHaveBeenCalledWith({ placement: "badge", feature: "badge" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("offers nothing more to a viewer who has Plus", async () => {
    account.value = { available: true, plusReady: true, plus: true, openPaywall: vi.fn() };
    render(<PlusBadgeFor userId={ADA} />);
    fireEvent.click(await screen.findByRole("button", { name: "Crossword Clash Plus member" }));
    expect(screen.queryByRole("button", { name: "Get Plus" })).toBeNull();
  });
});
