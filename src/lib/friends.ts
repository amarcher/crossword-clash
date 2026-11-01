/**
 * Friends and room invites (docs/friends-spec.md, phases a and b): the launch
 * switch, the pure helpers the Race friends screen and the lobby build on, the
 * client wrappers for migration 20261101000000's RPCs, and the per-user
 * Realtime channel an invite's sender nudges so the recipient refetches.
 *
 * Pure parts (tested): `splitFriendships` (rows → friends / incoming /
 * outgoing), `inviteState` (open, started, closed, expired), `raceBlocks` (the
 * screen's block order by state, spec §3.6), `friendsErrorKind`, the pending
 * challenge store. The client functions wrap the tables and RPCs and map a
 * refusal's `friends:<code>` message to a `FriendsError`.
 */
import { supabase } from "./supabaseClient";
import type { Database } from "../types/supabase";

// --- Switch -----------------------------------------------------------------

/** VITE_FRIENDS=1: the /race routes, the menu row and the lobby's invite list exist only with it. */
export function friendsEnabled(env: { VITE_FRIENDS?: string } = import.meta.env as { VITE_FRIENDS?: string }): boolean {
  return env.VITE_FRIENDS === "1";
}

// --- Shapes -----------------------------------------------------------------

export type FriendshipRow = Database["public"]["Tables"]["friendships"]["Row"];
export type RoomInviteRow = Database["public"]["Tables"]["room_invites"]["Row"];

/** Another account, as the screens show it. */
export interface Person {
  userId: string;
  username: string;
}

export interface Friend extends Person {
  since: string;
}

export interface FriendRequest extends Person {
  /** When the request was made. */
  createdAt: string;
}

export interface Friendships {
  friends: Friend[];
  /** Requests made to the viewer, awaiting Accept / Decline. */
  incoming: FriendRequest[];
  /** Requests the viewer made, still pending. */
  outgoing: FriendRequest[];
}

export interface Opponent extends Person {
  games: number;
  lastAt: string;
}

/** An invite as the inbox and the banner show it. */
export interface RoomInvite {
  id: string;
  kind: "room" | "beat";
  from: Person;
  createdAt: string;
  seenAt: string | null;
  /** kind = room */
  room: { gameId: string; code: string; status: string; title: string; width: number; height: number } | null;
  /** kind = beat: the /daily/:day/:slot?beat=… path. */
  link: string | null;
}

export type InviteState = "open" | "started" | "closed" | "expired";

/** A room invite is stale once the room is gone or an hour has passed (a lobby older than that is dead to the invitee, spec §3.4). */
export const INVITE_OPEN_MS = 60 * 60 * 1000;

export function inviteState(invite: Pick<RoomInvite, "kind" | "room" | "createdAt">, now = Date.now()): InviteState {
  if (invite.kind === "beat") return "open";
  if (!invite.room) return "closed";
  if (invite.room.status === "active" || invite.room.status === "completed") return "started";
  if (invite.room.status !== "waiting") return "closed";
  return now - Date.parse(invite.createdAt) > INVITE_OPEN_MS ? "expired" : "open";
}

// --- Pure helpers -----------------------------------------------------------

interface FriendshipWithNames extends FriendshipRow {
  requester: { username: string } | null;
  recipient: { username: string } | null;
}

/** The viewer's rows → their friends and both directions of pending requests. */
export function splitFriendships(rows: readonly FriendshipWithNames[], viewerId: string): Friendships {
  const friends: Friend[] = [];
  const incoming: FriendRequest[] = [];
  const outgoing: FriendRequest[] = [];
  for (const row of rows) {
    const mine = row.requester_id === viewerId;
    const otherId = mine ? row.recipient_id : row.requester_id;
    const username = (mine ? row.recipient : row.requester)?.username;
    if (!username) continue;
    if (row.status === "accepted") friends.push({ userId: otherId, username, since: row.responded_at ?? row.created_at });
    else if (mine) outgoing.push({ userId: otherId, username, createdAt: row.created_at });
    else incoming.push({ userId: otherId, username, createdAt: row.created_at });
  }
  const byName = (a: Person, b: Person) => a.username.localeCompare(b.username);
  friends.sort(byName);
  const newest = (a: FriendRequest, b: FriendRequest) => b.createdAt.localeCompare(a.createdAt);
  incoming.sort(newest);
  outgoing.sort(newest);
  return { friends, incoming, outgoing };
}

export type RaceBlock = "invites" | "friends" | "addFriends" | "start" | "code" | "signIn";

/**
 * The Race friends screen's blocks in order, by state (spec §3.6): the most
 * useful block first. A newcomer sees the code; a player with friends sees
 * them; one with invites sees those.
 */
export function raceBlocks(state: { signedIn: boolean; friends: number; invites: number }): RaceBlock[] {
  if (!state.signedIn) return ["code", "start", "signIn"];
  if (state.friends === 0 && state.invites === 0) return ["code", "start", "addFriends"];
  if (state.invites > 0) return ["invites", "friends", "start", "code"];
  return ["friends", "start", "code"];
}

/** The daily challenge link an invite may carry (the only link the server accepts). */
export const BEAT_LINK = /^\/daily\/\d{4}-\d{2}-\d{2}\/(mini|midi|large)(\?[A-Za-z0-9=&%._+-]*)?$/;

// --- Pending challenge (Challenge → host flow → lobby) -------------------------

const PENDING_KEY = "crossword-clash:pending-challenge";

/** Remember which friend "Challenge" was tapped for, so the lobby invites them once the room exists. */
export function setPendingChallenge(friendId: string | null): void {
  try {
    if (friendId) sessionStorage.setItem(PENDING_KEY, friendId);
    else sessionStorage.removeItem(PENDING_KEY);
  } catch {
    // No storage: the host invites by hand from the lobby.
  }
}

export function takePendingChallenge(): string | null {
  try {
    const id = sessionStorage.getItem(PENDING_KEY);
    if (id) sessionStorage.removeItem(PENDING_KEY);
    return id;
  } catch {
    return null;
  }
}

// --- Errors -----------------------------------------------------------------

export type FriendsErrorKind =
  | "not_signed_in"
  | "no_username"
  | "not_found"
  | "self"
  | "cooldown"
  | "already_friends"
  | "already_requested"
  | "rate_limited"
  | "too_many"
  | "room_not_open"
  | "not_in_room"
  | "not_friends"
  | "already_invited"
  | "invalid"
  | "unconfigured"
  | "failed";

const KINDS: readonly FriendsErrorKind[] = [
  "not_signed_in", "no_username", "not_found", "self", "cooldown", "already_friends", "already_requested",
  "rate_limited", "too_many", "room_not_open", "not_in_room", "not_friends", "already_invited", "invalid",
];

export class FriendsError extends Error {
  readonly kind: FriendsErrorKind;
  constructor(kind: FriendsErrorKind, message: string = kind) {
    super(message);
    this.name = "FriendsError";
    this.kind = kind;
  }
}

export function friendsErrorKind(message: string | null | undefined): FriendsErrorKind {
  const code = /friends:([a-z_]+)/.exec(message ?? "")?.[1];
  return (KINDS as readonly string[]).includes(code ?? "") ? (code as FriendsErrorKind) : "failed";
}

function client() {
  if (!supabase) throw new FriendsError("unconfigured", "Supabase isn't configured in this build.");
  return supabase;
}

const refusal = (error: { message?: string } | null): FriendsError => new FriendsError(friendsErrorKind(error?.message), error?.message ?? "failed");

// --- Reads ------------------------------------------------------------------

const FRIENDSHIP_COLUMNS = "requester_id, recipient_id, status, created_at, responded_at, requester:profiles!friendships_requester_id_fkey(username), recipient:profiles!friendships_recipient_id_fkey(username)";

export async function fetchFriendships(viewerId: string): Promise<Friendships> {
  const { data, error } = await client()
    .from("friendships")
    .select(FRIENDSHIP_COLUMNS)
    .or(`requester_id.eq.${viewerId},recipient_id.eq.${viewerId}`);
  if (error) throw refusal(error);
  return splitFriendships((data ?? []) as unknown as FriendshipWithNames[], viewerId);
}

/** Usernames starting with the query (case-insensitive), the viewer excluded. */
export async function searchUsernames(query: string, viewerId: string, limit = 10): Promise<Person[]> {
  const q = query.trim().replace(/^@/, "").replace(/[^A-Za-z0-9_]/g, "");
  if (q.length < 2) return [];
  const { data, error } = await client()
    .from("profiles")
    .select("user_id, username")
    .ilike("username", `${q}%`)
    .neq("user_id", viewerId)
    .order("username")
    .limit(limit);
  if (error) throw refusal(error);
  return (data ?? []).map((row) => ({ userId: row.user_id, username: row.username }));
}

export async function fetchRecentOpponents(): Promise<Opponent[]> {
  const { data, error } = await client().rpc("recent_opponents", {});
  if (error) throw refusal(error);
  return (data ?? []).map((row) => ({ userId: row.user_id, username: row.username, games: row.games, lastAt: row.last_at }));
}

export async function fetchBlocks(viewerId: string): Promise<string[]> {
  const { data, error } = await client().from("blocks").select("blocked_id").eq("blocker_id", viewerId);
  if (error) throw refusal(error);
  return (data ?? []).map((row) => row.blocked_id);
}

const INVITE_COLUMNS =
  "id, kind, game_id, link, from_user_id, to_user_id, created_at, pushed_at, seen_at, sender:profiles!room_invites_from_user_id_fkey(username), game:games(short_code, status, puzzle:puzzles(title, width, height))";

interface InviteJoined extends RoomInviteRow {
  sender: { username: string } | null;
  game: { short_code: string | null; status: string; puzzle: { title: string; width: number; height: number } | null } | null;
}

export function toRoomInvite(row: InviteJoined): RoomInvite | null {
  if (!row.sender) return null;
  return {
    id: row.id,
    kind: row.kind,
    from: { userId: row.from_user_id, username: row.sender.username },
    createdAt: row.created_at,
    seenAt: row.seen_at,
    room:
      row.kind === "room" && row.game_id
        ? {
            gameId: row.game_id,
            code: row.game?.short_code ?? "",
            status: row.game?.status ?? "closed",
            title: row.game?.puzzle?.title ?? "",
            width: row.game?.puzzle?.width ?? 0,
            height: row.game?.puzzle?.height ?? 0,
          }
        : null,
    link: row.kind === "beat" ? row.link : null,
  };
}

/** The viewer's invites from the last week, newest first (the sweep deletes older ones). */
export async function fetchInvites(viewerId: string): Promise<RoomInvite[]> {
  const { data, error } = await client()
    .from("room_invites")
    .select(INVITE_COLUMNS)
    .eq("to_user_id", viewerId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw refusal(error);
  return ((data ?? []) as unknown as InviteJoined[]).map(toRoomInvite).filter((i): i is RoomInvite => i !== null);
}

// --- Writes -----------------------------------------------------------------

export type RequestOutcome = "pending" | "accepted" | "sent";

export async function sendFriendRequest(username: string): Promise<RequestOutcome> {
  const { data, error } = await client().rpc("send_friend_request", { p_username: username.trim().replace(/^@/, "") });
  if (error) throw refusal(error);
  return data ?? "sent";
}

export async function respondFriendRequest(requesterId: string, accept: boolean): Promise<void> {
  const { error } = await client().rpc("respond_friend_request", { p_requester: requesterId, p_accept: accept });
  if (error) throw refusal(error);
}

/** Unfriend, or cancel the viewer's own pending request (either party may delete the pair's row). */
export async function removeFriend(viewerId: string, otherId: string): Promise<void> {
  const { error } = await client()
    .from("friendships")
    .delete()
    .or(`and(requester_id.eq.${viewerId},recipient_id.eq.${otherId}),and(requester_id.eq.${otherId},recipient_id.eq.${viewerId})`);
  if (error) throw refusal(error);
}

/** Block: also drops any friendship, so the person leaves every list at once. */
export async function blockUser(viewerId: string, otherId: string): Promise<void> {
  const { error } = await client().from("blocks").insert({ blocker_id: viewerId, blocked_id: otherId });
  if (error && error.code !== "23505") throw refusal(error);
  await removeFriend(viewerId, otherId);
}

export async function unblockUser(viewerId: string, otherId: string): Promise<void> {
  const { error } = await client().from("blocks").delete().eq("blocker_id", viewerId).eq("blocked_id", otherId);
  if (error) throw refusal(error);
}

/** Returns the invite id, or null when a block swallowed it (the caller still shows "Invited"). */
export async function inviteToRoom(gameId: string, friendId: string): Promise<string | null> {
  const { data, error } = await client().rpc("invite_to_room", { p_game_id: gameId, p_friend: friendId });
  if (error) throw refusal(error);
  if (data) notifyInvite(friendId);
  return data ?? null;
}

export async function sendBeat(friendId: string, link: string): Promise<string | null> {
  if (!BEAT_LINK.test(link)) throw new FriendsError("invalid");
  const { data, error } = await client().rpc("send_beat", { p_friend: friendId, p_link: link });
  if (error) throw refusal(error);
  if (data) notifyInvite(friendId);
  return data ?? null;
}

export async function markInvitesSeen(ids: readonly string[]): Promise<void> {
  if (ids.length === 0) return;
  const { error } = await client().rpc("mark_invites_seen", { p_ids: [...ids] });
  if (error) throw refusal(error);
}

// --- The per-user channel -----------------------------------------------------

/**
 * A sender nudges the recipient's channel after a successful insert so an open
 * tab shows the banner at once. The message carries nothing the recipient
 * trusts: it only triggers a refetch of `room_invites` under RLS, so a forged
 * broadcast can at most cause one extra read.
 */
export const USER_CHANNEL_EVENT = "invites_changed";

export function userChannelName(userId: string): string {
  return `user:${userId}`;
}

export function notifyInvite(toUserId: string): void {
  if (!supabase) return;
  const channel = supabase.channel(userChannelName(toUserId));
  channel.subscribe((status) => {
    if (status !== "SUBSCRIBED") return;
    void channel.send({ type: "broadcast", event: USER_CHANNEL_EVENT, payload: {} }).finally(() => {
      void supabase?.removeChannel(channel);
    });
  });
}

/** Listen on the viewer's channel; `onChange` runs on every nudge. Returns a stop function. */
export function subscribeInvites(userId: string, onChange: () => void): () => void {
  if (!supabase) return () => {};
  const sb = supabase;
  const channel = sb.channel(userChannelName(userId));
  channel.on("broadcast", { event: USER_CHANNEL_EVENT }, () => onChange()).subscribe();
  return () => {
    void sb.removeChannel(channel);
  };
}

/** The in-app join path for a room invite (what the QR / app link also opens). */
export function inviteJoinPath(invite: RoomInvite): string | null {
  if (invite.kind === "beat") return invite.link;
  return invite.room?.code ? `/join?join=${encodeURIComponent(invite.room.code)}` : null;
}
