import { expect, test, type Page } from "@playwright/test";
import { FILLED, contextWithSavedAuth, gridCell, waitForAnonAuth } from "./helpers";

// Needs a real Supabase project (anonymous auth + Realtime). Creates a real
// room on whatever project VITE_SUPABASE_URL points at. Not run in CI.
test.skip(!process.env.VITE_SUPABASE_URL, "VITE_SUPABASE_URL not set — multiplayer E2E needs Supabase");

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

/** First white cell of the grid on this page (row-major). */
async function firstWhiteCell(page: Page): Promise<{ row: number; col: number }> {
  const cell = page.getByRole("grid").first().getByRole("gridcell").first();
  const name = (await cell.getAttribute("aria-label")) ?? "";
  const m = name.match(/^Row (\d+), Column (\d+)/);
  if (!m) throw new Error(`Unexpected cell label: ${name}`);
  return { row: Number(m[1]) - 1, col: Number(m[2]) - 1 };
}

test("multiplayer: host and player race, claims sync across clients", async ({ browser }) => {
  // Two isolated contexts = two separate anonymous Supabase users.
  const hostCtx = await contextWithSavedAuth(browser, "host");
  const playerCtx = await contextWithSavedAuth(browser, "player");
  const host = await hostCtx.newPage();
  const player = await playerCtx.newPage();

  try {
    // Host: menu → Race friends → name → lobby.
    await host.goto("/menu");
    await waitForAnonAuth(host, "host");
    await host.getByRole("button", { name: /Race friends/i }).click();
    await expect(host).toHaveURL(/\/host-game\/name/);
    await host.getByRole("textbox", { name: /Your name/i }).fill("E2E Host");
    await host.getByRole("button", { name: /Create Room/i }).click();

    const codeButton = host.getByRole("button", { name: /Click to copy/i });
    await expect(codeButton).toBeVisible({ timeout: 20_000 });
    const code = ((await codeButton.textContent()) ?? "").match(/[A-Z0-9]{6}/)?.[0];
    expect(code, "lobby should show a 6-char share code").toBeTruthy();

    // Player: /join → name + code → lobby.
    await player.goto("/join");
    await waitForAnonAuth(player, "player");
    await player.getByLabel(/Your Name/i).fill("E2E Player");
    await player.getByLabel(/Game Code/i).fill(code!);
    await player.getByRole("button", { name: /^Join Game$/i }).click();
    await expect(player.getByText(/Waiting for host/i)).toBeVisible({ timeout: 20_000 });

    // Host sees the player and starts.
    await expect(host.getByText("E2E Player")).toBeVisible({ timeout: 20_000 });
    const start = host.getByRole("button", { name: /^Start Game$/i });
    await expect(start).toBeEnabled();
    await start.click();

    // Both land on the grid.
    await expect(host.getByRole("grid").first()).toBeVisible({ timeout: 20_000 });
    await expect(player.getByRole("grid").first()).toBeVisible({ timeout: 20_000 });

    // Player claims the first white cell. Multiplayer rejects wrong letters (no
    // lockout by default), so cycle A–Z until the claim sticks — no need to
    // know the solution.
    const { row, col } = await firstWhiteCell(player);
    const playerCell = gridCell(player, row, col);
    for (const letter of LETTERS) {
      await playerCell.click();
      await player.keyboard.press(letter);
      const label = (await playerCell.getAttribute("aria-label")) ?? "";
      if (FILLED.test(label)) break;
    }
    await expect(playerCell).toHaveAccessibleName(FILLED);
    const letter = ((await playerCell.getAttribute("aria-label")) ?? "").slice(-1);

    // Host sees the same letter arrive over Realtime.
    await expect(gridCell(host, row, col)).toHaveAccessibleName(new RegExp(`, ${letter}$`), {
      timeout: 15_000,
    });
  } finally {
    await hostCtx.close();
    await playerCtx.close();
  }
});
