import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useLocation, useMatches, useNavigate, useOutlet, type UIMatch } from "react-router";
import { useTranslation } from "react-i18next";
import { ArrowLeft, X } from "lucide-react";
import { useMediaQuery } from "../../hooks/useMediaQuery";
import { TransitionLink } from "../ui/TransitionLink";

/**
 * Screens with little content open as a dialog over the page the player came
 * from on a wide window (desktop browsers, iPad landscape, the Mac app), and
 * stay full pages on a phone. A route opts in with one line in the route
 * config: `handle: DIALOG_ROUTE`. The URL still changes, so links, deep links,
 * back/forward and app links work as before; a screen built on `PageShell`
 * (with `heading`) or `FlowPage` needs no change of its own.
 */
export const DIALOG_ROUTE = { dialog: true } as const;

/** The same breakpoint as Tailwind's `lg` (64rem). */
export const DIALOG_QUERY = "(min-width: 64rem)";

export function isDialogRoute(matches: UIMatch[]): boolean {
  const handle = matches[matches.length - 1]?.handle as { dialog?: boolean } | undefined;
  return handle?.dialog === true;
}

interface RouteDialogValue {
  titleId: string;
  close: () => void;
}

const RouteDialogContext = createContext<RouteDialogValue | null>(null);

/** Non-null while the screen is rendered inside a route dialog: PageShell draws the dialog's chrome then. */
export function useRouteDialog(): RouteDialogValue | null {
  return useContext(RouteDialogContext);
}

interface Background {
  key: string;
  /** The page's route element (null: the menu fallback). */
  element: ReactNode | null;
  path: string;
  /** React Router's history index of that page, when the browser history has one. */
  idx: number | null;
}

function historyIdx(): number | null {
  if (typeof window === "undefined") return null;
  const idx = (window.history.state as { idx?: unknown } | null)?.idx;
  return typeof idx === "number" ? idx : null;
}

/**
 * Stands in for `<Outlet />`. On a page route it renders the page and
 * remembers it; on a dialog route at `lg` and up it keeps rendering that
 * remembered page (the same element, so the page stays mounted with its state)
 * — inert — and puts the dialog route on top. With nothing remembered (a cold
 * load or deep link straight to the dialog's URL) the page underneath is
 * `fallback`, the menu. The index route "/" is never kept as the page: it is
 * the cold-start resolver and would redirect again (a `?join=` code, a saved
 * room) if rendered under the dialog, so the menu stands in for it.
 */
export function DialogOutlet({ fallback }: { fallback: ReactNode }) {
  const outlet = useOutlet();
  const matches = useMatches();
  const location = useLocation();
  const navigate = useNavigate();
  const wide = useMediaQuery(DIALOG_QUERY);
  const dialogRoute = isDialogRoute(matches);
  const open = wide && dialogRoute;

  const [background, setBackground] = useState<Background | null>(null);
  if (!dialogRoute && background?.key !== location.key) {
    const index = location.pathname === "/";
    setBackground({
      key: location.key,
      element: index ? null : outlet,
      path: index ? "/menu" : location.pathname + location.search,
      idx: index ? null : historyIdx(),
    });
  }

  // Close returns to the page underneath: back through history when the
  // dialog (or a chain of them, Race friends → Friends) was pushed over it,
  // else in place, so a cold-loaded dialog's back button leaves the site
  // rather than reopening it.
  const close = useCallback(() => {
    const now = historyIdx();
    if (background && background.idx !== null && now !== null && now > background.idx) {
      navigate(background.idx - now);
    } else {
      navigate(background?.path ?? "/menu", { replace: true });
    }
  }, [background, navigate]);

  return (
    <>
      <div className="contents" inert={open || undefined} data-dialog-background={open || undefined}>
        {open ? (background?.element ?? fallback) : outlet}
      </div>
      {open && <RouteDialogFrame onClose={close}>{outlet}</RouteDialogFrame>}
    </>
  );
}

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * The dialog itself: a dimmed backdrop and a sheet sized to its content up to
 * the window's height. It persists while the dialog routes change underneath
 * it (Race friends → Friends), so it enters once and keeps its focus trap.
 * The screen inside draws its title row and body (`RouteDialogPage`).
 */
function RouteDialogFrame({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  // The control that opened the dialog, read before the dialog commits (the
  // screen inside may focus its own field in that commit, as Join does).
  const [opener] = useState(() => (typeof document === "undefined" ? null : (document.activeElement as HTMLElement | null)));
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    if (!panel.contains(document.activeElement)) panel.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        // An open dropdown closes itself first.
        if ((e.target as HTMLElement | null)?.getAttribute?.("aria-expanded") === "true") return;
        e.preventDefault();
        closeRef.current();
        return;
      }
      if (e.key !== "Tab") return;
      const items = panel.querySelectorAll<HTMLElement>(FOCUSABLE);
      const first = items[0];
      const last = items[items.length - 1];
      if (!first || !last) return;
      if (e.shiftKey && (document.activeElement === first || document.activeElement === panel)) {
        last.focus();
        e.preventDefault();
      } else if (!e.shiftKey && document.activeElement === last) {
        first.focus();
        e.preventDefault();
      }
    };
    panel.addEventListener("keydown", onKey);
    return () => {
      panel.removeEventListener("keydown", onKey);
      if (opener?.isConnected) opener.focus();
    };
  }, [opener]);

  // A step to another dialog route (Race friends → Friends) unmounts the
  // focused control: keep focus in the dialog instead of losing it to the page.
  const { key } = useLocation();
  useEffect(() => {
    const panel = panelRef.current;
    if (panel && !panel.contains(document.activeElement)) panel.focus();
  }, [key]);

  const value = { titleId, close: useCallback(() => closeRef.current(), []) };
  return (
    <RouteDialogContext.Provider value={value}>
      <div className="fixed inset-0 z-[60] flex items-center justify-center overscroll-contain p-8">
        <div data-testid="route-dialog-backdrop" className="lf-fade-in absolute inset-0 bg-stage/55 backdrop-blur-[3px]" onClick={() => closeRef.current()} />
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          tabIndex={-1}
          className="lf-pop-in relative flex max-h-full max-w-full flex-col overflow-hidden rounded-[1.25rem] bg-canvas shadow-overlay ring-1 ring-black/10 focus:outline-none"
        >
          {children}
        </div>
      </div>
    </RouteDialogContext.Provider>
  );
}

/** Body widths: a phone-column screen keeps about its phone width, a wider one gets two columns' room. */
const BODY_WIDTH = { narrow: "w-[30rem]", wide: "w-[46rem]" } as const;

interface RouteDialogPageProps {
  title: ReactNode;
  width: keyof typeof BODY_WIDTH;
  /** A back step to another screen (Friends → Race friends); never the page underneath, which Close is. */
  back?: { label: string; to: string };
  /** A control for the title row, before Close (a screen's bar action). */
  action?: ReactNode;
  children: ReactNode;
}

/** A screen's look inside the route dialog: the title row (back, title, close) over a body that scrolls. */
export function RouteDialogPage({ title, width, back, action, children }: RouteDialogPageProps) {
  const { t } = useTranslation();
  const dialog = useRouteDialog();
  if (!dialog) return null;
  return (
    <>
      <div className="flex min-h-14 shrink-0 items-center gap-1 border-b border-line bg-surface py-1.5 pl-5 pr-1.5">
        {back && (
          <TransitionLink
            to={back.to}
            className="-ml-3 mr-1 inline-flex size-11 shrink-0 items-center justify-center rounded-full text-ink-soft hover:bg-canvas hover:text-brand-700 focus-visible:outline-2 focus-visible:outline-brand-500"
          >
            <ArrowLeft className="size-5" aria-hidden="true" />
            <span className="sr-only">{back.label}</span>
          </TransitionLink>
        )}
        <h2 id={dialog.titleId} className="min-w-0 flex-1 truncate font-display text-lg font-bold tracking-tight text-ink">
          {title}
        </h2>
        {action}
        <button
          type="button"
          onClick={dialog.close}
          aria-label={t("common.close")}
          className="inline-flex size-11 shrink-0 items-center justify-center rounded-full text-ink-soft hover:bg-canvas hover:text-ink focus-visible:outline-2 focus-visible:outline-brand-500"
        >
          <X className="size-5" aria-hidden="true" />
        </button>
      </div>
      <div data-route-dialog-body className={`scroll-quiet min-h-0 max-w-full flex-1 overflow-y-auto overscroll-contain p-6 ${BODY_WIDTH[width]}`}>
        {children}
      </div>
    </>
  );
}
