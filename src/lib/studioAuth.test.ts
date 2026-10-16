import { describe, it, expect } from "vitest";
import type { User } from "@supabase/supabase-js";
import { accountName, isAccount, readAuthError } from "./studioAuth";

const user = (fields: Partial<User>) => ({ id: "u", app_metadata: {}, user_metadata: {}, aud: "authenticated", created_at: "", ...fields }) as User;

describe("readAuthError", () => {
  it("is null without an error", () => {
    expect(readAuthError("https://crosswordclash.com/studio")).toBeNull();
    expect(readAuthError("https://crosswordclash.com/studio#access_token=abc")).toBeNull();
  });

  it("reads an error from the query string", () => {
    expect(
      readAuthError("https://crosswordclash.com/studio?error=server_error&error_code=identity_already_exists&error_description=Identity+is+already+linked"),
    ).toEqual({ code: "identity_already_exists", description: "Identity is already linked" });
  });

  it("reads an error from the hash", () => {
    expect(readAuthError("http://localhost:5199/studio#error=access_denied&error_description=User%20cancelled")).toEqual({
      code: "access_denied",
      description: "User cancelled",
    });
  });
});

describe("accounts", () => {
  it("only counts non-anonymous users", () => {
    expect(isAccount(null)).toBe(false);
    expect(isAccount(user({ is_anonymous: true }))).toBe(false);
    expect(isAccount(user({ is_anonymous: false }))).toBe(true);
  });

  it("names the account from provider metadata, then email", () => {
    expect(accountName(user({ user_metadata: { full_name: "Ada Lovelace" }, email: "ada@example.com" }))).toBe("Ada Lovelace");
    expect(accountName(user({ email: "ada@example.com" }))).toBe("ada@example.com");
  });
});
