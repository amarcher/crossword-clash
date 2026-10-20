import { useCallback, useEffect, useMemo, useState } from "react";
import { useTransitionNavigate } from "../hooks/useTransitionNavigate";
import { useTranslation } from "react-i18next";
import { BookOpen, Check, Dices, EyeOff } from "lucide-react";
import { PageShell, pageColumnClass } from "../components/PageShell";
import { ClassicList } from "../components/ClassicList";
import { Button } from "../components/ui";
import { useAuth } from "../contexts/AuthContext";
import { useGame } from "../contexts/GameContext";
import {
  SIZE_BUCKETS,
  filterEntries,
  knownClassicManifest,
  loadClassicManifest,
  loadClassicPuzzle,
  pickRandom,
  type ClassicEntry,
  type SizeBucket,
} from "../lib/classicLibrary";
import { useBestTimes } from "../hooks/useSolveHistory";
import { track } from "../lib/analytics";

type Filter = SizeBucket | "all";

/**
 * Browse screen for the bundled public-domain library — every puzzle from
 * the 1924 *Cross Word Puzzle Book* we ship, filterable by size, with the
 * player's solved state and personal best pulled from local solo stats.
 *
 * One page, not one page per puzzle: each card is a "Play solo" target
 * (straight into /solo/play, same path as the daily mini) with a secondary
 * "Race friends" (hands the puzzle to the existing host flow via urlPuzzle,
 * same path as the daily race).
 */
export function ClassicLibraryScreen() {
  const { t } = useTranslation();
  const navigate = useTransitionNavigate();
  const { user, loading: authLoading } = useAuth();
  const { handleSoloPuzzleLoaded, setSoloTheme, setUrlPuzzle } = useGame();

  // Known on the first render when the route prefetched it (the normal path)
  // or when the prerendered page embedded it (so hydration renders the same
  // cards the HTML already shows); fetched here only on a direct mount
  // without either.
  const [entries, setEntries] = useState<ClassicEntry[] | null>(() => knownClassicManifest());
  const [filter, setFilter] = useState<Filter>("all");
  const [hideSolved, setHideSolved] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (entries !== null) return;
    let cancelled = false;
    loadClassicManifest().then((list) => {
      if (!cancelled) setEntries(list);
    });
    return () => {
      cancelled = true;
    };
  }, [entries]);

  // Best times are keyed by puzzle identity, which the manifest carries — so
  // "solved" + PB come straight from the account's history (or localStorage
  // when anonymous), no puzzle parsing.
  const bestTimes = useBestTimes();
  const solved = useMemo(() => new Set(Object.keys(bestTimes)), [bestTimes]);
  const solvedCount = useMemo(
    () => (entries ?? []).filter((e) => solved.has(e.identity)).length,
    [entries, solved],
  );

  const visible = useMemo(
    () => filterEntries(entries ?? [], { bucket: filter, hideSolved, solved }),
    [entries, filter, hideSolved, solved],
  );

  const playSolo = useCallback(
    async (entry: ClassicEntry) => {
      setError(null);
      setBusy(entry.file);
      try {
        const puzzle = await loadClassicPuzzle(entry);
        // No file buffer: like the daily mini, this isn't counted as an upload.
        await handleSoloPuzzleLoaded(puzzle);
        setSoloTheme(null);
        navigate("/solo/play");
      } catch {
        setError(t("classics.loadError"));
        setBusy(null);
      }
    },
    [handleSoloPuzzleLoaded, setSoloTheme, navigate, t],
  );

  const raceFriends = useCallback(
    async (entry: ClassicEntry) => {
      setError(null);
      setBusy(entry.file);
      try {
        const puzzle = await loadClassicPuzzle(entry);
        track("mode_selected", { mode: "classic-race" });
        // Same handoff as the daily race: HostNameScreen consumes urlPuzzle
        // and creates the room right after the name prompt.
        setUrlPuzzle(puzzle);
        navigate("/host-game/name");
      } catch {
        setError(t("classics.loadError"));
        setBusy(null);
      }
    },
    [setUrlPuzzle, navigate, t],
  );

  const surpriseMe = useCallback(() => {
    const pick = pickRandom(visible.length > 0 ? visible : (entries ?? []), solved);
    if (pick) void playSolo(pick);
  }, [visible, entries, solved, playSolo]);

  const canRace = Boolean(user) || authLoading;
  const chipBase =
    "inline-flex shrink-0 items-center justify-center gap-1.5 min-h-11 md:min-h-9 px-3.5 rounded-full text-sm font-semibold border transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500";
  const chipOn = `${chipBase} bg-ink text-white border-ink`;
  const chipOff = `${chipBase} bg-surface text-ink-soft border-line-strong hover:bg-surface-sunken active:bg-line`;

  return (
    <PageShell
      width="5xl"
      bar={{ backLabel: t("legal.back") }}
      below={
        <>
          {/* Sticky filter bar — spans the viewport so it stays reachable while scrolling 46 cards. */}
          <div className="sticky top-0 z-20 border-y border-line bg-canvas/90 py-2.5 backdrop-blur supports-[backdrop-filter]:bg-canvas/75">
            <div className={`flex items-center gap-2 ${pageColumnClass("5xl")}`}>
              <div className="-mx-1 flex min-w-0 flex-1 items-center gap-2 overflow-x-auto px-1 py-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                <button
                  type="button"
                  onClick={() => setFilter("all")}
                  aria-pressed={filter === "all"}
                  className={filter === "all" ? chipOn : chipOff}
                >
                  {t("classics.filterAll")}
                </button>
                {SIZE_BUCKETS.map((b) => (
                  <button
                    key={b}
                    type="button"
                    onClick={() => setFilter(b)}
                    aria-pressed={filter === b}
                    className={filter === b ? chipOn : chipOff}
                  >
                    {t(`classics.size.${b}`)}
                  </button>
                ))}
                {solvedCount > 0 && (
                  <button
                    type="button"
                    onClick={() => setHideSolved((v) => !v)}
                    aria-pressed={hideSolved}
                    className={hideSolved ? chipOn : chipOff}
                  >
                    <EyeOff className="size-4" aria-hidden="true" />
                    {t("classics.hideSolved")}
                  </button>
                )}
              </div>
              <Button
                variant="soft"
                onClick={surpriseMe}
                disabled={!entries || entries.length === 0 || busy !== null}
                className="shrink-0 max-sm:w-11 max-sm:px-0"
              >
                <Dices className="size-4.5" aria-hidden="true" />
                <span className="max-sm:sr-only">{t("classics.surpriseMe")}</span>
              </Button>
            </div>
          </div>

          <div className={`mt-5 ${pageColumnClass("5xl")}`}>
            {error && (
              <p role="alert" className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-center text-sm font-medium text-red-700">
                {error}
              </p>
            )}
            {entries === null ? (
              <p className="py-12 text-center text-sm text-subtle">{t("classics.loading")}</p>
            ) : entries.length === 0 ? (
              <p className="py-12 text-center text-sm text-muted">{t("classics.unavailable")}</p>
            ) : visible.length === 0 ? (
              <p className="py-12 text-center text-sm text-muted">{t("classics.emptyFilter")}</p>
            ) : (
              <ClassicList
                entries={visible}
                bestTimes={bestTimes}
                busy={busy}
                intent="library"
                onPrimary={(entry) => void playSolo(entry)}
                onRace={canRace ? (entry) => void raceFriends(entry) : undefined}
                raceDisabled={authLoading}
              />
            )}

            <p className="mx-auto mt-10 max-w-2xl px-2 text-center text-xs leading-snug text-subtle">
              {t("classics.credit")}
            </p>
          </div>
        </>
      }
    >
      <div className="pb-5 pt-4 text-center sm:pt-6">
        <span className="mx-auto mb-3 grid size-12 place-items-center rounded-2xl bg-gold-50 text-gold-700 ring-1 ring-gold-100">
          <BookOpen className="size-6" aria-hidden="true" />
        </span>
        <h1 className="font-display text-3xl font-bold tracking-tight text-ink sm:text-4xl">{t("classics.title")}</h1>
        <p className="mx-auto mt-2 max-w-xl text-sm text-muted sm:text-base">
          {entries && entries.length > 0
            ? t("classics.subtitle", { count: entries.length })
            : t("classics.subtitleNoCount")}
        </p>
        {solvedCount > 0 && entries && (
          <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-3 py-1 text-sm font-semibold text-brand-700 ring-1 ring-brand-100">
            <Check className="size-4" aria-hidden="true" />
            <span>{t("classics.progress", { solved: solvedCount, total: entries.length })}</span>
          </p>
        )}
      </div>
    </PageShell>
  );
}

