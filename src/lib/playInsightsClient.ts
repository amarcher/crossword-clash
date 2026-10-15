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

/** Best effort; never throws. */
export function sendPlaySession(record: PlaySessionRecord): void {
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  if (!url || !key || !accessToken || !playInsightsAllowed()) return;
  try {
    void fetch(`${url}/rest/v1/play_sessions?on_conflict=id`, {
      method: "POST",
      keepalive: true,
      headers: {
        "Content-Type": "application/json",
        apikey: key,
        Authorization: `Bearer ${accessToken}`,
        Prefer: "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify({ ...record, updated_at: new Date().toISOString() }),
    }).catch(() => undefined);
  } catch {
    // Unsupported keepalive or a closed page: the record is simply lost.
  }
}
