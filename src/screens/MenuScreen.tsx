import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useTransitionNavigate } from "../hooks/useTransitionNavigate";
import { BookOpen, CalendarDays, Flame, Hash, Newspaper, Smartphone, Swords, Trophy, Tv, Upload, Users } from "lucide-react";
import { Title } from "../components/Title";
import { LanguageSwitcher } from "../components/LanguageSwitcher";
import { AdSlot } from "../components/AdSlot";
import { LegalLinks } from "../components/LegalLinks";
import { AccountMenuRow } from "../components/Account";
import { useAuth } from "../contexts/AuthContext";
import { supabase } from "../lib/supabaseClient";
import { useGame } from "../contexts/GameContext";
import { track } from "../lib/analytics";
import { useHydrated } from "../lib/hydration";
import { useDailyMini, useDailyPuzzle } from "../hooks/useDailyMini";
import { displayTheme, type DailySlot } from "../lib/dailyFeed";
import { leaderboardPath } from "../lib/dailyLeaderboard";
import type { DailyMini } from "../lib/dailyMinis";
import { useStreaks } from "../hooks/useSolveHistory";
import {
  ANDROID_PLAY_STORE_URL,
  IOS_APP_STORE_URL,
  isAndroidBrowser,
  isDesktopBrowser,
  isIosBrowser,
} from "../lib/platform";
import { nativeNytImportAvailable } from "../lib/nativeNytImport";
import { Button, Card, Eyebrow, ListGroup, ListRow, MiniGridThumb, TransitionLink } from "../components/ui";
import { PAGE_GUTTER } from "../components/PageShell";
import { prefetchOnIntent } from "../routeModules";

interface DailyHeroProps {
  slot: DailySlot;
  /** Null paints the loading placeholder, sized exactly like the loaded tile. */
  daily: DailyMini | null;
  /** Whether a "Race friends" button exists at all (multiplayer configured). */
  multiplayer: boolean;
  /** Race friends is disabled (not unmounted) until auth has a user. */
  disabled: boolean;
  /** Shown in the footer when positive (the mini carries the daily streak). */
  streak?: number;
  onPlay: () => void;
  onRace: () => void;
}

const SLOT_EYEBROW = { mini: "menu.dailyMiniEyebrow", midi: "menu.dailyMidiEyebrow", large: "menu.dailyLargeEyebrow" } as const satisfies Record<DailySlot, string>;

/** One daily's front-door tile: eyebrow + theme chip, title, size line, thumb, actions, board link. */
function DailyHero({ slot, daily, multiplayer, disabled, streak = 0, onPlay, onRace }: DailyHeroProps) {
  const { t } = useTranslation();
  const label = t(SLOT_EYEBROW[slot]);
  return (
    // A named region, so the two dailies' identical "Play" buttons can be told
    // apart by assistive tech and by the e2e suite.
    <Card role="region" aria-label={label} className="overflow-hidden" aria-busy={!daily}>
      <div className="flex items-start gap-5 p-5 sm:p-6">
        <div className="min-w-0 flex-1">
          {/* One 20px row whatever the feed says: the theme chip is 20px and the
              eyebrow alone 16px (min-h-5), and a long theme truncates rather
              than wrapping, so the loaded tile is exactly the placeholder's height. */}
          <div className="flex min-h-5 items-center gap-2">
            <Eyebrow className="shrink-0 text-brand-600">{label}</Eyebrow>
            {displayTheme(daily) && (
              <span
                className="min-w-0 truncate rounded-full bg-gold-50 px-2 py-0.5 text-xs font-semibold text-gold-700 ring-1 ring-gold-100"
                title={displayTheme(daily)}
              >
                {displayTheme(daily)}
              </span>
            )}
          </div>
          {daily ? (
            <>
              <h1 className="mt-2 font-display text-[28px] font-bold leading-tight tracking-tight text-ink sm:text-[32px]">
                {daily.puzzle.title}
              </h1>
              <p className="mt-1 text-sm text-muted tabular-nums">
                {t("menu.dailyMeta", {
                  width: daily.puzzle.width,
                  height: daily.puzzle.height,
                  count: daily.puzzle.clues.length,
                })}
              </p>
            </>
          ) : (
            <div className="animate-pulse" aria-hidden="true">
              <div className="mt-2 h-[35px] w-3/4 rounded-lg bg-surface-sunken sm:h-10" />
              <div className="mt-1 h-5 w-1/2 rounded bg-surface-sunken" />
            </div>
          )}
        </div>
        {daily ? (
          <MiniGridThumb puzzle={daily.puzzle} className="w-24 shrink-0 sm:w-28 lg:w-36" />
        ) : (
          <div className="aspect-square w-24 shrink-0 animate-pulse rounded-lg bg-surface-sunken sm:w-28 lg:w-36" aria-hidden="true" />
        )}
      </div>
      <div className="flex gap-2.5 px-5 pb-5 sm:px-6 sm:pb-6">
        {/* Buttons, not links, so they warm their screens' chunks by hand. */}
        <Button size="lg" className="flex-1" onClick={onPlay} disabled={!daily} {...prefetchOnIntent("/solo/play")}>
          {t("menu.dailyPlay")}
        </Button>
        {multiplayer && (
          <Button
            variant="secondary"
            size="lg"
            className="flex-1"
            onClick={onRace}
            disabled={disabled || !daily}
            {...prefetchOnIntent("/host-game/name")}
          >
            <Swords className="size-4.5" aria-hidden="true" />
            {t("menu.raceFriends")}
          </Button>
        )}
      </div>
      <div className="flex items-center justify-between gap-3 border-t border-line bg-surface-sunken/60 px-5 py-2.5 sm:px-6">
        <TransitionLink
          to={leaderboardPath(slot)}
          onClick={() => track("mode_selected", { mode: "leaderboard", slot })}
          className="inline-flex min-h-11 items-center gap-2 rounded-lg text-sm font-semibold text-ink-soft hover:text-brand-700 focus-visible:outline-2 focus-visible:outline-brand-500"
        >
          <Trophy className="size-4 text-gold-500" aria-hidden="true" />
          {t("menu.dailyLeaderboard")}
        </TransitionLink>
        {streak > 0 && (
          <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-gold-700">
            <Flame className="size-4 text-gold-500" aria-hidden="true" />
            {t("soloStats.streakDays", { count: streak })}
          </span>
        )}
      </div>
    </Card>
  );
}

export function MenuScreen() {
  const { t } = useTranslation();
  const { user, loading } = useAuth();
  // Pushes run inside the site cross-fade; the play screen gets a plain fade
  // (no bar to morph into) and the grid itself is never a named element.
  const navigate = useTransitionNavigate();
  const { handleSoloPuzzleLoaded, setSoloTheme, setUrlPuzzle } = useGame();
  // Multiplayer needs a Supabase user. Whether Supabase is configured at all is
  // known synchronously, so hiding the friends UI in an offline build costs no
  // layout shift; whether auth has resolved is not, so while it is pending (or
  // failed) the friends UI stays mounted and merely disabled — unmounting it
  // after first paint moved everything below by 341px (site-chrome audit, item 6).
  const multiplayer = supabase !== null;
  const disabled = loading || !user;
  // The account's streaks when signed in, this device's otherwise.
  const { daily: streak, nyt: nytStreak } = useStreaks();
  // Device-dependent rows (bookmarklet, app store links) are absent from the
  // prerendered HTML and from the hydration pass, then appear on the next
  // render; a plain client render has them from the start as before.
  const hydrated = useHydrated();
  // Bookmarklet promotion is desktop-only: it needs a bookmarks bar, so on a
  // phone or tablet the row would be a dead end.
  const desktop = useMemo(() => hydrated && isDesktopBrowser(), [hydrated]);

  // Resolve once per render — deterministic per calendar day. The mini always
  // has an answer (bundled fallback); the large exists only on days one was
  // published, and its tile simply isn't there otherwise.
  const dailyMini = useDailyMini();
  const dailyMidi = useDailyPuzzle("midi");
  const dailyLarge = useDailyPuzzle("large");

  const playDaily = useCallback(
    async (daily: DailyMini | null | undefined, slot: DailySlot) => {
      track("mode_selected", { mode: "daily", slot });
      // No import step: load the daily straight into solo play. It carries no
      // file buffer, so handleSoloPuzzleLoaded won't count it as an import.
      if (!daily) return;
      await handleSoloPuzzleLoaded(daily.puzzle);
      setSoloTheme(daily.theme);
      navigate("/solo/play");
    },
    [handleSoloPuzzleLoaded, setSoloTheme, navigate],
  );

  const raceDaily = useCallback(
    (daily: DailyMini | null | undefined, slot: DailySlot) => {
      track("mode_selected", { mode: "daily-race", slot });
      // Hand the daily to the existing host flow (name → lobby with share
      // code/QR) — everyone is released into the SAME puzzle at the same instant
      // when the host starts. Same lobby mechanic as any imported puzzle.
      if (!daily) return;
      setUrlPuzzle(daily.puzzle);
      navigate("/host-game/name");
    },
    [setUrlPuzzle, navigate],
  );

  const nativeNyt = nativeNytImportAvailable();
  // Website visitors on an iPhone or iPad get pointed at the app, once it is live.
  const iosAppUrl = useMemo(
    () => (hydrated && import.meta.env.MODE !== "mobile" && isIosBrowser() ? IOS_APP_STORE_URL : null),
    [hydrated],
  );
  const androidAppUrl = useMemo(
    () => (hydrated && import.meta.env.MODE !== "mobile" && isAndroidBrowser() ? ANDROID_PLAY_STORE_URL : null),
    [hydrated],
  );

  return (
    <div className={`min-h-dvh crossword-bg pb-8 pt-8 sm:pt-12 ${PAGE_GUTTER}`}>
      {/* The wordmark constructs via a one-shot Lottie on the first menu visit of
          the session; later visits show its final frame (see Title). */}
      <Title animate className="mb-8 sm:mb-10" />

      <div className="mx-auto grid w-full max-w-md gap-8 lg:max-w-5xl lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:items-start lg:gap-10">
        {/* Front door: today's dailies. Never gated on auth loading; the mini
            waits only for the daily feed's first answer of the day (see
            useDailyMini). The large's slot is reserved with a placeholder tile
            while its feed is still unknown (undefined) and collapses only once
            the feed says there is none today (null), so a published large never
            pushes the page down after first paint. */}
        <div className="grid gap-4 lg:sticky lg:top-8">
          <DailyHero
            slot="mini"
            daily={dailyMini}
            multiplayer={multiplayer}
            disabled={disabled}
            streak={streak}
            onPlay={() => void playDaily(dailyMini, "mini")}
            onRace={() => raceDaily(dailyMini, "mini")}
          />
          {dailyMidi !== null && (
            <DailyHero
              slot="midi"
              daily={dailyMidi ?? null}
              multiplayer={multiplayer}
              disabled={disabled}
              onPlay={() => void playDaily(dailyMidi, "midi")}
              onRace={() => raceDaily(dailyMidi, "midi")}
            />
          )}
          {dailyLarge !== null && (
            <DailyHero
              slot="large"
              daily={dailyLarge ?? null}
              multiplayer={multiplayer}
              disabled={disabled}
              onPlay={() => void playDaily(dailyLarge, "large")}
              onRace={() => raceDaily(dailyLarge, "large")}
            />
          )}
        </div>

        <div className="grid gap-8">
          {multiplayer && (
            <section className="grid gap-3" aria-busy={loading || undefined}>
              <Eyebrow as="h2" className="px-1">{t("menu.friendsHeading")}</Eyebrow>
              <ListGroup>
                <ListRow
                  icon={Users}
                  to="/host-game/name"
                  title={t("menu.startGame")}
                  subtitle={t("menu.startGameSubtitle")}
                  disabled={disabled}
                  onClick={() => track("mode_selected", { mode: "host" })}
                />
                <ListRow
                  icon={Hash}
                  to="/join"
                  title={t("menu.joinGame")}
                  subtitle={t("menu.joinGameSubtitle")}
                  disabled={disabled}
                  onClick={() => track("mode_selected", { mode: "join" })}
                />
                <ListRow
                  icon={Tv}
                  to="/host"
                  title={t("menu.tvMode")}
                  subtitle={t("menu.tvModeHint")}
                  disabled={disabled}
                  onClick={() => track("mode_selected", { mode: "tv" })}
                />
              </ListGroup>
              <TransitionLink
                to="/watch"
                className="justify-self-center inline-flex min-h-11 items-center text-sm font-medium text-brand-700 underline decoration-brand-200 underline-offset-4 hover:decoration-brand-500"
              >
                {t("menu.watchLink")}
              </TransitionLink>
            </section>
          )}

          <section className="grid gap-3">
            <Eyebrow as="h2" className="px-1">{t("menu.soloHeading")}</Eyebrow>
            <ListGroup>
              {/* NYT bookmarklet — the stickiest thing the app does for
                  subscribers. Plain <a>: /install-bookmarklet is a static page. */}
              {desktop && (
                <ListRow
                  icon={Newspaper}
                  href="/install-bookmarklet"
                  title={nytStreak > 0 ? t("menu.nytTileStreak", { count: nytStreak }) : t("menu.nytTile")}
                  subtitle={t("menu.nytTileSubtitle")}
                  onClick={() => track("mode_selected", { mode: "nyt" })}
                />
              )}
              <ListRow
                icon={CalendarDays}
                to="/archive"
                title={t("menu.pastPuzzles")}
                subtitle={t("menu.pastPuzzlesSubtitle")}
                onClick={() => track("mode_selected", { mode: "archive" })}
              />
              <ListRow
                icon={BookOpen}
                tone="gold"
                to="/classics"
                title={t("menu.classicLibrary")}
                subtitle={t("menu.classicLibrarySubtitle")}
                onClick={() => track("mode_selected", { mode: "classics" })}
              />
              {nativeNyt && (
                <ListRow
                  icon={Newspaper}
                  tone="neutral"
                  to="/nyt-import"
                  title={t("nytImport.title")}
                  onClick={() => track("mode_selected", { mode: "import" })}
                />
              )}
              <ListRow
                icon={Upload}
                tone="neutral"
                to="/solo/import"
                title={t("menu.ownPuzzle")}
                subtitle={t("menu.ownPuzzleSubtitle")}
                onClick={() => track("mode_selected", { mode: "solo" })}
              />
              {iosAppUrl && (
                <ListRow
                  icon={Smartphone}
                  href={iosAppUrl}
                  title={t("menu.iosApp")}
                  subtitle={t("menu.iosAppSubtitle")}
                  onClick={() => track("app_store_click", { placement: "menu" })}
                />
              )}
              {androidAppUrl && (
                <ListRow
                  icon={Smartphone}
                  href={androidAppUrl}
                  title={t("menu.androidApp")}
                  subtitle={t("menu.androidAppSubtitle")}
                  onClick={() => track("play_store_click", { placement: "menu" })}
                />
              )}
            </ListGroup>
          </section>

          {/* Optional account: a benefit for anonymous visitors, the username
              once signed in. Renders nothing where accounts aren't offered. */}
          <AccountMenuRow />
        </div>
      </div>

      <div className="mx-auto mt-10 flex w-full max-w-md flex-col items-center gap-3 lg:max-w-5xl">
        <AdSlot placement="menu-bottom" />
        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
          <LanguageSwitcher />
          <LegalLinks />
        </div>
      </div>
    </div>
  );
}
