import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { fetchSpectatorRoom, type SpectatorRoom } from "../lib/spectatorService";
import type { RealtimeChannel } from "@supabase/supabase-js";

export function useSpectatorRoom(code: string, enabled: boolean) {
  const [room, setRoom] = useState<SpectatorRoom | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  useEffect(() => {
    setRoom(null);
    setLoading(true);
    setError(false);
    if (!enabled || !code || !supabase) return;
    const client = supabase;
    let disposed = false;
    let current: SpectatorRoom | null = null;
    let channel: RealtimeChannel | null = null;
    let subscribedId: string | null = null;
    let refreshing = false;
    let refreshAgain = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    // Broadcasts invalidate a read-only DB snapshot; they never write local
    // player state or grant this screen the ability to complete/close a game.
    const schedule = () => {
      if (disposed || timer) return;
      timer = setTimeout(() => { timer = undefined; void refresh(); }, 200);
    };
    const refresh = async () => {
      if (disposed) return;
      if (refreshing) { refreshAgain = true; return; }
      refreshing = true;
      try {
        const next = await fetchSpectatorRoom(code, current);
        if (disposed) return;
        if (!next) { setError(true); return; }
        current = next;
        setRoom(next);
        setError(false);
        if (subscribedId !== next.gameId) {
          if (channel) void client.removeChannel(channel);
          subscribedId = next.gameId;
          channel = client.channel(`game:${next.gameId}`);
          for (const event of ["cell_claimed", "game_started", "game_completed", "race_finished", "room_closed", "new_game"]) {
            channel.on("broadcast", { event }, schedule);
          }
          channel.on("presence", { event: "sync" }, schedule);
          channel.subscribe(status => { if (status === "SUBSCRIBED") schedule(); });
          // Deliberately no track(), player insert, or game control calls.
        }
      } catch { if (!disposed) setError(true); }
      finally {
        refreshing = false;
        if (!disposed) {
          setLoading(false);
          if (refreshAgain) { refreshAgain = false; schedule(); }
        }
      }
    };
    void refresh();
    const poll = setInterval(schedule, 15_000);
    const onVisible = () => { if (document.visibilityState === "visible") schedule(); };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", schedule);
    return () => {
      disposed = true;
      clearTimeout(timer);
      clearInterval(poll);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", schedule);
      if (channel) void client.removeChannel(channel);
    };
  }, [code, enabled]);
  return { room, loading, error };
}
