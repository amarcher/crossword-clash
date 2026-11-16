/**
 * An account's small preferences, kept with the account (Andrew, 2026-11-16:
 * signing in means the same data on every device). Three device stores are
 * mirrored to the `account_preferences` table, one row per preference:
 * the solo play settings, the hidden community authors and the board's
 * Friends-only switch.
 *
 * - `startPrefsSync(userId)` pushes a preference when its store changes.
 * - `pullPrefs(userId)` reads the account's rows: a stored value replaces
 *   the device's (the account is the truth); a preference the account has
 *   never stored takes the device's when that differs from the default, so a
 *   guest's choices come along at sign-in.
 *
 * A guest's preferences stay in the browser only. A refused or failed call
 * is logged and the device keeps what it has.
 */
import { supabase } from "./supabaseClient";
import { readFriendsOnly, subscribeFriendsOnly, writeFriendsOnly } from "./boardPrefs";
import { loadHiddenAuthors, setHiddenAuthors, subscribeHiddenAuthors } from "./hiddenAuthors";
import { DEFAULT_SOLO_SETTINGS, loadSoloSettings, sanitizeSoloSettings, saveSoloSettings, subscribeSoloSettings } from "./soloSettings";

interface Binding {
  key: "solo_settings" | "hidden_authors" | "board_friends_only";
  read: () => unknown;
  /** Take the account's value; anything malformed falls back inside the store. */
  apply: (value: unknown) => void;
  isDefault: () => boolean;
  subscribe: (listener: () => void) => () => void;
}

export const PREF_BINDINGS: readonly Binding[] = [
  {
    key: "solo_settings",
    read: loadSoloSettings,
    apply: (v) => saveSoloSettings(sanitizeSoloSettings(v)),
    isDefault: () => JSON.stringify(loadSoloSettings()) === JSON.stringify(DEFAULT_SOLO_SETTINGS),
    subscribe: subscribeSoloSettings,
  },
  {
    key: "hidden_authors",
    read: loadHiddenAuthors,
    apply: (v) => setHiddenAuthors(Array.isArray(v) ? v.filter((id): id is string => typeof id === "string") : []),
    isDefault: () => loadHiddenAuthors().length === 0,
    subscribe: subscribeHiddenAuthors,
  },
  {
    key: "board_friends_only",
    read: readFriendsOnly,
    apply: (v) => writeFriendsOnly(v === true),
    isDefault: () => !readFriendsOnly(),
    subscribe: subscribeFriendsOnly,
  },
];

let syncUser: string | null = null;
let unsubscribes: (() => void)[] = [];
/** True while a pulled value is being written to a store, so it is not pushed straight back. */
let applying = false;

async function push(userId: string, binding: Binding): Promise<void> {
  if (!supabase) return;
  try {
    const { error } = await supabase
      .from("account_preferences")
      .upsert({ user_id: userId, key: binding.key, value: binding.read(), updated_at: new Date().toISOString() }, { onConflict: "user_id,key" });
    if (error) throw error;
  } catch (err) {
    console.warn("Account preferences: could not save", binding.key, err);
  }
}

/** Mirror the device's preference stores for this account. Idempotent per user. */
export function startPrefsSync(userId: string): void {
  if (!supabase || syncUser === userId) return;
  stopPrefsSync();
  syncUser = userId;
  unsubscribes = PREF_BINDINGS.map((binding) =>
    binding.subscribe(() => {
      if (!applying) void push(userId, binding);
    }),
  );
}

export function stopPrefsSync(): void {
  unsubscribes.forEach((u) => u());
  unsubscribes = [];
  syncUser = null;
}

/** Bring the account's preferences to this device, and give the account any it has never stored. Never throws. */
export async function pullPrefs(userId: string): Promise<void> {
  if (!supabase) return;
  try {
    const { data, error } = await supabase.from("account_preferences").select("key, value").eq("user_id", userId);
    if (error) throw error;
    const stored = new Map(((data ?? []) as { key: string; value: unknown }[]).map((row) => [row.key, row.value]));
    for (const binding of PREF_BINDINGS) {
      if (stored.has(binding.key)) {
        const value = stored.get(binding.key);
        if (JSON.stringify(value) === JSON.stringify(binding.read())) continue;
        applying = true;
        try {
          binding.apply(value);
        } finally {
          applying = false;
        }
      } else if (!binding.isDefault()) {
        await push(userId, binding);
      }
    }
  } catch (err) {
    console.warn("Account preferences: could not read", err);
  }
}

/** Test hook. */
export function resetPrefsSyncForTests(): void {
  stopPrefsSync();
  applying = false;
}
