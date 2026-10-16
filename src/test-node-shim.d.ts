/**
 * Minimal Node typings for tests that read fixtures from disk (e.g. the
 * classic-library manifest integrity test). The app tsconfig deliberately
 * doesn't pull in @types/node — doing so leaks Node globals (Buffer, the
 * NodeJS.Timeout return type of setTimeout, …) into browser code. Only
 * what the tests actually call is declared here.
 */
declare module "node:fs" {
  export function readFileSync(path: string): ArrayBuffer;
  export function readFileSync(path: string, encoding: "utf8"): string;
  export function readdirSync(path: string): string[];
  export function existsSync(path: string): boolean;
}

/** Only what the tests read: an opt-in flag for the slow production-list run. */
declare const process: { env: Record<string, string | undefined> };
