/**
 * PROTOTYPE — throwaway. Three variants of a "past puzzles" archive on the
 * dev-only route /prototype/archive, switchable via `?variant=A|B|C` and the
 * floating bar. Real data: the generated daily index (public/daily-puzzles/
 * index*.json) filtered to today, the viewer's real best times and the
 * resumable solo game — or, with `?fake=1`, a deterministic fake history so
 * every state is visible. Play / Race go through the real load paths.
 * Spec and trade-offs: docs/puzzle-archive-spec.md §3.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { useTranslation } from "react-i18next";
import { CalendarDays, Dices, Sparkles } from "lucide-react";
import { PageShell } from "../../components/PageShell";
import { ClassicList } from "../../components/ClassicList";
import { useAuth } from "../../contexts/AuthContext";
import { useGame, loadSavedSession } from "../../contexts/GameContext";
import { useBestTimes, useStreaks } from "../../hooks/useSolveHistory";
import { useTransitionNavigate } from "../../hooks/useTransitionNavigate";
import { fetchDailyForDay } from "../../lib/dailyFeed";
import { fetchPublishedIndex, type DailyIndexEntry } from "../../lib/dailyIndex";
import { loadClassicManifest, loadClassicPuzzle, type ClassicEntry } from "../../lib/classicLibrary";
import { dayKey, loadSoloTimer, puzzleIdentity } from "../../lib/soloStats";
import { deriveItems, fakeHistory, shortDay, type ArchiveItem } from "./archiveData";
import { PrototypeSwitcher } from "./PrototypeSwitcher";
import { VariantCalendar } from "./VariantCalendar";
import { VariantWeeks } from "./VariantWeeks";
import { VariantStats } from "./VariantStats";

export interface VariantProps {
  items: ArchiveItem[];
  today: string;
  onPlay: (item: ArchiveItem) => void;
  onRace: (item: ArchiveItem) => void;
  /** identity of the item loading, or null */
  busy: string | null;
  canRace: boolean;
  streak: number;
  classicsSolved: number;
  classicsTotal: number;
}

const VARIANTS = [
  { key: "A", name: "Calendar" },
  { key: "B", name: "Weeks" },
  { key: "C", name: "Stats" },
] as const;

/** The resumable solo game's identity, unless it is already finished. */
function inProgressIdentity(): string | null {
  const saved = loadSavedSession();
  if (!saved?.puzzle) return null;
  const id = puzzleIdentity(saved.puzzle);
  const timer = loadSoloTimer();
  return timer?.key === id && timer.completed ? null : id;
}

export function ArchivePrototypeScreen() {
  const { t, i18n } = useTranslation();
  const [params, setParams] = useSearchParams();
  const variant = VARIANTS.some((v) => v.key === params.get("variant")) ? (params.get("variant") as "A" | "B" | "C") : "A";
  const fake = params.get("fake") === "1";
  const setParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(params);
    if (value === null) next.delete(key);
    else next.set(key, value);
    setParams(next, { replace: true });
  };

  const navigate = useTransitionNavigate();
  const { user, loading: authLoading } = useAuth();
  const { handleSoloPuzzleLoaded, setSoloTheme, setUrlPuzzle } = useGame();
  const today = dayKey(new Date());

  const [entries, setEntries] = useState<DailyIndexEntry[] | null>(null);
  const [classics, setClassics] = useState<ClassicEntry[]>([]);
  const [showClassics, setShowClassics] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void fetchPublishedIndex(today).then((list) => alive && setEntries(list));
    void loadClassicManifest().then((list) => alive && setClassics(list));
    return () => {
      alive = false;
    };
  }, [today]);

  const realBest = useBestTimes();
  const realStreaks = useStreaks();
  const fakeData = useMemo(() => (fake && entries ? fakeHistory(entries, today) : null), [fake, entries, today]);
  const bestTimes = fakeData?.bestTimes ?? realBest;
  const streak = fakeData?.streak ?? realStreaks.daily;
  const items = useMemo(
    () => deriveItems(entries ?? [], bestTimes, fakeData ? fakeData.inProgressIdentity : inProgressIdentity()),
    [entries, bestTimes, fakeData],
  );
  const classicsSolved = classics.filter((c) => c.identity in bestTimes).length;

  const onPlay = useCallback(
    async (item: ArchiveItem) => {
      setError(null);
      setBusy(item.identity);
      const daily = await fetchDailyForDay(item.day, item.slot);
      if (!daily) {
        setError("That puzzle couldn't be loaded.");
        setBusy(null);
        return;
      }
      await handleSoloPuzzleLoaded(daily.puzzle);
      setSoloTheme(daily.theme || null);
      navigate("/solo/play");
    },
    [handleSoloPuzzleLoaded, setSoloTheme, navigate],
  );
  const onRace = useCallback(
    async (item: ArchiveItem) => {
      setError(null);
      setBusy(item.identity);
      const daily = await fetchDailyForDay(item.day, item.slot);
      if (!daily) {
        setError("That puzzle couldn't be loaded.");
        setBusy(null);
        return;
      }
      setUrlPuzzle(daily.puzzle);
      navigate("/host-game/name");
    },
    [setUrlPuzzle, navigate],
  );
  const playClassic = useCallback(
    async (entry: ClassicEntry) => {
      setBusy(entry.file);
      try {
        const puzzle = await loadClassicPuzzle(entry);
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

  const props: VariantProps = {
    items,
    today,
    onPlay: (it) => void onPlay(it),
    onRace: (it) => void onRace(it),
    busy,
    canRace: !!user || authLoading,
    streak,
    classicsSolved,
    classicsTotal: classics.length,
  };

  const chip = "inline-flex min-h-10 items-center gap-1.5 rounded-full border px-3.5 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500";

  return (
    <PageShell width="md" bar={{ backLabel: t("completion.backToMenu") }}>
      <div className="pt-3" data-archive-ready={entries ? "1" : undefined}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="font-display text-3xl font-bold tracking-tight text-ink">Past puzzles</h1>
            <p className="mt-1 text-sm text-muted">Every daily since {entries?.[0] ? shortDay(entries[0].day, i18n.language) : "…"}, with your times.</p>
          </div>
          {variant !== "C" && (
            <div className="flex shrink-0 gap-1.5" role="group" aria-label="Collection">
              <button type="button" onClick={() => setShowClassics(false)} aria-pressed={!showClassics} className={`${chip} ${!showClassics ? "border-ink bg-ink text-white" : "border-line-strong bg-surface text-ink-soft hover:bg-surface-sunken"}`}>
                <CalendarDays className="size-4" aria-hidden="true" /> Dailies
              </button>
              <button type="button" onClick={() => setShowClassics(true)} aria-pressed={showClassics} className={`${chip} ${showClassics ? "border-ink bg-ink text-white" : "border-line-strong bg-surface text-ink-soft hover:bg-surface-sunken"}`}>
                Classics
              </button>
            </div>
          )}
        </div>
        {error && (
          <p role="alert" className="mt-3 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-center text-sm font-medium text-red-700">
            {error}
          </p>
        )}
        {entries === null ? (
          <p className="py-16 text-center text-sm text-subtle" aria-busy="true">Loading the archive…</p>
        ) : showClassics && variant !== "C" ? (
          <div className="mt-4 pb-28">
            <ClassicList entries={classics} bestTimes={bestTimes} busy={busy} intent="library" onPrimary={(e) => void playClassic(e)} />
          </div>
        ) : variant === "A" ? (
          <VariantCalendar {...props} />
        ) : variant === "B" ? (
          <VariantWeeks {...props} />
        ) : (
          <VariantStats {...props} />
        )}
      </div>
      <PrototypeSwitcher variants={VARIANTS} current={variant} onChange={(key) => setParam("variant", key)}>
        <button
          type="button"
          onClick={() => setParam("fake", fake ? null : "1")}
          aria-pressed={fake}
          className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold ${fake ? "bg-gold-400 text-ink" : "text-white/80 hover:bg-white/10"}`}
          title="Toggle a fake history so every state shows"
        >
          {fake ? <Sparkles className="size-3.5" aria-hidden="true" /> : <Dices className="size-3.5" aria-hidden="true" />}
          {fake ? "Fake history" : "Real history"}
        </button>
      </PrototypeSwitcher>
    </PageShell>
  );
}
