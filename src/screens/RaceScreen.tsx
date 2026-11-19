import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Share2, Swords, UserPlus, Users } from "lucide-react";
import { useTransitionNavigate } from "../hooks/useTransitionNavigate";
import { PageShell } from "../components/PageShell";
import { Button, Card, Eyebrow, TransitionLink } from "../components/ui";
import { CodeJoinCard, PersonList, PersonRow, SendTimeButton, SolveChip } from "../components/Friends";
import { useBestTimes } from "../hooks/useSolveHistory";
import { useShareFriendLink } from "../components/Friends/InviteFriendCard";
import { useFriendSolves } from "../hooks/useFriendSolves";
import { useRaceCandidates } from "../hooks/useRace";
import { WatchSolveButton } from "../components/Race/WatchSolveButton";
import { puzzleIdentity } from "../lib/soloStats";
import { todayKey } from "../lib/dailyLeaderboard";
import { formatShareDay } from "../lib/shareBlock";
import { useAccountContext } from "../contexts/AccountContext";
import { useGame } from "../contexts/GameContext";
import { useFriends } from "../contexts/FriendsContext";
import { inviteJoinPath, raceBlocks, setPendingChallenge, solveChip, type RoomInvite } from "../lib/friends";
import { pickerPath } from "./PuzzlePickerScreen";
import { prefetchOnIntent } from "../routeModules";
import { track } from "../lib/analytics";

export const FRIENDS_PATH = "/race/friends";

/**
 * Race friends (docs/friends-spec.md §3.6): the one screen behind the menu's
 * row and the daily tile's Race friends button. Its blocks are ordered by
 * state (`raceBlocks`): invites from friends with Join, the friends list with
 * Challenge, Start a room, and an always-visible code field. A newcomer sees
 * the code first; the code is the fallback, not the front door. Deep links
 * never pass through here: a scanned QR still lands on /join with the code.
 */
export function RaceScreen() {
  const { t, i18n } = useTranslation();
  const navigate = useTransitionNavigate();
  const game = useGame();
  const account = useAccountContext();
  const friends = useFriends();

  const blocks = useMemo(
    () => raceBlocks({ signedIn: friends.active, friends: friends.friendships.friends.length, invites: friends.openInvites.length, requests: friends.friendships.incoming.length, puzzle: !!game.urlPuzzle }),
    [friends.active, friends.friendships.friends.length, friends.openInvites.length, friends.friendships.incoming.length, game.urlPuzzle],
  );

  // Start a room: the chip's puzzle goes to the host flow; otherwise the picker chooses one.
  // The daily chip's puzzle: friends who already finished it wear a chip on their Challenge row (spec §3.8).
  const puzzleKey = game.urlPuzzle ? puzzleIdentity(game.urlPuzzle) : null;
  const friendSolves = useFriendSolves(puzzleKey);
  // A friend who has finished it is not someone to bring into a live room: their row
  // offers their recorded solve instead (Watch), when one was kept.
  const candidates = useRaceCandidates(puzzleKey, !!puzzleKey);
  // And a puzzle the viewer has finished is no live race either: a friend who has not
  // solved it is sent the viewer's time to race, as from the finish screen.
  const bestTimes = useBestTimes();
  const ownSeconds = puzzleKey ? bestTimes[puzzleKey] : undefined;
  const recorded = useMemo(() => new Set(candidates.filter((c) => c.friend).map((c) => c.userId)), [candidates]);

  const startRoom = useCallback(
    (friendId: string | null) => {
      setPendingChallenge(friendId);
      track("race_action", { action: friendId ? "challenge" : "start", signed_in: friends.active });
      navigate(game.urlPuzzle ? "/host-game/name" : pickerPath("race"));
    },
    [game.urlPuzzle, friends.active, navigate],
  );

  const openInvite = useCallback(
    (invite: RoomInvite) => {
      const to = inviteJoinPath(invite);
      void friends.markSeen([invite.id]);
      track("room_invite_opened", { via: "inbox", kind: invite.kind });
      track("race_action", { action: "invite-join", signed_in: true });
      if (to) navigate(to);
    },
    [friends, navigate],
  );

  const signIn = () => {
    track("race_action", { action: "sign-in", signed_in: false });
    if (account.user && !account.profile) account.openAccount({ view: "username", placement: "race" });
    else account.openAccount({ placement: "race", returnTo: "/race" });
  };

  // A beat invite's line: today's daily, another day's, or a community puzzle.
  const beatDetail = (link: string | null) => {
    const daily = /^\/daily\/(\d{4}-\d{2}-\d{2})\//.exec(link ?? "");
    if (daily && daily[1] !== todayKey()) return t("race.inviteBeatDay", { date: formatShareDay(daily[1], i18n.language) });
    return link?.startsWith("/puzzles/") ? t("race.inviteBeatPuzzle") : t("race.inviteBeat");
  };

  const render = (block: (typeof blocks)[number], index: number) => {
    switch (block) {
      case "invites":
        return (
          <Card key={block} className="p-5">
            <Eyebrow as="h2">{t("race.invitesHeading")}</Eyebrow>
            <PersonList className="mt-3">
              {friends.openInvites.map((invite) => (
                <PersonRow
                  key={invite.id}
                  username={invite.from.username}
                  detail={
                    invite.kind === "room"
                      ? t("race.inviteRoom", { title: invite.room?.title ?? "", size: invite.room ? `${invite.room.width}×${invite.room.height}` : "" })
                      : beatDetail(invite.link)
                  }
                >
                  {invite.kind === "room" && (
                    <Button size="sm" variant="secondary" onClick={() => void friends.decline(invite, "inbox")}>
                      {t("friends.cantNow")}
                    </Button>
                  )}
                  <Button size="sm" onClick={() => openInvite(invite)} {...prefetchOnIntent(invite.kind === "room" ? "/join" : "/daily")}>
                    {invite.kind === "room" ? t("friends.join") : t("friends.beatIt")}
                  </Button>
                </PersonRow>
              ))}
            </PersonList>
          </Card>
        );
      case "friends":
        return (
          <Card key={block} className="p-5">
            <div className="flex items-center justify-between gap-3">
              <Eyebrow as="h2">{t("race.friendsHeading")}</Eyebrow>
              <TransitionLink to={FRIENDS_PATH} className="inline-flex min-h-11 items-center text-sm font-semibold text-brand-700 hover:underline">
                {friends.friendships.incoming.length > 0
                  ? t("race.manageWithRequests", { count: friends.friendships.incoming.length })
                  : t("race.manage")}
              </TransitionLink>
            </div>
            {friends.friendships.friends.length > 0 ? (
              <PersonList className="mt-3">
                {friends.friendships.friends.map((f) => (
                  <PersonRow key={f.userId} username={f.username}>
                    {/* "Watch" (the leaderboard rows' word) says they solved it; the chip stands alone only when no solve was kept to watch. */}
                    {game.urlPuzzle && puzzleKey && recorded.has(f.userId) ? (
                      <WatchSolveButton puzzle={game.urlPuzzle} puzzleKey={puzzleKey} friendId={f.userId} friendName={f.username} />
                    ) : solveChip(friendSolves[f.userId]) ? (
                      <SolveChip solve={friendSolves[f.userId]} />
                    ) : game.urlPuzzle?.ref && puzzleKey && typeof ownSeconds === "number" ? (
                      <SendTimeButton puzzle={game.urlPuzzle} puzzleKey={puzzleKey} linkRef={game.urlPuzzle.ref} seconds={ownSeconds} friendId={f.userId} friendName={f.username} />
                    ) : (
                      <Button size="sm" onClick={() => startRoom(f.userId)} {...prefetchOnIntent(game.urlPuzzle ? "/host-game/name" : "/pick-puzzle")}>
                        <Swords className="size-4" aria-hidden="true" />
                        {t("race.challenge")}
                      </Button>
                    )}
                  </PersonRow>
                ))}
              </PersonList>
            ) : (
              <p className="mt-2 text-sm text-muted">{t("race.noFriendsYet")}</p>
            )}
          </Card>
        );
      case "addFriends":
        return (
          <Card key={block} className="p-5">
            <div className="flex items-start gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-600">
                <UserPlus className="size-5" aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="font-semibold text-ink">{t("race.addFriendsTitle")}</h2>
                <p className="mt-1 text-sm text-muted">{t("race.addFriendsBody")}</p>
              </div>
            </div>
            <div className="mt-4 grid gap-2.5">
              {/* The quickest way to a first friend: send your own add-me link, no usernames to type. */}
              {account.profile && <ShareMyLink username={account.profile.username} />}
              <Button variant="secondary" size="lg" block onClick={() => { track("race_action", { action: "add-friend", signed_in: true }); navigate(FRIENDS_PATH); }}>
                {t("race.addFriends")}
              </Button>
            </div>
          </Card>
        );
      case "start":
        return (
          <Card key={block} className="flex items-center gap-3 p-4 pl-5">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-600">
              <Users className="size-5" aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="font-semibold text-ink">{t("race.startTitle")}</h2>
              {game.urlPuzzle && <p className="truncate text-sm text-muted">{game.urlPuzzle.title}</p>}
            </div>
            <Button variant={index === 0 ? "primary" : "secondary"} onClick={() => startRoom(null)} {...prefetchOnIntent(game.urlPuzzle ? "/host-game/name" : "/pick-puzzle")}>
              {t("race.start")}
            </Button>
          </Card>
        );
      case "code":
        return <CodeJoinCard key={block} onJoin={() => track("race_action", { action: "join-code", signed_in: friends.active })} />;
      case "signIn":
        return (
          <Card key={block} className="flex items-center gap-3 p-4 pl-5">
            <div className="min-w-0 flex-1">
              <h2 className="font-semibold text-ink">{t(account.user && !account.profile ? "race.usernameTitle" : "race.signInTitle")}</h2>
            </div>
            {account.available && (
              <Button variant="secondary" onClick={signIn}>
                {t(account.user && !account.profile ? "race.chooseUsername" : "race.signIn")}
              </Button>
            )}
          </Card>
        );
    }
  };

  return (
    <PageShell width="md" widthMd="5xl" widthLg="5xl" bar={{ backLabel: t("completion.backToMenu"), backTo: "/menu" }}>
      <header className="mb-5 pt-3">
        <h1 className="font-display text-3xl font-bold tracking-tight text-ink sm:text-4xl">{t("race.title")}</h1>
        {game.urlPuzzle && (
          <p className="mt-3 inline-flex max-w-full items-center gap-2 rounded-full bg-brand-50 px-3 py-1.5 text-sm font-semibold text-brand-700">
            <span className="truncate">{t("race.racingChip", { title: game.urlPuzzle.title })}</span>
            <button type="button" onClick={() => game.setUrlPuzzle(null)} className="-my-3 shrink-0 py-3 underline decoration-brand-200 underline-offset-2 hover:decoration-brand-500">
              {t("race.changePuzzle")}
            </button>
          </p>
        )}
      </header>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 md:block md:columns-2 md:gap-5 md:[&>*]:mb-5 md:[&>*]:break-inside-avoid" aria-busy={!friends.ready || undefined}>
        {blocks.map(render)}
      </div>
    </PageShell>
  );
}

/** "Share my link" on the add-friends prompt: the same add-me link as the Friends screen's invite card. */
function ShareMyLink({ username }: { username: string }) {
  const { t } = useTranslation();
  const { share, busy, note } = useShareFriendLink(username, "race");
  return (
    <>
      <Button size="lg" block onClick={() => void share()} disabled={busy} aria-busy={busy || undefined}>
        <Share2 className="size-4" aria-hidden="true" />
        {t("friends.linkShare")}
      </Button>
      {note && (
        <p role="status" className="text-center text-sm font-medium text-brand-700">
          {note}
        </p>
      )}
    </>
  );
}
