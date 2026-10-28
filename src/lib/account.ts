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
import { nativeIdToken, nativeProviders, nativeSignInAvailable } from "./nativeSignIn";

export type AuthProvider = "apple" | "google";

export const AUTH_PROVIDERS: AuthProvider[] = ["apple", "google"];

const PENDING_KEY = "crossword-clash:sign-in";
/** Marks the page the sign-in started from, so the return trip can finish there. */
const RETURN_KEY = "crossword-clash:sign-in-return";
/** Providers that have signed in to an existing account on this device (localStorage, JSON array). */
const KNOWN_KEY = "crossword-clash:known-providers";

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
 * either this is the website, or the native app has native sign-in set up
 * (nativeSignIn.ts: the OS sheets, since the webview can't host the
 * providers' pages — Google refuses embedded webviews, and Apple expects its
 * native sheet there). An app build without the client ids stays anonymous.
 */
export function accountsAvailable(): boolean {
  if (!supabase) return false;
  return import.meta.env.MODE !== "mobile" || nativeSignInAvailable();
}

/** The providers this build can offer: both on the web, what nativeSignIn.ts can show in the app. */
export function availableProviders(): AuthProvider[] {
  return import.meta.env.MODE === "mobile" ? nativeProviders() : AUTH_PROVIDERS;
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

/**
 * Whether this provider has already signed in to an existing account on this
 * device. A first sign-in links the provider to the anonymous user so its
 * history stays; once an identity is known to belong to an account, linking
 * can only come back "identity already exists" and cost a second OAuth round
 * trip (two Google account choosers in a row, the "double chooser" bug), so a
 * returning device signs straight in.
 */
export function isKnownProvider(provider: AuthProvider): boolean {
  try {
    const raw = localStorage.getItem(KNOWN_KEY);
    const list: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) && list.includes(provider);
  } catch {
    return false;
  }
}

export function rememberKnownProvider(provider: AuthProvider): void {
  try {
    const raw = localStorage.getItem(KNOWN_KEY);
    const list: unknown = raw ? JSON.parse(raw) : [];
    const next = Array.isArray(list) ? list.filter((p): p is AuthProvider => p === "apple" || p === "google") : [];
    if (!next.includes(provider)) next.push(provider);
    localStorage.setItem(KNOWN_KEY, JSON.stringify(next));
  } catch {
    // Storage unavailable: the next sign-in simply tries the link first again.
  }
}

/** Test hook. */
export function forgetKnownProvidersForTests(): void {
  try {
    localStorage.removeItem(KNOWN_KEY);
  } catch {
    // ignore
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

export type SignInOutcome =
  /** The browser is leaving for the provider; the return trip finishes the sign-in (resumeSignIn). */
  | "redirecting"
  /** Native: the OS sheet finished and the session is already updated. */
  | "signed-in"
  /** Native: the user dismissed the OS sheet. */
  | "cancelled";

/**
 * Starts the provider's sign-in. On the web the page navigates away on success
 * and comes back to `returnTo` (default: the current page); pass `returnTo:
 * "/menu"` from a screen that cannot finish a sign-in itself (for example a
 * play screen), so the menu, which calls resumeSignIn, picks it up. In the
 * native app the OS sheet answers in place (signInNatively) and the session
 * changes before this resolves.
 */
export async function signInWith(provider: AuthProvider, opts: { returnTo?: string } = {}): Promise<SignInOutcome> {
  if (import.meta.env.MODE === "mobile") return signInNatively(provider);
  const auth = client().auth;
  const path = opts.returnTo ?? window.location.pathname;
  const options = { redirectTo: window.location.origin + path };
  remember(RETURN_KEY, path);
  const { data } = await auth.getSession();
  if (data.session?.user.is_anonymous && !isKnownProvider(provider)) {
    remember(PENDING_KEY, provider);
    const { error } = await auth.linkIdentity({ provider, options });
    if (!error) return "redirecting";
    // Manual linking off, or some other refusal: a plain sign-in still works.
    remember(PENDING_KEY, null);
  }
  const { error } = await auth.signInWithOAuth({ provider, options });
  if (error) throw error;
  return "redirecting";
}

/**
 * The native path (docs/monetization-spec.md §3.5): the OS sheet's id token
 * is LINKED to the current anonymous user (`linkIdentity` with the token, so
 * the uid — and any Plus bought on it — stays); if that identity already has
 * an account (made on the web, say), the app signs in to it instead
 * (`signInWithIdToken`), and the uid changes. Needs "manual linking" on in
 * Supabase and the bundle id among the Apple client ids.
 */
export async function signInNatively(provider: AuthProvider): Promise<SignInOutcome> {
  const auth = client().auth;
  let token: string;
  let nonce: string;
  try {
    ({ token, nonce } = await nativeIdToken(provider));
  } catch (err) {
    if (err instanceof Error && err.message === "cancelled") return "cancelled";
    throw err;
  }
  const { data } = await auth.getSession();
  if (data.session?.user.is_anonymous && !isKnownProvider(provider)) {
    const { error } = await auth.linkIdentity({ provider, token, nonce });
    if (!error) return "signed-in";
    if (error.code !== "identity_already_exists") throw error;
    rememberKnownProvider(provider);
  }
  const { error } = await auth.signInWithIdToken({ provider, token, nonce });
  if (error) throw error;
  return "signed-in";
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
    // Next time on this device: straight to sign-in, one round trip.
    rememberKnownProvider(provider);
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
  // The account being left has a provider: a later sign-in with it on this
  // device goes straight to sign-in instead of a doomed link attempt.
  const { data } = await client().auth.getSession();
  const provider = data.session?.user.app_metadata?.provider;
  if (!data.session?.user.is_anonymous && (provider === "apple" || provider === "google")) rememberKnownProvider(provider);
  await client().auth.signOut();
}

/**
 * Permanently deletes the signed-in account and its data (the delete-account
 * edge function), then signs out here; play continues anonymously.
 */
export async function deleteAccount(): Promise<void> {
  const { error } = await client().functions.invoke("delete-account", { body: {} });
  if (error) throw error;
  // The server session is already gone; just drop the local one.
  await client().auth.signOut({ scope: "local" });
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
