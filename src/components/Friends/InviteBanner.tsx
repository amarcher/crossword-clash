import { useTranslation } from "react-i18next";
import { useLocation } from "react-router";
import { Swords, X } from "lucide-react";
import { useTransitionNavigate } from "../../hooks/useTransitionNavigate";
import { useFriends } from "../../contexts/FriendsContext";
import { inviteJoinPath } from "../../lib/friends";
import { track } from "../../lib/analytics";
import { Button } from "../ui";

/** Screens where a banner would cover the game or the lobby it belongs to. */
const QUIET_PREFIXES = ["/play/", "/lobby/", "/solo/play", "/host"];

/**
 * The newest unseen open invite, on any screen outside a game (spec §3.2):
 * "alicia invited you to race · Birds of a feather · Join". Join is the app
 * link's path; Dismiss marks the invite seen so it only shows in the inbox.
 * A fixed overlay, so it pads the safe area itself.
 */
export function InviteBanner() {
  const { t } = useTranslation();
  const navigate = useTransitionNavigate();
  const { pathname } = useLocation();
  const { unseenInvites, markSeen } = useFriends();
  const invite = unseenInvites[0];
  if (!invite || QUIET_PREFIXES.some((p) => pathname.startsWith(p))) return null;
  const to = inviteJoinPath(invite);

  const join = () => {
    void markSeen([invite.id]);
    track("room_invite_opened", { via: "banner", kind: invite.kind });
    if (to) navigate(to);
  };

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 top-0 z-40 flex justify-center px-4 pt-[max(0.75rem,env(safe-area-inset-top))]"
    >
      <div className="pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-2xl border border-brand-100 bg-surface p-3 shadow-card">
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
        <Button size="sm" onClick={join} disabled={!to}>
          {invite.kind === "room" ? t("friends.join") : t("friends.beatIt")}
        </Button>
        <button
          type="button"
          onClick={() => void markSeen([invite.id])}
          aria-label={t("friends.dismiss")}
          className="grid size-11 shrink-0 place-items-center rounded-xl text-subtle hover:bg-surface-sunken hover:text-ink focus-visible:outline-2 focus-visible:outline-brand-500"
        >
          <X className="size-4.5" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
