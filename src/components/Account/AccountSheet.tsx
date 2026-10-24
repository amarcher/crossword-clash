import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { LogOut, Sparkles, UserRound, X } from "lucide-react";
import { useFocusTrap } from "../../hooks/useFocusTrap";
import { accountName, AUTH_PROVIDERS, deleteAccount, fetchEnabledProviders, signInWith, signOut, type AuthProvider } from "../../lib/account";
import { track } from "../../lib/analytics";
import { useSolveHistory } from "../../hooks/useSolveHistory";
import { Button } from "../ui";
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
}

/**
 * The one account dialog. Anonymous: a benefit-led pitch and the provider
 * buttons (disabled when Supabase has a provider off). Signed in: who you are,
 * your username (or a nudge to pick one) and sign out. The username view is
 * the picker, shown once after the first sign-in and again on "Change".
 * "Delete account" asks once before it deletes.
 */
export function AccountSheet({ account, initialView, initialError, returnTo, placement, onClose }: AccountSheetProps) {
  const { t } = useTranslation();
  const [view, setView] = useState<AccountSheetView>(initialView);
  const [error, setError] = useState<string | null>(initialError);
  const [busy, setBusy] = useState(false);
  const [enabled, setEnabled] = useState<Record<AuthProvider, boolean> | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const { user, profile } = account;
  const history = useSolveHistory();

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

  const signIn = (provider: AuthProvider) =>
    void act(async () => {
      track("account_sign_in_started", { provider, placement });
      await signInWith(provider, { returnTo });
      // The page navigates away; leave the button busy meanwhile.
    });

  const handleSignOut = () =>
    void act(async () => {
      await signOut();
      setBusy(false);
    });

  const handleDelete = () =>
    void act(async () => {
      await deleteAccount();
      track("account_deleted");
    });

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
        className="lf-pop-in relative max-h-full w-full max-w-sm overflow-y-auto overscroll-contain rounded-2xl border border-line bg-surface p-6 text-ink shadow-overlay"
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
              <p className="mt-1.5 text-sm leading-relaxed text-muted">{t("account.deleteBody")}</p>
            ) : user ? (
              <p className="mt-1 truncate text-sm text-muted">{username ? accountName(user) : t("account.noUsernameYet")}</p>
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
            <PlusPitch>
              {user ? (
                // The purchase controls land with the paywall (Stripe on the web, RevenueCat in the apps).
                <p className="text-center text-sm text-muted">{account.plus ? t("plus.manageSoon") : t("plus.comingSoon")}</p>
              ) : (
                <div className="flex flex-col gap-2.5">
                  <p className="text-sm leading-relaxed text-ink-soft">{t("plus.signInFirst")}</p>
                  {AUTH_PROVIDERS.map((provider) => (
                    <Button
                      key={provider}
                      variant="secondary"
                      size="lg"
                      block
                      disabled={busy || !enabled?.[provider]}
                      aria-busy={busy || undefined}
                      onClick={() => signIn(provider)}
                    >
                      {provider === "apple" ? t("account.continueApple") : t("account.continueGoogle")}
                    </Button>
                  ))}
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
              onCancel={username ? () => setView("account") : onClose}
              cancelLabel={username ? t("account.close") : t("account.later")}
            />
          ) : view === "delete" && user ? (
            <div className="flex flex-col gap-2.5">
              <Button variant="danger" size="lg" block disabled={busy} aria-busy={busy || undefined} onClick={handleDelete}>
                {t("account.deleteConfirm")}
              </Button>
              <Button variant="ghost" size="md" block disabled={busy} onClick={() => setView("account")}>
                {t("account.cancel")}
              </Button>
            </div>
          ) : user ? (
            <div className="flex flex-col gap-2.5">
              <Button variant="secondary" size="lg" block onClick={() => setView("username")}>
                {username ? t("account.changeUsername") : t("account.chooseUsername")}
              </Button>
              <Button variant="ghost" size="md" block disabled={busy} onClick={handleSignOut}>
                <LogOut className="size-4" aria-hidden="true" /> {t("account.signOut")}
              </Button>
              <p className="text-center text-xs leading-relaxed text-subtle">
                {history.summary
                  ? history.summary.solveCount === 0
                    ? t("account.syncedNone")
                    : t("account.syncedSolves", { count: history.summary.solveCount })
                  : history.failed
                    ? t("account.syncOffline")
                    : t("account.syncing")}
              </p>
              <button
                type="button"
                onClick={() => setView("delete")}
                className="mx-auto mt-1 min-h-11 rounded-lg px-3 text-xs text-subtle underline-offset-2 hover:text-muted hover:underline active:text-muted focus-visible:outline-2 focus-visible:outline-brand-500"
              >
                {t("account.deleteAccount")}
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-2.5">
              {AUTH_PROVIDERS.map((provider) => (
                <Button
                  key={provider}
                  variant="secondary"
                  size="lg"
                  block
                  disabled={busy || !enabled?.[provider]}
                  aria-busy={busy || undefined}
                  onClick={() => signIn(provider)}
                >
                  {provider === "apple" ? t("account.continueApple") : t("account.continueGoogle")}
                </Button>
              ))}
              {enabled && !enabled.apple && !enabled.google && <p className="text-center text-xs text-muted">{t("account.noProviders")}</p>}
            </div>
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
