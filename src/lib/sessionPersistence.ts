/**
 * Multiplayer and host session persistence via localStorage.
 * Allows players to rejoin games after page refresh.
 */

const MP_STORAGE_KEY = "crossword-clash-mp";
const HOST_STORAGE_KEY = "crossword-clash-host";

/**
 * Bump when changing the on-disk shape. loadXxxSession() treats payloads
 * with a missing or non-matching version as corrupt and returns null
 * (the caller then clears localStorage on the rejoin-fail path).
 */
const SESSION_VERSION = 1;

export interface MpSession {
  gameId: string;
  shareCode: string | null;
  displayName: string;
}

export interface HostSession {
  gameId: string;
}

interface VersionedMpSession extends MpSession {
  version: number;
}
interface VersionedHostSession extends HostSession {
  version: number;
}

export function loadMpSession(): MpSession | null {
  try {
    const raw = localStorage.getItem(MP_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<VersionedMpSession>;
    if (parsed.version !== SESSION_VERSION) return null;
    if (!parsed.gameId || typeof parsed.displayName !== "string") return null;
    return {
      gameId: parsed.gameId,
      shareCode: parsed.shareCode ?? null,
      displayName: parsed.displayName,
    };
  } catch {
    return null;
  }
}

export function saveMpSession(session: MpSession): void {
  const versioned: VersionedMpSession = { ...session, version: SESSION_VERSION };
  localStorage.setItem(MP_STORAGE_KEY, JSON.stringify(versioned));
}

export function clearMpSession(): void {
  localStorage.removeItem(MP_STORAGE_KEY);
}

export function loadHostSession(): HostSession | null {
  try {
    const raw = localStorage.getItem(HOST_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<VersionedHostSession>;
    if (parsed.version !== SESSION_VERSION) return null;
    if (!parsed.gameId) return null;
    return { gameId: parsed.gameId };
  } catch {
    return null;
  }
}

export function saveHostSession(session: HostSession): void {
  const versioned: VersionedHostSession = { ...session, version: SESSION_VERSION };
  localStorage.setItem(HOST_STORAGE_KEY, JSON.stringify(versioned));
}

export function clearHostSession(): void {
  localStorage.removeItem(HOST_STORAGE_KEY);
}
