import { useCallback, useEffect, useState } from "react";
import { ExternalLink, Flag, KeyRound, Play, RefreshCw } from "lucide-react";
import { Button, Card, Eyebrow, Select } from "../ui";
import { setStudioToken, useStudioToken } from "../../hooks/useStudioToken";
import { StudioClaudeError } from "../../lib/seedgrid/studioClaude";
import { puzzlePath } from "../../lib/communityPuzzles";
import { normalizeTransferPuzzle, type TransferPuzzle } from "../../lib/puzzleNormalizer";
import { compressPuzzleToHash } from "../../lib/puzzleUrl";
import {
  fetchModerationQueue,
  MODERATION_REASONS,
  moderatePuzzle,
  reasonSummary,
  suggestsBan,
  topReason,
  type ModerationQueue,
  type ModerationReason,
  type QueueItem,
  type QueuePuzzle,
} from "../../lib/studioModerate";

const INPUT =
  "h-10 min-w-0 flex-1 rounded-lg border border-line-strong bg-surface px-2 text-base md:text-sm text-ink placeholder:text-subtle focus-visible:outline-2 focus-visible:outline-brand-500";

const when = (iso: string) => new Date(iso).toLocaleDateString([], { month: "short", day: "numeric" });

/** The normal `#puzzle=` link, so the admin can play a held puzzle the page no longer serves. */
function playTestHref(puzzle: QueuePuzzle): string | null {
  const transfer = puzzle.puzzle as TransferPuzzle;
  if (!Array.isArray(transfer.grid)) return null;
  try {
    return `/${compressPuzzleToHash(normalizeTransferPuzzle(transfer))}`;
  } catch {
    return null;
  }
}

/**
 * The admin's report queue (docs/community-puzzles-spec.md §3.3): every
 * community puzzle with an open report, held ones first, with the reasons and
 * notes, the author's strikes, and Dismiss / Remove / Remove and stop this
 * author; below it the recently removed, with Restore (a counter-notice, a
 * mistake). Reads and writes through the studio-moderate edge function, so it
 * needs a studio admin sign-in or the studio token like the daily queue.
 */
export function Reports({ admin }: { admin: boolean }) {
  const token = useStudioToken();
  const [tokenDraft, setTokenDraft] = useState("");
  const [queue, setQueue] = useState<ModerationQueue | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<{ id: string; reason: ModerationReason; note: string; ban: boolean } | null>(null);

  const run = useCallback(async (work: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await work();
    } catch (err) {
      if (err instanceof StudioClaudeError && err.kind === "token") {
        setStudioToken("");
        setError("The studio token wasn't accepted.");
      } else setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, []);

  const refresh = useCallback(() => run(async () => setQueue(await fetchModerationQueue(token))), [run, token]);

  useEffect(() => {
    if (token || admin) void refresh();
  }, [token, admin, refresh]);

  const act = (action: "dismiss" | "restore" | "remove" | "ban", id: string, reason?: ModerationReason, note?: string) =>
    run(async () => {
      await moderatePuzzle(token, action, id, reason, note);
      setRemoving(null);
      setQueue(await fetchModerationQueue(token));
    });

  if (!token && !admin) {
    return (
      <Card className="p-4">
        <Eyebrow as="h2">Reports</Eyebrow>
        <p className="mt-1 text-sm text-muted">Sign in as a studio admin, or enter the studio token.</p>
        <form
          className="mt-2 flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            setStudioToken(tokenDraft);
            setTokenDraft("");
          }}
        >
          <KeyRound className="size-4 text-muted" aria-hidden="true" />
          <label className="sr-only" htmlFor="reports-token">Studio token</label>
          <input id="reports-token" type="password" autoComplete="off" placeholder="Studio token" className={INPUT} value={tokenDraft} onChange={(e) => setTokenDraft(e.target.value)} />
          <Button size="sm" type="submit" disabled={!tokenDraft.trim()}>Save</Button>
        </form>
        {error && <p role="alert" className="mt-2 text-sm text-ink-soft">{error}</p>}
      </Card>
    );
  }

  const item = (entry: QueueItem) => {
    const { puzzle, reports, publisher } = entry;
    const form = removing?.id === puzzle.id ? removing : null;
    const playHref = playTestHref(puzzle);
    return (
      <li key={puzzle.id} className={`rounded-xl px-3 py-2.5 ${puzzle.status === "held" ? "bg-gold-50" : ""}`}>
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <a href={puzzlePath(puzzle.short_id)} target="_blank" rel="noopener" className="font-medium text-ink underline decoration-line-strong underline-offset-2 hover:decoration-brand-500">
            {puzzle.title || "Untitled"}
          </a>
          <span className="text-sm text-muted">by @{puzzle.author}</span>
          <span className="text-xs text-subtle">
            {puzzle.width}×{puzzle.height} · {puzzle.plays} plays
          </span>
          {puzzle.status === "held" && <span className="rounded-full bg-gold-100 px-2 py-0.5 text-xs font-semibold text-gold-800">held</span>}
          {publisher && (publisher.strikes > 0 || publisher.banned_at) && (
            <span className="text-xs font-semibold text-red-700">
              {publisher.banned_at ? "stopped" : `${publisher.strikes} strike${publisher.strikes === 1 ? "" : "s"}`}
            </span>
          )}
        </div>
        <p className="mt-0.5 text-sm text-ink-soft">{reasonSummary(reports)}</p>
        {reports.some((r) => r.details) && (
          <ul className="mt-1 flex flex-col gap-0.5 text-xs text-muted">
            {reports
              .filter((r) => r.details)
              .map((r) => (
                <li key={r.id}>
                  “{r.details}” · {when(r.created_at)}
                </li>
              ))}
          </ul>
        )}
        {form ? (
          <div className="mt-2 flex flex-col gap-2">
            <div className="flex gap-2">
              <Select<ModerationReason>
                aria-label="Reason"
                size="sm"
                className="w-36 shrink-0"
                value={form.reason}
                options={MODERATION_REASONS.map((r) => ({ value: r, label: r }))}
                onChange={(reason) => setRemoving({ ...form, reason })}
              />
              <input className={INPUT} aria-label="Note to the author" placeholder="Note to the author (optional)" maxLength={500} value={form.note} onChange={(e) => setRemoving({ ...form, note: e.target.value })} />
            </div>
            <label className="flex items-center gap-2 text-sm text-ink-soft">
              <input type="checkbox" className="size-4 accent-red-600" checked={form.ban} onChange={(e) => setRemoving({ ...form, ban: e.target.checked })} />
              Also stop this author publishing (removes all their puzzles)
            </label>
            <div className="flex justify-end gap-1">
              <Button variant="ghost" size="sm" onClick={() => setRemoving(null)}>Keep</Button>
              <Button variant="danger" size="sm" disabled={busy} onClick={() => void act(form.ban ? "ban" : "remove", puzzle.id, form.reason, form.note)}>
                {form.ban ? "Remove and stop author" : "Remove"}
              </Button>
            </div>
          </div>
        ) : (
          <div className="mt-1.5 flex flex-wrap items-center gap-1">
            {playHref && (
              <a href={playHref} target="_blank" rel="noopener" className="inline-flex min-h-9 items-center gap-1 rounded-lg px-2 text-sm font-medium text-ink-soft hover:bg-surface-sunken">
                <Play className="size-4" aria-hidden="true" /> Play test
              </a>
            )}
            <Button variant="ghost" size="sm" disabled={busy} onClick={() => void act("dismiss", puzzle.id)}>Dismiss</Button>
            <Button variant="ghost" size="sm" className="text-red-700" disabled={busy} onClick={() => setRemoving({ id: puzzle.id, reason: topReason(reports), note: "", ban: suggestsBan(entry) })}>
              Remove…
            </Button>
          </div>
        )}
      </li>
    );
  };

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <Eyebrow as="h2" className="flex items-center gap-1.5">
          <Flag className="size-4" aria-hidden="true" /> Reports
        </Eyebrow>
        <button
          type="button"
          className="inline-flex size-9 items-center justify-center rounded-lg text-muted hover:bg-surface-sunken hover:text-ink active:bg-line focus-visible:outline-2 focus-visible:outline-brand-500"
          aria-label="Refresh the reports"
          onClick={() => void refresh()}
          disabled={busy}
        >
          <RefreshCw className={`size-4 ${busy ? "motion-safe:animate-spin" : ""}`} aria-hidden="true" />
        </button>
      </div>
      {queue === null ? (
        <p className="mt-2 text-sm text-muted">{error ? "" : "Loading…"}</p>
      ) : queue.items.length === 0 ? (
        <p className="mt-2 text-sm text-muted">No open reports.</p>
      ) : (
        <ul className="mt-2 flex flex-col gap-1">{queue.items.map(item)}</ul>
      )}
      {queue && queue.removed.length > 0 && (
        <details className="mt-3 border-t border-line pt-2">
          <summary className="cursor-pointer text-sm font-medium text-ink-soft">Recently removed ({queue.removed.length})</summary>
          <ul className="mt-1 flex flex-col gap-0.5">
            {queue.removed.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-x-2 rounded-lg px-2 py-1 text-sm">
                <span className="font-medium text-ink">{p.title || "Untitled"}</span>
                <span className="text-muted">by @{p.author}</span>
                <span className="text-xs text-subtle">{p.removed_reason}{p.moderated_at ? ` · ${when(p.moderated_at)}` : ""}</span>
                <Button variant="ghost" size="sm" className="ml-auto" disabled={busy} onClick={() => void act("restore", p.id)}>
                  Restore
                </Button>
              </li>
            ))}
          </ul>
        </details>
      )}
      <p className="mt-3 text-xs text-subtle">
        <ExternalLink className="mr-1 inline size-3.5" aria-hidden="true" />
        Copyright notices follow /copyright; a removal for one uses the “copyright” reason so a counter-notice can Restore it.
      </p>
      {error && <p role="alert" className="mt-2 rounded-xl bg-gold-50 px-3 py-2 text-sm text-ink-soft">{error}</p>}
    </Card>
  );
}
