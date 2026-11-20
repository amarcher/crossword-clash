// A start request lasts only until the play screen consumes it. Reloads and
// browser Forward restore paused; an explicit Play/Resume starts immediately.
let requestedKey: string | null = null;
export function requestSoloStart(key: string): void { requestedKey = key; }
/** The same answer without taking it: for the first frame, before the clock asks. */
export function peekSoloStart(key: string): boolean { return requestedKey === key; }
export function consumeSoloStart(key: string): boolean {
  const start = requestedKey === key;
  requestedKey = null;
  return start;
}
// "Play solo now" on Race friends: the start card has already been answered, so it goes straight to its count.
let soloChosen = false;
export function requestSoloChosen(): void { soloChosen = true; }
/** The same answer without taking it: for the first frame, before the clock asks. */
export function peekSoloChosen(): boolean { return soloChosen; }
export function consumeSoloChosen(): boolean {
  const chosen = soloChosen;
  soloChosen = false;
  return chosen;
}
export const SOLO_LANDING_KEY = "crossword-clash:solo-landing";
export function rememberSoloLanding(landing: "menu" | "play"): boolean {
  try { localStorage.setItem(SOLO_LANDING_KEY, landing); return true; } catch { return false; }
}
export function soloLandingIsMenu(): boolean {
  try { return localStorage.getItem(SOLO_LANDING_KEY) === "menu"; } catch { return false; }
}
