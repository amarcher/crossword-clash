import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, UserRoundCheck, UserRoundX } from "lucide-react";
import { useFriends } from "../../contexts/FriendsContext";
import { FriendsError, lobbyInviteStatus, takePendingChallenge } from "../../lib/friends";
import { Button, Card, Eyebrow } from "../ui";
import { useFriendSolves } from "../../hooks/useFriendSolves";
import { PersonList, PersonRow } from "./PersonRow";
import { SolveChip } from "./SolveChip";

const CHIP = "inline-flex h-9 items-center gap-1.5 rounded-xl px-3 text-sm font-semibold";

/**
 * The lobby's "Invite friends" list (spec §3.2): the viewer's friends, each
 * with Invite; a friend tapped on the Race friends screen's Challenge is
 * invited the moment the room exists. Renders nothing for a viewer with no
 * friends. Each row then says where the friend stands (spec §3.7): Invited
 * (an open invite, this session's or one read back from the sender's own
 * rows), Joined (they are in `players`), or "Can't right now" (declined).
 * In the apps the invite is a push; on the web it waits in their inbox and
 * shows as a banner if the site is open.
 */
export function LobbyInvites({ gameId, players = [], puzzleKey = null }: { gameId: string; players?: readonly { userId: string }[]; puzzleKey?: string | null }) {
  const { t } = useTranslation();
  const { active, friendships, invite, sentInvites } = useFriends();
  // Friends who already finished this room's puzzle (spec §3.8) wear a chip; they are still invitable.
  const solves = useFriendSolves(puzzleKey);
  const [invited, setInvited] = useState<Record<string, true>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const send = async (friendId: string) => {
    setBusy(friendId);
    setError(null);
    try {
      await invite(gameId, friendId);
      setInvited((prev) => ({ ...prev, [friendId]: true }));
    } catch (err) {
      if (err instanceof FriendsError && err.kind === "already_invited") setInvited((prev) => ({ ...prev, [friendId]: true }));
      else setError(t(err instanceof FriendsError && err.kind === "rate_limited" ? "friends.errorRateLimited" : "friends.errorGeneric"));
    } finally {
      setBusy(null);
    }
  };

  // Challenge → host flow → here: invite the chosen friend once, as soon as the room exists.
  const sendRef = useRef(send);
  sendRef.current = send;
  const pendingHandled = useRef(false);
  useEffect(() => {
    if (!active || pendingHandled.current) return;
    const pending = takePendingChallenge();
    pendingHandled.current = true;
    if (pending && friendships.friends.some((f) => f.userId === pending)) void sendRef.current(pending);
  }, [active, friendships.friends]);

  if (!active || friendships.friends.length === 0) return null;

  return (
    <Card className="p-5">
      <Eyebrow as="h2">{t("friends.inviteHeading")}</Eyebrow>
      <PersonList className="mt-3">
        {friendships.friends.map((f) => {
          const status = lobbyInviteStatus(f.userId, gameId, sentInvites, players);
          const state = status === "none" && invited[f.userId] ? "invited" : status;
          return (
            <PersonRow key={f.userId} username={f.username}>
              <SolveChip solve={solves[f.userId]} />
              {state === "joined" ? (
                <span className={`${CHIP} bg-emerald-50 text-emerald-800`}>
                  <UserRoundCheck className="size-4" aria-hidden="true" />
                  {t("friends.joined")}
                </span>
              ) : state === "declined" ? (
                <span className={`${CHIP} bg-surface-sunken text-muted`}>
                  <UserRoundX className="size-4" aria-hidden="true" />
                  {t("friends.cantRightNow")}
                </span>
              ) : state === "invited" ? (
                <span className={`${CHIP} bg-brand-50 text-brand-700`}>
                  <Check className="size-4" aria-hidden="true" />
                  {t("friends.invited")}
                </span>
              ) : (
                <Button size="sm" onClick={() => void send(f.userId)} disabled={busy !== null} aria-busy={busy === f.userId || undefined}>
                  {t("friends.invite")}
                </Button>
              )}
            </PersonRow>
          );
        })}
      </PersonList>
      {error && (
        <p role="alert" className="mt-3 text-sm font-medium text-red-700">
          {error}
        </p>
      )}
      <p className="mt-3 text-sm text-muted">{t("friends.inviteHint")}</p>
    </Card>
  );
}
