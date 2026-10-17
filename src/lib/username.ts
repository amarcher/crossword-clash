/**
 * Username rules, shared by the picker and the database check constraint
 * (supabase/migrations/*_profiles.sql): 3–20 characters, letters, digits and
 * underscores. Pure, so it is easy to test and safe to run on every keystroke.
 */
import { SUPPORTED_LANGS, tStatic } from "../i18n/i18n";

export const USERNAME_MIN = 3;
export const USERNAME_MAX = 20;
export const USERNAME_PATTERN = /^[A-Za-z0-9_]+$/;

/** Names that would impersonate the service or read as nobody in particular. */
const RESERVED = new Set(["admin", "administrator", "moderator", "mod", "support", "help", "system", "staff", "crosswordclash", "crossword_clash", "anonymous", "anon", "null", "undefined", "me", "you", "host", "player"]);

export type UsernameProblem = "tooShort" | "tooLong" | "invalidChars" | "reserved";

/** Trims and strips spaces so a pasted " Ada Lovelace " becomes "AdaLovelace". */
export function normalizeUsername(raw: string): string {
  return raw.replace(/\s+/g, "").slice(0, USERNAME_MAX + 1);
}

/** The first rule a username breaks, or null when it is fine. */
export function validateUsername(username: string): UsernameProblem | null {
  if (username.length < USERNAME_MIN) return "tooShort";
  if (username.length > USERNAME_MAX) return "tooLong";
  if (!USERNAME_PATTERN.test(username)) return "invalidChars";
  const lower = username.toLowerCase();
  if (RESERVED.has(lower)) return "reserved";
  // The anonymous default in any supported language ("Player", "Jugador") is not a username.
  if (SUPPORTED_LANGS.some((lng) => tStatic("common.defaultPlayerName", { lng }).toLowerCase() === lower)) return "reserved";
  return null;
}

/**
 * A starting point for the picker from the provider's display name: letters
 * and digits only, capped, and empty when nothing usable is left.
 */
export function suggestUsername(displayName: string | null | undefined): string {
  const base = (displayName ?? "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9_]+/g, "")
    .slice(0, USERNAME_MAX);
  return validateUsername(base) === null ? base : "";
}
