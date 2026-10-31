import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Sparkles, UserRound, X } from "lucide-react";
import { useFocusTrap } from "../../hooks/useFocusTrap";
import { accountName, availableProviders, deleteAccount, fetchEnabledProviders, signInWith, type AuthProvider } from "../../lib/account";
import { nativePurchaseAvailable } from "../../lib/nativePurchase";
import { PlusPurchaseControls } from "../Plus/PlusPurchaseControls";
import { track } from "../../lib/analytics";
import { useTransitionNavigate } from "../../hooks/useTransitionNavigate";
import { Button } from "../ui";
import { ProviderButton } from "./ProviderButton";
import { UsernamePicker } from "./UsernamePicker";
import { PlusPitch } from "../Plus/PlusPitch";
import type { AccountContextValue } from "../../contexts/AccountContext";

export type AccountSheetView = "account" | "username" | "delete" | "plus";

interface AccountSheetProps {
  account: AccountContextValue;
  initialView: AccountSheetView;
  initialError: string | null;
  returnTo?: string;
  placement: string;
  onClose: () => void;
  /** Native: the OS sheet finished and the session changed in place (no return trip), so the provider can run its first-sign-in steps. */
  onSignedIn?: () => void;
}

/**
 * The one account dialog, for what a page can't do: the benefit-led sign-in
 * (provider buttons, disabled when Supabase has a provider off), the username
 * picker (once after the first sign-in, and from "Change username"), the
 * delete confirm, and the Plus pitch with its purchase controls. Everything a
 * signed-in solver would look at lives on /account (AccountScreen), so the
 * signed-in "account" view is only a pointer there.
 */
export function AccountSheet({ account, initialView, initialError, returnTo, placement, onClose, onSignedIn }: AccountSheetProps) {
  const { t } = useTranslation();
  // No view leads to another any more: each is opened for what it does.
  const view = initialView;
  const [error, setError] = useState<string | null>(initialError);
  const [busy, setBusy] = useState(false);
  const [enabled, setEnabled] = useState<Record<AuthProvider, boolean> | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const { user, profile } = account;
  const navigate = useTransitionNavigate();

  const handleEscape = useCallback(() => onClose(), [onClose]);
  useFocusTrap(panelRef, handleEscape);

  useEffect(() => {
    if (!user && !enabled) void fetchEnabledProviders().then(setEnabled);
  }, [user, enabled]);

  // A sign-out while open: the sheet has nothing left to say.
  const hadUser = useRef(!!user);
  useEffect(() => {
    if (hadUser.current && !user) onClose();
    hadUser.current = !!user;
  }, [user, onClose]);

  const act = async (work: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await work();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("account.genericError"));
      setBusy(false);
    }
  };

  const providers = availableProviders();

  const signIn = (provider: AuthProvider) =>
    void act(async () => {
      track("account_sign_in_started", { provider, placement });
      const outcome = await signInWith(provider, { returnTo });
      // On the web the page navigates away; leave the button busy meanwhile.
      if (outcome === "signed-in") onSignedIn?.();
      if (outcome !== "redirecting") setBusy(false);
    });

  const handleDelete = () =>
    void act(async () => {
      await deleteAccount();
      track("account_deleted");
    });

  const providerButtons = (
    <>
      {providers.map((provider) => (
        <ProviderButton key={provider} provider={provider} size="lg" disabled={!enabled?.[provider]} busy={busy} onClick={() => signIn(provider)} />
      ))}
      {enabled && !providers.some((p) => enabled[p]) && <p className="text-center text-xs text-muted">{t("account.noProviders")}</p>}
    </>
  );

  const username = profile?.username ?? null;
  const name = user ? username ?? accountName(user) : "";
  const title =
    view === "plus"
      ? t("plus.title")
      : view === "username"
        ? t("account.chooseUsername")
        : view === "delete"
          ? t("account.deleteTitle")
          : user
            ? name
            : t("account.sheetTitle");

  return (
    <div
      className="fixed inset-0 z-[65] flex items-end justify-center overscroll-contain sm:items-center"
      style={{
        paddingTop: "max(1rem, env(safe-area-inset-top))",
        paddingRight: "max(1rem, env(safe-area-inset-right))",
        paddingBottom: "max(1rem, env(safe-area-inset-bottom))",
        paddingLeft: "max(1rem, env(safe-area-inset-left))",
      }}
    >
      <div data-testid="account-backdrop" className="lf-fade-in absolute inset-0 bg-stage/60 backdrop-blur-[2px]" onClick={onClose} />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="lf-pop-in scroll-quiet relative max-h-full w-full max-w-sm overflow-y-auto overscroll-contain rounded-2xl border border-line bg-surface p-6 text-ink shadow-overlay"
      >
        <div className="flex items-start gap-3.5">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-600">
            {view === "plus" ? <Sparkles className="size-5" aria-hidden="true" /> : <UserRound className="size-5" aria-hidden="true" />}
          </span>
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className={`font-display text-lg font-bold leading-snug tracking-tight ${user && view === "account" ? "truncate" : ""}`}>
              {title}
            </h2>
            {view === "plus" ? (
              <p className="mt-1.5 text-sm leading-relaxed text-muted">{account.plus ? t("plus.youHavePlus") : t("plus.subtitle")}</p>
            ) : view === "username" ? (
              <p className="mt-1.5 text-sm leading-relaxed text-muted">{t("account.usernameBody")}</p>
            ) : view === "delete" ? (
              <>
                <p className="mt-1.5 text-sm leading-relaxed text-muted">{t("account.deleteBody")}</p>
                {/* Deleting the account can't cancel a store subscription (Apple asks apps to say so). */}
                {account.plus && account.plusRow?.source === "revenuecat" && (
                  <p className="mt-1.5 text-sm font-medium leading-relaxed text-ink-soft">{t("account.deleteStoreSubscription")}</p>
                )}
              </>
            ) : user ? (
              <p className="mt-1.5 text-sm leading-relaxed text-muted">{t("account.signedInBody")}</p>
            ) : (
              <p className="mt-1.5 text-sm leading-relaxed text-muted">{t("account.sheetBody")}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("account.close")}
            className="-mr-2 -mt-2 grid size-11 shrink-0 place-items-center rounded-xl text-muted hover:bg-surface-sunken active:bg-surface-sunken focus-visible:outline-2 focus-visible:outline-brand-500"
          >
            <X className="size-5" aria-hidden="true" />
          </button>
        </div>

        <div className="mt-5">
          {view === "plus" ? (
            <PlusPitch prices={!account.plus}>
              {user || (nativePurchaseAvailable() && account.plus) ? (
                // Plus belongs to an account on every platform (spec §3.5, revised 2026-10-28: half the
                // benefits need one and the studio is web-only), so an anonymous visitor signs in first.
                // The one exception is a subscriber whose purchase predates that rule: still anonymous,
                // still shown Manage / Restore, with the sign-in prompt underneath.
                <PlusPurchaseControls
                  account={{ signedIn: !!user, plus: account.plus, plusRow: account.plusRow, refreshEntitlements: account.refreshEntitlements }}
                  placement={placement}
                  returnTo={returnTo}
                  signInPrompt={
                    <div className="flex flex-col gap-2.5">
                      <p className="text-center text-sm leading-relaxed text-ink-soft">{t("plus.keepOnEveryDevice")}</p>
                      {providerButtons}
                    </div>
                  }
                />
              ) : (
                <div className="flex flex-col gap-2.5">
                  <p className="text-sm leading-relaxed text-ink-soft">{t("plus.signInFirst")}</p>
                  {providerButtons}
                </div>
              )}
            </PlusPitch>
          ) : view === "username" && user ? (
            <UsernamePicker
              userId={user.id}
              current={username}
              suggestFrom={accountName(user)}
              onSaved={(saved) => {
                track("username_saved", { first: !username });
                account.setProfile(saved);
                onClose();
              }}
              onCancel={onClose}
              cancelLabel={username ? t("account.close") : t("account.later")}
            />
          ) : view === "delete" && user ? (
            <div className="flex flex-col gap-2.5">
              <Button variant="danger" size="lg" block disabled={busy} aria-busy={busy || undefined} onClick={handleDelete}>
                {t("account.deleteConfirm")}
              </Button>
              <Button variant="ghost" size="md" block disabled={busy} onClick={onClose}>
                {t("account.cancel")}
              </Button>
            </div>
          ) : user ? (
            <Button
              variant="secondary"
              size="lg"
              block
              onClick={() => {
                onClose();
                navigate("/account");
              }}
            >
              {t("account.yourAccountLink")}
            </Button>
          ) : (
            <div className="flex flex-col gap-2.5">{providerButtons}</div>
          )}
          {error && (
            <p role="alert" className="mt-3 rounded-xl bg-gold-50 px-3 py-2 text-xs leading-relaxed text-ink-soft">
              {error}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
