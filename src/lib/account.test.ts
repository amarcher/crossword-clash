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
    auth: { signOut: (opts: unknown) => (calls.push({ method: "signOut", args: [opts] }), Promise.resolve({ error: null })) },
  },
}));

import { deleteAccount, fetchProfile, isUsernameTaken, saveUsername } from "./account";

beforeEach(() => {
  calls.length = 0;
  nextResult = { data: null, error: null };
  invokeError = null;
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
