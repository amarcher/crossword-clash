import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocation } from "react-router";
import { CalendarDays, LogOut, Pencil, PencilRuler, Sparkles, UserRound } from "lucide-react";
import { useMaybeAccount } from "../../contexts/AccountContext";
import { useTransitionNavigate } from "../../hooks/useTransitionNavigate";
import { accountName, signOut } from "../../lib/account";
import { useHydrated } from "../../lib/hydration";
import { plusEnabled } from "../../lib/plus";
import { studioRouteEnabled } from "../../lib/studioGate";
import { prefetchRoute } from "../../routeModules";

interface AccountControlProps {
  /** Where the control sits, for the funnel (`account_sign_in_started { placement }`). */
  placement?: string;
  className?: string;
}

/** The letter an avatar shows: the username's first, else the provider name's. */
export function avatarInitial(name: string): string {
  const first = [...name.trim()][0];
  return first ? first.toLocaleUpperCase() : "?";
}

const ITEM =
  "flex w-full min-h-11 items-center gap-3 rounded-xl px-3 text-left text-sm font-medium text-ink hover:bg-surface-sunken active:bg-surface-sunken focus-visible:bg-surface-sunken focus-visible:outline-none";

/**
 * The site header's account control, on every screen with a header. Signed
 * in: a round avatar (the username's initial) that opens a compact menu of
 * what an account can do — the account page, past puzzles, the username
 * picker, Plus (only once the launch switch is on) and sign out. Anonymous: a
 * quiet "Sign in" that opens the sheet's benefit-led sign-in view. Nothing at
 * all outside AccountProvider, where accounts aren't offered (no Supabase, an
 * app without native sign-in), or before hydration — the prerendered pages
 * must paint the same with and without a browser, so the control appears on
 * the render right after.
 */
export function AccountControl({ placement = "header", className = "" }: AccountControlProps) {
  const { t } = useTranslation();
  const account = useMaybeAccount();
  const hydrated = useHydrated();
  const navigate = useTransitionNavigate();
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  const close = useCallback((refocus = false) => {
    setOpen(false);
    if (refocus) buttonRef.current?.focus();
  }, []);

  // Navigating away closes the menu; so does a tap or click outside it.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);
  // Opening puts focus on the first item, so arrow keys work at once.
  useEffect(() => {
    if (open) menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
  }, [open]);

  if (!account || !account.available || !hydrated || !account.ready) return null;
  const { user, profile } = account;

  if (!user) {
    return (
      <button
        type="button"
        onClick={() => account.openAccount({ placement })}
        className={`inline-flex min-h-11 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-2 text-sm font-semibold text-ink-soft hover:text-brand-700 active:text-brand-800 focus-visible:outline-2 focus-visible:outline-brand-500 ${className}`}
      >
        <UserRound className="size-4" aria-hidden="true" />
        {t("account.signInControl")}
      </button>
    );
  }

  const username = profile?.username ?? null;
  const name = username ?? accountName(user);
  const items: { key: string; icon: typeof UserRound; label: string; run: () => void; warm?: string }[] = [
    { key: "account", icon: UserRound, label: t("account.menuAccount"), run: () => navigate("/account"), warm: "/account" },
    { key: "archive", icon: CalendarDays, label: t("account.menuPastPuzzles"), run: () => navigate("/archive"), warm: "/archive" },
    {
      key: "username",
      icon: Pencil,
      label: username ? t("account.changeUsername") : t("account.chooseUsername"),
      run: () => account.openAccount({ view: "username", placement }),
    },
  ];
  // A subscriber's way into the studio from any header, in the apps as on the web (the editor itself is behind StudioGateScreen).
  if (plusEnabled() && account.plus && studioRouteEnabled()) {
    items.push({ key: "studio", icon: PencilRuler, label: t("account.menuStudio"), run: () => navigate("/studio"), warm: "/studio" });
  }
  if (plusEnabled()) {
    items.push({
      key: "plus",
      icon: Sparkles,
      label: account.plus ? t("account.menuPlusManage") : t("account.menuPlusAbout"),
      run: () => account.openPaywall({ placement, returnTo: pathname }),
    });
  }
  items.push({
    key: "signout",
    icon: LogOut,
    label: t("account.signOut"),
    run: () => void signOut().catch((err) => console.warn("Sign out:", err)),
  });

  const onMenuKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      close(true);
      return;
    }
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp" && e.key !== "Home" && e.key !== "End") return;
    const nodes = [...(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];
    if (nodes.length === 0) return;
    e.preventDefault();
    const at = nodes.indexOf(document.activeElement as HTMLElement);
    const next = e.key === "Home" ? 0 : e.key === "End" ? nodes.length - 1 : e.key === "ArrowDown" ? (at + 1) % nodes.length : (at - 1 + nodes.length) % nodes.length;
    nodes[next].focus();
  };

  return (
    <div ref={rootRef} className={`relative shrink-0 ${className}`}>
      <button
        ref={buttonRef}
        type="button"
        aria-label={t("account.avatarLabel", { name })}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" && !open) {
            e.preventDefault();
            setOpen(true);
          }
        }}
        className="grid size-11 place-items-center rounded-full focus-visible:outline-2 focus-visible:outline-brand-500"
      >
        <span
          aria-hidden="true"
          className={`grid size-9 place-items-center rounded-full font-display text-sm font-bold leading-none ring-1 transition-colors ${
            open ? "bg-brand-600 text-white ring-brand-600" : "bg-brand-50 text-brand-700 ring-brand-100 hover:bg-brand-100"
          }`}
        >
          {avatarInitial(name)}
        </span>
      </button>
      {open && (
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-label={name}
          onKeyDown={onMenuKey}
          className="lf-pop-in absolute right-0 top-full z-50 mt-1.5 w-64 max-w-[calc(100vw-2rem)] rounded-2xl border border-line bg-surface p-1.5 text-ink shadow-overlay"
        >
          <div className="flex items-center gap-3 px-3 pb-2.5 pt-2">
            <span aria-hidden="true" className="grid size-9 shrink-0 place-items-center rounded-full bg-brand-50 font-display text-sm font-bold text-brand-700 ring-1 ring-brand-100">
              {avatarInitial(name)}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold leading-snug">{name}</span>
              <span className="block truncate text-xs leading-snug text-muted">{username ? accountName(user) : t("account.noUsernameYet")}</span>
            </span>
          </div>
          <div className="mb-1.5 border-t border-line" />
          {items.map(({ key, icon: Icon, label, run, warm }) => (
            <button
              key={key}
              type="button"
              role="menuitem"
              className={ITEM}
              onPointerEnter={warm ? () => void prefetchRoute(warm) : undefined}
              onFocus={warm ? () => void prefetchRoute(warm) : undefined}
              onClick={() => {
                close();
                run();
              }}
            >
              <Icon className={`size-4 shrink-0 ${key === "plus" ? "text-brand-600" : "text-muted"}`} aria-hidden="true" />
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
