import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Swords, UserPlus, Users } from "lucide-react";
import { useTransitionNavigate } from "../hooks/useTransitionNavigate";
import { PageShell } from "../components/PageShell";
import { Button, Card, Eyebrow, TransitionLink } from "../components/ui";
import { CodeJoinCard, PersonList, PersonRow } from "../components/Friends";
import { useAccountContext } from "../contexts/AccountContext";
import { useGame } from "../contexts/GameContext";
import { useFriends } from "../contexts/FriendsContext";
import { inviteJoinPath, raceBlocks, setPendingChallenge, type RoomInvite } from "../lib/friends";
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
  const { t } = useTranslation();
  const navigate = useTransitionNavigate();
  const game = useGame();
  const account = useAccountContext();
  const friends = useFriends();

  const blocks = useMemo(
    () => raceBlocks({ signedIn: friends.active, friends: friends.friendships.friends.length, invites: friends.openInvites.length }),
    [friends.active, friends.friendships.friends.length, friends.openInvites.length],
  );

  // Start a room: the chip's puzzle goes to the host flow; otherwise the picker chooses one.
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
                      : t("race.inviteBeat")
                  }
                >
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
                    <Button size="sm" onClick={() => startRoom(f.userId)} {...prefetchOnIntent(game.urlPuzzle ? "/host-game/name" : "/pick-puzzle")}>
                      <Swords className="size-4" aria-hidden="true" />
                      {t("race.challenge")}
                    </Button>
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
            <Button variant="secondary" size="lg" block className="mt-4" onClick={() => { track("race_action", { action: "add-friend", signed_in: true }); navigate(FRIENDS_PATH); }}>
              {t("race.addFriends")}
            </Button>
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
              <p className="text-sm text-muted">{t(friends.active && friends.friendships.friends.length > 0 ? "race.startBodyFriends" : "race.startBody")}</p>
            </div>
            <Button variant={index === 0 ? "primary" : "secondary"} onClick={() => startRoom(null)} {...prefetchOnIntent(game.urlPuzzle ? "/host-game/name" : "/pick-puzzle")}>
              {t("race.start")}
            </Button>
          </Card>
        );
      case "code":
        return <CodeJoinCard key={block} first={index === 0} onJoin={() => track("race_action", { action: "join-code", signed_in: friends.active })} />;
      case "signIn":
        return (
          <Card key={block} className="flex items-center gap-3 p-4 pl-5">
            <div className="min-w-0 flex-1">
              <h2 className="font-semibold text-ink">{t(account.user && !account.profile ? "race.usernameTitle" : "race.signInTitle")}</h2>
              <p className="text-sm text-muted">{t(account.user && !account.profile ? "race.usernameBody" : "race.signInBody")}</p>
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
    <PageShell width="md" bar={{ backLabel: t("common.back"), backTo: "/menu" }}>
      <header className="mb-5">
        <h1 className="font-display text-3xl font-bold tracking-tight text-ink sm:text-4xl">{t("race.title")}</h1>
        <p className="mt-1 text-muted">{t("race.subtitle")}</p>
        {game.urlPuzzle && (
          <p className="mt-3 inline-flex max-w-full items-center gap-2 rounded-full bg-brand-50 px-3 py-1.5 text-sm font-semibold text-brand-700">
            <span className="truncate">{t("race.racingChip", { title: game.urlPuzzle.title })}</span>
            <button type="button" onClick={() => game.setUrlPuzzle(null)} className="shrink-0 underline decoration-brand-200 underline-offset-2 hover:decoration-brand-500">
              {t("race.changePuzzle")}
            </button>
          </p>
        )}
      </header>
      <div className="grid gap-4" aria-busy={!friends.ready || undefined}>
        {blocks.map(render)}
      </div>
    </PageShell>
  );
}
