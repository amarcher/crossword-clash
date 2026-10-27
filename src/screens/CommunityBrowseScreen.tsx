import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useSearchParams } from "react-router";
import { useTranslation } from "react-i18next";
import { EyeOff, Search, Users } from "lucide-react";
import { PageShell, pageColumnClass } from "../components/PageShell";
import { CommunityList } from "../components/CommunityList";
import { Button, Select, TransitionLink } from "../components/ui";
import { useAuth } from "../contexts/AuthContext";
import { useGame } from "../contexts/GameContext";
import { useBestTimes } from "../hooks/useSolveHistory";
import { useHiddenAuthors } from "../hooks/useHiddenAuthors";
import { useTransitionNavigate } from "../hooks/useTransitionNavigate";
import { track } from "../lib/analytics";
import {
  browseParams,
  COMMUNITY_LANGS,

  DIFFICULTIES,
  fetchCommunityList,
  fetchCommunityPuzzle,
  PAGE_SIZE,
  parseBrowseParams,
  SIZE_BUCKETS,
  SORTS,
  toPlayablePuzzle,
  withoutHidden,
  type BrowseFilters,
  type CommunityLang,
  type CommunityPuzzle,
  type CommunitySort,
} from "../lib/communityPuzzles";
import { hideAuthor, unhideAuthor } from "../lib/hiddenAuthors";
import { inProgressKeys, loadProgressStore } from "../lib/soloProgress";

const SEARCH_DELAY_MS = 300;

type Status = "loading" | "ready" | "error";

/**
 * Browse the community library (docs/community-puzzles-spec.md §2.1), and an
 * author's page (`/puzzles/by/:username`, §2.3): the same list with the
 * author fixed. Filters live in the URL so a filtered view is shareable and
 * back/forward restore it; pages load 24 at a time behind "Load more".
 * Hidden authors (this device's list) are dropped from each page.
 */
export function CommunityBrowseScreen() {
  const { t, i18n } = useTranslation();
  const navigate = useTransitionNavigate();
  const { username } = useParams<{ username?: string }>();
  const [params, setParams] = useSearchParams();
  const { user, loading: authLoading } = useAuth();
  const { handleSoloPuzzleLoaded, setSoloTheme, setUrlPuzzle } = useGame();
  const uiLang: CommunityLang = i18n.language?.startsWith("es") ? "es" : "en";

  const filters = useMemo<BrowseFilters>(() => {
    const parsed = parseBrowseParams(params, uiLang);
    // The author page: every language, the author from the route.
    return username ? { ...parsed, author: username, lang: params.get("lang") ? parsed.lang : "all" } : parsed;
  }, [params, uiLang, username]);
  const setFilters = useCallback(
    (next: BrowseFilters) => {
      const out = browseParams({ ...next, author: username ? null : next.author }, uiLang);
      if (username && next.lang === "all") out.delete("lang");
      setParams(out, { replace: true });
    },
    [setParams, uiLang, username],
  );

  // The search box types freely; the URL (and the query) follow after a pause.
  const [queryInput, setQueryInput] = useState(filters.query);
  useEffect(() => setQueryInput(filters.query), [filters.query]);
  const filtersRef = useRef(filters);
  filtersRef.current = filters;
  useEffect(() => {
    if (queryInput === filtersRef.current.query) return;
    const handle = setTimeout(() => setFilters({ ...filtersRef.current, query: queryInput }), SEARCH_DELAY_MS);
    return () => clearTimeout(handle);
  }, [queryInput, setFilters]);

  const [rows, setRows] = useState<CommunityPuzzle[]>([]);
  const [status, setStatus] = useState<Status>("loading");
  const [page, setPage] = useState(0);
  const [done, setDone] = useState(false);
  const [more, setMore] = useState(false);
  const [hideSolved, setHideSolved] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const filterKey = JSON.stringify(filters);
  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    setPage(0);
    const current = JSON.parse(filterKey) as BrowseFilters;
    fetchCommunityList(current, 0).then(
      (list) => {
        if (cancelled) return;
        setRows(list);
        setDone(list.length < PAGE_SIZE);
        setStatus("ready");
      },
      () => {
        if (!cancelled) setStatus("error");
      },
    );
    return () => {
      cancelled = true;
    };
  }, [filterKey]);

  const loadMore = () => {
    const next = page + 1;
    setMore(true);
    fetchCommunityList(filters, next).then(
      (list) => {
        setRows((prev) => [...prev, ...list]);
        setPage(next);
        setDone(list.length < PAGE_SIZE);
        setMore(false);
      },
      () => setMore(false),
    );
  };

  const hidden = useHiddenAuthors();
  const bestTimes = useBestTimes();
  const inProgress = useMemo(() => inProgressKeys(loadProgressStore()), []);
  const { rows: unhidden, hiddenCount } = useMemo(() => withoutHidden(rows, hidden), [rows, hidden]);
  const visible = useMemo(() => (hideSolved ? unhidden.filter((r) => typeof bestTimes[r.puzzle_key] !== "number") : unhidden), [unhidden, hideSolved, bestTimes]);
  const solvedCount = useMemo(() => unhidden.filter((r) => typeof bestTimes[r.puzzle_key] === "number").length, [unhidden, bestTimes]);

  const authorId = username ? (rows[0]?.author_id ?? null) : null;
  const authorHidden = !!authorId && hidden.includes(authorId);

  const load = useCallback(
    async (entry: CommunityPuzzle, what: "play" | "race") => {
      setError(null);
      setBusy(entry.short_id);
      try {
        const row = await fetchCommunityPuzzle(entry.short_id);
        if (!row) throw new Error("gone");
        const puzzle = toPlayablePuzzle(row);
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
    [handleSoloPuzzleLoaded, setSoloTheme, setUrlPuzzle, navigate, t],
  );

  const canRace = Boolean(user) || authLoading;
  const chipBase =
    "inline-flex shrink-0 items-center justify-center gap-1.5 min-h-11 md:min-h-9 px-3.5 rounded-full text-sm font-semibold border transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500";
  const chipOn = `${chipBase} bg-ink text-white border-ink`;
  const chipOff = `${chipBase} bg-surface text-ink-soft border-line-strong hover:bg-surface-sunken active:bg-line`;

  return (
    <PageShell
      width="5xl"
      bar={{ backLabel: t("legal.back"), backTo: username ? "/puzzles" : "/menu" }}
      below={
        <>
          <div className="sticky top-0 z-20 border-y border-line bg-canvas/90 py-2.5 backdrop-blur supports-[backdrop-filter]:bg-canvas/75">
            <div className={`flex flex-col gap-2 ${pageColumnClass("5xl")}`}>
              <div className="flex items-center gap-2">
                <label className="relative min-w-0 flex-1">
                  <span className="sr-only">{t("community.searchLabel")}</span>
                  <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle" aria-hidden="true" />
                  <input
                    type="search"
                    inputMode="search"
                    autoComplete="off"
                    className="h-11 w-full rounded-full border border-line-strong bg-surface pl-9 pr-3 text-base text-ink placeholder:text-subtle focus-visible:outline-2 focus-visible:outline-brand-500 md:h-10 md:text-sm"
                    placeholder={t("community.searchPlaceholder")}
                    value={queryInput}
                    onChange={(e) => setQueryInput(e.target.value)}
                  />
                </label>
                <Select<CommunitySort>
                  aria-label={t("community.sortLabel")}
                  className="w-36 shrink-0"
                  value={filters.sort}
                  options={SORTS.map((s) => ({ value: s, label: t(`community.sort.${s}`) }))}
                  onChange={(sort) => setFilters({ ...filters, sort })}
                />
              </div>
              <div className="-mx-1 flex min-w-0 items-center gap-2 overflow-x-auto px-1 py-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                <button type="button" onClick={() => setFilters({ ...filters, size: "all" })} aria-pressed={filters.size === "all"} className={filters.size === "all" ? chipOn : chipOff}>
                  {t("community.sizeAll")}
                </button>
                {SIZE_BUCKETS.map((b) => (
                  <button key={b} type="button" onClick={() => setFilters({ ...filters, size: b })} aria-pressed={filters.size === b} className={filters.size === b ? chipOn : chipOff}>
                    {t(`community.size.${b}`)}
                  </button>
                ))}
                <span className="mx-0.5 h-5 w-px shrink-0 bg-line" aria-hidden="true" />
                <Select
                  aria-label={t("community.difficultyAll")}
                  size="sm"
                  className="shrink-0"
                  value={filters.difficulty}
                  options={[{ value: "all", label: t("community.difficultyAll") }, ...DIFFICULTIES.map((d) => ({ value: d, label: t(`community.difficulty.${d}`) }))]}
                  onChange={(difficulty) => setFilters({ ...filters, difficulty })}
                />
                <Select
                  aria-label={t("community.lang.all")}
                  size="sm"
                  className="shrink-0"
                  value={filters.lang}
                  options={[...COMMUNITY_LANGS.map((l) => ({ value: l, label: t(`community.lang.${l}`) })), { value: "all", label: t("community.lang.all") }]}
                  onChange={(lang) => setFilters({ ...filters, lang })}
                />
                {solvedCount > 0 && (
                  <button type="button" onClick={() => setHideSolved((v) => !v)} aria-pressed={hideSolved} className={hideSolved ? chipOn : chipOff}>
                    <EyeOff className="size-4" aria-hidden="true" />
                    {t("community.hideSolved")}
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className={`mt-5 ${pageColumnClass("5xl")}`}>
            {error && (
              <p role="alert" className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-center text-sm font-medium text-red-700">
                {error}
              </p>
            )}
            {username && authorHidden ? (
              <div className="py-12 text-center text-sm text-muted">
                <p>{t("community.authorHidden")}</p>
                <Button variant="secondary" className="mt-3" onClick={() => authorId && unhideAuthor(authorId)}>
                  {t("community.showAgain")}
                </Button>
              </div>
            ) : status === "loading" ? (
              <p className="py-12 text-center text-sm text-subtle" aria-busy="true">
                {t("community.loading")}
              </p>
            ) : status === "error" ? (
              <p className="py-12 text-center text-sm text-muted">{t("community.unavailable")}</p>
            ) : rows.length === 0 ? (
              <p className="py-12 text-center text-sm text-muted">
                {username ? t("community.authorEmpty") : filters.query || filters.size !== "all" || filters.difficulty !== "all" ? t("community.emptyFilter") : t("community.empty")}
              </p>
            ) : visible.length === 0 ? (
              <p className="py-12 text-center text-sm text-muted">{t("community.emptyFilter")}</p>
            ) : (
              <CommunityList
                entries={visible}
                bestTimes={bestTimes}
                inProgress={inProgress}
                busy={busy}
                onPlay={(entry) => void load(entry, "play")}
                onRace={canRace ? (entry) => void load(entry, "race") : undefined}
                raceDisabled={authLoading}
                showAuthor={!username}
              />
            )}
            <p role="status" aria-live="polite" className="mt-4 text-center text-xs text-subtle">
              {hiddenCount > 0 && !authorHidden ? t("community.hiddenNote", { count: hiddenCount }) : ""}
            </p>
            {status === "ready" && !done && !authorHidden && (
              <div className="mt-2 flex justify-center">
                <Button variant="secondary" onClick={loadMore} disabled={more} aria-busy={more || undefined}>
                  {more ? t("community.loadingMore") : t("community.loadMore")}
                </Button>
              </div>
            )}
          </div>
        </>
      }
    >
      <div className="pb-5 pt-4 text-center sm:pt-6">
        <span className="mx-auto mb-3 grid size-12 place-items-center rounded-2xl bg-brand-50 text-brand-600 ring-1 ring-brand-100">
          <Users className="size-6" aria-hidden="true" />
        </span>
        <h1 className="font-display text-3xl font-bold tracking-tight text-ink sm:text-4xl">{username ? t("community.authorTitle", { author: username }) : t("community.title")}</h1>
        <p className="mx-auto mt-2 max-w-xl text-sm text-muted sm:text-base">
          {username ? (status === "ready" && done ? t("community.authorSubtitle", { count: rows.length }) : "") : t("community.subtitle")}
        </p>
        {username && authorId && !authorHidden && (
          <button
            type="button"
            onClick={() => {
              hideAuthor(authorId);
              track("author_hidden");
            }}
            className="mt-3 inline-flex min-h-11 items-center gap-1.5 rounded-lg px-3 text-sm font-medium text-ink-soft hover:text-ink focus-visible:outline-2 focus-visible:outline-brand-500"
          >
            <EyeOff className="size-4" aria-hidden="true" />
            {t("community.hideAuthor", { author: username })}
          </button>
        )}
        {!username && (
          <TransitionLink to="/studio" className="mt-3 inline-flex min-h-11 items-center text-sm font-semibold text-brand-700 underline decoration-brand-200 underline-offset-4 hover:decoration-brand-500">
            {t("community.makeYourOwn")}
          </TransitionLink>
        )}
      </div>
    </PageShell>
  );
}
