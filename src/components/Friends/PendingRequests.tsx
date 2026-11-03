import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useConfirm } from "../ConfirmDialog";
import { useFriends } from "../../contexts/FriendsContext";
import { FriendsError, type FriendsErrorKind, type Person } from "../../lib/friends";
import { Button } from "../ui";
import { PersonList, PersonRow } from "./PersonRow";

const ERROR_KEYS: Partial<Record<FriendsErrorKind, string>> = {
  rate_limited: "friends.errorRateLimited",
  too_many: "friends.errorTooMany",
};

interface PendingRequestsProps {
  /** Offer Block beside Accept / Decline (the full friends screen); the menu and the account page keep the row to two actions. */
  showBlock?: boolean;
  className?: string;
}

/**
 * The friend requests waiting for the viewer, each with Accept and Decline
 * (docs/friends-spec.md §3.1). One component wherever a request can be
 * answered — the friends screen, the menu and the account page — so a request
 * is actionable where the player lands, not only behind Race friends. Renders
 * nothing while there is no request; the parent decides on a heading.
 */
export function PendingRequests({ showBlock = false, className = "" }: PendingRequestsProps) {
  const { t } = useTranslation();
  const friends = useFriends();
  const confirm = useConfirm();
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ text: string; error?: boolean } | null>(null);
  const incoming = friends.friendships.incoming;
  if (incoming.length === 0 && !notice) return null;

  const respond = async (person: Person, accept: boolean) => {
    setBusy(person.userId);
    setNotice(null);
    try {
      await friends.respond(person.userId, accept);
    } catch (err) {
      setNotice({ text: t((err instanceof FriendsError && ERROR_KEYS[err.kind]) || "friends.errorGeneric"), error: true });
    } finally {
      setBusy(null);
    }
  };

  const block = async (person: Person) => {
    const ok = await confirm({
      title: t("friends.blockConfirm", { name: person.username }),
      body: t("friends.blockBody"),
      confirmLabel: t("friends.block"),
      tone: "danger",
    });
    if (!ok) return;
    setBusy(person.userId);
    try {
      await friends.block(person.userId);
      setNotice({ text: t("friends.blocked", { name: person.username }) });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className={className}>
      {notice && (
        <p role={notice.error ? "alert" : "status"} className={`mb-3 rounded-xl px-4 py-3 text-sm font-medium ${notice.error ? "bg-red-50 text-red-700" : "bg-brand-50 text-brand-700"}`}>
          {notice.text}
        </p>
      )}
      {incoming.length > 0 && (
        <PersonList>
          {incoming.map((p) => (
            <PersonRow key={p.userId} username={p.username} detail={t("friends.wantsToBeFriends")}>
              <Button size="sm" onClick={() => void respond(p, true)} disabled={busy !== null} aria-busy={busy === p.userId || undefined}>
                {t("friends.accept")}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => void respond(p, false)} disabled={busy !== null}>
                {t("friends.decline")}
              </Button>
              {showBlock && (
                <Button size="sm" variant="ghost" onClick={() => void block(p)} disabled={busy !== null} aria-label={t("friends.blockName", { name: p.username })}>
                  {t("friends.block")}
                </Button>
              )}
            </PersonRow>
          ))}
        </PersonList>
      )}
    </div>
  );
}
