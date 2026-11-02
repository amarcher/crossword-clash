import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2 } from "lucide-react";
import { PageShell } from "../components/PageShell";
import { Button, Card, Eyebrow } from "../components/ui";
import { inputClass } from "../components/Flow/TextField";
import { PersonList, PersonRow } from "../components/Friends";
import { useConfirm } from "../components/ConfirmDialog";
import { useAccountContext } from "../contexts/AccountContext";
import { useFriends } from "../contexts/FriendsContext";
import { fetchRecentOpponents, FriendsError, searchUsernames, type FriendsErrorKind, type Opponent, type Person } from "../lib/friends";
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

function errorKey(err: unknown): string {
  return (err instanceof FriendsError && ERROR_KEYS[err.kind]) || "friends.errorGeneric";
}

/**
 * Friends (docs/friends-spec.md §3.1): requests awaiting the viewer, adding by
 * username, "people you have raced" from the game rows the sweep keeps, and the
 * friends list with Remove and Block. An anonymous visitor is sent to sign in.
 */
export function FriendsScreen() {
  const { t } = useTranslation();
  const account = useAccountContext();
  const friends = useFriends();
  const confirm = useConfirm();
  const viewerId = account.user?.id ?? "";

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Person[]>([]);
  const [searching, setSearching] = useState(false);
  const [opponents, setOpponents] = useState<Opponent[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ text: string; error?: boolean } | null>(null);
  // Requests sent from this screen, so a row flips to "Requested" without waiting for the refetch.
  const [requested, setRequested] = useState<Record<string, true>>({});

  useEffect(() => {
    if (!friends.active) return;
    let live = true;
    fetchRecentOpponents().then(
      (list) => live && setOpponents(list),
      () => live && setOpponents([]),
    );
    return () => {
      live = false;
    };
  }, [friends.active]);

  useEffect(() => {
    if (!friends.active) return;
    const q = query.trim();
    if (q.replace(/^@/, "").length < 2) {
      setResults([]);
      return;
    }
    setSearching(true);
    const handle = window.setTimeout(() => {
      searchUsernames(q, viewerId).then(
        (list) => {
          setResults(list);
          setSearching(false);
        },
        () => setSearching(false),
      );
    }, 250);
    return () => window.clearTimeout(handle);
  }, [query, viewerId, friends.active]);

  const relation = useCallback(
    (userId: string): "friend" | "incoming" | "outgoing" | "requested" | "none" => {
      if (friends.friendships.friends.some((f) => f.userId === userId)) return "friend";
      if (friends.friendships.incoming.some((f) => f.userId === userId)) return "incoming";
      if (friends.friendships.outgoing.some((f) => f.userId === userId) || requested[userId]) return "outgoing";
      return "none";
    },
    [friends.friendships, requested],
  );

  const send = async (person: Person, method: "username" | "raced") => {
    setBusy(person.userId);
    setNotice(null);
    try {
      const outcome = await friends.request(person.username);
      track("friend_request_sent", { method, outcome });
      setRequested((prev) => ({ ...prev, [person.userId]: true }));
      setNotice({ text: t(outcome === "accepted" ? "friends.nowFriends" : "friends.requestSent", { name: person.username }) });
    } catch (err) {
      setNotice({ text: t(errorKey(err)), error: true });
    } finally {
      setBusy(null);
    }
  };

  const respond = async (person: Person, accept: boolean) => {
    setBusy(person.userId);
    setNotice(null);
    try {
      await friends.respond(person.userId, accept);
    } catch (err) {
      setNotice({ text: t(errorKey(err)), error: true });
    } finally {
      setBusy(null);
    }
  };

  const remove = async (person: Person) => {
    const ok = await confirm({ title: t("friends.removeConfirm", { name: person.username }), confirmLabel: t("friends.remove") });
    if (!ok) return;
    setBusy(person.userId);
    try {
      await friends.remove(person.userId);
    } finally {
      setBusy(null);
    }
  };

  const block = async (person: Person) => {
    const ok = await confirm({
      title: t("friends.blockConfirm", { name: person.username }),
      body: t("friends.blockBody"),
      confirmLabel: t("friends.block"),
      tone: "danger",
    });
    if (!ok) return;
    setBusy(person.userId);
    try {
      await friends.block(person.userId);
      setNotice({ text: t("friends.blocked", { name: person.username }) });
    } finally {
      setBusy(null);
    }
  };

  const actionFor = (person: Person, method: "username" | "raced") => {
    switch (relation(person.userId)) {
      case "friend":
        return <span className="text-sm font-semibold text-muted">{t("friends.alreadyFriend")}</span>;
      case "outgoing":
        return <span className="text-sm font-semibold text-muted">{t("friends.requested")}</span>;
      case "incoming":
        return (
          <Button size="sm" onClick={() => void respond(person, true)} disabled={busy !== null}>
            {t("friends.accept")}
          </Button>
        );
      default:
        return (
          <Button size="sm" variant="secondary" onClick={() => void send(person, method)} disabled={busy !== null} aria-busy={busy === person.userId || undefined}>
            {t("friends.add")}
          </Button>
        );
    }
  };

  const shell = (children: React.ReactNode) => (
    <PageShell width="md" bar={{ backLabel: t("race.title"), backTo: "/race" }}>
      <header className="mb-5">
        <h1 className="font-display text-3xl font-bold tracking-tight text-ink sm:text-4xl">{t("friends.title")}</h1>
        <p className="mt-1 text-muted">{t("friends.subtitle")}</p>
      </header>
      {children}
    </PageShell>
  );

  if (!friends.active) {
    const needsUsername = !!account.user && !account.profile;
    return shell(
      <Card className="p-5">
        <h2 className="font-semibold text-ink">{t(needsUsername ? "race.usernameTitle" : "race.signInTitle")}</h2>
        <p className="mt-1 text-sm text-muted">{t(needsUsername ? "race.usernameBody" : "race.signInBody")}</p>
        {account.available && (
          <Button
            className="mt-4"
            onClick={() => (needsUsername ? account.openAccount({ view: "username", placement: "friends" }) : account.openAccount({ placement: "friends", returnTo: "/race/friends" }))}
          >
            {t(needsUsername ? "race.chooseUsername" : "race.signIn")}
          </Button>
        )}
      </Card>,
    );
  }

  const { incoming, friends: list } = friends.friendships;

  return shell(
    <div className="grid gap-4">
      {notice && (
        <p role={notice.error ? "alert" : "status"} className={`rounded-xl px-4 py-3 text-sm font-medium ${notice.error ? "bg-red-50 text-red-700" : "bg-brand-50 text-brand-700"}`}>
          {notice.text}
        </p>
      )}

      {incoming.length > 0 && (
        <Card className="p-5">
          <Eyebrow as="h2">{t("friends.requestsHeading", { count: incoming.length })}</Eyebrow>
          <PersonList className="mt-3">
            {incoming.map((p) => (
              <PersonRow key={p.userId} username={p.username} detail={t("friends.wantsToBeFriends")}>
                <Button size="sm" onClick={() => void respond(p, true)} disabled={busy !== null}>
                  {t("friends.accept")}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => void respond(p, false)} disabled={busy !== null}>
                  {t("friends.decline")}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => void block(p)} disabled={busy !== null} aria-label={t("friends.blockName", { name: p.username })}>
                  {t("friends.block")}
                </Button>
              </PersonRow>
            ))}
          </PersonList>
        </Card>
      )}

      <Card className="p-5">
        <label htmlFor="friend-search" className="block">
          <Eyebrow as="span">{t("friends.searchHeading")}</Eyebrow>
        </label>
        <div className="relative mt-3">
          <input
            id="friend-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("friends.searchPlaceholder")}
            maxLength={21}
            autoCapitalize="none"
            autoCorrect="off"
            autoComplete="off"
            spellCheck={false}
            className={inputClass}
          />
          {searching && <Loader2 className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-subtle motion-reduce:animate-none" aria-hidden="true" />}
        </div>
        {results.length > 0 && (
          <PersonList className="mt-3">
            {results.map((p) => (
              <PersonRow key={p.userId} username={p.username}>
                {actionFor(p, "username")}
              </PersonRow>
            ))}
          </PersonList>
        )}
        {query.trim().replace(/^@/, "").length >= 2 && !searching && results.length === 0 && <p className="mt-3 text-sm text-muted">{t("friends.searchEmpty")}</p>}
      </Card>

      <Card className="p-5">
        <Eyebrow as="h2">{t("friends.racedHeading")}</Eyebrow>
        <p className="mt-1 text-sm text-muted">{t("friends.racedHint")}</p>
        {opponents === null ? (
          <p className="mt-3 text-sm text-muted">{t("friends.loading")}</p>
        ) : opponents.filter((o) => relation(o.userId) !== "friend").length === 0 ? (
          <p className="mt-3 text-sm text-muted">{t("friends.racedEmpty")}</p>
        ) : (
          <PersonList className="mt-3">
            {opponents
              .filter((o) => relation(o.userId) !== "friend")
              .map((o) => (
                <PersonRow key={o.userId} username={o.username} detail={t("friends.racedDetail", { count: o.games, when: new Date(o.lastAt).toLocaleDateString() })}>
                  {actionFor(o, "raced")}
                </PersonRow>
              ))}
          </PersonList>
        )}
      </Card>

      <Card className="p-5">
        <Eyebrow as="h2">{t("friends.listHeading", { count: list.length })}</Eyebrow>
        {list.length === 0 ? (
          <p className="mt-3 text-sm text-muted">{t("friends.listEmpty")}</p>
        ) : (
          <PersonList className="mt-3">
            {list.map((p) => (
              <PersonRow key={p.userId} username={p.username} detail={t("friends.since", { when: new Date(p.since).toLocaleDateString() })}>
                <Button size="sm" variant="ghost" onClick={() => void remove(p)} disabled={busy !== null}>
                  {t("friends.remove")}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => void block(p)} disabled={busy !== null} aria-label={t("friends.blockName", { name: p.username })}>
                  {t("friends.block")}
                </Button>
              </PersonRow>
            ))}
          </PersonList>
        )}
      </Card>

      {friends.blocked.length > 0 && (
        <p className="text-sm text-muted">
          {t("friends.blockedCount", { count: friends.blocked.length })}{" "}
          <button type="button" className="font-semibold text-brand-700 underline-offset-2 hover:underline" onClick={() => void Promise.all(friends.blocked.map((id) => friends.unblock(id)))}>
            {t("friends.unblockAll")}
          </button>
        </p>
      )}
    </div>,
  );
}
