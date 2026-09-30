import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router";
import { BookOpen, Flame, Hash, Newspaper, Swords, Trophy, Tv, Upload, Users } from "lucide-react";
import { Title } from "../components/Title";
import { LanguageSwitcher } from "../components/LanguageSwitcher";
import { AdSlot } from "../components/AdSlot";
import { LegalLinks } from "../components/LegalLinks";
import { useAuth } from "../contexts/AuthContext";
import { useGame } from "../contexts/GameContext";
import { track } from "../lib/analytics";
import { getDailyMini } from "../lib/dailyMinis";
import { getDisplayNytStreak, getDisplayStreak } from "../lib/soloStats";
import { isDesktopBrowser } from "../lib/platform";
import { nativeNytImportAvailable } from "../lib/nativeNytImport";
import { Button, Card, Eyebrow, ListGroup, ListRow, MiniGridThumb } from "../components/ui";

export function MenuScreen() {
  const { t } = useTranslation();
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const { handleSoloPuzzleLoaded, setSoloTheme, setUrlPuzzle } = useGame();
  const disabled = loading;
  const streak = useMemo(() => getDisplayStreak(), []);
  // Bookmarklet promotion is desktop-only: it needs a bookmarks bar, so on a
  // phone or tablet the row would be a dead end.
  const desktop = useMemo(() => isDesktopBrowser(), []);
  const nytStreak = useMemo(() => getDisplayNytStreak(), []);

  // Resolve once per render — deterministic per calendar day.
  const dailyMini = useMemo(() => getDailyMini(), []);

  const playDailyMini = useCallback(async () => {
    track("mode_selected", { mode: "daily" });
    // No import step: load the bundled mini straight into solo play. It carries
    // no file buffer, so handleSoloPuzzleLoaded won't count it as an import.
    await handleSoloPuzzleLoaded(dailyMini.puzzle);
    setSoloTheme(dailyMini.theme);
    navigate("/solo/play");
  }, [dailyMini, handleSoloPuzzleLoaded, setSoloTheme, navigate]);

  const raceDailyMini = useCallback(() => {
    track("mode_selected", { mode: "daily-race" });
    // Hand today's mini to the existing host flow (name → lobby with share
    // code/QR) — everyone is released into the SAME puzzle at the same instant
    // when the host starts. Same lobby mechanic as any imported puzzle.
    setUrlPuzzle(dailyMini.puzzle);
    navigate("/host-game/name");
  }, [dailyMini, setUrlPuzzle, navigate]);

  const clueCount = dailyMini.puzzle.clues.length;
  const showFriends = Boolean(user) || loading;
  const nativeNyt = nativeNytImportAvailable();

  return (
    <div className="min-h-dvh crossword-bg px-4 pb-8 pt-8 sm:pt-12">
      {/* The wordmark constructs via a one-shot Lottie on every menu visit. */}
      <Title animate className="mb-8 sm:mb-10" />

      <div className="mx-auto grid w-full max-w-md gap-8 lg:max-w-5xl lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:items-start lg:gap-10">
        {/* Front door: today's mini. Fully local (bundled data) — never gated on
            auth loading, so a cold visitor can start instantly. */}
        <Card className="overflow-hidden lg:sticky lg:top-8">
          <div className="flex items-start gap-5 p-5 sm:p-6">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <Eyebrow className="text-brand-600">{t("menu.dailyMiniEyebrow")}</Eyebrow>
                <span className="rounded-full bg-gold-50 px-2 py-0.5 text-xs font-semibold text-gold-700 ring-1 ring-gold-100">
                  {dailyMini.theme}
                </span>
              </div>
              <h1 className="mt-2 font-display text-[28px] font-bold leading-tight tracking-tight text-ink sm:text-[32px]">
                {dailyMini.puzzle.title}
              </h1>
              <p className="mt-1 text-sm text-muted tabular-nums">
                {t("menu.dailyMeta", { width: dailyMini.puzzle.width, height: dailyMini.puzzle.height, count: clueCount })}
              </p>
            </div>
            <MiniGridThumb puzzle={dailyMini.puzzle} className="w-24 shrink-0 sm:w-28 lg:w-36" />
          </div>
          <div className="flex gap-2.5 px-5 pb-5 sm:px-6 sm:pb-6">
            <Button size="lg" className="flex-1" onClick={playDailyMini}>
              {t("menu.dailyPlay")}
            </Button>
            {showFriends && (
              <Button variant="secondary" size="lg" className="flex-1" onClick={raceDailyMini} disabled={disabled}>
                <Swords className="size-4.5" aria-hidden="true" />
                {t("menu.raceFriends")}
              </Button>
            )}
          </div>
          <div className="flex items-center justify-between gap-3 border-t border-line bg-surface-sunken/60 px-5 py-2.5 sm:px-6">
            <Link
              to="/daily/leaderboard"
              onClick={() => track("mode_selected", { mode: "leaderboard" })}
              className="inline-flex min-h-11 items-center gap-2 rounded-lg text-sm font-semibold text-ink-soft hover:text-brand-700 focus-visible:outline-2 focus-visible:outline-brand-500"
            >
              <Trophy className="size-4 text-gold-500" aria-hidden="true" />
              {t("menu.dailyLeaderboard")}
            </Link>
            {streak > 0 && (
              <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-gold-700">
                <Flame className="size-4 text-gold-500" aria-hidden="true" />
                {t("soloStats.streakDays", { count: streak })}
              </span>
            )}
          </div>
        </Card>

        <div className="grid gap-8">
          {showFriends && (
            <section className="grid gap-3">
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
              <Link
                to="/watch"
                className="justify-self-center inline-flex min-h-11 items-center text-sm font-medium text-brand-700 underline decoration-brand-200 underline-offset-4 hover:decoration-brand-500"
              >
                {t("menu.watchLink")}
              </Link>
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
            </ListGroup>
          </section>
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
