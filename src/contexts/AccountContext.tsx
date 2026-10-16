import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useAccount, type Account } from "../hooks/useAccount";
import { accountsAvailable, resumeSignIn } from "../lib/account";
import { AccountSheet, type AccountSheetView } from "../components/Account/AccountSheet";

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

export interface AccountContextValue extends Account {
  /** False in builds that cannot offer an account (no Supabase, or the native apps). */
  available: boolean;
  /** Opens the account sheet: sign-in when anonymous, manage when signed in. */
  openAccount: (opts?: OpenAccountOptions) => void;
}

const AccountContext = createContext<AccountContextValue | null>(null);

interface SheetState extends OpenAccountOptions {
  view: AccountSheetView;
  error?: string | null;
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

  // First sign-in: once the profile lookup settles with no username, ask for one.
  const { user, profile, profileReady } = account;
  useEffect(() => {
    if (!justReturned || !user || !profileReady) return;
    setJustReturned(false);
    if (!profile) setSheet({ view: "username", placement: "first-sign-in" });
  }, [justReturned, user, profile, profileReady]);

  const openAccount = useCallback((opts: OpenAccountOptions = {}) => setSheet({ view: "account", ...opts }), []);
  const close = useCallback(() => setSheet(null), []);

  const value = useMemo<AccountContextValue>(() => ({ ...account, available, openAccount }), [account, available, openAccount]);

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
        />
      )}
    </AccountContext.Provider>
  );
}

export function useAccountContext(): AccountContextValue {
  const ctx = useContext(AccountContext);
  if (!ctx) throw new Error("useAccountContext must be used within AccountProvider");
  return ctx;
}
