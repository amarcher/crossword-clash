/**
 * Who wears the Plus badge (docs/plus-expansion-spec.md §5; migration
 * 20261115000000_plus_badge.sql). `profiles.plus_badge` is public and derived
 * on the server (Plus and the owner's "Show my Plus badge"), so any name on
 * screen can ask for it by user id or by username. The lookups are batched
 * (every name rendered in the same tick goes in one query) and cached for the
 * session; a name with no profile simply has no badge.
 */
import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";
import { plusEnabled } from "./plus";

type Key = `id:${string}` | `name:${string}`;

const known = new Map<Key, boolean>();
const listeners = new Set<() => void>();
let pendingIds = new Set<string>();
let pendingNames = new Set<string>();
let scheduled = false;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function keyFor(who: { userId?: string | null; username?: string | null }): Key | null {
  if (who.userId && UUID.test(who.userId)) return `id:${who.userId}`;
  if (who.username) return `name:${who.username.toLowerCase()}`;
  return null;
}

async function flush(): Promise<void> {
  scheduled = false;
  const ids = [...pendingIds];
  const names = [...pendingNames];
  pendingIds = new Set();
  pendingNames = new Set();
  if (!supabase) return;
  const rows: { user_id: string; username_lower: string; plus_badge: boolean }[] = [];
  try {
    for (let i = 0; i < ids.length; i += 100) {
      const { data } = await supabase.from("profiles").select("user_id, username_lower, plus_badge").in("user_id", ids.slice(i, i + 100));
      rows.push(...((data ?? []) as typeof rows));
    }
    for (let i = 0; i < names.length; i += 100) {
      const { data } = await supabase.from("profiles").select("user_id, username_lower, plus_badge").in("username_lower", names.slice(i, i + 100));
      rows.push(...((data ?? []) as typeof rows));
    }
  } catch {
    // Offline: no badges this session for these names; asked again on the next mount.
    for (const id of ids) known.delete(`id:${id}`);
    for (const n of names) known.delete(`name:${n}`);
    return;
  }
  for (const id of ids) known.set(`id:${id}`, false);
  for (const n of names) known.set(`name:${n}`, false);
  for (const r of rows) {
    known.set(`id:${r.user_id}`, !!r.plus_badge);
    known.set(`name:${r.username_lower}`, !!r.plus_badge);
  }
  for (const listener of listeners) listener();
}

function request(key: Key): void {
  if (known.has(key)) return;
  known.set(key, false);
  if (key.startsWith("id:")) pendingIds.add(key.slice(3));
  else pendingNames.add(key.slice(5));
  if (!scheduled) {
    scheduled = true;
    queueMicrotask(() => void flush());
  }
}

/** Whether this person wears the Plus badge (false until known, and always while the Plus switch is off). */
export function usePlusBadge(who: { userId?: string | null; username?: string | null }): boolean {
  const key = plusEnabled() ? keyFor(who) : null;
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!key) return;
    const listener = () => setTick((n) => n + 1);
    listeners.add(listener);
    request(key);
    return () => {
      listeners.delete(listener);
    };
  }, [key]);
  return key ? known.get(key) === true : false;
}

/** The viewer changed their own badge (the account switch): show it at once, without a refetch. */
export function setKnownPlusBadge(who: { userId?: string | null; username?: string | null }, on: boolean): void {
  if (who.userId) known.set(`id:${who.userId}`, on);
  if (who.username) known.set(`name:${who.username.toLowerCase()}`, on);
  for (const listener of listeners) listener();
}

/** Tests: forget everything. */
export function resetPlusBadges(): void {
  known.clear();
  pendingIds = new Set();
  pendingNames = new Set();
  scheduled = false;
}

/** The account's "Show my Plus badge" switch. */
export async function setShowPlusBadge(userId: string, show: boolean): Promise<boolean> {
  if (!supabase) return false;
  const { data, error } = await supabase.from("profiles").update({ show_plus_badge: show }).eq("user_id", userId).select("plus_badge").maybeSingle();
  if (error) throw new Error(error.message);
  return !!(data as { plus_badge?: boolean } | null)?.plus_badge;
}

export async function fetchShowPlusBadge(userId: string): Promise<boolean> {
  if (!supabase) return true;
  const { data } = await supabase.from("profiles").select("show_plus_badge").eq("user_id", userId).maybeSingle();
  return (data as { show_plus_badge?: boolean } | null)?.show_plus_badge ?? true;
}
