import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import { useTranslation } from "react-i18next";
import { Flag, Loader2, PlayCircle, Reply } from "lucide-react";
import { Button, Card, buttonClass } from "../components/ui";
import { FlowPage } from "../components/Flow";
import { ReplayDialog, type ReplaySolve } from "../components/Race/ReplayDialog";
import { replyVerdict } from "../components/Race/RaceRepliesCard";
import { fetchRaceReply, markRepliesSeen, type RaceReply } from "../lib/raceReplies";
import { fetchReplayShare, letteredReplay } from "../lib/replayShare";
import { fetchDailyForDay } from "../lib/dailyFeed";
import { buildDailyLink } from "../lib/dailyChallenge";
import { GHOST_COLORS, type TraceEvent } from "../lib/race";
import { formatShareDay } from "../lib/shareBlock";
import { track } from "../lib/analytics";
import type { Puzzle } from "../types/puzzle";

const SLOT_LABEL = { mini: "menu.dailyMiniEyebrow", midi: "menu.dailyMidiEyebrow", large: "menu.dailyLargeEyebrow" } as const;

type State =
  | { kind: "loading" }
  | { kind: "missing" }
  | { kind: "ready"; reply: RaceReply; puzzle: Puzzle | null; theirs: Replay | null; mine: Replay | null };

type Replay = { seconds: number; events: TraceEvent[] };

/**
 * `/reply/:id` — someone raced a daily the viewer shared (raceReplies.ts):
 * how it went, their solve replayed with letters (rebuilt from the answers,
 * replayShare.ts), and a way to race their solve back. Where the menu's inbox
 * and the race-reply push land; opening it marks the reply seen.
 */
export function RaceReplyScreen() {
  const { t, i18n } = useTranslation();
  const { id = "" } = useParams();
  const [state, setState] = useState<State>({ kind: "loading" });
  const [watching, setWatching] = useState(false);

  useEffect(() => {
    let live = true;
    void (async () => {
      const reply = await fetchRaceReply(id);
      if (!live) return;
      if (!reply) {
        setState({ kind: "missing" });
        return;
      }
      void markRepliesSeen([reply.id]);
      // Their solve and the viewer's own (the shared link), to watch the race side by side.
      const [daily, theirCode, myCode] = await Promise.all([
        fetchDailyForDay(reply.day, reply.slot),
        reply.replyShareId ? fetchReplayShare(reply.replyShareId) : Promise.resolve(null),
        fetchReplayShare(reply.shareId),
      ]);
      if (!live) return;
      const puzzle = daily?.puzzle ?? null;
      setState({
        kind: "ready",
        reply,
        puzzle,
        theirs: puzzle && theirCode ? letteredReplay(theirCode, puzzle) : null,
        mine: puzzle && myCode ? letteredReplay(myCode, puzzle) : null,
      });
    })();
    return () => {
      live = false;
    };
  }, [id]);

  if (state.kind === "loading") {
    return (
      <div className="flex min-h-app items-center justify-center p-6" role="status">
        <Loader2 className="size-5 animate-spin text-muted motion-reduce:animate-none" aria-hidden="true" />
      </div>
    );
  }
  if (state.kind === "missing") {
    return (
      <FlowPage title={t("raceReplies.missingTitle")} subtitle={t("raceReplies.missingBody")} backLabel={t("completion.backToMenu")} onBack={() => history.back()}>
        <Link to="/menu" className={buttonClass("primary", "lg", "w-full")}>
          {t("completion.backToMenu")}
        </Link>
      </FlowPage>
    );
  }

  const { reply, puzzle, theirs, mine } = state;
  const solves: ReplaySolve[] = theirs
    ? [...(mine ? [{ name: t("ghostRace.you"), color: "#3a6bf0", ...mine }] : []), { name: reply.name, color: GHOST_COLORS[0], ...theirs }]
    : [];
  const raceBack = reply.replyShareId ? buildDailyLink("", { day: reply.day, slot: reply.slot, seconds: reply.seconds, name: reply.name, replay: reply.replyShareId }) : null;
  return (
    <FlowPage
      eyebrow={
        <span className="grid size-10 place-items-center rounded-xl bg-brand-50 text-brand-600 ring-1 ring-brand-100">
          <Reply className="size-5" aria-hidden="true" />
        </span>
      }
      title={t("raceReplies.raced", { name: reply.name, daily: t(SLOT_LABEL[reply.slot]) })}
      subtitle={`${formatShareDay(reply.day, i18n.language)} · ${replyVerdict(t, reply)}`}
      backLabel={t("completion.backToMenu")}
      onBack={() => history.back()}
    >
      <Card className="grid gap-3 p-5">
        {solves.length > 0 && puzzle && (
          <Button size="lg" block onClick={() => (setWatching(true), track("replay_watched", { racing: solves.length > 1 }))}>
            <PlayCircle className="size-5" aria-hidden="true" />
            {solves.length > 1 ? t("ghostRace.watchRace") : t("ghostRace.watch", { name: reply.name })}
          </Button>
        )}
        {raceBack && (
          <Link to={raceBack} className={buttonClass(solves.length ? "secondary" : "primary", "lg", "w-full")}>
            <Flag className="size-4" aria-hidden="true" />
            {t("challenge.raceButton", { name: reply.name })}
          </Link>
        )}
      </Card>
      {watching && solves.length > 0 && puzzle && <ReplayDialog puzzle={puzzle} solves={solves} onClose={() => setWatching(false)} />}
    </FlowPage>
  );
}
