import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useMaybeAccount } from "./AccountContext";
import {
  blockUser,
  fetchBlocks,
  fetchFriendships,
  fetchInvites,
  friendsEnabled,
  inviteState,
  inviteToRoom,
  markInvitesSeen,
  removeFriend,
  respondFriendRequest,
  sendBeat,
  sendFriendRequest,
  subscribeInvites,
  unblockUser,
  type Friendships,
  type RequestOutcome,
  type RoomInvite,
} from "../lib/friends";
import { track } from "../lib/analytics";

export interface FriendsContextValue {
  /** The switch is on and the viewer is a signed-in account with a username. */
  active: boolean;
  /** False until the first load for this account answered (or failed). */
  ready: boolean;
  friendships: Friendships;
  /** Every invite the sweep still keeps, newest first. */
  invites: RoomInvite[];
  /** Invites still worth acting on: a waiting room under an hour old, or a beat link. */
  openInvites: RoomInvite[];
  /** Open invites the viewer has not dismissed or acted on. */
  unseenInvites: RoomInvite[];
  blocked: string[];
  refresh: () => Promise<void>;
  request: (username: string) => Promise<RequestOutcome>;
  respond: (requesterId: string, accept: boolean) => Promise<void>;
  remove: (otherId: string) => Promise<void>;
  block: (otherId: string) => Promise<void>;
  unblock: (otherId: string) => Promise<void>;
  invite: (gameId: string, friendId: string) => Promise<void>;
  beat: (friendId: string, link: string) => Promise<void>;
  markSeen: (ids: readonly string[]) => Promise<void>;
}

const EMPTY: Friendships = { friends: [], incoming: [], outgoing: [] };

const FriendsContext = createContext<FriendsContextValue | null>(null);

/**
 * Friends, requests and invites for the signed-in account (docs/friends-spec.md
 * phases a and b). Loads once the account has a username, again on every nudge
 * of the viewer's Realtime channel and whenever the tab comes back, and keeps
 * the lists in one place so the menu badge, the Race friends screen, the lobby
 * and the banner agree. Inert while the switch is off or the viewer is
 * anonymous.
 */
export function FriendsProvider({ children }: { children: React.ReactNode }) {
  const account = useMaybeAccount();
  const userId = account?.user?.id ?? null;
  const hasUsername = !!account?.profile;
  const active = friendsEnabled() && !!userId && hasUsername;

  const [friendships, setFriendships] = useState<Friendships>(EMPTY);
  const [invites, setInvites] = useState<RoomInvite[]>([]);
  const [blocked, setBlocked] = useState<string[]>([]);
  const [readyFor, setReadyFor] = useState<string | null>(null);
  // Re-renders once a minute while an open invite could expire, so the lists age without a reload.
  const [, setTick] = useState(0);

  const activeUser = active ? userId : null;
  const refresh = useCallback(async () => {
    if (!activeUser) return;
    const [f, i, b] = await Promise.all([
      fetchFriendships(activeUser).catch(() => EMPTY),
      fetchInvites(activeUser).catch(() => [] as RoomInvite[]),
      fetchBlocks(activeUser).catch(() => [] as string[]),
    ]);
    setFriendships(f);
    setInvites(i);
    setBlocked(b);
    setReadyFor(activeUser);
  }, [activeUser]);

  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;

  useEffect(() => {
    if (!activeUser) {
      setFriendships(EMPTY);
      setInvites([]);
      setBlocked([]);
      setReadyFor(null);
      return;
    }
    void refreshRef.current();
    const stop = subscribeInvites(activeUser, () => void refreshRef.current());
    const onVisible = () => {
      if (document.visibilityState === "visible") void refreshRef.current();
    };
    document.addEventListener("visibilitychange", onVisible);
    const timer = window.setInterval(() => setTick((n) => n + 1), 60_000);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisible);
      window.clearInterval(timer);
    };
  }, [activeUser]);

  // The screens report `friend_request_sent` themselves: they know whether the
  // request came from a search or from "people you have raced".
  const request = useCallback(async (username: string) => {
    const outcome = await sendFriendRequest(username);
    await refreshRef.current();
    return outcome;
  }, []);
  const respond = useCallback(async (requesterId: string, accept: boolean) => {
    await respondFriendRequest(requesterId, accept);
    track("friend_request_responded", { accepted: accept });
    await refreshRef.current();
  }, []);
  const remove = useCallback(
    async (otherId: string) => {
      if (!activeUser) return;
      await removeFriend(activeUser, otherId);
      track("friend_removed");
      await refreshRef.current();
    },
    [activeUser],
  );
  const block = useCallback(
    async (otherId: string) => {
      if (!activeUser) return;
      await blockUser(activeUser, otherId);
      track("player_blocked");
      await refreshRef.current();
    },
    [activeUser],
  );
  const unblock = useCallback(
    async (otherId: string) => {
      if (!activeUser) return;
      await unblockUser(activeUser, otherId);
      await refreshRef.current();
    },
    [activeUser],
  );
  const invite = useCallback(async (gameId: string, friendId: string) => {
    await inviteToRoom(gameId, friendId);
    track("room_invite_sent", { channel: "inapp", kind: "room" });
  }, []);
  const beat = useCallback(async (friendId: string, link: string) => {
    await sendBeat(friendId, link);
    track("room_invite_sent", { channel: "inapp", kind: "beat" });
  }, []);
  const markSeen = useCallback(async (ids: readonly string[]) => {
    if (ids.length === 0) return;
    const now = new Date().toISOString();
    setInvites((prev) => prev.map((i) => (ids.includes(i.id) && !i.seenAt ? { ...i, seenAt: now } : i)));
    await markInvitesSeen(ids).catch(() => undefined);
  }, []);

  const openInvites = useMemo(() => invites.filter((i) => inviteState(i) === "open"), [invites]);
  const unseenInvites = useMemo(() => openInvites.filter((i) => !i.seenAt), [openInvites]);

  const value = useMemo<FriendsContextValue>(
    () => ({
      active,
      ready: !active || readyFor === userId,
      friendships,
      invites,
      openInvites,
      unseenInvites,
      blocked,
      refresh,
      request,
      respond,
      remove,
      block,
      unblock,
      invite,
      beat,
      markSeen,
    }),
    [active, readyFor, userId, friendships, invites, openInvites, unseenInvites, blocked, refresh, request, respond, remove, block, unblock, invite, beat, markSeen],
  );

  return <FriendsContext.Provider value={value}>{children}</FriendsContext.Provider>;
}

const INERT: FriendsContextValue = {
  active: false,
  ready: true,
  friendships: EMPTY,
  invites: [],
  openInvites: [],
  unseenInvites: [],
  blocked: [],
  refresh: async () => {},
  request: async () => "sent",
  respond: async () => {},
  remove: async () => {},
  block: async () => {},
  unblock: async () => {},
  invite: async () => {},
  beat: async () => {},
  markSeen: async () => {},
};

/** The friends context; inert (never active) outside the provider, so screens need no guard. */
export function useFriends(): FriendsContextValue {
  return useContext(FriendsContext) ?? INERT;
}
