import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Browser, BrowserContext, Locator, Page } from "@playwright/test";

/** Escape a string for literal use inside a RegExp. */
function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * A grid cell by 0-based coordinates. Cells expose an accessible name like
 * "Row 1, Column 3, 12, A" (row/col, optional clue number, optional letter).
 */
export function gridCell(page: Page, row: number, col: number): Locator {
  const prefix = escapeRe(`Row ${row + 1}, Column ${col + 1}`);
  return page.getByRole("gridcell", { name: new RegExp(`^${prefix}(,|$)`) });
}

/** Matches a cell whose accessible name ends in a filled letter. */
export const FILLED = /, [A-Z]$/;

const AUTH_DIR = join(dirname(fileURLToPath(import.meta.url)), ".auth");
const isAuthKey = (k: string) => k.startsWith("sb-") && k.endsWith("-auth-token");

/**
 * A fresh browser context that reuses a previously saved anonymous Supabase
 * session for `role`, if any. Supabase rate-limits anonymous sign-ins per IP
 * (~30/hour by default), so minting two new users on every run quickly fails
 * with "Request rate limit reached". Only the sb-*-auth-token key is kept —
 * never game/session state, so each run still starts from a clean menu.
 */
export async function contextWithSavedAuth(browser: Browser, role: string): Promise<BrowserContext> {
  const file = join(AUTH_DIR, `${role}.json`);
  return browser.newContext(existsSync(file) ? { storageState: file } : {});
}

/**
 * Wait until supabase-js has an anonymous session, then save it for reuse.
 * Needed because some flows (e.g. JoinScreen's handleJoin) silently no-op
 * while `user` is still null, so a click before auth resolves does nothing.
 */
export async function waitForAnonAuth(page: Page, role: string): Promise<void> {
  let onConsole: ((msg: { text(): string }) => void) | undefined;
  const rateLimited = new Promise<never>((_, reject) => {
    onConsole = (msg) => {
      if (/Anonymous sign-in failed.*rate limit/i.test(msg.text())) {
        reject(
          new Error(
            `Supabase anonymous sign-in rate limit hit for "${role}" — wait a while and retry (see e2e/README.md)`,
          ),
        );
      }
    };
    page.on("console", onConsole);
  });
  try {
    await Promise.race([
      page.waitForFunction(
        () => Object.keys(localStorage).some((k) => k.startsWith("sb-") && k.endsWith("-auth-token")),
        undefined,
        { timeout: 20_000 },
      ),
      rateLimited,
    ]);
  } finally {
    if (onConsole) page.off("console", onConsole);
  }

  const state = await page.context().storageState();
  const origins = state.origins
    .map((o) => ({ ...o, localStorage: o.localStorage.filter((e) => isAuthKey(e.name)) }))
    .filter((o) => o.localStorage.length > 0);
  mkdirSync(AUTH_DIR, { recursive: true });
  writeFileSync(join(AUTH_DIR, `${role}.json`), JSON.stringify({ cookies: [], origins }, null, 2));
}
