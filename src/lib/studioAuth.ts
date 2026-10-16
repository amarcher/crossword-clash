/**
 * Studio sign-in (Apple or Google). Players stay anonymous; only the studio
 * offers an account. A browser that already has an anonymous player gets the
 * provider linked to that same user, so nothing it played is orphaned; if the
 * provider account already exists, linking fails on the way back and we sign
 * in to that account instead.
 */
import type { User } from "@supabase/supabase-js";
import { supabase } from "./supabaseClient";

export type StudioProvider = "apple" | "google";

const PENDING_KEY = "crossword-clash:studio-sign-in";

export function isAccount(user: User | null | undefined): user is User {
  return !!user && !user.is_anonymous;
}

/** A name to show for the signed-in account. */
export function accountName(user: User): string {
  const meta = user.user_metadata as { full_name?: string; name?: string } | undefined;
  return meta?.full_name || meta?.name || user.email || "Signed in";
}

function client() {
  if (!supabase) throw new Error("Supabase isn't configured in this build.");
  return supabase;
}

const returnUrl = () => window.location.origin + window.location.pathname;

function setPending(provider: StudioProvider | null) {
  try {
    if (provider) sessionStorage.setItem(PENDING_KEY, provider);
    else sessionStorage.removeItem(PENDING_KEY);
  } catch {
    // Without it, an "already exists" return just shows the error.
  }
}

function pending(): StudioProvider | null {
  try {
    const value = sessionStorage.getItem(PENDING_KEY);
    return value === "apple" || value === "google" ? value : null;
  } catch {
    return null;
  }
}

/** Which providers are switched on in Supabase (its public auth settings). */
export async function fetchEnabledProviders(): Promise<Record<StudioProvider, boolean>> {
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  const none = { apple: false, google: false };
  if (!url || !key) return none;
  try {
    const res = await fetch(`${url}/auth/v1/settings`, { headers: { apikey: key } });
    const body = (await res.json()) as { external?: Partial<Record<StudioProvider, boolean>> };
    return { apple: !!body.external?.apple, google: !!body.external?.google };
  } catch {
    // Unknown: offer both and let the provider page answer.
    return { apple: true, google: true };
  }
}

/** Starts the provider's sign-in; the page navigates away on success. */
export async function signInToStudio(provider: StudioProvider): Promise<void> {
  const auth = client().auth;
  const options = { redirectTo: returnUrl() };
  const { data } = await auth.getSession();
  if (data.session?.user.is_anonymous) {
    setPending(provider);
    const { error } = await auth.linkIdentity({ provider, options });
    if (!error) return;
    // Manual linking off, or some other refusal: a plain sign-in still works.
    setPending(null);
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

/**
 * Call once when the studio opens: finishes a link that came back "identity
 * already exists" by signing in to that account, and returns any other
 * sign-in error to show. Clears the error from the address bar.
 */
export async function resumeStudioSignIn(): Promise<string | null> {
  const error = readAuthError(window.location.href);
  const provider = pending();
  setPending(null);
  if (!error) return null;
  window.history.replaceState(null, "", window.location.pathname);
  if (error.code === "identity_already_exists" && provider) {
    const { error: signInError } = await client().auth.signInWithOAuth({ provider, options: { redirectTo: returnUrl() } });
    return signInError ? signInError.message : null;
  }
  return error.code === "access_denied" ? null : `Sign-in didn't finish: ${error.description}`;
}

export async function signOutOfStudio(): Promise<void> {
  await client().auth.signOut();
}

/** Whether a signed-in user is a studio admin (RLS shows only their own row). */
export async function fetchIsStudioAdmin(userId: string): Promise<boolean> {
  const { data, error } = await client().from("studio_admins").select("user_id").eq("user_id", userId).maybeSingle();
  return !error && !!data;
}

/**
 * Headers for the studio edge functions: the signed-in account's access token
 * when there is one (admins need no studio token), else the anon key, plus the
 * studio token if this browser has one.
 */
export async function studioHeaders(token: string): Promise<Record<string, string>> {
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
  const session = supabase ? (await supabase.auth.getSession()).data.session : null;
  const bearer = session && !session.user.is_anonymous ? session.access_token : key;
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${bearer}`,
    apikey: key,
    ...(token ? { "x-studio-token": token } : {}),
  };
}
