import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, UserPlus } from "lucide-react";
import { useFriends } from "../../contexts/FriendsContext";
import { fetchPlayerProfiles, friendSuggestions, FriendsError, type FriendsErrorKind, type Person, type RequestOutcome } from "../../lib/friends";
import { track } from "../../lib/analytics";
import { Button } from "../ui";
import { PersonList, PersonRow } from "./PersonRow";

const ERROR_KEYS: Partial<Record<FriendsErrorKind, string>> = {
  cooldown: "friends.errorCooldown",
  already_friends: "friends.errorAlreadyFriends",
  already_requested: "friends.errorAlreadyRequested",
  rate_limited: "friends.errorRateLimited",
  too_many: "friends.errorTooMany",
};

interface RaceFriendSuggestionsProps {
  /** The finished room's players (the frozen standings): only the ids are read. */
  players: readonly { userId: string }[];
  /** The viewing player's user id, never suggested to themselves. */
  viewerId: string;
  darkMode?: boolean;
}

/**
 * The completion modal's "Raced with you" (Andrew's direction of 2026-11-02):
 * after a multiplayer finish, the other players of the room who have an
 * account and a username and are not yet friends (or asked, or blocked), each
 * with Add friend. The ids come from the frozen standings, the usernames from
 * one `profiles` read — an anonymous player has no row and is never listed.
 * A tapped row flips to Requested (or Friends, when the other side had asked
 * first) and stays on screen through the refetch that would otherwise drop
 * it. Renders nothing with the switch off, for an anonymous viewer, before
 * the profiles answer, or once nobody is left to add.
 */
export function RaceFriendSuggestions({ players, viewerId, darkMode }: RaceFriendSuggestionsProps) {
  const { t } = useTranslation();
  const { active, friendships, blocked, request } = useFriends();
  const [profiles, setProfiles] = useState<Person[] | null>(null);
  const [outcomes, setOutcomes] = useState<Record<string, RequestOutcome>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // One read per set of ids: the record is frozen, so this runs once per finish.
  const idsKey = players.map((p) => p.userId).join("\n");
  useEffect(() => {
    if (!active || !idsKey) return;
    let live = true;
    fetchPlayerProfiles(idsKey.split("\n")).then(
      (list) => live && setProfiles(list),
      () => live && setProfiles([]),
    );
    return () => {
      live = false;
    };
  }, [active, idsKey]);

  const rows = useMemo(() => {
    if (!profiles) return [];
    const suggested = new Set(friendSuggestions(profiles, friendships, blocked, viewerId).map((p) => p.userId));
    // A row the viewer just acted on stays, so "Requested" is seen rather than the row vanishing on the refetch.
    return profiles.filter((p) => suggested.has(p.userId) || outcomes[p.userId]);
  }, [profiles, friendships, blocked, viewerId, outcomes]);

  if (!active || rows.length === 0) return null;

  const add = async (person: Person) => {
    setBusy(person.userId);
    setError(null);
    try {
      const outcome = await request(person.username);
      track("friend_request_sent", { method: "post-race", outcome });
      setOutcomes((prev) => ({ ...prev, [person.userId]: outcome }));
    } catch (err) {
      setError(t((err instanceof FriendsError && ERROR_KEYS[err.kind]) || "friends.errorGeneric"));
    } finally {
      setBusy(null);
    }
  };

  return (
    <section aria-labelledby="completion-raced-with" data-testid="raced-with" className="mt-1">
      <h3 id="completion-raced-with" className={`mb-1.5 px-1 text-xs font-semibold uppercase tracking-[0.08em] ${darkMode ? "text-white/50" : "text-subtle"}`}>
        {t("friends.postRaceHeading")}
      </h3>
      <PersonList>
        {rows.map((p) => {
          const outcome = outcomes[p.userId];
          return (
            <PersonRow key={p.userId} username={p.username}>
              {outcome ? (
                <span className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-brand-50 px-3 text-sm font-semibold text-brand-700">
                  <Check className="size-4" aria-hidden="true" />
                  {t(outcome === "accepted" ? "friends.alreadyFriend" : "friends.requested")}
                </span>
              ) : (
                <Button size="sm" variant="secondary" onClick={() => void add(p)} disabled={busy !== null} aria-busy={busy === p.userId || undefined}>
                  <UserPlus className="size-4" aria-hidden="true" />
                  {t("friends.addFriend")}
                </Button>
              )}
            </PersonRow>
          );
        })}
      </PersonList>
      {error && (
        <p role="alert" className="mt-2 text-sm font-medium text-red-700">
          {error}
        </p>
      )}
      <p className={`mt-2 px-1 text-xs ${darkMode ? "text-white/60" : "text-muted"}`}>{t("friends.postRaceHint")}</p>
    </section>
  );
}
