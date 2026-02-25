/**
 * Multiplayer and host session persistence via localStorage.
 * Allows players to rejoin games after page refresh.
 */

const MP_STORAGE_KEY = "crossword-clash-mp";
const HOST_STORAGE_KEY = "crossword-clash-host";

export interface MpSession {
  gameId: string;
  shareCode: string | null;
  displayName: string;
}

export interface HostSession {
  gameId: string;
  displayName: string;
}

export function loadMpSession(): MpSession | null {
  try {
    const raw = localStorage.getItem(MP_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed.gameId) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveMpSession(session: MpSession): void {
  localStorage.setItem(MP_STORAGE_KEY, JSON.stringify(session));
}

export function clearMpSession(): void {
  localStorage.removeItem(MP_STORAGE_KEY);
}

export function loadHostSession(): HostSession | null {
  try {
    const raw = localStorage.getItem(HOST_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed.gameId) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveHostSession(session: HostSession): void {
  localStorage.setItem(HOST_STORAGE_KEY, JSON.stringify(session));
}

export function clearHostSession(): void {
  localStorage.removeItem(HOST_STORAGE_KEY);
}
