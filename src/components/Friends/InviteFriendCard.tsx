import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import QRCode from "react-qr-code";
import { QrCode, Share2 } from "lucide-react";
import { Button, Card, Eyebrow } from "../ui";
import { runtimeDeps } from "../CompletionModal/ShareResultButton";
import { shareText } from "../../lib/shareSheet";
import { friendLink } from "../../lib/friends";
import { track } from "../../lib/analytics";

/**
 * Sends the viewer's own add-me link (friends.ts) through the share sheet,
 * falling back to the clipboard; `note` is what to tell them afterwards.
 */
export function useShareFriendLink(username: string, placement: string) {
  const { t } = useTranslation();
  const link = friendLink(username);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const share = useCallback(async () => {
    setBusy(true);
    setNote(null);
    try {
      const text = t("friends.linkShareText", { link });
      const result = await shareText({ text, body: text, url: link, title: "Crossword Clash" }, await runtimeDeps());
      if (result.outcome === "dismissed") return;
      track("friend_link_shared", { method: result.method, outcome: result.outcome, placement });
      setNote(t(result.outcome === "shared" ? "friends.linkShared" : result.outcome === "copied" ? "friends.linkCopied" : "friends.linkFailed"));
    } finally {
      setBusy(false);
    }
  }, [t, link, placement]);
  return { link, share, busy, note };
}

/**
 * "Invite a friend" on the Friends screen: the viewer's own add-me link
 * (friends.ts), sent through the share sheet or shown as a QR code for
 * someone in the room. Finding a friend used to mean knowing and typing their
 * username; here the sender picks the person in their own messaging app, so
 * the app never asks for contacts, and the link works as an invitation for
 * someone who has not played yet.
 */
export function InviteFriendCard({ username, className = "" }: { username: string; className?: string }) {
  const { t } = useTranslation();
  const { link, share, busy, note } = useShareFriendLink(username, "friends");
  const [showQr, setShowQr] = useState(false);

  return (
    <Card className={`p-5 ${className}`} data-testid="invite-friend">
      <Eyebrow as="h2">{t("friends.linkHeading")}</Eyebrow>
      <p className="mt-1 text-sm text-muted">{t("friends.linkHint")}</p>
      <div className="mt-3 flex flex-wrap gap-2.5">
        <Button onClick={() => void share()} disabled={busy} aria-busy={busy || undefined}>
          <Share2 className="size-4" aria-hidden="true" />
          {t("friends.linkShare")}
        </Button>
        <Button
          variant="secondary"
          aria-expanded={showQr}
          onClick={() => {
            setShowQr((on) => !on);
            if (!showQr) track("friend_link_shared", { method: "qr", outcome: "shown" });
          }}
        >
          <QrCode className="size-4" aria-hidden="true" />
          {t(showQr ? "friends.linkHideQr" : "friends.linkShowQr")}
        </Button>
      </div>
      {note && (
        <p role="status" className="mt-3 text-sm font-medium text-brand-700">
          {note}
        </p>
      )}
      {showQr && (
        <div className="mt-4 grid justify-items-center gap-2 text-center">
          <div className="rounded-2xl bg-white p-3 shadow-card ring-1 ring-line">
            <QRCode value={link} size={168} title={t("friends.linkQrLabel")} />
          </div>
          <p className="text-sm text-muted">{t("friends.linkQrHint")}</p>
          <p className="max-w-full break-all font-mono text-xs text-subtle">{link.replace(/^https?:\/\//, "")}</p>
        </div>
      )}
    </Card>
  );
}
