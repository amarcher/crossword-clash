import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import { Title } from "../components/Title";
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
 * One page, not one page per puzzle: each card offers "Play solo" (straight
 * into /solo/play, same path as the daily mini) and "Race friends" (hands the
 * puzzle to the existing host flow via urlPuzzle, same path as the daily race).
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
    "min-h-10 px-3 py-2 rounded-full text-sm font-medium border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500";
  const chipOn = `${chipBase} bg-neutral-800 text-white border-neutral-800`;
  const chipOff = `${chipBase} bg-white text-neutral-600 border-neutral-300 hover:bg-neutral-100 active:bg-neutral-200`;

  return (
    <div className="flex flex-col items-center min-h-dvh crossword-bg p-6 sm:p-8">
      <Title className="mb-4" />

      <div className="w-full max-w-md">
        <div className="text-center mb-4">
          <h1 className="text-2xl font-bold text-neutral-900">📚 {t("classics.title")}</h1>
          <p className="text-sm text-neutral-500 mt-1">
            {entries && entries.length > 0
              ? t("classics.subtitle", { count: entries.length })
              : t("classics.subtitleNoCount")}
          </p>
          {solvedCount > 0 && entries && (
            <p className="mt-2 inline-flex items-center rounded-full bg-emerald-50 border border-emerald-200 px-3 py-1 text-sm font-semibold text-emerald-700">
              {t("classics.progress", { solved: solvedCount, total: entries.length })}
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-center gap-2 mb-3">
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
        </div>

        <div className="flex items-center justify-between gap-3 mb-4">
          <button
            type="button"
            onClick={surpriseMe}
            disabled={!entries || entries.length === 0 || busy !== null}
            className="flex-1 min-h-11 px-4 py-2.5 rounded-lg text-sm font-semibold text-white bg-gradient-to-br from-blue-600 to-indigo-600 shadow-sm hover:from-blue-700 hover:to-indigo-700 active:from-blue-800 active:to-indigo-800 disabled:opacity-50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
          >
            🎲 {t("classics.surpriseMe")}
          </button>
          {solvedCount > 0 && (
            <button
              type="button"
              onClick={() => setHideSolved((v) => !v)}
              aria-pressed={hideSolved}
              className={hideSolved ? chipOn : chipOff}
            >
              {t("classics.hideSolved")}
            </button>
          )}
        </div>

        {error && (
          <p role="alert" className="mb-3 text-center text-sm text-red-600">
            {error}
          </p>
        )}

        {entries === null ? (
          <p className="py-8 text-center text-sm text-neutral-400">{t("classics.loading")}</p>
        ) : entries.length === 0 ? (
          <p className="py-8 text-center text-sm text-neutral-500">{t("classics.unavailable")}</p>
        ) : visible.length === 0 ? (
          <p className="py-8 text-center text-sm text-neutral-500">{t("classics.emptyFilter")}</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {visible.map((entry) => {
              const best = bestTimes[entry.identity];
              const isSolved = typeof best === "number";
              const isBusy = busy === entry.file;
              return (
                <li
                  key={entry.file}
                  className={`rounded-2xl bg-white shadow-sm border p-4 ${
                    isSolved ? "border-emerald-200" : "border-neutral-200"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
                        {t("classics.cardEyebrow", {
                          number: entry.number,
                          size: `${entry.width}×${entry.height}`,
                          clues: entry.clues,
                        })}
                        {" · "}
                        {t(`classics.size.${sizeBucket(entry)}`)}
                      </p>
                      <h2 className="text-base font-semibold text-neutral-900 leading-snug mt-0.5">
                        {entry.title}
                      </h2>
                      <p className="text-xs text-neutral-500">
                        {t("classics.by", { author: entry.author })}
                      </p>
                    </div>
                    {isSolved && (
                      <span className="shrink-0 inline-flex items-center rounded-full bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-xs font-semibold text-emerald-700 tabular-nums">
                        ✓ {formatDuration(best)}
                      </span>
                    )}
                  </div>
                  {entry.blurb && (
                    <p className="mt-2 text-sm italic text-neutral-600 leading-snug">
                      “{entry.blurb}”
                    </p>
                  )}
                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      onClick={() => void playSolo(entry)}
                      disabled={busy !== null}
                      className="flex-1 min-h-11 px-3 py-2 rounded-lg text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 active:bg-blue-800 disabled:opacity-50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
                    >
                      {isBusy
                        ? t("classics.loadingPuzzle")
                        : isSolved
                          ? t("classics.playAgain")
                          : t("classics.playSolo")}
                    </button>
                    {canRace && (
                      <button
                        type="button"
                        onClick={() => void raceFriends(entry)}
                        disabled={busy !== null || authLoading}
                        className="flex-1 min-h-11 px-3 py-2 rounded-lg text-sm font-semibold text-indigo-700 bg-indigo-50 border border-indigo-200 hover:bg-indigo-100 active:bg-indigo-200 disabled:opacity-50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                      >
                        ⚔️ {t("classics.raceFriends")}
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        <p className="mt-6 text-center text-[11px] text-neutral-400 leading-snug px-2">
          {t("classics.credit")}
        </p>

        <div className="mt-4 text-center">
          <Link
            to="/"
            className="inline-block min-h-11 px-4 py-2.5 text-sm text-neutral-500 underline underline-offset-2 hover:text-neutral-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
          >
            {t("classics.backToMenu")}
          </Link>
        </div>
      </div>
    </div>
  );
}
