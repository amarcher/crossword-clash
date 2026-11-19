import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, Loader2, Send } from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import { useFriends } from "../../contexts/FriendsContext";
import { useRaceName } from "../../hooks/useRaceName";
import { buildPuzzleLink } from "../../lib/dailyChallenge";
import { FriendsError } from "../../lib/friends";
import { fetchOwnSolveTrace } from "../../lib/race";
import { encodeReplay } from "../../lib/replayCode";
import { createReplayShare, rememberReplay, rememberedReplay } from "../../lib/replayShare";
import { track } from "../../lib/analytics";
import type { PageRef, Puzzle } from "../../types/puzzle";
import { Button } from "../ui";

/**
 * "Send time" beside a friend who has not solved a puzzle the viewer has
 * (Race friends; Andrew, 2026-11-18: a live room for a puzzle one side has
 * finished is no race). One tap sends the finish screen's in-app challenge
 * (SendToFriend, spec §3.2): the puzzle's link with the viewer's time and,
 * when this device or the account kept the solve, its replay to race.
 */
export function SendTimeButton({ puzzle, puzzleKey, linkRef, seconds, friendId, friendName }: { puzzle: Puzzle; puzzleKey: string; linkRef: PageRef; seconds: number; friendId: string; friendName: string }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { beat } = useFriends();
  const name = useRaceName();
  const [state, setState] = useState<"idle" | "busy" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);

  const send = async () => {
    if (state !== "idle") return;
    setState("busy");
    setError(null);
    try {
      // The replay this device filed for that finish, or one made again from the account's kept recording.
      let replay = rememberedReplay(puzzleKey, seconds);
      if (!replay && user) {
        const kept = await fetchOwnSolveTrace(user.id, puzzleKey).catch(() => null);
        const code = kept && kept.events.length > 0 && kept.seconds === Math.floor(seconds) ? encodeReplay(puzzle, kept.events, kept.seconds) : null;
        replay = code ? await createReplayShare(code).catch(() => null) : null;
        if (replay) rememberReplay(puzzleKey, replay, Math.floor(seconds));
      }
      await beat(friendId, buildPuzzleLink("", linkRef, { seconds, name, replay: replay ?? undefined }));
      track("race_action", { action: "send-time", signed_in: true });
      setState("sent");
    } catch (err) {
      const kind = err instanceof FriendsError ? err.kind : null;
      setError(t(kind === "rate_limited" ? "friends.errorRateLimited" : kind === "invalid" ? "friends.errorCantSend" : "friends.errorGeneric"));
      setState("idle");
    }
  };

  if (state === "sent") {
    return (
      <span className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-brand-50 px-3 text-sm font-semibold text-brand-700">
        <Check className="size-4" aria-hidden="true" />
        {t("friends.sent")}
      </span>
    );
  }
  return (
    <>
      <Button size="sm" variant="secondary" onClick={() => void send()} disabled={state === "busy"} aria-busy={state === "busy" || undefined} aria-label={t("race.sendTimeTo", { name: friendName })} title={error ?? undefined}>
        {state === "busy" ? <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <Send className="size-4" aria-hidden="true" />}
        {t(error ? "race.watchRetry" : "race.sendTime")}
      </Button>
      {error && (
        <span role="alert" className="sr-only">
          {error}
        </span>
      )}
    </>
  );
}
