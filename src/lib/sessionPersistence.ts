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
 *
 * v2 added `savedAt`. A v1 payload has no timestamp, so its age is unknown
 * and it counts as expired: the stale lobbies this field exists to retire
 * are exactly the sessions written before it existed.
 */
const SESSION_VERSION = 2;

/** A room session older than this is ignored at cold start. */
export const MP_SESSION_MAX_AGE_MS = 12 * 60 * 60 * 1000;
/** A room that is still *waiting* is only auto-rejoined when the session is this young. */
export const MP_SESSION_RECENT_MS = 60 * 60 * 1000;

export interface MpSession {
  gameId: string;
  shareCode: string | null;
  displayName: string;
  /** When this device last saved or touched the session (ms since epoch). */
  savedAt: number;
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

function readMpPayload(): Partial<VersionedMpSession> | null {
  try {
    const raw = localStorage.getItem(MP_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<VersionedMpSession>;
    // v1 payloads are understood (not corrupt), just undated.
    if (parsed.version !== SESSION_VERSION && parsed.version !== 1) return null;
    if (!parsed.gameId || typeof parsed.displayName !== "string") return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * The saved room session, or null when there is none, it is unreadable, or
 * it is older than {@link MP_SESSION_MAX_AGE_MS}. Rooms that are abandoned
 * by closing the app are never cleaned up explicitly, so age is the only
 * thing that retires them.
 */
export function loadMpSession(now: number = Date.now()): MpSession | null {
  const parsed = readMpPayload();
  if (!parsed?.gameId || typeof parsed.displayName !== "string") return null;
  const savedAt = typeof parsed.savedAt === "number" && Number.isFinite(parsed.savedAt) ? parsed.savedAt : 0;
  if (now - savedAt > MP_SESSION_MAX_AGE_MS) return null;
  return {
    gameId: parsed.gameId,
    shareCode: parsed.shareCode ?? null,
    displayName: parsed.displayName,
    savedAt,
  };
}

/** True when the session was saved or touched within {@link MP_SESSION_RECENT_MS}. */
export function isRecentMpSession(session: Pick<MpSession, "savedAt">, now: number = Date.now()): boolean {
  return now - session.savedAt <= MP_SESSION_RECENT_MS;
}

/**
 * Save a room session. Re-saving the room that is already stored (the
 * contexts do this on every mount and on a name change) keeps its original
 * `savedAt`, so a cold start cannot refresh the very session it is about to
 * judge; a different room gets a fresh stamp. Use {@link touchMpSession} to
 * renew the stamp while the player is actually in the room.
 */
export function saveMpSession(session: Omit<MpSession, "savedAt"> & { savedAt?: number }, now: number = Date.now()): void {
  const stored = readMpPayload();
  const keep = stored && stored.gameId === session.gameId && typeof stored.savedAt === "number" ? stored.savedAt : null;
  const versioned: VersionedMpSession = {
    gameId: session.gameId,
    shareCode: session.shareCode,
    displayName: session.displayName,
    savedAt: session.savedAt ?? keep ?? now,
    version: SESSION_VERSION,
  };
  localStorage.setItem(MP_STORAGE_KEY, JSON.stringify(versioned));
}

/** Renew the stored session's `savedAt` (the player is in the room right now). No-op without a session. */
export function touchMpSession(now: number = Date.now()): void {
  const stored = readMpPayload();
  if (!stored?.gameId || typeof stored.displayName !== "string") return;
  const versioned: VersionedMpSession = {
    gameId: stored.gameId,
    shareCode: stored.shareCode ?? null,
    displayName: stored.displayName,
    savedAt: now,
    version: SESSION_VERSION,
  };
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
    // The host (TV) session never changed shape; v1 payloads are still current.
    if (parsed.version !== SESSION_VERSION && parsed.version !== 1) return null;
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
