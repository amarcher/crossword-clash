import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useAccount, type Account } from "../hooks/useAccount";
import { accountsAvailable, resumeSignIn } from "../lib/account";
import { AccountSheet, type AccountSheetView } from "../components/Account/AccountSheet";
import { clearSolveHistory, ensureSolveHistory } from "../lib/solveHistory";
import { pullProgress, startProgressSync, stopProgressSync } from "../lib/soloProgressSync";
import { checkoutReturn, reconcileEntitlements, withoutCheckoutParam } from "../lib/plusPurchase";
import { nativePurchaseAvailable, syncNativePurchaseUser } from "../lib/nativePurchase";
import { plusEnabled, type PlusFeature } from "../lib/plus";
import { track } from "../lib/analytics";

export interface OpenAccountOptions {
  /**
   * Where the provider should send the visitor back to. Screens that cannot
   * finish a sign-in themselves (the play screens) pass "/", so the menu picks
   * it up; the default is the current page.
   */
  returnTo?: string;
  /** Where the sheet was opened from, for the funnel. */
  placement?: string;
}

export interface OpenPaywallOptions {
  /** Where the paywall was opened from, for the funnel (`paywall_viewed`). */
  placement: string;
  /** The gate that asked, if any. */
  feature?: PlusFeature;
  /** Where a sign-in started from the paywall should come back to. */
  returnTo?: string;
}

export interface AccountContextValue extends Account {
  /** False in builds that cannot offer an account (no Supabase, or the native apps). */
  available: boolean;
  /** Opens the account sheet: sign-in when anonymous, manage when signed in. */
  openAccount: (opts?: OpenAccountOptions) => void;
  /**
   * Opens the Plus pitch (docs/monetization-spec.md §3.3): sign-in first for an
   * anonymous visitor (Plus needs an account on the web), then the plans. A
   * no-op while the Plus launch switch is off.
   */
  openPaywall: (opts: OpenPaywallOptions) => void;
}

const AccountContext = createContext<AccountContextValue | null>(null);

interface SheetState extends OpenAccountOptions {
  view: AccountSheetView;
  error?: string | null;
  feature?: PlusFeature;
}

/**
 * Who is signed in (optional accounts for solvers), plus the one account sheet
 * every screen opens. Also finishes a sign-in that just came back from the
 * provider and, after the first one, asks the new account for a username.
 */
export function AccountProvider({ children }: { children: React.ReactNode }) {
  const account = useAccount();
  const available = useMemo(() => accountsAvailable(), []);
  const [sheet, setSheet] = useState<SheetState | null>(null);
  const [justReturned, setJustReturned] = useState(false);

  useEffect(() => {
    if (!available) return;
    let live = true;
    void resumeSignIn().then(({ returned, error }) => {
      if (!live) return;
      if (error) setSheet({ view: "account", error });
      else if (returned) setJustReturned(true);
    });
    return () => {
      live = false;
    };
  }, [available]);

  // Back from Stripe Checkout (web): the webhook may still be in flight, so ask
  // verify-purchase to reconcile, refresh, and show the Plus view; either way
  // drop the `checkout` parameter so a reload does not repeat this.
  const { refreshEntitlements, sessionUserId } = account;
  useEffect(() => {
    // With Plus off this build never started a checkout; a stray parameter
    // (a preview's purchase that landed on production) must not reconcile here.
    if (!available || !plusEnabled() || typeof window === "undefined") return;
    const outcome = checkoutReturn(window.location.search);
    if (!outcome) return;
    window.history.replaceState(window.history.state, "", withoutCheckoutParam(window.location.href));
    if (outcome !== "success") return;
    track("purchase_completed", { channel: "stripe" });
    void reconcileEntitlements("stripe")
      .catch(() => [])
      .then(() => refreshEntitlements())
      .finally(() => setSheet({ view: "plus", placement: "checkout-return" }));
  }, [available, refreshEntitlements]);

  // Apps: RevenueCat is keyed by the session user (anonymous included) and follows a sign-in.
  useEffect(() => {
    if (sessionUserId && nativePurchaseAvailable()) void syncNativePurchaseUser(sessionUserId).catch((err) => console.warn("RevenueCat:", err));
  }, [sessionUserId]);

  // An account's solve history: loaded once it appears (and this device's
  // pre-account history uploaded once), forgotten when it goes.
  const { user, profile, profileReady, plus } = account;
  const userId = user?.id;
  useEffect(() => {
    if (userId) void ensureSolveHistory(userId);
    else clearSolveHistory();
  }, [userId]);

  // Plus: mirror per-puzzle progress to the account (soloProgressSync.ts) while
  // a real account holds Plus; pull the other devices' records on appearance
  // and whenever the tab comes back.
  const syncId = userId && plus ? userId : null;
  useEffect(() => {
    if (!syncId) {
      stopProgressSync();
      return;
    }
    startProgressSync(syncId);
    void pullProgress(syncId);
    const onVisible = () => {
      if (document.visibilityState === "visible") void pullProgress(syncId);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [syncId]);

  // First sign-in: once the profile lookup settles with no username, ask for one.
  useEffect(() => {
    if (!justReturned || !user || !profileReady) return;
    setJustReturned(false);
    if (!profile) setSheet({ view: "username", placement: "first-sign-in" });
  }, [justReturned, user, profile, profileReady]);

  const openAccount = useCallback((opts: OpenAccountOptions = {}) => setSheet({ view: "account", ...opts }), []);
  const openPaywall = useCallback((opts: OpenPaywallOptions) => {
    if (!plusEnabled()) return;
    track("paywall_viewed", { placement: opts.placement, feature: opts.feature });
    setSheet({ view: "plus", placement: opts.placement, feature: opts.feature, returnTo: opts.returnTo });
  }, []);
  const close = useCallback(() => setSheet(null), []);

  const value = useMemo<AccountContextValue>(() => ({ ...account, available, openAccount, openPaywall }), [account, available, openAccount, openPaywall]);

  return (
    <AccountContext.Provider value={value}>
      {children}
      {sheet && available && (
        <AccountSheet
          account={value}
          initialView={sheet.view}
          initialError={sheet.error ?? null}
          returnTo={sheet.returnTo}
          placement={sheet.placement ?? "menu"}
          onClose={close}
          onSignedIn={() => setJustReturned(true)}
        />
      )}
    </AccountContext.Provider>
  );
}

/** The account context, or null outside the provider (tests, isolated trees). */
export function useMaybeAccount(): AccountContextValue | null {
  return useContext(AccountContext);
}

export function useAccountContext(): AccountContextValue {
  const ctx = useContext(AccountContext);
  if (!ctx) throw new Error("useAccountContext must be used within AccountProvider");
  return ctx;
}
