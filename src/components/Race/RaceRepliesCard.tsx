import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronRight, Reply } from "lucide-react";
import { Card } from "../ui";
import { TransitionLink } from "../ui";
import { useAuth } from "../../contexts/AuthContext";
import { fetchRaceReplies, type RaceReply } from "../../lib/raceReplies";
import { formatDuration } from "../../lib/soloStats";

const SLOT_LABEL = { mini: "menu.dailyMiniEyebrow", midi: "menu.dailyMidiEyebrow", large: "menu.dailyLargeEyebrow" } as const;

/** What a reply raced, for "Sam raced your …": "Mini", or a community puzzle's title. */
export function replyPuzzleLabel(t: (key: string, params?: Record<string, unknown>) => string, reply: Pick<RaceReply, "ref" | "title">): string {
  if ("slot" in reply.ref) return t(SLOT_LABEL[reply.ref.slot]);
  return reply.title ? t("raceReplies.titleQuoted", { title: reply.title }) : t("raceReplies.communityPuzzle");
}

/** "Sam won by 0:12", "You won by 0:12" or "Dead heat": a reply's verdict from the sender's side. */
export function replyVerdict(t: (key: string, params?: Record<string, unknown>) => string, reply: Pick<RaceReply, "name" | "seconds" | "toSeconds">): string {
  const delta = formatDuration(Math.abs(reply.seconds - reply.toSeconds));
  if (reply.seconds < reply.toSeconds) return t("raceReplies.theyWon", { name: reply.name, delta });
  if (reply.seconds > reply.toSeconds) return t("raceReplies.youWon", { delta });
  return t("raceReplies.tied");
}

/**
 * The menu's inbox of replies to the viewer's shared solves (raceReplies.ts):
 * who raced which one, and how it went. Unseen replies only; each opens its
 * page, which plays that racer's solve. Nothing renders without replies.
 */
export function RaceRepliesCard() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [replies, setReplies] = useState<RaceReply[]>([]);
  const userId = user?.id ?? null;
  useEffect(() => {
    if (!userId) return;
    let live = true;
    void fetchRaceReplies(userId).then((rows) => live && setReplies(rows.filter((r) => !r.seen).slice(0, 3)));
    return () => {
      live = false;
    };
  }, [userId]);
  if (!userId || replies.length === 0) return null;
  return (
    <section className="grid gap-3" aria-label={t("raceReplies.heading")}>
      <Card className="divide-y divide-line">
        {replies.map((r) => (
          <TransitionLink key={r.id} to={`/reply/${r.id}`} className="flex min-h-14 items-center gap-3 px-4 py-2.5 hover:bg-surface-sunken active:bg-surface-sunken focus-visible:outline-2 focus-visible:outline-brand-500">
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-600">
              <Reply className="size-4" aria-hidden="true" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold text-ink">{t("raceReplies.raced", { name: r.name, daily: replyPuzzleLabel(t, r) })}</span>
              <span className="block truncate text-xs text-muted">{replyVerdict(t, r)} · {t("raceReplies.watch")}</span>
            </span>
            <ChevronRight className="size-4 shrink-0 text-subtle" aria-hidden="true" />
          </TransitionLink>
        ))}
      </Card>
    </section>
  );
}
