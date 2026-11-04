import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useLocation } from "react-router";
import { Swords, UserRoundCheck, X } from "lucide-react";
import { useTransitionNavigate } from "../../hooks/useTransitionNavigate";
import { useFriends } from "../../contexts/FriendsContext";
import { inviteJoinPath } from "../../lib/friends";
import { track } from "../../lib/analytics";
import { Button } from "../ui";

/** Screens where a banner would cover the game or the lobby it belongs to. */
const QUIET_PREFIXES = ["/play/", "/lobby/", "/solo/play", "/host"];

const SHELL = "pointer-events-none fixed inset-x-0 top-0 z-40 flex justify-center px-4 pt-[max(0.75rem,env(safe-area-inset-top))]";
// Icon · text · dismiss on the first row, the actions under the text on the second: at 375 px
// three controls beside the name left it two letters.
const CARD = "pointer-events-auto grid w-full max-w-md grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 rounded-2xl border border-brand-100 bg-surface p-3 shadow-card";
const ACTIONS = "col-span-2 col-start-2 flex gap-2";
const DISMISS = "grid size-11 shrink-0 place-items-center rounded-xl text-subtle hover:bg-surface-sunken hover:text-ink focus-visible:outline-2 focus-visible:outline-brand-500";

/**
 * The newest unseen open invite, on any screen outside a game (spec §3.2):
 * "alicia invited you to race · Birds of a feather · Join". Join is the app
 * link's path; Can't now declines it (phase f); Dismiss marks the invite seen
 * so it only shows in the inbox. For a host away from their lobby the same
 * card says "alicia joined your room · Go to room" (spec §3.7). A fixed
 * overlay, so it pads the safe area itself.
 */
export function InviteBanner() {
  const { t } = useTranslation();
  const navigate = useTransitionNavigate();
  const { pathname } = useLocation();
  const { unseenInvites, markSeen, decline, roomJoined, dismissRoomJoined } = useFriends();
  const quiet = QUIET_PREFIXES.some((p) => pathname.startsWith(p));
  // The Race screen lists the same invite with its own Join and Can't now:
  // the banner over it showed two Joins for one room (Andrew, 2026-11-03).
  // A joined-your-room notice has no row there, so it still shows.
  const inviteQuiet = quiet || pathname === "/race";
  const invite = inviteQuiet ? undefined : unseenInvites[0];
  // A host on their own lobby sees the roster change; the banner is for a host elsewhere in the app.
  const joined = roomJoined && !pathname.startsWith(`/lobby/${roomJoined.gameId}`) ? roomJoined : null;

  const joinedKey = joined ? `${joined.gameId}:${joined.at}` : null;
  useEffect(() => {
    if (joinedKey && !quiet) track("room_joined_notified", { via: "banner" });
  }, [joinedKey, quiet]);

  if (quiet) return null;

  if (joined) {
    const goToRoom = () => {
      dismissRoomJoined();
      navigate(`/lobby/${joined.gameId}`);
    };
    return (
      <div role="status" aria-live="polite" className={SHELL}>
        <div className={CARD}>
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-600">
            <UserRoundCheck className="size-5" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold text-ink">
              {joined.joinerName ? t("friends.bannerJoined", { name: joined.joinerName }) : t("friends.bannerJoinedAnon")}
            </p>
            {joined.title && <p className="truncate text-sm text-muted">{joined.title}</p>}
          </div>
          <button type="button" onClick={dismissRoomJoined} aria-label={t("friends.dismiss")} className={DISMISS}>
            <X className="size-4.5" aria-hidden="true" />
          </button>
          <div className={ACTIONS}>
            <Button size="sm" onClick={goToRoom}>
              {t("friends.goToRoom")}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (!invite) return null;
  const to = inviteJoinPath(invite);

  const join = () => {
    void markSeen([invite.id]);
    track("room_invite_opened", { via: "banner", kind: invite.kind });
    if (to) navigate(to);
  };

  return (
    <div role="status" aria-live="polite" className={SHELL}>
      <div className={CARD}>
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-600">
          <Swords className="size-5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-ink">
            {invite.kind === "room"
              ? t("friends.bannerRoom", { name: invite.from.username })
              : t("friends.bannerBeat", { name: invite.from.username })}
          </p>
          {invite.room?.title && <p className="truncate text-sm text-muted">{invite.room.title}</p>}
        </div>
        <button type="button" onClick={() => void markSeen([invite.id])} aria-label={t("friends.dismiss")} className={DISMISS}>
          <X className="size-4.5" aria-hidden="true" />
        </button>
        <div className={ACTIONS}>
          <Button size="sm" onClick={join} disabled={!to}>
            {invite.kind === "room" ? t("friends.join") : t("friends.beatIt")}
          </Button>
          {invite.kind === "room" && (
            <Button size="sm" variant="secondary" onClick={() => void decline(invite, "banner")}>
              {t("friends.cantNow")}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
