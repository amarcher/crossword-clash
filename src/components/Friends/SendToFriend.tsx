import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, Send } from "lucide-react";
import { useFriends } from "../../contexts/FriendsContext";
import { FriendsError } from "../../lib/friends";
import { Button, buttonClass } from "../ui";
import { PersonList, PersonRow } from "./PersonRow";

interface SendToFriendProps {
  /** The daily challenge path (`/daily/:day/:slot?beat=…&by=…`), the only link the server accepts. */
  link: string;
  darkMode?: boolean;
}

/**
 * The completion modal's "Send to a friend" (docs/friends-spec.md §3.2): the
 * daily "beat my time" link delivered in-app instead of through the share
 * sheet. A toggle row, then the friends with Send; each send is one `beat`
 * invite the friend sees as a banner or in their Race friends inbox. Renders
 * nothing for a viewer without friends (or with the switch off).
 */
export function SendToFriend({ link, darkMode }: SendToFriendProps) {
  const { t } = useTranslation();
  const { active, friendships, beat } = useFriends();
  const [open, setOpen] = useState(false);
  const [sent, setSent] = useState<Record<string, true>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (!active || friendships.friends.length === 0) return null;

  const send = async (friendId: string) => {
    setBusy(friendId);
    setError(null);
    try {
      await beat(friendId, link);
      setSent((prev) => ({ ...prev, [friendId]: true }));
    } catch (err) {
      setError(t(err instanceof FriendsError && err.kind === "rate_limited" ? "friends.errorRateLimited" : "friends.errorGeneric"));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="grid gap-2">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className={buttonClass(darkMode ? "stage" : "secondary", "md", "w-full")}>
        <Send className="size-4" aria-hidden="true" />
        {t("friends.sendToFriend")}
      </button>
      {open && (
        <div>
          <PersonList>
            {friendships.friends.map((f) => (
              <PersonRow key={f.userId} username={f.username}>
                {sent[f.userId] ? (
                  <span className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-brand-50 px-3 text-sm font-semibold text-brand-700">
                    <Check className="size-4" aria-hidden="true" />
                    {t("friends.sent")}
                  </span>
                ) : (
                  <Button size="sm" onClick={() => void send(f.userId)} disabled={busy !== null} aria-busy={busy === f.userId || undefined}>
                    {t("friends.send")}
                  </Button>
                )}
              </PersonRow>
            ))}
          </PersonList>
          {error && (
            <p role="alert" className="mt-2 text-sm font-medium text-red-700">
              {error}
            </p>
          )}
          <p className={`mt-2 text-xs ${darkMode ? "text-stage-line" : "text-muted"}`}>{t("friends.sendToFriendHint")}</p>
        </div>
      )}
    </div>
  );
}
