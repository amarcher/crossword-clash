import type { User } from "@supabase/supabase-js";
import { supabase } from "./supabaseClient";
import { isAccount } from "./account";

const KEY = "solo_leaderboard_enabled";

/** Account default is on; only an explicit opt-out disables automatic posting. */
export function soloLeaderboardEnabled(user: Pick<User, "user_metadata">): boolean {
  return user.user_metadata?.[KEY] !== false;
}

async function currentAccount(userId: string): Promise<User> {
  if (!supabase) throw new Error("Account unavailable");
  // Read the server, not a cached JWT: an opt-out on another device must be
  // honored before the next public result is written.
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  if (!isAccount(data.user) || data.user.id !== userId) throw new Error("Account changed");
  return data.user;
}

export async function fetchSoloLeaderboardPreference(userId: string): Promise<boolean> {
  return soloLeaderboardEnabled(await currentAccount(userId));
}

export async function saveSoloLeaderboardPreference(userId: string, enabled: boolean): Promise<void> {
  await currentAccount(userId);
  const { error } = await supabase!.auth.updateUser({ data: { [KEY]: enabled } });
  if (error) throw error;
}
