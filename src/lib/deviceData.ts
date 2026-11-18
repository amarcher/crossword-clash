/**
 * Whose play data this device holds (Andrew, 2026-11-16).
 *
 * Streaks, best times, puzzles in progress and the rest live in localStorage
 * under fixed keys, so they used to stay on screen for whoever opened the app
 * next: signed out, the phone still showed the account's streak and "your
 * time" on a board, beside a Sign in link. Now the data follows the account:
 *
 * - While an account is signed in, the device's play data is its own
 *   (`OWNER_KEY` names it). A guest's data is adopted by the account they sign
 *   in to, as before.
 * - When the account leaves (Sign out, or its session ended elsewhere), its
 *   data is put away in a vault under its id and the guest starts clean.
 * - When it signs in again its vault comes back. Anything the guest did in
 *   between is kept: a guest's value wins over the vault's, puzzles in
 *   progress merge newest first, and the guest's finishes are offered to the
 *   account's history again (solveHistory's once-per-device upload).
 *
 * Device preferences (language, consent, the push token) are not
 * play data and never move. React state is read from storage once, so every
 * change here ends in a page load.
 *
 * `settleDeviceData` is the pure rule over a Storage; `startDeviceData` wires
 * it to the session. Tested in deviceData.test.ts.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { mergeProgress, PROGRESS_KEY, sanitizeStore } from "./soloProgress";

export const OWNER_KEY = "crossword-clash:data-owner";
export const VAULT_PREFIX = "crossword-clash:vault:";
export const VAULTS_KEY = "crossword-clash:vaults";
/** Set when an account's data was put away: the menu says so once (SignedOutNotice). */
export const SIGNED_OUT_NOTICE_KEY = "crossword-clash:signed-out-notice";
/** Accounts whose put-away data a device keeps; the oldest goes first. */
export const MAX_VAULTS = 3;

const STATS_KEY = "crossword-clash-solo-stats";
const REPLAYS_KEY = "crossword-clash:replay-shares";
const UPLOADED_KEY = "crossword-clash:solves-uploaded";
const PROGRESS_UPLOADED_KEY = "crossword-clash:progress-uploaded";

/** The play data that belongs to whoever is signed in. */
export const ACCOUNT_KEYS: readonly string[] = [
  STATS_KEY,
  "crossword-clash-solo-timer",
  "crossword-clash-solo",
  PROGRESS_KEY,
  "crossword-clash:solo-landing",
  "crossword-clash:solve-trace",
  REPLAYS_KEY,
  "crossword-clash:race",
  "crossword-clash-challenge",
  "crossword-clash-mp",
  "crossword-clash:name",
  "crossword-clash:bonus-puzzles",
  "crossword-clash:board-friends-only",
  "crossword-clash:hidden-authors",
  "crossword-clash:solo-settings",
  "crossword-clash:studio",
  "crossword-clash:studio-puzzles",
];

type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;
interface VaultEntry {
  id: string;
  at: number;
}

const vaultKey = (id: string, key: string) => `${VAULT_PREFIX}${id}:${key}`;

function readVaults(store: Store): VaultEntry[] {
  try {
    const parsed: unknown = JSON.parse(store.getItem(VAULTS_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((v): v is VaultEntry => !!v && typeof v.id === "string" && typeof v.at === "number") : [];
  } catch {
    return [];
  }
}

function writeVaults(store: Store, vaults: VaultEntry[]): void {
  if (vaults.length === 0) store.removeItem(VAULTS_KEY);
  else store.setItem(VAULTS_KEY, JSON.stringify(vaults));
}

function dropVault(store: Store, id: string): void {
  for (const key of ACCOUNT_KEYS) store.removeItem(vaultKey(id, key));
}

/** Put the device's play data away under `id`. One key at a time, so storage never holds two whole copies. */
function stow(store: Store, id: string, now: number): void {
  for (const key of ACCOUNT_KEYS) {
    const value = store.getItem(key);
    store.removeItem(vaultKey(id, key));
    if (value === null) continue;
    try {
      store.setItem(vaultKey(id, key), value);
    } catch {
      // Storage full: the guest still starts clean; the account's history is on the server.
    }
    store.removeItem(key);
  }
  const vaults = [...readVaults(store).filter((v) => v.id !== id), { id, at: now }].sort((a, b) => b.at - a.at);
  for (const old of vaults.slice(MAX_VAULTS)) dropVault(store, old.id);
  writeVaults(store, vaults.slice(0, MAX_VAULTS));
}

/** A guest's value beside the vault's for one key: what the account gets. */
function merged(key: string, guest: string | null, vault: string): string {
  if (guest === null) return vault;
  try {
    if (key === PROGRESS_KEY) {
      const kept = Object.values(sanitizeStore(JSON.parse(vault)));
      return JSON.stringify(mergeProgress(sanitizeStore(JSON.parse(guest)), kept).next);
    }
    if (key === REPLAYS_KEY) return JSON.stringify({ ...(JSON.parse(vault) as object), ...(JSON.parse(guest) as object) });
  } catch {
    // Unreadable: the guest's, as for every other key.
  }
  return guest;
}

/** Bring `id`'s vault back, if it has one. */
function restore(store: Store, id: string): boolean {
  const vaults = readVaults(store);
  if (!vaults.some((v) => v.id === id)) return false;
  // The guest's own finishes and puzzles in progress are not in the account yet: let each upload run again.
  for (const [dataKey, flagKey] of [[STATS_KEY, UPLOADED_KEY], [PROGRESS_KEY, PROGRESS_UPLOADED_KEY]] as const) {
    if (store.getItem(dataKey) === null) continue;
    try {
      const ids: unknown = JSON.parse(store.getItem(flagKey) ?? "[]");
      if (Array.isArray(ids)) store.setItem(flagKey, JSON.stringify(ids.filter((u) => u !== id)));
    } catch {
      store.removeItem(flagKey);
    }
  }
  for (const key of ACCOUNT_KEYS) {
    const value = store.getItem(vaultKey(id, key));
    if (value === null) continue;
    try {
      store.setItem(key, merged(key, store.getItem(key), value));
    } catch {
      // Storage full: what is in place stays.
    }
    store.removeItem(vaultKey(id, key));
  }
  writeVaults(store, vaults.filter((v) => v.id !== id));
  return true;
}

export interface SessionUser {
  id: string;
  /** A real account, not the anonymous session every visitor has. */
  account: boolean;
}

/**
 * Make the device's play data match the session. Returns what the page must
 * do: nothing, load again where it is (an account's data came back), or start
 * over at the menu (an account's data was put away).
 * `discard`: the account was deleted, so its data is removed, not kept.
 */
export function settleDeviceData(store: Store, user: SessionUser | null, options: { now?: number; discard?: boolean } = {}): "none" | "reload" | "menu" {
  const now = options.now ?? Date.now();
  const owner = store.getItem(OWNER_KEY);
  if (user?.account) {
    if (owner === user.id) return "none";
    if (owner) stow(store, owner, now);
    const returned = restore(store, user.id);
    store.setItem(OWNER_KEY, user.id);
    store.removeItem(SIGNED_OUT_NOTICE_KEY);
    return returned || owner ? "reload" : "none";
  }
  if (!owner) return "none";
  if (options.discard) for (const key of ACCOUNT_KEYS) store.removeItem(key);
  else {
    stow(store, owner, now);
    store.setItem(SIGNED_OUT_NOTICE_KEY, "1");
  }
  store.removeItem(OWNER_KEY);
  return "menu";
}

let discardNext = false;
/** The account is being deleted: its data on this device goes with it at the sign-out that follows. */
export function discardDeviceDataOnSignOut(): void {
  discardNext = true;
}

/** Follow the session for the life of the page. */
export function startDeviceData(client: SupabaseClient): void {
  client.auth.onAuthStateChange((_event, session) => {
    const user = session?.user ? { id: session.user.id, account: !session.user.is_anonymous } : null;
    let verdict: ReturnType<typeof settleDeviceData> = "none";
    try {
      verdict = settleDeviceData(localStorage, user, { discard: discardNext });
    } catch {
      // No storage: nothing to keep apart.
    }
    discardNext = false;
    if (verdict === "reload") window.location.reload();
    else if (verdict === "menu") window.location.replace("/menu");
  });
}

/** Whether the menu should say an account was signed out here; `dismissSignedOutNotice` ends it. */
export function signedOutNoticePending(): boolean {
  try {
    return localStorage.getItem(SIGNED_OUT_NOTICE_KEY) !== null;
  } catch {
    return false;
  }
}

export function dismissSignedOutNotice(): void {
  try {
    localStorage.removeItem(SIGNED_OUT_NOTICE_KEY);
  } catch {
    // Nothing to forget.
  }
}
