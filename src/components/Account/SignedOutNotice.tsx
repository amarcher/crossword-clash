import { useState } from "react";
import { useTranslation } from "react-i18next";
import { UserRound } from "lucide-react";
import { Button } from "../ui";
import { useMaybeAccount } from "../../contexts/AccountContext";
import { useHydrated } from "../../lib/hydration";
import { dismissSignedOutNotice, signedOutNoticePending } from "../../lib/deviceData";

/**
 * "You're signed out" at the top of the menu, once, after an account left this
 * device (lib/deviceData put its play data away): the menu now looks like a
 * new player's, and this says why and how to get it back (Andrew, 2026-11-16:
 * a quiet Sign in link was too subtle). Gone on Sign in, "Not now", or the
 * account's return.
 */
export function SignedOutNotice({ className = "" }: { className?: string }) {
  const { t } = useTranslation();
  const account = useMaybeAccount();
  const hydrated = useHydrated();
  const [dismissed, setDismissed] = useState(false);
  if (!hydrated || dismissed || !account?.available || account.user || !signedOutNoticePending()) return null;
  const close = () => {
    dismissSignedOutNotice();
    setDismissed(true);
  };
  return (
    <section aria-label={t("signedOut.label")} className={`flex items-start gap-3.5 rounded-2xl bg-brand-50 p-4 ring-1 ring-brand-100 ${className}`}>
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-100 text-brand-700">
        <UserRound className="size-5" strokeWidth={2} aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-semibold leading-snug text-ink">{t("signedOut.title")}</p>
        <p className="mt-0.5 text-sm leading-snug text-muted">{t("signedOut.body")}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            size="sm"
            onClick={() => {
              close();
              account.openAccount({ placement: "signed_out_notice", returnTo: "/menu" });
            }}
          >
            {t("signedOut.signIn")}
          </Button>
          <Button size="sm" variant="ghost" onClick={close}>
            {t("signedOut.dismiss")}
          </Button>
        </div>
      </div>
    </section>
  );
}
