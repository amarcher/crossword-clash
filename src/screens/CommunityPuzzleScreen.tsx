import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { useParams } from "react-router";
import { useTranslation } from "react-i18next";
import { Check, EyeOff, Flag, Link2, MoreHorizontal, PencilLine, Swords } from "lucide-react";
import { PageShell } from "../components/PageShell";
import { ReportDialog } from "../components/ReportDialog";
import { Button, Card, MiniGridThumb, TransitionLink } from "../components/ui";
import { useAuth } from "../contexts/AuthContext";
import { useGame } from "../contexts/GameContext";
import { useBestTimes } from "../hooks/useSolveHistory";
import { useHiddenAuthors } from "../hooks/useHiddenAuthors";
import { useTransitionNavigate } from "../hooks/useTransitionNavigate";
import { track } from "../lib/analytics";
import { authorPath, fetchCommunityPuzzle, puzzlePath, toPlayablePuzzle, type CommunityPuzzleFull } from "../lib/communityPuzzles";
import { hideAuthor, unhideAuthor } from "../lib/hiddenAuthors";
import { getProgress } from "../lib/soloProgress";
import { formatDuration } from "../lib/soloStats";
import { emitToast } from "../lib/toastBus";

const ITEM =
  "flex w-full min-h-11 items-center gap-3 rounded-xl px-3 text-left text-sm font-medium text-ink hover:bg-surface-sunken active:bg-surface-sunken focus-visible:bg-surface-sunken focus-visible:outline-none";

type State = { kind: "loading" } | { kind: "missing" } | { kind: "ready"; row: CommunityPuzzleFull };

/**
 * One community puzzle (docs/community-puzzles-spec.md §2.2): the facts,
 * the viewer's own status, Play and Race friends, and an overflow menu with
 * Copy link, Report and Hide this author (the author sees "Update in the
 * studio" instead). The author also sees their own unpublished, held or
 * removed puzzle here, with the reason; everyone else gets "not here".
 */
export function CommunityPuzzleScreen() {
  const { t, i18n } = useTranslation();
  const navigate = useTransitionNavigate();
  const { shortId = "" } = useParams<{ shortId: string }>();
  const { user, loading: authLoading } = useAuth();
  const { handleSoloPuzzleLoaded, setSoloTheme, setUrlPuzzle } = useGame();
  const [state, setState] = useState<State>({ kind: "loading" });
  const [busy, setBusy] = useState<"play" | "race" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reporting, setReporting] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    let cancelled = false;
    setState({ kind: "loading" });
    fetchCommunityPuzzle(shortId).then(
      (row) => {
        if (!cancelled) setState(row ? { kind: "ready", row } : { kind: "missing" });
      },
      () => {
        if (!cancelled) setState({ kind: "missing" });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [shortId]);

  const row = state.kind === "ready" ? state.row : null;
  useEffect(() => {
    if (row) document.title = `${row.title} · ${t("community.title")} · Crossword Clash`;
  }, [row, t]);

  const puzzle = useMemo(() => {
    if (!row || !row.puzzle || typeof row.puzzle !== "object" || !("grid" in (row.puzzle as object))) return null;
    try {
      return toPlayablePuzzle(row);
    } catch {
      return null;
    }
  }, [row]);

  const hidden = useHiddenAuthors();
  const bestTimes = useBestTimes();
  const own = !!row && !!user && row.author_id === user.id;
  const authorHidden = !!row && hidden.includes(row.author_id);
  const best = row ? bestTimes[row.puzzle_key] : undefined;
  const progress = useMemo(() => (row && typeof best !== "number" ? getProgress(row.puzzle_key) : null), [row, best]);

  // The overflow menu: closes on an outside tap; arrow keys move, Escape returns focus.
  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [menuOpen]);
  const onMenuKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      setMenuOpen(false);
      menuButtonRef.current?.focus();
      return;
    }
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    const nodes = [...(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];
    if (nodes.length === 0) return;
    e.preventDefault();
    const at = nodes.indexOf(document.activeElement as HTMLElement);
    nodes[(e.key === "ArrowDown" ? at + 1 : at - 1 + nodes.length) % nodes.length].focus();
  };

  const load = useCallback(
    async (what: "play" | "race") => {
      if (!puzzle) return;
      setError(null);
      setBusy(what);
      try {
        track("puzzle_imported", { import_source: "community", title: puzzle.title, size: `${puzzle.width}x${puzzle.height}` });
        if (what === "play") {
          await handleSoloPuzzleLoaded(puzzle);
          setSoloTheme(null);
          navigate("/solo/play");
        } else {
          track("mode_selected", { mode: "community-race" });
          setUrlPuzzle(puzzle);
          navigate("/host-game/name");
        }
      } catch {
        setError(t("community.loadError"));
        setBusy(null);
      }
    },
    [puzzle, handleSoloPuzzleLoaded, setSoloTheme, setUrlPuzzle, navigate, t],
  );

  const copyLink = () => {
    const url = `${window.location.origin}${puzzlePath(shortId)}`;
    void navigator.clipboard?.writeText(url).then(
      () => emitToast({ message: t("community.linkCopied") }),
      () => undefined,
    );
  };

  const date = row ? new Date(row.published_at).toLocaleDateString(i18n.language, { month: "short", day: "numeric", year: "numeric" }) : "";
  const canRace = Boolean(user) || authLoading;

  let body: React.ReactNode;
  if (state.kind === "loading") {
    body = (
      <p className="py-12 text-center text-sm text-subtle" aria-busy="true">
        {t("community.loading")}
      </p>
    );
  } else if (!row) {
    body = <p className="py-12 text-center text-sm text-muted">{t("community.notFound")}</p>;
  } else if (authorHidden && !own) {
    body = (
      <div className="py-12 text-center text-sm text-muted">
        <p>{t("community.hiddenAuthorNote")}</p>
        <Button variant="secondary" className="mt-3" onClick={() => unhideAuthor(row.author_id)}>
          {t("community.showAgain")}
        </Button>
      </div>
    );
  } else {
    const note =
      row.status === "unpublished"
        ? t("community.unpublished")
        : row.status === "held"
          ? own
            ? t("community.heldOwn")
            : t("community.held")
          : row.status === "removed"
            ? t("community.removedOwn", { reason: row.removed_reason ? t(`community.removedReason.${row.removed_reason}`) : "—" })
            : null;
    body = (
      <Card className="mt-4 p-5 sm:mt-6 sm:p-7">
        {note && <p className="mb-4 rounded-xl bg-gold-50 px-3 py-2 text-sm text-ink-soft">{note}</p>}
        <div className="flex gap-4 sm:gap-6">
          {puzzle && <MiniGridThumb puzzle={puzzle} className="w-24 shrink-0 self-start sm:w-32" />}
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-[0.06em] text-subtle tabular-nums">
              {t("community.cardEyebrow", { size: `${row.width}×${row.height}`, clues: row.clue_count, difficulty: t(`community.difficulty.${row.difficulty}`) })}
            </p>
            <h1 className="mt-1 font-display text-2xl font-bold leading-tight tracking-tight text-ink sm:text-3xl">{row.title}</h1>
            <p className="mt-1 text-sm text-muted">
              <TransitionLink to={authorPath(row.author)} className="rounded-md font-medium hover:text-brand-700 focus-visible:outline-2 focus-visible:outline-brand-500">
                {t("community.by", { author: row.author })}
              </TransitionLink>
              {" · "}
              {t("community.published", { date })}
            </p>
            <p className="mt-1 text-xs text-subtle tabular-nums">{t("community.stats", { plays: row.plays, solves: row.solves })}</p>
          </div>
        </div>
        {row.notes && <p className="mt-4 text-sm leading-relaxed text-ink-soft">{row.notes}</p>}
        {typeof best === "number" ? (
          <p className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-3 py-1 text-sm font-semibold text-brand-700 ring-1 ring-brand-100">
            <Check className="size-4" aria-hidden="true" />
            {t("community.statusSolved", { time: formatDuration(best) })}
          </p>
        ) : progress ? (
          <p className="mt-4 inline-flex items-center rounded-full bg-gold-50 px-3 py-1 text-sm font-semibold text-gold-700 ring-1 ring-gold-100">
            {t("community.statusProgress", { filled: progress.filled, total: progress.total })}
          </p>
        ) : null}
        {error && (
          <p role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-medium text-red-700">
            {error}
          </p>
        )}
        <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:items-center">
          <Button size="lg" onClick={() => void load("play")} disabled={!puzzle || busy !== null} className="sm:flex-1" aria-busy={busy === "play" || undefined}>
            {busy === "play" ? t("community.loadingPuzzle") : typeof best === "number" ? t("community.playAgain") : progress ? t("community.resume") : t("community.playSolo")}
          </Button>
          {canRace && (
            <Button variant="secondary" size="lg" onClick={() => void load("race")} disabled={!puzzle || busy !== null || authLoading} className="sm:flex-1">
              <Swords className="size-4" aria-hidden="true" />
              {t("community.raceFriends")}
            </Button>
          )}
          <div ref={rootRef} className="relative sm:ml-auto">
            <button
              ref={menuButtonRef}
              type="button"
              aria-label={t("community.more")}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              aria-controls={menuOpen ? menuId : undefined}
              onClick={() => setMenuOpen((v) => !v)}
              className="inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-xl border border-line-strong bg-surface px-3 text-sm font-semibold text-ink-soft hover:bg-surface-sunken active:bg-line focus-visible:outline-2 focus-visible:outline-brand-500 sm:w-auto sm:min-w-11"
            >
              <MoreHorizontal className="size-5" aria-hidden="true" />
              <span className="sm:sr-only">{t("community.more")}</span>
            </button>
            {menuOpen && (
              <div
                ref={menuRef}
                id={menuId}
                role="menu"
                aria-label={t("community.more")}
                onKeyDown={onMenuKey}
                className="lf-pop-in absolute right-0 top-full z-40 mt-1.5 w-72 max-w-[calc(100vw-2rem)] rounded-2xl border border-line bg-surface p-1.5 text-ink shadow-overlay"
              >
                <button
                  type="button"
                  role="menuitem"
                  className={ITEM}
                  onClick={() => {
                    setMenuOpen(false);
                    copyLink();
                  }}
                >
                  <Link2 className="size-4 shrink-0 text-muted" aria-hidden="true" />
                  {t("community.copyLink")}
                </button>
                {own ? (
                  <button
                    type="button"
                    role="menuitem"
                    className={ITEM}
                    onClick={() => {
                      setMenuOpen(false);
                      navigate("/studio");
                    }}
                  >
                    <PencilLine className="size-4 shrink-0 text-muted" aria-hidden="true" />
                    {t("community.updateInStudio")}
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      role="menuitem"
                      className={ITEM}
                      onClick={() => {
                        setMenuOpen(false);
                        setReporting(true);
                      }}
                    >
                      <Flag className="size-4 shrink-0 text-muted" aria-hidden="true" />
                      {t("community.report")}
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      className={ITEM}
                      onClick={() => {
                        setMenuOpen(false);
                        hideAuthor(row.author_id);
                        track("author_hidden");
                      }}
                    >
                      <EyeOff className="size-4 shrink-0 text-muted" aria-hidden="true" />
                      {t("community.hideAuthor", { author: row.author })}
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </Card>
    );
  }

  return (
    <PageShell as="main" width="2xl" bar={{ backLabel: t("community.title"), backTo: "/puzzles" }}>
      {body}
      {reporting && row && <ReportDialog puzzleId={row.id} onClose={() => setReporting(false)} />}
    </PageShell>
  );
}
