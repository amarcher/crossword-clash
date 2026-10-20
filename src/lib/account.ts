/**
 * Accounts: optional sign-in (Apple or Google) for solvers and the studio, plus
 * the public profile (username) that comes with one. Anonymous play stays the
 * default: nothing here is required to play.
 *
 * A browser that already has an anonymous player gets the provider linked to
 * that same user, so nothing it played is orphaned; if the provider account
 * already exists, linking fails on the way back and we sign in to that
 * account instead (see resumeSignIn).
 */
import type { User } from "@supabase/supabase-js";
import { supabase } from "./supabaseClient";

export type AuthProvider = "apple" | "google";

export const AUTH_PROVIDERS: AuthProvider[] = ["apple", "google"];

const PENDING_KEY = "crossword-clash:sign-in";
/** Marks the page the sign-in started from, so the return trip can finish there. */
const RETURN_KEY = "crossword-clash:sign-in-return";

export function isAccount(user: User | null | undefined): user is User {
  return !!user && !user.is_anonymous;
}

/** A name to show for the signed-in account when there is no username yet. */
export function accountName(user: User): string {
  const meta = user.user_metadata as { full_name?: string; name?: string } | undefined;
  return meta?.full_name || meta?.name || user.email || "Signed in";
}

function client() {
  if (!supabase) throw new Error("Supabase isn't configured in this build.");
  return supabase;
}

/**
 * Whether this build can offer an account at all: Supabase is configured and
 * this is the website. The native apps stay anonymous for now: their webview
 * can't host the provider's sign-in page (Google refuses embedded webviews,
 * and Apple expects its native sheet there).
 */
export function accountsAvailable(): boolean {
  return !!supabase && import.meta.env.MODE !== "mobile";
}

function remember(key: string, value: string | null) {
  try {
    if (value) sessionStorage.setItem(key, value);
    else sessionStorage.removeItem(key);
  } catch {
    // Without it, an "already exists" return just shows the error.
  }
}

function recall(key: string): string | null {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function pendingProvider(): AuthProvider | null {
  const value = recall(PENDING_KEY);
  return value === "apple" || value === "google" ? value : null;
}

/** Which providers are switched on in Supabase (its public auth settings). */
export async function fetchEnabledProviders(): Promise<Record<AuthProvider, boolean>> {
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  const none = { apple: false, google: false };
  if (!url || !key) return none;
  try {
    const res = await fetch(`${url}/auth/v1/settings`, { headers: { apikey: key } });
    const body = (await res.json()) as { external?: Partial<Record<AuthProvider, boolean>> };
    return { apple: !!body.external?.apple, google: !!body.external?.google };
  } catch {
    // Unknown: offer both and let the provider page answer.
    return { apple: true, google: true };
  }
}

/**
 * Starts the provider's sign-in; the page navigates away on success and comes
 * back to `returnTo` (default: the current page). Pass `returnTo: "/menu"` from a
 * screen that cannot finish a sign-in itself (for example a play screen), so
 * the menu, which calls resumeSignIn, picks it up.
 */
export async function signInWith(provider: AuthProvider, opts: { returnTo?: string } = {}): Promise<void> {
  const auth = client().auth;
  const path = opts.returnTo ?? window.location.pathname;
  const options = { redirectTo: window.location.origin + path };
  remember(RETURN_KEY, path);
  const { data } = await auth.getSession();
  if (data.session?.user.is_anonymous) {
    remember(PENDING_KEY, provider);
    const { error } = await auth.linkIdentity({ provider, options });
    if (!error) return;
    // Manual linking off, or some other refusal: a plain sign-in still works.
    remember(PENDING_KEY, null);
  }
  const { error } = await auth.signInWithOAuth({ provider, options });
  if (error) throw error;
}

/** The OAuth error the provider round trip came back with, if any. */
export function readAuthError(url: string): { code: string; description: string } | null {
  const parsed = new URL(url);
  const params = new URLSearchParams(parsed.hash.replace(/^#/, ""));
  for (const [key, value] of parsed.searchParams) if (!params.has(key)) params.set(key, value);
  const error = params.get("error");
  if (!error) return null;
  return { code: params.get("error_code") || error, description: (params.get("error_description") || error).replace(/\+/g, " ") };
}

export interface SignInReturn {
  /** True when this page load is the return trip of a sign-in started here. */
  returned: boolean;
  /** A sign-in error to show, or null. */
  error: string | null;
}

async function finishSignIn(): Promise<SignInReturn> {
  const error = readAuthError(window.location.href);
  const provider = pendingProvider();
  const returned = recall(RETURN_KEY) !== null;
  remember(PENDING_KEY, null);
  remember(RETURN_KEY, null);
  if (!error) return { returned, error: null };
  window.history.replaceState(null, "", window.location.pathname);
  if (error.code === "identity_already_exists" && provider) {
    const { error: signInError } = await client().auth.signInWithOAuth({ provider, options: { redirectTo: window.location.origin + window.location.pathname } });
    return { returned, error: signInError ? signInError.message : null };
  }
  return { returned, error: error.code === "access_denied" ? null : `Sign-in didn't finish: ${error.description}` };
}

let resumed: Promise<SignInReturn> | null = null;

/**
 * Call when the page a sign-in returns to opens: finishes a link that came
 * back "identity already exists" by signing in to that account, and returns
 * any other sign-in error to show. Clears the error from the address bar.
 * Answers once per page load, so every caller (the account provider, the
 * studio's top bar, React's double-invoked effects) sees the same result.
 */
export function resumeSignIn(): Promise<SignInReturn> {
  if (!resumed) resumed = finishSignIn();
  return resumed;
}

/**
 * Signs the account out. The app's anonymous session is gone with it; the
 * auth hook signs in anonymously again, so play continues with a fresh id.
 */
export async function signOut(): Promise<void> {
  await client().auth.signOut();
}

// ---- Profiles ----

export interface Profile {
  user_id: string;
  username: string;
  display_name: string | null;
}

const PROFILE_COLUMNS = "user_id, username, display_name";

/** The account's public profile, or null before a username is chosen. */
export async function fetchProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await client().from("profiles").select(PROFILE_COLUMNS).eq("user_id", userId).maybeSingle();
  if (error) throw error;
  return (data as Profile | null) ?? null;
}

/** Whether another account already holds this username (case-insensitive). */
export async function isUsernameTaken(username: string, exceptUserId?: string): Promise<boolean> {
  let query = client().from("profiles").select("user_id").eq("username_lower", username.toLowerCase());
  if (exceptUserId) query = query.neq("user_id", exceptUserId);
  const { data, error } = await query.limit(1);
  if (error) throw error;
  return (data?.length ?? 0) > 0;
}

export type SaveUsernameResult = { ok: true; profile: Profile } | { ok: false; reason: "taken" | "invalid" | "error"; message?: string };

/** Creates or renames the account's profile. Only non-anonymous users may have one (RLS). */
export async function saveUsername(userId: string, username: string): Promise<SaveUsernameResult> {
  const { data, error } = await client()
    .from("profiles")
    .upsert({ user_id: userId, username }, { onConflict: "user_id" })
    .select(PROFILE_COLUMNS)
    .single();
  if (error) {
    // 23505 = unique violation (the username), 23514 = the format check.
    if (error.code === "23505") return { ok: false, reason: "taken" };
    if (error.code === "23514") return { ok: false, reason: "invalid" };
    return { ok: false, reason: "error", message: error.message };
  }
  return { ok: true, profile: data as Profile };
}
