/**
 * Sends play-insight records to Supabase `play_sessions`. Uses a keepalive
 * fetch straight to the REST endpoint (an upsert by id) so a record sent while
 * the page is closing still arrives; the auth token is cached ahead of time
 * because a closing page can't wait for it.
 */
import { Capacitor } from "@capacitor/core";
import { supabase } from "./supabaseClient";
import { analyticsAllowed } from "./consentStore";
import type { PlaySessionRecord } from "./playInsights";

let accessToken: string | null = null;
let watching = false;

/** Start caching the signed-in (anonymous) user's token. Safe to call repeatedly. */
export function watchPlayInsightsAuth(): void {
  if (watching || !supabase) return;
  watching = true;
  void supabase.auth.getSession().then(({ data }) => {
    accessToken = data.session?.access_token ?? accessToken;
  });
  supabase.auth.onAuthStateChange((_event, session) => {
    accessToken = session?.access_token ?? null;
  });
}

/** The apps have no consent banner; on the web, follow the visitor's analytics choice. */
export function playInsightsAllowed(): boolean {
  return import.meta.env.MODE === "mobile" || analyticsAllowed();
}

export function playClient(): PlaySessionRecord["client"] {
  const platform = Capacitor.getPlatform();
  return platform === "ios" || platform === "android" ? platform : "web";
}

/**
 * A short platform label for insights: the OS family and the browser, or
 * "<OS> app" inside the native apps. Pure given its inputs, so it is testable;
 * the defaults read the running browser.
 */
export function platformLabel(
  ua: string = typeof navigator === "undefined" ? "" : navigator.userAgent,
  touchPoints: number = typeof navigator === "undefined" ? 0 : navigator.maxTouchPoints || 0,
  native: boolean = Capacitor.isNativePlatform(),
): string {
  const os = /iPhone|iPod/.test(ua)
    ? "iOS"
    : /iPad/.test(ua) || (/Macintosh/.test(ua) && touchPoints > 1)
      ? "iPadOS"
      : /Android/.test(ua)
        ? "Android"
        : /CrOS/.test(ua)
          ? "ChromeOS"
          : /Windows/.test(ua)
            ? "Windows"
            : /Macintosh|Mac OS X/.test(ua)
              ? "macOS"
              : /Linux|X11/.test(ua)
                ? "Linux"
                : "Other";
  if (native) return `${os} app`;
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /SamsungBrowser/.test(ua)
      ? "Samsung"
      : /OPR\/|Opera/.test(ua)
        ? "Opera"
        : /Firefox|FxiOS/.test(ua)
          ? "Firefox"
          : /CriOS|Chrome\//.test(ua)
            ? "Chrome"
            : /Safari\//.test(ua)
              ? "Safari"
              : "Other";
  return `${os} ${browser}`;
}

/** One row for an insights table, as the signed-in (anonymous or not) user. Best effort; never throws. */
function postInsightRow(table: "play_sessions" | "narrator_sessions", row: Record<string, unknown>, upsert: boolean): void {
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  if (!url || !key || !accessToken || !playInsightsAllowed()) return;
  try {
    void fetch(`${url}/rest/v1/${table}${upsert ? "?on_conflict=id" : ""}`, {
      method: "POST",
      keepalive: true,
      headers: {
        "Content-Type": "application/json",
        apikey: key,
        Authorization: `Bearer ${accessToken}`,
        Prefer: upsert ? "resolution=merge-duplicates,return=minimal" : "return=minimal",
      },
      body: JSON.stringify(row),
    }).catch(() => undefined);
  } catch {
    // Unsupported keepalive or a closed page: the record is simply lost.
  }
}

export interface NarratorSessionRecord {
  game_id: string | null;
  puzzle_key: string;
  puzzle_title: string;
  requested_engine: string;
  engine: string;
  outcome: "connected" | "failed" | "budget";
  error: string;
}

/** Records one attempt to start the TV narrator (see narrator_sessions). */
export function sendNarratorSession(record: NarratorSessionRecord): void {
  postInsightRow(
    "narrator_sessions",
    { ...record, error: record.error.slice(0, 500), puzzle_title: record.puzzle_title.slice(0, 200), client: playClient(), platform: platformLabel().slice(0, 60) },
    false,
  );
}

/** Best effort; never throws. */
export function sendPlaySession(record: PlaySessionRecord): void {
  postInsightRow("play_sessions", { ...record, updated_at: new Date().toISOString() }, true);
}
