/**
 * Minimal Node typings for tests that read fixtures from disk (e.g. the
 * classic-library manifest integrity test). The app tsconfig deliberately
 * doesn't pull in @types/node — doing so leaks Node globals (Buffer, the
 * NodeJS.Timeout return type of setTimeout, …) into browser code. Only
 * what the tests actually call is declared here.
 */
declare module "node:fs" {
  export function readFileSync(path: string): ArrayBuffer;
  export function readdirSync(path: string): string[];
}
