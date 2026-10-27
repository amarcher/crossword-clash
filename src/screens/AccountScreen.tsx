import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { BookOpen, CalendarDays, Check, ChevronRight, Clock, Flame, Globe, LogOut, Newspaper, Pencil, Play, Sparkles } from "lucide-react";
import { PageShell } from "../components/PageShell";
import { Button, Card, Eyebrow, TransitionLink } from "../components/ui";
import { PlusPurchaseControls } from "../components/Plus/PlusPurchaseControls";
import { avatarInitial } from "../components/Account/AccountControl";
import { useAccountContext } from "../contexts/AccountContext";
import { useGame, loadSavedSession } from "../contexts/GameContext";
import { useSolveHistory, useStreaks, useBestTimes } from "../hooks/useSolveHistory";
import { useTransitionNavigate } from "../hooks/useTransitionNavigate";
import { accountName, signOut } from "../lib/account";
import { inProgressRows, recentSolves, solveDate, type InProgressRow } from "../lib/accountHistory";
import { track } from "../lib/analytics";
import { inProgressFrom } from "../lib/archive";
import { knownClassicManifest, loadClassicManifest, loadClassicPuzzle, type ClassicEntry } from "../lib/classicLibrary";
import { fetchDailyForDay, type DailySlot } from "../lib/dailyFeed";
import { knownPublishedIndex, loadPublishedIndex, type DailyIndexEntry } from "../lib/dailyIndex";
import { plusEnabled } from "../lib/plus";
import { communityEnabled } from "../lib/community";
import { fetchMyPuzzles, puzzlePath, type CommunityPuzzle } from "../lib/communityPuzzles";
import { loadProgressStore } from "../lib/soloProgress";
import { dayKey, formatDuration, loadSoloTimer } from "../lib/soloStats";
import type { SolveRow } from "../lib/solveHistory";
import { prefetchOnIntent } from "../routeModules";

const SLOT_EYEBROW = { mini: "menu.dailyMiniEyebrow", midi: "menu.dailyMidiEyebrow", large: "menu.dailyLargeEyebrow" } as const satisfies Record<DailySlot, string>;
const PROVIDER_NAMES: Record<string, string> = { apple: "Apple", google: "Google" };

/** The sign-in provider's display name, from Supabase's app metadata. */
function providerName(user: { app_metadata?: { provider?: string } }): string | null {
  const id = user.app_metadata?.provider;
  if (!id || id === "anonymous" || id === "email") return null;
  return PROVIDER_NAMES[id] ?? id;
}

function SourceChip({ row }: { row: Pick<SolveRow, "source"> }) {
  const { t } = useTranslation();
  const label = row.source === "daily" ? t("account.sourceDaily") : row.source === "nyt" ? t("account.sourceNyt") : row.source === "community" ? t("account.sourceCommunity") : t("account.sourceOther");
  const Icon = row.source === "daily" ? CalendarDays : row.source === "nyt" ? Newspaper : BookOpen;
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-surface-sunken px-2 py-0.5 text-xs font-semibold text-ink-soft">
      <Icon className="size-3.5" aria-hidden="true" />
      {label}
    </span>
  );
}

/**
 * /account — the signed-in solver's page: who they are (username, provider,
 * Change username), Plus once the launch switch is on (the subscriber view
 * or the pitch), streaks and the synced solve count, the puzzles in progress
 * (the per-puzzle solo store matched to the daily index and the classic
 * manifest, each with Resume on the daily / classic play path), the most
 * recent solves, and at the bottom sign out and delete. Anonymous visitors
 * are sent to the menu with the sign-in sheet open.
 */
export function AccountScreen() {
  const { t, i18n } = useTranslation();
  const locale = i18n.language;
  const navigate = useTransitionNavigate();
  const account = useAccountContext();
  const { user, profile, ready, available } = account;
  const { handleSoloPuzzleLoaded, setSoloTheme } = useGame();
  const history = useSolveHistory();
  const streaks = useStreaks();
  const bestTimes = useBestTimes();
  const today = dayKey(new Date());

  // Not for anonymous visitors: back to the menu, sign-in sheet open — unless
  // the visitor just signed out here, who wants the menu and nothing else.
  const leftOnPurpose = useRef(false);
  useEffect(() => {
    if (!ready || (available && user)) return;
    navigate("/menu", { replace: true });
    if (available && !leftOnPurpose.current) account.openAccount({ placement: "account-page" });
  }, [ready, available, user, navigate, account]);

  // The names behind the progress store's keys: the daily index (warmed
  // with this route's chunk) and the classic manifest.
  const [dailies, setDailies] = useState<DailyIndexEntry[] | null | undefined>(() => knownPublishedIndex(today));
  const [classics, setClassics] = useState<ClassicEntry[] | null>(() => knownClassicManifest());
  useEffect(() => {
    let alive = true;
    if (dailies === undefined || dailies === null) void loadPublishedIndex(today).then((list) => alive && setDailies(list));
    if (classics === null) void loadClassicManifest().then((list) => alive && setClassics(list));
    return () => {
      alive = false;
    };
  }, [dailies, classics, today]);
  // Read once, like /archive: resuming navigates away before it could change.
  const [inProgress] = useState(() => inProgressFrom(loadProgressStore(), loadSavedSession(), loadSoloTimer()));
  const pending = useMemo(() => inProgressRows(inProgress, bestTimes, dailies, classics), [inProgress, bestTimes, dailies, classics]);
  const recent = useMemo(() => recentSolves(history.rows), [history.rows]);

  // The account's community puzzles (docs/community-puzzles-spec.md §1.4), only with the switch on.
  const [mine, setMine] = useState<CommunityPuzzle[] | null | "failed">(null);
  const userId = user?.id ?? null;
  useEffect(() => {
    if (!userId || !communityEnabled()) return;
    let alive = true;
    fetchMyPuzzles(userId).then(
      (rows) => alive && setMine(rows),
      () => alive && setMine("failed"),
    );
    return () => {
      alive = false;
    };
  }, [userId]);

  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const resume = useCallback(
    async (row: InProgressRow) => {
      setError(null);
      setBusy(row.key);
      try {
        if (row.kind === "daily") {
          const daily = await fetchDailyForDay(row.entry.day, row.entry.slot);
          if (!daily) throw new Error("not published");
          track("mode_selected", { mode: "account-resume", slot: row.entry.slot });
          await handleSoloPuzzleLoaded(daily.puzzle);
          setSoloTheme(daily.theme || null);
        } else {
          const puzzle = await loadClassicPuzzle(row.entry);
          track("mode_selected", { mode: "account-resume", slot: "classic" });
          await handleSoloPuzzleLoaded(puzzle);
          setSoloTheme(null);
        }
        navigate("/solo/play");
      } catch {
        setError(t("archive.loadError"));
        setBusy(null);
      }
    },
    [handleSoloPuzzleLoaded, setSoloTheme, navigate, t],
  );

  const handleSignOut = () => {
    leftOnPurpose.current = true;
    void signOut().catch((err) => {
      leftOnPurpose.current = false;
      console.warn("Sign out:", err);
    });
  };

  if (!ready || !user) {
    return (
      <PageShell width="md" bar={{ backLabel: t("completion.backToMenu") }} grow>
        <div className="flex flex-1 items-center justify-center">
          <p className="text-sm text-muted">{t("account.recentLoading")}</p>
        </div>
      </PageShell>
    );
  }

  const username = profile?.username ?? null;
  const name = username ?? accountName(user);
  const provider = providerName(user);
  const solveCount = history.summary?.solveCount ?? null;

  return (
    <PageShell width="md" widthLg="4xl" bar={{ backLabel: t("completion.backToMenu") }}>
      <h1 className="sr-only">{t("account.pageTitle")}</h1>
      <div className="mt-4 grid grid-cols-[minmax(0,1fr)] gap-6 lg:mt-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:items-start lg:gap-8">
        <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
          {/* Identity */}
          <Card className="p-5 sm:p-6">
            <div className="flex items-start gap-4">
              <span aria-hidden="true" className="grid size-14 shrink-0 place-items-center rounded-full bg-brand-50 font-display text-xl font-bold text-brand-700 ring-1 ring-brand-100">
                {avatarInitial(name)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-display text-2xl font-bold leading-tight tracking-tight text-ink">{name}</p>
                <p className="mt-1 truncate text-sm text-muted">{username ? accountName(user) : t("account.noUsernameYet")}</p>
                {provider && <p className="mt-0.5 text-xs text-subtle">{t("account.signedInWith", { provider })}</p>}
              </div>
            </div>
            <Button variant="secondary" size="md" block className="mt-5" onClick={() => account.openAccount({ view: "username", placement: "account-page" })}>
              <Pencil className="size-4" aria-hidden="true" />
              {username ? t("account.changeUsername") : t("account.chooseUsername")}
            </Button>
          </Card>

          {/* Overview */}
          <section className="grid grid-cols-[minmax(0,1fr)] gap-3" aria-labelledby="account-overview">
            <Eyebrow as="h2" id="account-overview" className="px-1">
              {t("account.pageOverview")}
            </Eyebrow>
            <dl className="grid grid-cols-3 gap-2.5">
              <Card className="flex min-w-0 flex-col p-3.5">
                <dt className="flex items-start gap-1.5 text-xs font-semibold leading-snug text-muted">
                  <Flame className="mt-px size-3.5 shrink-0 text-gold-500" aria-hidden="true" />
                  {t("account.statDailyStreak")}
                </dt>
                <dd className="mt-auto pt-1.5 font-display text-xl font-bold leading-none text-ink tabular-nums">{t("account.statDays", { count: streaks.daily })}</dd>
              </Card>
              <Card className="flex min-w-0 flex-col p-3.5">
                <dt className="flex items-start gap-1.5 text-xs font-semibold leading-snug text-muted">
                  <Newspaper className="mt-px size-3.5 shrink-0 text-brand-600" aria-hidden="true" />
                  {t("account.statNytStreak")}
                </dt>
                <dd className="mt-auto pt-1.5 font-display text-xl font-bold leading-none text-ink tabular-nums">{t("account.statDays", { count: streaks.nyt })}</dd>
              </Card>
              <Card className="flex min-w-0 flex-col p-3.5">
                <dt className="flex items-start gap-1.5 text-xs font-semibold leading-snug text-muted">
                  <Check className="mt-px size-3.5 shrink-0 text-brand-600" aria-hidden="true" />
                  {t("account.statSolves")}
                </dt>
                <dd className="mt-auto pt-1.5 font-display text-xl font-bold leading-none text-ink tabular-nums" aria-busy={solveCount === null && history.loading}>
                  {solveCount === null ? "–" : solveCount}
                </dd>
              </Card>
            </dl>
          </section>

          {/* Plus: only once the launch switch is on. */}
          {plusEnabled() && (
            <Card className="p-5 sm:p-6" aria-labelledby="account-plus">
              <div className="flex items-start gap-3.5">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-600">
                  <Sparkles className="size-5" aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1">
                  <h2 id="account-plus" className="font-display text-lg font-bold leading-snug tracking-tight text-ink">
                    {t("plus.title")}
                  </h2>
                  <p className="mt-1 text-sm leading-relaxed text-muted">{account.plus ? t("plus.youHavePlus") : t("plus.rowPitch")}</p>
                </div>
              </div>
              <div className="mt-4">
                {account.plus ? (
                  <PlusPurchaseControls
                    account={{ signedIn: true, plus: account.plus, plusRow: account.plusRow, refreshEntitlements: account.refreshEntitlements }}
                    placement="account-page"
                    returnTo="/account"
                  />
                ) : (
                  <Button variant="soft" size="md" block onClick={() => account.openPaywall({ placement: "account-page", returnTo: "/account" })}>
                    {t("plus.about")}
                  </Button>
                )}
              </div>
            </Card>
          )}

          <div className="hidden lg:block">
            <Footer onSignOut={handleSignOut} onDelete={() => account.openAccount({ view: "delete", placement: "account-page" })} />
          </div>
        </div>

        <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
          {/* In progress */}
          <section className="grid grid-cols-[minmax(0,1fr)] gap-3" aria-labelledby="account-inprogress">
            <Eyebrow as="h2" id="account-inprogress" className="px-1">
              {t("account.inProgressHeading")}
            </Eyebrow>
            {pending.length === 0 ? (
              <Card className="p-5 text-sm leading-relaxed text-muted">{t("account.inProgressEmpty")}</Card>
            ) : (
              <Card className="divide-y divide-line">
                {pending.map((row) => (
                  <div key={row.key} className="flex items-center gap-3.5 px-4 py-3">
                    <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-gold-50 text-gold-700">
                      <Clock className="size-5" aria-hidden="true" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold leading-snug text-ink">{row.entry.title}</p>
                      <p className="mt-0.5 text-sm leading-snug text-muted">
                        {row.kind === "daily" ? `${t(SLOT_EYEBROW[row.entry.slot])} · ${solveDate(row.entry.day, locale, today)}` : t("account.sourceClassic")}
                        {row.progress.total > 0 && (
                          <>
                            {" · "}
                            <span className="whitespace-nowrap tabular-nums">
                              {t("archive.progressHint", {
                                filled: row.progress.filled,
                                total: row.progress.total,
                                time: formatDuration(row.progress.elapsedMs / 1000),
                              })}
                            </span>
                          </>
                        )}
                      </p>
                    </div>
                    <Button size="sm" onClick={() => void resume(row)} disabled={busy !== null} aria-busy={busy === row.key || undefined} {...prefetchOnIntent("/solo/play")}>
                      <Play className="size-4" aria-hidden="true" />
                      {t("archive.resume")}
                    </Button>
                  </div>
                ))}
              </Card>
            )}
            {error && (
              <p role="alert" className="px-1 text-sm text-red-600">
                {error}
              </p>
            )}
          </section>

          {/* Your puzzles (community) */}
          {communityEnabled() && (
            <section className="grid grid-cols-[minmax(0,1fr)] gap-3" aria-labelledby="account-puzzles">
              <Eyebrow as="h2" id="account-puzzles" className="px-1">
                {t("account.yourPuzzlesHeading")}
              </Eyebrow>
              {mine === null ? (
                <Card className="p-5 text-sm text-muted" aria-busy="true">
                  {t("account.yourPuzzlesLoading")}
                </Card>
              ) : mine === "failed" ? (
                <Card className="p-5 text-sm leading-relaxed text-muted">{t("account.yourPuzzlesOffline")}</Card>
              ) : mine.length === 0 ? (
                <Card className="p-5 text-sm leading-relaxed text-muted">{t("account.yourPuzzlesEmpty")}</Card>
              ) : (
                <Card className="divide-y divide-line">
                  {mine.map((row) => (
                    <div key={row.id} className="flex items-center gap-3.5 px-4 py-3">
                      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-600">
                        <Globe className="size-5" aria-hidden="true" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold leading-snug text-ink">
                          {row.status === "published" ? (
                            <TransitionLink to={puzzlePath(row.short_id)} className="rounded-md hover:text-brand-700 focus-visible:outline-2 focus-visible:outline-brand-500">
                              {row.title}
                            </TransitionLink>
                          ) : (
                            row.title
                          )}
                        </p>
                        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-sm leading-snug text-muted">
                          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${row.status === "published" ? "bg-brand-50 text-brand-700" : "bg-surface-sunken text-ink-soft"}`}>
                            {t(`account.puzzleStatus.${row.status}`)}
                          </span>
                          <span className="tabular-nums">{t("account.puzzleStats", { plays: row.plays, solves: row.solves })}</span>
                          {row.status === "removed" && row.removed_reason && <span>{t(`community.removedReason.${row.removed_reason}`)}</span>}
                        </p>
                      </div>
                    </div>
                  ))}
                </Card>
              )}
              <TransitionLink
                to="/studio"
                className="inline-flex min-h-11 items-center gap-1.5 self-start px-1 text-sm font-semibold text-brand-700 hover:text-brand-800 focus-visible:outline-2 focus-visible:outline-brand-500"
              >
                <Globe className="size-4" aria-hidden="true" />
                {t("account.openStudio")}
                <ChevronRight className="size-4" aria-hidden="true" />
              </TransitionLink>
            </section>
          )}

          {/* Recent solves */}
          <section className="grid grid-cols-[minmax(0,1fr)] gap-3" aria-labelledby="account-recent">
            <Eyebrow as="h2" id="account-recent" className="px-1">
              {t("account.recentHeading")}
            </Eyebrow>
            {history.loading && !history.summary ? (
              <Card className="p-5 text-sm text-muted" aria-busy="true">
                {t("account.recentLoading")}
              </Card>
            ) : history.failed ? (
              <Card className="p-5 text-sm leading-relaxed text-muted">{t("account.recentOffline")}</Card>
            ) : recent.length === 0 ? (
              <Card className="p-5 text-sm leading-relaxed text-muted">{t("account.recentEmpty")}</Card>
            ) : (
              <Card className="divide-y divide-line">
                <ol>
                  {recent.map((row) => (
                    <li key={`${row.puzzle_key}:${row.completed_day}`} className="flex items-center gap-3.5 px-4 py-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold leading-snug text-ink">{row.title}</p>
                        <p className="mt-0.5 flex items-center gap-2 text-sm leading-snug text-muted">
                          <span>{solveDate(row.completed_day, locale, today)}</span>
                          <SourceChip row={row} />
                        </p>
                      </div>
                      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-brand-50 px-2 py-0.5 text-xs font-semibold text-brand-700 tabular-nums ring-1 ring-brand-100">
                        <Check className="size-3.5" aria-hidden="true" />
                        {row.seconds !== null ? formatDuration(row.seconds) : t("account.untimed")}
                      </span>
                    </li>
                  ))}
                </ol>
              </Card>
            )}
            <TransitionLink
              to="/archive"
              className="inline-flex min-h-11 items-center gap-1.5 self-start px-1 text-sm font-semibold text-brand-700 hover:text-brand-800 focus-visible:outline-2 focus-visible:outline-brand-500"
            >
              <CalendarDays className="size-4" aria-hidden="true" />
              {t("account.allPastPuzzles")}
              <ChevronRight className="size-4" aria-hidden="true" />
            </TransitionLink>
          </section>

          <div className="lg:hidden">
            <Footer onSignOut={handleSignOut} onDelete={() => account.openAccount({ view: "delete", placement: "account-page" })} />
          </div>
        </div>
      </div>
    </PageShell>
  );
}

/** Sign out, and the quiet delete link under it (the sheet asks once before deleting). */
function Footer({ onSignOut, onDelete }: { onSignOut: () => void; onDelete: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col items-center gap-1">
      <Button variant="ghost" size="md" block onClick={onSignOut}>
        <LogOut className="size-4" aria-hidden="true" />
        {t("account.signOut")}
      </Button>
      <button
        type="button"
        onClick={onDelete}
        className="min-h-11 rounded-lg px-3 text-xs text-subtle underline-offset-2 hover:text-muted hover:underline active:text-muted focus-visible:outline-2 focus-visible:outline-brand-500"
      >
        {t("account.deleteAccount")}
      </button>
    </div>
  );
}
