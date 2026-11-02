// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";

// A tiny PostgREST-shaped fake: every builder method returns the same
// chainable object, and the awaited result is whatever the test queued.
type Result = { data: unknown; error: { code?: string; message: string } | null };
const calls: { method: string; args: unknown[] }[] = [];
let nextResult: Result = { data: null, error: null };

function chain(): Record<string, unknown> {
  const self: Record<string, unknown> = {};
  for (const method of ["select", "eq", "neq", "limit", "upsert", "maybeSingle", "single"]) {
    self[method] = (...args: unknown[]) => {
      calls.push({ method, args });
      return self;
    };
  }
  self.then = (resolve: (r: Result) => unknown) => Promise.resolve(nextResult).then(resolve);
  return self;
}

let invokeError: Error | null = null;

vi.mock("./supabaseClient", () => ({
  supabase: {
    from: (table: string) => (calls.push({ method: "from", args: [table] }), chain()),
    functions: { invoke: (name: string, opts: unknown) => (calls.push({ method: "invoke", args: [name, opts] }), Promise.resolve({ data: null, error: invokeError })) },
    auth: {
      signOut: (opts: unknown) => (calls.push({ method: "signOut", args: [opts] }), Promise.resolve({ error: null })),
      getSession: () => (calls.push({ method: "getSession", args: [] }), Promise.resolve({ data: { session: sessionUser ? { user: sessionUser } : null } })),
      linkIdentity: (args: unknown) => (calls.push({ method: "linkIdentity", args: [args] }), Promise.resolve({ error: linkError })),
      signInWithOAuth: (args: unknown) => (calls.push({ method: "signInWithOAuth", args: [args] }), Promise.resolve({ error: null })),
      signInWithIdToken: (args: unknown) => (calls.push({ method: "signInWithIdToken", args: [args] }), Promise.resolve({ error: null })),
    },
  },
}));

// The OS sheet, already answered: the native path only needs its token.
vi.mock("./nativeSignIn", () => ({
  nativeIdToken: (provider: string) => Promise.resolve({ token: `id-token-${provider}`, nonce: "raw-nonce" }),
  nativeProviders: () => ["apple", "google"],
  nativeSignInAvailable: () => true,
}));

import {
  accountElsewhere,
  deleteAccount,
  fetchProfile,
  forgetKnownProvidersForTests,
  isKnownProvider,
  isUsernameTaken,
  resetSignInForTests,
  resumeSignIn,
  saveUsername,
  signInNatively,
  signInWith,
  signOut,
} from "./account";

let sessionUser: { is_anonymous: boolean; app_metadata?: { provider?: string } } | null = null;
let linkError: { code: string; message: string } | null = null;

beforeEach(() => {
  calls.length = 0;
  nextResult = { data: null, error: null };
  invokeError = null;
  sessionUser = null;
  linkError = null;
  forgetKnownProvidersForTests();
  resetSignInForTests();
  sessionStorage.clear();
  window.history.replaceState(null, "", "/menu");
});

const names = () => calls.map((c) => c.method);

describe("fetchProfile", () => {
  it("reads the public columns of the account's own row", async () => {
    nextResult = { data: { user_id: "u1", username: "ada", display_name: null }, error: null };
    await expect(fetchProfile("u1")).resolves.toEqual({ user_id: "u1", username: "ada", display_name: null });
    expect(calls[0]).toEqual({ method: "from", args: ["profiles"] });
    expect(calls.find((c) => c.method === "eq")?.args).toEqual(["user_id", "u1"]);
    expect(names()).toContain("maybeSingle");
  });

  it("is null before a username is chosen", async () => {
    await expect(fetchProfile("u1")).resolves.toBeNull();
  });

  it("throws on a query error", async () => {
    nextResult = { data: null, error: { message: "boom" } };
    await expect(fetchProfile("u1")).rejects.toEqual({ message: "boom" });
  });
});

describe("isUsernameTaken", () => {
  it("compares case-insensitively and ignores the account's own row", async () => {
    nextResult = { data: [], error: null };
    await expect(isUsernameTaken("Ada", "u1")).resolves.toBe(false);
    expect(calls.find((c) => c.method === "eq")?.args).toEqual(["username_lower", "ada"]);
    expect(calls.find((c) => c.method === "neq")?.args).toEqual(["user_id", "u1"]);
  });

  it("is true when another account holds the name", async () => {
    nextResult = { data: [{ user_id: "u2" }], error: null };
    await expect(isUsernameTaken("ada")).resolves.toBe(true);
    expect(names()).not.toContain("neq");
  });
});

describe("saveUsername", () => {
  it("upserts the account's row and returns the saved profile", async () => {
    nextResult = { data: { user_id: "u1", username: "ada", display_name: null }, error: null };
    const result = await saveUsername("u1", "ada");
    expect(result).toEqual({ ok: true, profile: { user_id: "u1", username: "ada", display_name: null } });
    expect(calls.find((c) => c.method === "upsert")?.args).toEqual([{ user_id: "u1", username: "ada" }, { onConflict: "user_id" }]);
  });

  it("maps the unique index to 'taken' and the check constraint to 'invalid'", async () => {
    nextResult = { data: null, error: { code: "23505", message: "duplicate key" } };
    await expect(saveUsername("u1", "ada")).resolves.toEqual({ ok: false, reason: "taken" });
    nextResult = { data: null, error: { code: "23514", message: "check violation" } };
    await expect(saveUsername("u1", "a b")).resolves.toEqual({ ok: false, reason: "invalid" });
  });

  it("passes other failures through with their message", async () => {
    nextResult = { data: null, error: { code: "42501", message: "new row violates row-level security policy" } };
    await expect(saveUsername("u1", "ada")).resolves.toEqual({ ok: false, reason: "error", message: "new row violates row-level security policy" });
  });
});

describe("deleteAccount", () => {
  it("deletes on the server, then drops the local session", async () => {
    await deleteAccount();
    expect(calls).toEqual([
      { method: "invoke", args: ["delete-account", { body: {} }] },
      { method: "signOut", args: [{ scope: "local" }] },
    ]);
  });

  it("stays signed in when the server refuses", async () => {
    invokeError = new Error("unauthorized");
    await expect(deleteAccount()).rejects.toThrow("unauthorized");
    expect(names()).not.toContain("signOut");
  });
});

describe("signInWith on the web", () => {
  it("links the provider to the anonymous user the first time (its history stays)", async () => {
    sessionUser = { is_anonymous: true };
    expect(await signInWith("google")).toBe("redirecting");
    expect(names()).toContain("linkIdentity");
    expect(names()).not.toContain("signInWithOAuth");
  });

  it("goes straight to sign-in once the provider is known to belong to an account on this device: one round trip, one chooser", async () => {
    sessionUser = { is_anonymous: false, app_metadata: { provider: "google" } };
    await signOut();
    expect(isKnownProvider("google")).toBe(true);
    expect(isKnownProvider("apple")).toBe(false);
    calls.length = 0;
    sessionUser = { is_anonymous: true };
    expect(await signInWith("google")).toBe("redirecting");
    expect(names()).not.toContain("linkIdentity");
    expect(names()).toContain("signInWithOAuth");
  });

  it("still links an unknown provider after a sign-out with another one", async () => {
    sessionUser = { is_anonymous: false, app_metadata: { provider: "google" } };
    await signOut();
    calls.length = 0;
    sessionUser = { is_anonymous: true };
    await signInWith("apple");
    expect(names()).toContain("linkIdentity");
  });
});


describe("accountElsewhere", () => {
  it("is the two refusals that mean the provider already has an account", () => {
    expect(accountElsewhere("identity_already_exists")).toBe(true);
    expect(accountElsewhere("email_exists")).toBe(true);
    expect(accountElsewhere("manual_linking_disabled")).toBe(false);
    expect(accountElsewhere(undefined)).toBe(false);
  });
});

describe("signInNatively", () => {
  const idTokenCall = () => calls.find((c) => c.method === "signInWithIdToken")?.args[0];

  it("links the OS sheet's token to the anonymous user the first time", async () => {
    sessionUser = { is_anonymous: true };
    expect(await signInNatively("apple")).toBe("signed-in");
    expect(names()).toContain("linkIdentity");
    expect(names()).not.toContain("signInWithIdToken");
  });

  it("signs in to the existing account when the identity's email already has one (Apple after Google)", async () => {
    // Supabase refuses to attach a new identity whose verified email belongs to another user;
    // the plain sign-in reaches that user, and automatic linking adds the identity to it.
    sessionUser = { is_anonymous: true };
    linkError = { code: "email_exists", message: "A user with this email address has already been registered" };
    expect(await signInNatively("apple")).toBe("signed-in");
    expect(names()).toEqual(expect.arrayContaining(["linkIdentity", "signInWithIdToken"]));
    expect(idTokenCall()).toEqual({ provider: "apple", token: "id-token-apple", nonce: "raw-nonce" });
    // Next time on this device: straight to sign-in.
    expect(isKnownProvider("apple")).toBe(true);
  });

  it("signs in to the existing account when the identity itself already has one", async () => {
    sessionUser = { is_anonymous: true };
    linkError = { code: "identity_already_exists", message: "Identity is already linked to another user" };
    expect(await signInNatively("google")).toBe("signed-in");
    expect(idTokenCall()).toEqual({ provider: "google", token: "id-token-google", nonce: "raw-nonce" });
    expect(isKnownProvider("google")).toBe(true);
  });

  it("surfaces any other link refusal and never falls back", async () => {
    sessionUser = { is_anonymous: true };
    linkError = { code: "manual_linking_disabled", message: "Manual linking is disabled" };
    await expect(signInNatively("apple")).rejects.toMatchObject({ code: "manual_linking_disabled" });
    expect(names()).not.toContain("signInWithIdToken");
    expect(isKnownProvider("apple")).toBe(false);
  });
});

describe("resumeSignIn on the web", () => {
  it("finishes a link refused for an existing email by signing in to that account", async () => {
    sessionStorage.setItem("crossword-clash:sign-in", "apple");
    sessionStorage.setItem("crossword-clash:sign-in-return", "/menu");
    window.history.replaceState(null, "", "/menu#error=server_error&error_code=email_exists&error_description=A+user+with+this+email+address+has+already+been+registered");
    expect(await resumeSignIn()).toEqual({ returned: true, error: null });
    const oauth = calls.find((c) => c.method === "signInWithOAuth")?.args[0] as { provider: string };
    expect(oauth.provider).toBe("apple");
    expect(isKnownProvider("apple")).toBe(true);
    expect(window.location.hash).toBe("");
  });

  it("shows any other refusal instead", async () => {
    sessionStorage.setItem("crossword-clash:sign-in", "apple");
    window.history.replaceState(null, "", "/menu#error=server_error&error_code=manual_linking_disabled&error_description=Manual+linking+is+disabled");
    const result = await resumeSignIn();
    expect(result.error).toContain("Manual linking is disabled");
    expect(names()).not.toContain("signInWithOAuth");
  });
});
