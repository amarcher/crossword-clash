import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import { BookOpen, Check, Dices, EyeOff, Swords } from "lucide-react";
import { SiteBar } from "../components/SiteBar";
import { Button } from "../components/ui";
import { useAuth } from "../contexts/AuthContext";
import { useGame } from "../contexts/GameContext";
import {
  SIZE_BUCKETS,
  filterEntries,
  loadClassicManifest,
  loadClassicPuzzle,
  pickRandom,
  sizeBucket,
  type ClassicEntry,
  type SizeBucket,
} from "../lib/classicLibrary";
import { formatDuration, loadSoloStats } from "../lib/soloStats";
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
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { handleSoloPuzzleLoaded, setSoloTheme, setUrlPuzzle } = useGame();

  const [entries, setEntries] = useState<ClassicEntry[] | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [hideSolved, setHideSolved] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadClassicManifest().then((list) => {
      if (!cancelled) setEntries(list);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Solo best times are keyed by puzzle identity, which the manifest carries —
  // so "solved" + PB come straight from localStorage, no puzzle parsing.
  const bestTimes = useMemo(() => loadSoloStats().bestTimes, []);
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
    <div className="min-h-dvh crossword-bg pb-10">
      <div className="px-4 pt-2">
        <SiteBar backLabel={t("legal.back")} />
      </div>

      <div className="mx-auto w-full max-w-5xl px-4 pb-5 pt-4 text-center sm:pt-6">
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

      {/* Sticky filter bar — stays reachable while scrolling 46 cards. */}
      <div className="sticky top-0 z-20 border-y border-line bg-canvas/90 px-4 py-2.5 backdrop-blur supports-[backdrop-filter]:bg-canvas/75">
        <div className="mx-auto flex w-full max-w-5xl items-center gap-2">
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

      <div className="mx-auto mt-5 w-full max-w-5xl px-4">
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
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {visible.map((entry) => {
              const best = bestTimes[entry.identity];
              const isSolved = typeof best === "number";
              const isBusy = busy === entry.file;
              return (
                <li
                  key={entry.file}
                  className={`relative flex flex-col rounded-2xl border bg-surface p-4 shadow-card transition-[box-shadow,border-color] duration-150 hover:shadow-raised ${
                    isSolved ? "border-brand-200" : "border-line hover:border-line-strong"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <p className="min-w-0 text-xs font-semibold uppercase tracking-[0.06em] text-subtle tabular-nums">
                      {t("classics.cardEyebrow", {
                        number: entry.number,
                        size: `${entry.width}×${entry.height}`,
                        clues: entry.clues,
                      })}
                      {" · "}
                      {t(`classics.size.${sizeBucket(entry)}`)}
                    </p>
                    {isSolved && (
                      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-brand-50 px-2 py-0.5 text-xs font-semibold text-brand-700 tabular-nums ring-1 ring-brand-100">
                        <Check className="size-3.5" aria-hidden="true" />
                        {formatDuration(best)}
                      </span>
                    )}
                  </div>
                  <h2 className="mt-1.5 font-display text-lg font-semibold leading-snug tracking-tight text-ink">
                    {entry.title}
                  </h2>
                  <p className="text-sm text-muted">{t("classics.by", { author: entry.author })}</p>
                  {entry.blurb && (
                    <p className="mt-2 line-clamp-3 text-sm italic leading-snug text-ink-soft">“{entry.blurb}”</p>
                  )}
                  <div className="mt-auto flex gap-2 pt-4">
                    {/* The play button's ::after stretches over the whole card, so the card itself is the "play solo" target. */}
                    <Button
                      variant={isSolved ? "secondary" : "soft"}
                      onClick={() => void playSolo(entry)}
                      disabled={busy !== null}
                      className="flex-1 after:absolute after:inset-0 after:rounded-2xl"
                    >
                      {isBusy
                        ? t("classics.loadingPuzzle")
                        : isSolved
                          ? t("classics.playAgain")
                          : t("classics.playSolo")}
                    </Button>
                    {canRace && (
                      <Button
                        variant="ghost"
                        onClick={() => void raceFriends(entry)}
                        disabled={busy !== null || authLoading}
                        className="relative z-10"
                      >
                        <Swords className="size-4" aria-hidden="true" />
                        {t("classics.raceFriends")}
                      </Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        <p className="mx-auto mt-10 max-w-2xl px-2 text-center text-xs leading-snug text-subtle">
          {t("classics.credit")}
        </p>
      </div>
    </div>
  );
}
