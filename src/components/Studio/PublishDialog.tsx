import { useCallback, useEffect, useId, useMemo, useRef, useState, type Dispatch } from "react";
import { Check, Copy, ExternalLink, Globe, X } from "lucide-react";
import type { User } from "@supabase/supabase-js";
import { Button, Select } from "../ui";
import { UsernamePicker } from "../Account/UsernamePicker";
import { useFocusTrap } from "../../hooks/useFocusTrap";
import { accountName, fetchProfile, type Profile } from "../../lib/account";
import { track } from "../../lib/analytics";
import { PUBLISHING_TERMS_VERSION } from "../../lib/community";
import {
  acceptPublishingTerms,
  COMMUNITY_LANGS,
  CommunityError,
  fetchPublisher,
  MAX_NOTES,
  MAX_TITLE,
  publishProblems,
  publishPuzzle,
  puzzlePath,
  toPublishSnapshot,
  unpublishPuzzle,
  type CommunityErrorKind,
  type CommunityLang,
  type CommunityPuzzle,
  type PublisherRow,
} from "../../lib/communityPuzzles";
import { knownClassicManifest, prefetchClassicManifest } from "../../lib/classicLibrary";
import { knownPublishedIndex, prefetchDailyIndex } from "../../lib/dailyIndex";
import { dayKey } from "../../lib/soloStats";
import { LEGAL_CONTACT_EMAIL } from "../../screens/legal/legalContent";
import type { Difficulty } from "../../lib/seedgrid/cluePrompt";
import type { StudioAction, StudioState } from "../../lib/seedgrid/studioState";
import i18n from "../../i18n/i18n";

interface PublishDialogProps {
  state: StudioState;
  dispatch: Dispatch<StudioAction>;
  /** The signed-in (non-anonymous) studio account, or null. */
  user: User | null;
  /** This studio puzzle's row, when it was published before. */
  existing: CommunityPuzzle | null;
  onClose: () => void;
  /** After a publish, update or unpublish: the studio refetches its rows. */
  onChanged: () => void;
}

const INPUT =
  "w-full rounded-xl border border-line-strong bg-surface px-3 py-2 text-base text-ink placeholder:text-subtle focus-visible:outline-2 focus-visible:outline-brand-500 md:text-sm";

const REFUSALS: Record<CommunityErrorKind, string> = {
  not_signed_in: "Sign in to publish.",
  no_username: "Pick a username first.",
  terms: "Agree to the publishing terms first.",
  banned: `Publishing is switched off for this account. Email ${LEGAL_CONTACT_EMAIL} if you think that's wrong.`,
  invalid: "Something about this puzzle isn't right. Check the grid and clues and try again.",
  rate_limited: "You've published a lot today. Try again tomorrow.",
  too_many: "You've reached 100 published puzzles. Unpublish one to make room.",
  already_published: "Someone has already published this exact puzzle.",
  under_review: "This puzzle is being reviewed after reports; it can't be updated until that's settled.",
  removed: "This puzzle was removed and can't be published again.",
  not_found: "That puzzle isn't published any more.",
  own_puzzle: "That's your own puzzle.",
  already_reported: "Already reported.",
  unconfigured: "Publishing isn't available in this build.",
  failed: "Publishing failed. Please try again.",
};

const uiLang = (): CommunityLang => (i18n.language?.startsWith("es") ? "es" : "en");

/** The puzzle's page on this site. */
export const puzzleUrl = (shortId: string) => `${window.location.origin}${puzzlePath(shortId)}`;

/**
 * Publish (or update, or unpublish) the open studio puzzle to the community
 * library (docs/community-puzzles-spec.md §1.2–1.3). Needs the studio
 * account to have a username (the picker opens in place when it has none) and,
 * once per version of the publishing terms, the author's agreement. The
 * checks (publishProblems) run here before the button enables; the server
 * holds the limits and the duplicate rule.
 */
export function PublishDialog({ state, dispatch, user, existing, onClose, onChanged }: PublishDialogProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const handleEscape = useCallback(() => onClose(), [onClose]);
  useFocusTrap(panelRef, handleEscape);

  const [profile, setProfile] = useState<Profile | null | undefined>(undefined);
  const [publisher, setPublisher] = useState<PublisherRow | null | undefined>(undefined);
  const [notes, setNotes] = useState(existing?.notes ?? "");
  const [lang, setLang] = useState<CommunityLang>(existing?.lang ?? uiLang());
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ shortId: string; update: boolean } | null>(null);
  const [copied, setCopied] = useState(false);
  const [confirmUnpublish, setConfirmUnpublish] = useState(false);
  const [ours, setOurs] = useState<ReadonlySet<string>>(() => new Set());

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    void Promise.all([fetchProfile(user.id).catch(() => null), fetchPublisher(user.id).catch(() => null)]).then(([p, pub]) => {
      if (cancelled) return;
      setProfile(p);
      setPublisher(pub);
    });
    return () => {
      cancelled = true;
    };
  }, [user]);

  // The dailies' and classics' identities, so one of ours is never republished.
  useEffect(() => {
    let cancelled = false;
    const collect = () => {
      const keys = new Set<string>();
      for (const e of knownPublishedIndex(dayKey(new Date())) ?? []) keys.add(e.identity);
      for (const e of knownClassicManifest() ?? []) keys.add(e.identity);
      if (!cancelled) setOurs(keys);
    };
    collect();
    void Promise.all([prefetchDailyIndex(dayKey(new Date())), prefetchClassicManifest()]).then(collect, collect);
    return () => {
      cancelled = true;
    };
  }, []);

  const problems = useMemo(() => publishProblems(state, { ours, notes }), [state, ours, notes]);
  const needsTerms = !publisher || publisher.terms_version !== PUBLISHING_TERMS_VERSION;
  const loading = !!user && (profile === undefined || publisher === undefined);
  const live = existing?.status === "published";

  const publish = async () => {
    if (!user || !profile) return;
    setBusy(true);
    setError(null);
    try {
      if (needsTerms) {
        await acceptPublishingTerms(PUBLISHING_TERMS_VERSION);
        setPublisher({ user_id: user.id, terms_accepted_at: new Date().toISOString(), terms_version: PUBLISHING_TERMS_VERSION, strikes: 0, banned_at: null, ban_reason: null, created_at: new Date().toISOString() });
      }
      const out = await publishPuzzle({
        studioId: state.id,
        title: state.title,
        notes,
        difficulty: state.difficulty,
        lang,
        snapshot: toPublishSnapshot(state, profile.username),
      });
      track("puzzle_published", { size: `${state.grid.width}x${state.grid.height}`, difficulty: state.difficulty, lang, update: out.version > 1 });
      setResult({ shortId: out.shortId, update: out.version > 1 });
      onChanged();
    } catch (err) {
      setError(err instanceof CommunityError ? REFUSALS[err.kind] : REFUSALS.failed);
    } finally {
      setBusy(false);
    }
  };

  const unpublish = async () => {
    if (!existing) return;
    setBusy(true);
    setError(null);
    try {
      await unpublishPuzzle(existing.id);
      track("puzzle_unpublished");
      onChanged();
      onClose();
    } catch (err) {
      setError(err instanceof CommunityError ? REFUSALS[err.kind] : REFUSALS.failed);
      setBusy(false);
    }
  };

  const copyLink = (shortId: string) => {
    void navigator.clipboard?.writeText(puzzleUrl(shortId)).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      },
      () => undefined,
    );
  };

  const heading = result ? (result.update ? "Updated" : "Published") : live ? "Update your published puzzle" : "Publish to the community";

  let body: React.ReactNode;
  if (!user) {
    body = (
      <p className="text-sm leading-relaxed text-ink-soft">
        Publishing needs an account with a username, so other players can find your puzzles and credit you. Sign in from the top bar, then come back here.
      </p>
    );
  } else if (loading) {
    body = <p className="text-sm text-muted">Loading…</p>;
  } else if (publisher?.banned_at) {
    body = <p className="text-sm leading-relaxed text-ink-soft">{REFUSALS.banned}</p>;
  } else if (!profile) {
    body = (
      <>
        <p className="mb-3 text-sm leading-relaxed text-ink-soft">Your puzzles are published under a username. Pick one to continue.</p>
        <UsernamePicker userId={user.id} current={null} suggestFrom={accountName(user)} onSaved={setProfile} onCancel={onClose} cancelLabel="Later" />
      </>
    );
  } else if (result) {
    const url = puzzleUrl(result.shortId);
    body = (
      <div className="flex flex-col gap-3">
        <p className="text-sm leading-relaxed text-ink-soft">
          {result.update ? "Your changes are live." : "Your puzzle is live. Anyone can play it, race it and share it."}
        </p>
        <p className="truncate rounded-xl bg-surface-sunken px-3 py-2 font-mono text-sm text-ink">{url}</p>
        <div className="flex flex-wrap gap-2">
          <Button variant="soft" onClick={() => copyLink(result.shortId)}>
            {copied ? <Check className="size-4" aria-hidden="true" /> : <Copy className="size-4" aria-hidden="true" />} {copied ? "Copied" : "Copy link"}
          </Button>
          <a href={url} target="_blank" rel="noopener" className="inline-flex min-h-11 items-center gap-1.5 rounded-xl px-3 text-sm font-semibold text-brand-700 hover:bg-surface-sunken">
            <ExternalLink className="size-4" aria-hidden="true" /> View puzzle
          </a>
          <Button variant="secondary" className="ml-auto" onClick={onClose}>
            Done
          </Button>
        </div>
      </div>
    );
  } else {
    body = (
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          void publish();
        }}
      >
        {existing?.status === "held" && <p className="rounded-xl bg-gold-50 px-3 py-2 text-sm text-ink-soft">This puzzle is being reviewed after reports. You'll see the outcome on your account page.</p>}
        {existing?.status === "removed" && <p className="rounded-xl bg-gold-50 px-3 py-2 text-sm text-ink-soft">This puzzle was removed{existing.removed_reason ? ` (${existing.removed_reason})` : ""} and can't be published again.</p>}
        <label className="block text-sm font-medium text-ink-soft">
          Title
          <input className={`${INPUT} mt-1`} value={state.title} maxLength={MAX_TITLE} onChange={(e) => dispatch({ type: "SET_TITLE", title: e.target.value })} />
        </label>
        <label className="block text-sm font-medium text-ink-soft">
          <span className="flex items-baseline justify-between">
            Note for solvers <span className="text-xs font-normal tabular-nums text-subtle">{notes.length}/{MAX_NOTES}</span>
          </span>
          <textarea
            className={`${INPUT} mt-1`}
            rows={2}
            maxLength={MAX_NOTES}
            placeholder="Optional: a themeless with a few long stacks. Wednesday-ish."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className="block text-sm font-medium text-ink-soft">
            Difficulty
            <Select
              block
              className="mt-1"
              value={state.difficulty}
              options={[
                { value: "easy", label: "Easy" },
                { value: "medium", label: "Medium" },
                { value: "hard", label: "Hard" },
              ]}
              onChange={(difficulty: Difficulty) => dispatch({ type: "SET_DIFFICULTY", difficulty })}
            />
          </label>
          <label className="block text-sm font-medium text-ink-soft">
            Language
            <Select block className="mt-1" value={lang} options={COMMUNITY_LANGS.map((l) => ({ value: l, label: l === "en" ? "English" : "Español" }))} onChange={setLang} />
          </label>
        </div>
        <p className="text-xs text-subtle">Published under @{profile.username}. Players solve it in Crossword Clash; you can unpublish it any time.</p>
        {problems.length > 0 && (
          <ul className="list-disc rounded-xl bg-gold-50 py-2 pl-7 pr-3 text-sm text-ink-soft">
            {problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        )}
        {needsTerms && (
          <label className="flex items-start gap-2.5 text-sm leading-snug text-ink-soft">
            <input type="checkbox" className="mt-0.5 size-4 shrink-0 accent-brand-600" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
            <span>
              I made this puzzle (or have the right to publish it) and I agree to the{" "}
              <a href="/terms" target="_blank" rel="noopener" className="font-semibold text-brand-700 underline decoration-brand-200 underline-offset-2">
                publishing terms
              </a>
              .
            </span>
          </label>
        )}
        {error && (
          <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <Button type="submit" disabled={busy || problems.length > 0 || (needsTerms && !agree) || existing?.status === "held" || existing?.status === "removed"} aria-busy={busy || undefined}>
            <Globe className="size-4" aria-hidden="true" /> {busy ? "Publishing…" : live ? "Update" : "Publish"}
          </Button>
          {live && existing && (
            <>
              <Button variant="ghost" onClick={() => copyLink(existing.short_id)}>
                {copied ? <Check className="size-4" aria-hidden="true" /> : <Copy className="size-4" aria-hidden="true" />} {copied ? "Copied" : "Copy link"}
              </Button>
              {confirmUnpublish ? (
                <span className="ml-auto flex items-center gap-1">
                  <Button variant="ghost" size="sm" onClick={() => setConfirmUnpublish(false)}>
                    Keep
                  </Button>
                  <Button variant="danger" size="sm" onClick={() => void unpublish()} disabled={busy}>
                    Unpublish
                  </Button>
                </span>
              ) : (
                <Button variant="ghost" className="ml-auto text-red-700" onClick={() => setConfirmUnpublish(true)} disabled={busy}>
                  Unpublish
                </Button>
              )}
            </>
          )}
        </div>
      </form>
    );
  }

  return (
    <div
      className="fixed inset-0 z-[65] flex items-end justify-center overscroll-contain sm:items-center"
      style={{
        paddingTop: "max(1rem, env(safe-area-inset-top))",
        paddingRight: "max(1rem, env(safe-area-inset-right))",
        paddingBottom: "max(1rem, env(safe-area-inset-bottom))",
        paddingLeft: "max(1rem, env(safe-area-inset-left))",
      }}
    >
      <div data-testid="publish-backdrop" className="lf-fade-in absolute inset-0 bg-stage/60 backdrop-blur-[2px]" onClick={onClose} />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="lf-pop-in scroll-quiet relative max-h-full w-full max-w-md overflow-y-auto overscroll-contain rounded-2xl border border-line bg-surface p-6 text-ink shadow-overlay"
      >
        <div className="flex items-start gap-3.5">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-600">
            <Globe className="size-5" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="font-display text-lg font-bold leading-snug tracking-tight">
              {heading}
            </h2>
            {!result && <p className="mt-1.5 text-sm leading-relaxed text-muted">Other players find it at /puzzles, play it solo or race on it, and see it under your username.</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mr-2 -mt-2 grid size-11 shrink-0 place-items-center rounded-xl text-muted hover:bg-surface-sunken active:bg-surface-sunken focus-visible:outline-2 focus-visible:outline-brand-500"
          >
            <X className="size-5" aria-hidden="true" />
          </button>
        </div>
        <div className="mt-5">{body}</div>
      </div>
    </div>
  );
}
