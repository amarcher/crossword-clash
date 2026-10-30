/**
 * Sign in with Apple / Google in the NATIVE apps (docs/monetization-spec.md
 * §3.5): the webview cannot host the providers' web pages, so the Capgo
 * social-login plugin shows the OS sheet and hands back an OpenID Connect id
 * token, which account.ts gives to Supabase (`linkIdentity` with the token to
 * keep the anonymous uid, or `signInWithIdToken`). The plugin is imported
 * dynamically behind the mobile-mode switch, so the web bundle never carries
 * it.
 *
 * Configuration (build-time env, all public ids):
 *   VITE_GOOGLE_WEB_CLIENT_ID   the Web client id (Android, and iOS's server id)
 *   VITE_GOOGLE_IOS_CLIENT_ID   the iOS client id (its reversed id is the URL scheme in Info.plist)
 * Apple needs no id here (the bundle id is the client id); the app needs the
 * "Sign in with Apple" capability and Supabase must list the bundle id among
 * the Apple client ids. docs/plus-setup.md §3 has the steps.
 */
import { Capacitor } from "@capacitor/core";
import type { AuthProvider } from "./account";

export interface NativeIdToken {
  token: string;
  /** The raw nonce the token was requested with, which Supabase checks against the token's hashed nonce. */
  nonce: string;
}

interface NativeSignInEnv {
  MODE?: string;
  VITE_GOOGLE_WEB_CLIENT_ID?: string;
  VITE_GOOGLE_IOS_CLIENT_ID?: string;
}

/**
 * Which providers this native build can offer: Apple on iOS always (the
 * capability is the only requirement), Google wherever its client ids are set.
 */
export function nativeProviders(env: NativeSignInEnv = import.meta.env as NativeSignInEnv, platform: string = Capacitor.getPlatform()): AuthProvider[] {
  if (env.MODE !== "mobile" || (platform !== "ios" && platform !== "android")) return [];
  const providers: AuthProvider[] = [];
  if (platform === "ios") providers.push("apple");
  if (env.VITE_GOOGLE_WEB_CLIENT_ID && (platform === "android" || env.VITE_GOOGLE_IOS_CLIENT_ID)) providers.push("google");
  return providers;
}

/** Whether this build can sign in natively at all (so accounts can be offered in the app). */
export function nativeSignInAvailable(): boolean {
  return nativeProviders().length > 0;
}

type SocialLoginModule = typeof import("@capgo/capacitor-social-login");
type SocialLogin = SocialLoginModule["SocialLogin"];
let plugin: Promise<SocialLoginModule> | null = null;

/**
 * The initialized plugin module. No promise here may resolve with the
 * `SocialLogin` object itself: a Capacitor plugin is a Proxy that answers
 * every property, `then` included, with a native-method wrapper, so a promise
 * resolved with it is taken for a thenable and never settles (see
 * nativePurchase.ts, where the 1.1.0 build 10 paywall froze on this). The
 * module namespace object has no `then`, so it is what the promise carries.
 */
async function socialLogin(): Promise<{ sl: SocialLogin }> {
  // The static switch lets Rollup drop the import (and the plugin's chunk) from web builds.
  if (import.meta.env.MODE !== "mobile") throw new Error("Native sign-in is only available in the apps.");
  if (!plugin) {
    plugin = import("@capgo/capacitor-social-login").then(async (m) => {
      const env = import.meta.env as NativeSignInEnv;
      // Apple only on iOS: the plugin's Android implementation of Sign in with Apple goes through
      // a web redirect and refuses an `apple` section without `redirectUrl` ("apple.android.redirectUrl
      // is null or empty" stopped every Google sign-in on Android in 1.1.0 build 6). Apple is never
      // offered on Android (`nativeProviders`), so the section is simply left out there.
      await m.SocialLogin.initialize({
        ...(Capacitor.getPlatform() === "ios" ? { apple: { clientId: "com.crosswordclash.app" } } : {}),
        ...(env.VITE_GOOGLE_WEB_CLIENT_ID
          ? { google: { webClientId: env.VITE_GOOGLE_WEB_CLIENT_ID, iOSClientId: env.VITE_GOOGLE_IOS_CLIENT_ID, iOSServerClientId: env.VITE_GOOGLE_WEB_CLIENT_ID, mode: "online" as const } }
          : {}),
      });
      return m;
    });
  }
  return { sl: (await plugin).SocialLogin };
}

/** A random nonce. The provider is asked to sign its SHA-256 (`hashNonce`) into the id token; Supabase gets the raw value. */
export function randomNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * SHA-256 of the nonce as lowercase hex: what the OS sign-in request carries.
 * Supabase's id-token grant hashes the raw `nonce` it is given the same way and
 * compares that to the token's `nonce` claim, and the Capgo plugin hands the
 * request nonce to Apple and Google unchanged, so the hash has to be made here
 * (1.1.0 build 12 sent the raw value both ways: "Nonces mismatch").
 */
export async function hashNonce(nonce: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(nonce));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Shows the OS sign-in sheet and returns the provider's id token. Throws "cancelled" when the user backs out. */
export async function nativeIdToken(provider: AuthProvider): Promise<NativeIdToken> {
  const nonce = randomNonce();
  const hashed = await hashNonce(nonce);
  const { sl } = await socialLogin();
  let result: { result?: unknown };
  try {
    result = await sl.login({ provider, options: { scopes: provider === "apple" ? ["email", "name"] : ["email", "profile"], nonce: hashed } });
  } catch (err) {
    if (err && typeof err === "object" && ((err as { code?: string }).code === "USER_CANCELLED" || /cancel/i.test(String((err as { message?: string }).message)))) {
      const cancelled = new Error("cancelled") as Error & { cause?: unknown };
      cancelled.cause = err;
      throw cancelled;
    }
    throw err;
  }
  // Both providers' online responses carry `idToken`; Google's offline mode (not used here) carries none.
  const token = (result.result as { idToken?: string | null } | undefined)?.idToken;
  if (!token) throw new Error("The provider returned no identity token.");
  return { token, nonce };
}

/** Test hook. */
export function resetNativeSignInForTests(): void {
  plugin = null;
}
