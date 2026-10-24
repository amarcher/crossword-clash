/**
 * Studio sign-in: the shared account module (`account.ts`) under the studio's
 * names, plus what only the studio needs (admin lookup, edge-function headers).
 * The studio's return trip comes back to /studio itself.
 */
import { supabase } from "./supabaseClient";
import { resumeSignIn, signInWith, signOut, type AuthProvider, type SignInOutcome } from "./account";

export { accountName, fetchEnabledProviders, isAccount, readAuthError } from "./account";
export type StudioProvider = AuthProvider;

function client() {
  if (!supabase) throw new Error("Supabase isn't configured in this build.");
  return supabase;
}

/** Starts the provider's sign-in; on the web the page navigates away on success. */
export function signInToStudio(provider: StudioProvider): Promise<SignInOutcome> {
  return signInWith(provider);
}

/**
 * Call once when the studio opens: finishes a link that came back "identity
 * already exists" by signing in to that account, and returns any other
 * sign-in error to show.
 */
export async function resumeStudioSignIn(): Promise<string | null> {
  return (await resumeSignIn()).error;
}

export function signOutOfStudio(): Promise<void> {
  return signOut();
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
