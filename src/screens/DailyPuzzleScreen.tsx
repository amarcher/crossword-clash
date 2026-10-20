import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router";
import { useTranslation } from "react-i18next";
import { CalendarX2, Loader2 } from "lucide-react";
import { useGame } from "../contexts/GameContext";
import { fetchDailyForDay } from "../lib/dailyFeed";
import { parseDailyChallenge, parseDailyRoute } from "../lib/dailyChallenge";
import { formatShareDay } from "../lib/shareBlock";
import { NotFoundScreen } from "./NotFoundScreen";
import { NoticeScreen, primaryButtonClass } from "./RouteErrorScreen";

const SLOT_EYEBROW = { mini: "menu.dailyMiniEyebrow", midi: "menu.dailyMidiEyebrow", large: "menu.dailyLargeEyebrow" } as const;

/**
 * `/daily/:day/:slot` — a day's daily by date, the short form of a shared
 * result's link. Loads that day's puzzle from the feed (past days included),
 * hands it to the game context as the URL puzzle and moves on: to the
 * challenge screen when the link carries a ghost (`?beat=102&by=Archer`), to
 * the plain puzzle-ready screen otherwise. Nothing renders here for longer
 * than the fetch takes.
 */
export function DailyPuzzleScreen() {
  const { t, i18n } = useTranslation();
  const params = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const game = useGame();
  const route = parseDailyRoute(params.day, params.slot);
  const [missing, setMissing] = useState(false);

  const day = route?.day;
  const slot = route?.slot;
  const search = location.search;
  const { setUrlPuzzle, setUrlChallenge } = game;
  const unsignedName = t("challenge.unsignedName");

  useEffect(() => {
    if (!day || !slot) return;
    let alive = true;
    void fetchDailyForDay(day, slot).then((daily) => {
      if (!alive) return;
      if (!daily) {
        setMissing(true);
        return;
      }
      const challenge = parseDailyChallenge(search, unsignedName);
      setUrlPuzzle(daily.puzzle);
      setUrlChallenge(challenge);
      navigate(challenge ? "/challenge" : "/puzzle-ready", { replace: true });
    });
    return () => {
      alive = false;
    };
  }, [day, slot, search, unsignedName, setUrlPuzzle, setUrlChallenge, navigate]);

  if (!route || !day || !slot) return <NotFoundScreen />;

  const dailyLabel = t(SLOT_EYEBROW[slot]);
  const dateLabel = formatShareDay(day, i18n.language);

  if (missing) {
    return (
      <NoticeScreen
        icon={CalendarX2}
        title={t("dailyLink.missingTitle", { daily: dailyLabel, date: dateLabel })}
        body={t("dailyLink.missingBody")}
      >
        <Link to="/" className={primaryButtonClass}>
          {t("errors.backToMenu")}
        </Link>
      </NoticeScreen>
    );
  }

  return (
    <div className="flex min-h-dvh items-center justify-center p-6" role="status" aria-live="polite">
      <p className="flex items-center gap-2 text-sm font-medium text-muted">
        <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        {t("dailyLink.loading", { daily: dailyLabel, date: dateLabel })}
      </p>
    </div>
  );
}
