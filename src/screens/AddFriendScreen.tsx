import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { useTranslation } from "react-i18next";
import { Check, UserPlus } from "lucide-react";
import { PageShell } from "../components/PageShell";
import { Button, Card } from "../components/ui";
import { useAccountContext } from "../contexts/AccountContext";
import { useFriends } from "../contexts/FriendsContext";
import { FriendsError, fetchProfileByUsername, friendLinkPath, friendLinkUsername, type FriendsErrorKind, type Person } from "../lib/friends";
import { supabase } from "../lib/supabaseClient";
import { track } from "../lib/analytics";

const ERROR_KEYS: Partial<Record<FriendsErrorKind, string>> = {
  not_found: "friends.errorNotFound",
  self: "friends.errorSelf",
  cooldown: "friends.errorCooldown",
  already_friends: "friends.errorAlreadyFriends",
  already_requested: "friends.errorAlreadyRequested",
  rate_limited: "friends.errorRateLimited",
  too_many: "friends.errorTooMany",
};

/**
 * Where a player's "add me" link lands (`/add/:username`, friends.ts): who is
 * asking, and one button. The button sends the ordinary friend request, which
 * the link's owner accepts — or, when they had already asked, makes the two
 * friends at once. A visitor without an account is asked to sign in and comes
 * back here; the page never befriends anyone by being opened.
 */
export function AddFriendScreen() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const params = useParams();
  const account = useAccountContext();
  const friends = useFriends();
  const username = friendLinkUsername(params.username);

  // undefined = looking up; null = no such player.
  const [person, setPerson] = useState<Person | null | undefined>(undefined);
  useEffect(() => {
    if (!username || !supabase) {
      setPerson(null);
      return;
    }
    let live = true;
    setPerson(undefined);
    fetchProfileByUsername(username).then(
      (found) => live && setPerson(found),
      () => live && setPerson(null),
    );
    return () => {
      live = false;
    };
  }, [username]);

  useEffect(() => {
    if (username) track("friend_link_opened", { signed_in: friends.active });
    // Once per link, not per sign-in state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [username]);

  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<"requested" | "accepted" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const name = person?.username ?? username ?? "";
  const { friendships } = friends;
  const isSelf = !!person && person.userId === account.user?.id;
  const isFriend = !!person && (sent === "accepted" || friendships.friends.some((f) => f.userId === person.userId));
  const theyAsked = !!person && friendships.incoming.some((f) => f.userId === person.userId);
  const asked = !!person && (sent === "requested" || friendships.outgoing.some((f) => f.userId === person.userId));

  const add = async () => {
    if (!person) return;
    setBusy(true);
    setError(null);
    try {
      if (theyAsked) {
        await friends.respond(person.userId, true);
        setSent("accepted");
        track("friend_request_responded", { accepted: true, via: "link" });
      } else {
        const outcome = await friends.request(person.username);
        setSent(outcome === "accepted" ? "accepted" : "requested");
        track("friend_request_sent", { method: "link", outcome });
      }
    } catch (err) {
      setError(t((err instanceof FriendsError && ERROR_KEYS[err.kind]) || "friends.errorGeneric"));
    } finally {
      setBusy(false);
    }
  };

  const returnTo = username ? friendLinkPath(username) : "/menu";
  const needsUsername = !!account.user && !account.profile;

  let body: React.ReactNode;
  if (!username) {
    body = <p className="text-muted">{t("friends.addBadLink")}</p>;
  } else if (person === undefined) {
    body = (
      <p role="status" className="text-muted">
        {t("friends.addLoading", { name })}
      </p>
    );
  } else if (person === null) {
    body = <p className="text-muted">{t("friends.addNotFound", { name })}</p>;
  } else if (isSelf) {
    body = (
      <>
        <p className="text-muted">{t("friends.addSelf")}</p>
        <Button className="mt-4" variant="secondary" onClick={() => navigate("/race/friends")}>
          {t("friends.addToFriends")}
        </Button>
      </>
    );
  } else if (!friends.active) {
    // Signed out, or signed in without the username a friendship needs.
    body = (
      <>
        <h1 className="font-display text-2xl font-bold tracking-tight text-ink">{t("friends.addSignInTitle", { name })}</h1>
        <p className="mt-1.5 text-muted">{t(needsUsername ? "friends.addUsernameBody" : "friends.addSignInBody", { name })}</p>
        {account.available && (
          <Button
            size="lg"
            className="mt-5"
            onClick={() =>
              needsUsername ? account.openAccount({ view: "username", placement: "friend-link" }) : account.openAccount({ placement: "friend-link", returnTo })
            }
          >
            {t(needsUsername ? "race.chooseUsername" : "race.signIn")}
          </Button>
        )}
      </>
    );
  } else if (isFriend || asked) {
    body = (
      <>
        <p role="status" className="flex items-start justify-center gap-2 font-semibold text-brand-700">
          <Check className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
          <span>{t(isFriend ? "friends.addFriends" : "friends.addRequested", { name })}</span>
        </p>
        <Button className="mt-5" variant={isFriend ? "primary" : "secondary"} onClick={() => navigate(isFriend ? "/race" : "/race/friends")}>
          {t(isFriend ? "friends.addRace" : "friends.addToFriends")}
        </Button>
      </>
    );
  } else {
    body = (
      <>
        <h1 className="font-display text-2xl font-bold tracking-tight text-ink">{t("friends.addTitle", { name })}</h1>
        <p className="mt-1.5 text-muted">{t("friends.addBody")}</p>
        <Button size="lg" className="mt-5" onClick={() => void add()} disabled={busy} aria-busy={busy || undefined}>
          <UserPlus className="size-4.5" aria-hidden="true" />
          {t(theyAsked ? "friends.addAccept" : "friends.addButton")}
        </Button>
        {error && (
          <p role="alert" className="mt-3 text-sm font-medium text-red-700">
            {error}
          </p>
        )}
      </>
    );
  }

  return (
    <PageShell width="md" bar={{ backLabel: t("completion.backToMenu") }}>
      <Card className="mt-6 p-6 text-center sm:p-8" data-testid="add-friend">
        {name && (
          <div className="mb-4 grid justify-items-center gap-2">
            <span aria-hidden="true" className="grid size-16 place-items-center rounded-full bg-brand-600 font-display text-2xl font-bold uppercase text-white">
              {name.slice(0, 1)}
            </span>
            <p className="font-semibold text-ink">@{name}</p>
          </div>
        )}
        {body}
      </Card>
    </PageShell>
  );
}
