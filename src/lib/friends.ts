/**
 * Friends and room invites (docs/friends-spec.md, phases a, b and f): the launch
 * switch, the pure helpers the Race friends screen and the lobby build on, the
 * client wrappers for migration 20261101000000's RPCs, and the per-user
 * Realtime channel an invite's sender nudges so the recipient refetches.
 *
 * Pure parts (tested): `splitFriendships` (rows → friends / incoming /
 * outgoing), `inviteState` (open, started, closed, expired), `raceBlocks` (the
 * screen's block order by state, spec §3.6), `friendSuggestions` (the other
 * players of a finished room worth an "Add friend"), `friendsErrorKind`, the
 * pending challenge store, `lobbyInviteStatus` (Invited → Joined → Can't right
 * now). The client functions wrap the tables and RPCs and map a refusal's
 * `friends:<code>` message to a `FriendsError`.
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
  /** The invitee's "Can't now" (phase f); null until answered. */
  response: "declined" | null;
}

/** A room invite the viewer sent, as the lobby's invite list reads it back. */
export interface SentInvite {
  id: string;
  gameId: string;
  toUserId: string;
  createdAt: string;
  response: "declined" | null;
}

/** The host's "someone joined" notice (phase f), read back under RLS after a nudge on the host's channel. */
export interface RoomJoined {
  gameId: string;
  code: string;
  title: string;
  /** The joiner's username, or null for an anonymous player (never the typed display name). */
  joinerName: string | null;
  at: number;
}

export type InviteState = "open" | "started" | "closed" | "expired" | "declined";

/** A room invite is stale once the room is gone or an hour has passed (a lobby older than that is dead to the invitee, spec §3.4). */
export const INVITE_OPEN_MS = 60 * 60 * 1000;

export function inviteState(invite: Pick<RoomInvite, "kind" | "room" | "createdAt"> & Partial<Pick<RoomInvite, "response">>, now = Date.now()): InviteState {
  if (invite.response === "declined") return "declined";
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
export function raceBlocks(state: { signedIn: boolean; friends: number; invites: number; requests: number }): RaceBlock[] {
  if (!state.signedIn) return ["code", "start", "signIn"];
  // A pending request with no friends yet still needs the friends block: its
  // "N requests" link is where the request is answered.
  if (state.friends === 0 && state.invites === 0 && state.requests === 0) return ["code", "start", "addFriends"];
  if (state.invites > 0) return ["invites", "friends", "start", "code"];
  return ["friends", "start", "code"];
}

/**
 * The players of a finished room the viewer could add as friends (Andrew's
 * direction of 2026-11-02: players who meet by code should be nudged to link
 * up). `players` are the room's accounts with a username — anonymous players
 * have no profile row and never reach this — in standings order, which the
 * result keeps. Dropped: the viewer, anyone already a friend, anyone with a
 * request pending in either direction, anyone the viewer blocked, and a user
 * listed twice (a rejoin under another row).
 */
export function friendSuggestions(
  players: readonly Person[],
  friendships: Friendships,
  blocked: readonly string[],
  viewerId: string,
): Person[] {
  const skip = new Set<string>([viewerId, ...blocked]);
  for (const list of [friendships.friends, friendships.incoming, friendships.outgoing]) {
    for (const p of list) skip.add(p.userId);
  }
  const out: Person[] = [];
  for (const p of players) {
    if (skip.has(p.userId)) continue;
    skip.add(p.userId);
    out.push(p);
  }
  return out;
}

export type LobbyInviteStatus = "none" | "invited" | "joined" | "declined";

/**
 * What the lobby's invite list says beside a friend (spec §3.7): Joined once
 * they are in the roster (whatever the invite row says), "Can't right now" on
 * a declined invite, Invited while one is open, else the Invite button.
 */
export function lobbyInviteStatus(friendId: string, gameId: string, sent: readonly SentInvite[], roster: readonly { userId: string }[]): LobbyInviteStatus {
  if (roster.some((p) => p.userId === friendId)) return "joined";
  const row = sent.find((i) => i.gameId === gameId && i.toUserId === friendId);
  if (!row) return "none";
  return row.response === "declined" ? "declined" : "invited";
}

/**
 * The wait after the 1st, 2nd, 3rd, 4th and every later nudge of one away
 * spell (Andrew, 2026-11-02: back off, don't stay flat); mirrored by
 * `nudge_backoff` in `nudge_host()`. The first nudge of a spell is free.
 */
export const NUDGE_BACKOFF_MS: readonly number[] = [1, 2, 4, 8, 15].map((m) => m * 60 * 1000);

/** When the next nudge becomes available: now for a fresh spell, else the last nudge plus the ladder's step for that count. */
export function nextNudgeAt(count: number, lastAt: number | null): number {
  if (count <= 0 || lastAt === null) return 0;
  return lastAt + NUDGE_BACKOFF_MS[Math.min(count, NUDGE_BACKOFF_MS.length) - 1];
}

/** m:ss for the countdown ("Nudge again in 1:42"). */
export function formatCountdown(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
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
  | "too_soon"
  | "invalid"
  | "unconfigured"
  | "failed";

const KINDS: readonly FriendsErrorKind[] = [
  "not_signed_in", "no_username", "not_found", "self", "cooldown", "already_friends", "already_requested",
  "rate_limited", "too_many", "room_not_open", "not_in_room", "not_friends", "already_invited", "too_soon", "invalid",
];

export class FriendsError extends Error {
  readonly kind: FriendsErrorKind;
  /** `too_soon` only: how long the server says is left, from `friends:too_soon:<seconds>`. */
  readonly retryAfterSeconds: number | null;
  constructor(kind: FriendsErrorKind, message: string = kind) {
    super(message);
    this.name = "FriendsError";
    this.kind = kind;
    this.retryAfterSeconds = retryAfterSeconds(message);
  }
}

export function friendsErrorKind(message: string | null | undefined): FriendsErrorKind {
  const code = /friends:([a-z_]+)/.exec(message ?? "")?.[1];
  return (KINDS as readonly string[]).includes(code ?? "") ? (code as FriendsErrorKind) : "failed";
}

/** The seconds a `friends:too_soon:<n>` refusal carries; null for any other message. */
export function retryAfterSeconds(message: string | null | undefined): number | null {
  const m = /friends:too_soon:(\d+)/.exec(message ?? "");
  return m ? Number(m[1]) : null;
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

/** A friend's finish of a puzzle (spec §3.8): the mode it was solved in and the day; never a time. */
export interface FriendSolve {
  mode: string;
  day: string;
}

/**
 * Which of the caller's friends have already finished the puzzle, by user id
 * (the `friend_solves` RPC: accepted friends only, never a time). Empty for a
 * viewer with no account.
 */
export async function fetchFriendSolves(puzzleKey: string): Promise<Record<string, FriendSolve>> {
  const { data, error } = await client().rpc("friend_solves", { p_puzzle_key: puzzleKey });
  if (error) throw refusal(error);
  const out: Record<string, FriendSolve> = {};
  for (const row of (data ?? []) as { user_id: string; mode: string; completed_day: string }[]) out[row.user_id] = { mode: row.mode, day: row.completed_day };
  return out;
}

/** The chip a friend's finish earns beside an invite: solved on their own, or raced in a room. */
export function solveChip(solve: FriendSolve | undefined): "solved" | "raced" | null {
  if (!solve) return null;
  if (solve.mode === "import") return null;
  return solve.mode === "solo" ? "solved" : "raced";
}

export async function fetchRecentOpponents(): Promise<Opponent[]> {
  const { data, error } = await client().rpc("recent_opponents", {});
  if (error) throw refusal(error);
  return (data ?? []).map((row) => ({ userId: row.user_id, username: row.username, games: row.games, lastAt: row.last_at }));
}

/**
 * The usernames behind a room's user ids (profiles are public). An anonymous
 * player has no row and is simply absent; the answer keeps the ids' order so
 * a list built from it follows the standings.
 */
export async function fetchPlayerProfiles(userIds: readonly string[]): Promise<Person[]> {
  const ids = [...new Set(userIds)];
  if (ids.length === 0) return [];
  const { data, error } = await client().from("profiles").select("user_id, username").in("user_id", ids);
  if (error) throw refusal(error);
  const byId = new Map((data ?? []).map((row) => [row.user_id, row.username] as const));
  return ids.flatMap((id) => {
    const username = byId.get(id);
    return username ? [{ userId: id, username }] : [];
  });
}

export async function fetchBlocks(viewerId: string): Promise<string[]> {
  const { data, error } = await client().from("blocks").select("blocked_id").eq("blocker_id", viewerId);
  if (error) throw refusal(error);
  return (data ?? []).map((row) => row.blocked_id);
}

const INVITE_COLUMNS =
  "id, kind, game_id, link, from_user_id, to_user_id, created_at, pushed_at, seen_at, response, sender:profiles!room_invites_from_user_id_fkey(username), game:games(short_code, status, puzzle:puzzles(title, width, height))";

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
    response: row.response === "declined" ? "declined" : null,
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

/** The room invites the viewer sent in the last week (the sender side of the parties-read policy), newest first. */
export async function fetchSentInvites(viewerId: string): Promise<SentInvite[]> {
  const { data, error } = await client()
    .from("room_invites")
    .select("id, game_id, to_user_id, created_at, response")
    .eq("from_user_id", viewerId)
    .eq("kind", "room")
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw refusal(error);
  return (data ?? []).flatMap((row) =>
    row.game_id ? [{ id: row.id, gameId: row.game_id, toUserId: row.to_user_id, createdAt: row.created_at, response: row.response === "declined" ? ("declined" as const) : null }] : [],
  );
}

/**
 * Reads a room back after a `room_joined` nudge (phase f). The nudge's game id
 * is only a hint: the game must be the viewer's own waiting room (RLS lets
 * anyone read games, so the host id is checked here), the joiner is its newest
 * player row that is not the host, and the name is their public username.
 */
export async function fetchRoomJoined(gameId: string, hostId: string, now = Date.now()): Promise<RoomJoined | null> {
  const sb = client();
  const { data: game } = await sb.from("games").select("id, short_code, status, host_user_id, puzzle:puzzles(title)").eq("id", gameId).maybeSingle();
  const room = game as { id: string; short_code: string | null; status: string; host_user_id: string | null; puzzle: { title: string } | null } | null;
  if (!room || room.host_user_id !== hostId || room.status !== "waiting" || !room.short_code) return null;
  const { data: rows } = await sb.from("players").select("user_id").eq("game_id", gameId).neq("user_id", hostId).order("created_at", { ascending: false }).limit(1);
  const joiner = (rows as { user_id: string }[] | null)?.[0]?.user_id;
  if (!joiner) return null;
  const [profile] = await fetchPlayerProfiles([joiner]);
  return { gameId, code: room.short_code, title: room.puzzle?.title ?? "", joinerName: profile?.username ?? null, at: now };
}

// --- Writes -----------------------------------------------------------------

export type RequestOutcome = "pending" | "accepted" | "sent";

export async function sendFriendRequest(username: string): Promise<RequestOutcome> {
  const name = username.trim().replace(/^@/, "");
  const { data, error } = await client().rpc("send_friend_request", { p_username: name });
  if (error) throw refusal(error);
  // Nudge the recipient's channel so a Race friends screen they have open
  // shows the request at once (the row itself is read under RLS). Profiles are
  // public, so the id lookup needs no new access; a miss just skips the nudge.
  const { data: rows } = await client().from("profiles").select("user_id").eq("username_lower", name.toLowerCase()).limit(1);
  const recipient = (rows as { user_id?: string }[] | null)?.[0]?.user_id;
  if (recipient) notifyInvite(recipient);
  return data ?? "sent";
}

export async function respondFriendRequest(requesterId: string, accept: boolean): Promise<void> {
  const { error } = await client().rpc("respond_friend_request", { p_requester: requesterId, p_accept: accept });
  if (error) throw refusal(error);
  // The requester's lists only refetch on a nudge or a tab wake: without this
  // an accept showed up for them on the next relaunch (Andrew, 2026-11-03).
  // A decline tells them nothing, as the spec has it.
  if (accept) notifyInvite(requesterId);
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

/** "Can't now": the invitee declines an open room invite; the sender's channel is nudged so their lobby list updates. */
export async function declineRoomInvite(invite: Pick<RoomInvite, "id" | "from">): Promise<void> {
  const { error } = await client().rpc("respond_room_invite", { p_invite: invite.id, p_response: "declined" });
  if (error) throw refusal(error);
  notifyInvite(invite.from.userId);
}

export interface NudgeOutcome {
  /** The nudge id, or null when a block swallowed it (the caller still counts down). */
  id: string | null;
  /** The ladder's next wait, as the server computed it. */
  nextInSeconds: number;
}

/** "Nudge host" for the away spell that began at `spellStartedAt` (ms); a `too_soon` refusal carries `retryAfterSeconds`. */
export async function nudgeHost(gameId: string, spellStartedAt: number): Promise<NudgeOutcome> {
  const { data, error } = await client().rpc("nudge_host", { p_game_id: gameId, p_spell: new Date(spellStartedAt).toISOString() });
  if (error) throw refusal(error);
  const row = (data ?? {}) as { id?: string | null; nextInSeconds?: number };
  return { id: row.id ?? null, nextInSeconds: typeof row.nextInSeconds === "number" ? row.nextInSeconds : NUDGE_BACKOFF_MS[0] / 1000 };
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
/** The join path's nudge to the host (phase f): `{ gameId }`, a hint the host reads back with `fetchRoomJoined`. */
export const ROOM_JOINED_EVENT = "room_joined";

export function userChannelName(userId: string): string {
  return `user:${userId}`;
}

function nudgeChannel(toUserId: string, event: string, payload: Record<string, unknown>): void {
  if (!supabase) return;
  const channel = supabase.channel(userChannelName(toUserId));
  channel.subscribe((status) => {
    if (status !== "SUBSCRIBED") return;
    void channel.send({ type: "broadcast", event, payload }).finally(() => {
      void supabase?.removeChannel(channel);
    });
  });
}

export function notifyInvite(toUserId: string): void {
  nudgeChannel(toUserId, USER_CHANNEL_EVENT, {});
}

/** The join path tells the host someone arrived (the web's stand-in for the players push). */
export function notifyRoomJoined(hostUserId: string, gameId: string): void {
  nudgeChannel(hostUserId, ROOM_JOINED_EVENT, { gameId });
}

/** Listen on the viewer's channel; `onChange` runs on every nudge, `onRoomJoined` with the game id a joiner names. Returns a stop function. */
export function subscribeInvites(userId: string, onChange: () => void, onRoomJoined?: (gameId: string) => void): () => void {
  if (!supabase) return () => {};
  const sb = supabase;
  const channel = sb.channel(userChannelName(userId));
  channel.on("broadcast", { event: USER_CHANNEL_EVENT }, () => onChange());
  channel.on("broadcast", { event: ROOM_JOINED_EVENT }, (msg) => {
    const gameId = (msg as { payload?: { gameId?: unknown } } | undefined)?.payload?.gameId;
    if (typeof gameId === "string" && onRoomJoined) onRoomJoined(gameId);
  });
  channel.subscribe();
  return () => {
    void sb.removeChannel(channel);
  };
}

/** The in-app join path for a room invite (what the QR / app link also opens). */
export function inviteJoinPath(invite: RoomInvite): string | null {
  if (invite.kind === "beat") return invite.link;
  return invite.room?.code ? `/join?join=${encodeURIComponent(invite.room.code)}` : null;
}
