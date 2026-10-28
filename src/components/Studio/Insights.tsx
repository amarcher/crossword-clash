import { useCallback, useEffect, useState } from "react";
import { BarChart3, KeyRound, RefreshCw } from "lucide-react";
import { Button, Card, Eyebrow } from "../ui";
import { setStudioToken, useStudioToken } from "../../hooks/useStudioToken";
import { StudioClaudeError } from "../../lib/seedgrid/studioClaude";
import {
  describeBreakdown,
  fetchClueInsights,
  fetchPuzzleInsights,
  formatSeconds,
  hardestClues,
  INSIGHT_RANGES,
  pct,
  summarize,
  type ClueInsight,
  type InsightRange,
  type PuzzleInsight,
} from "../../lib/insights";

const INPUT =
  "h-10 min-w-0 flex-1 rounded-lg border border-line-strong bg-surface px-2 text-base md:text-sm text-ink placeholder:text-subtle focus-visible:outline-2 focus-visible:outline-brand-500";
const TH = "px-2 py-1.5 text-left text-xs font-semibold uppercase tracking-wide text-muted";
const TD = "px-2 py-1.5 align-top text-sm text-ink tabular-nums";

const share = (part: number, whole: number) => {
  const p = pct(part, whole);
  return p === null ? "—" : `${p}%`;
};

const when = (iso: string) => new Date(iso).toLocaleDateString([], { month: "short", day: "numeric" });

/**
 * The admin's view of how puzzles are doing: for the last 7–90 days, every
 * puzzle played with its opens, attempts and solves, the solo / multiplayer and
 * signed-in shares, the platforms it was played on, and whether the TV
 * game-show host came on; open a puzzle for its hardest clues. Reads through
 * the studio-insights edge function, so it needs a studio admin sign-in or
 * the studio token, like the daily queue.
 */
export function Insights({ admin }: { admin: boolean }) {
  const token = useStudioToken();
  const [tokenDraft, setTokenDraft] = useState("");
  const [days, setDays] = useState<InsightRange>(14);
  const [rows, setRows] = useState<PuzzleInsight[] | null>(null);
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [clues, setClues] = useState<Record<string, ClueInsight[]>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  const refresh = useCallback(
    () =>
      run(async () => {
        setRows(await fetchPuzzleInsights(token, days));
        setClues({});
      }),
    [run, token, days],
  );

  useEffect(() => {
    if (token || admin) void refresh();
  }, [token, admin, refresh]);

  const open = (key: string) => {
    if (openKey === key) {
      setOpenKey(null);
      return;
    }
    setOpenKey(key);
    if (!clues[key]) {
      void run(async () => {
        const list = await fetchClueInsights(token, key, days);
        setClues((c) => ({ ...c, [key]: list }));
      });
    }
  };

  if (!token && !admin) {
    return (
      <Card className="p-4">
        <Eyebrow as="h2">Puzzle insights</Eyebrow>
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
          <label className="sr-only" htmlFor="insights-token">Studio token</label>
          <input id="insights-token" type="password" autoComplete="off" placeholder="Studio token" className={INPUT} value={tokenDraft} onChange={(e) => setTokenDraft(e.target.value)} />
          <Button type="submit" size="sm" disabled={!tokenDraft.trim()}>Save</Button>
        </form>
      </Card>
    );
  }

  const totals = rows ? summarize(rows) : null;

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Eyebrow as="h2" className="flex items-center gap-1.5">
          <BarChart3 className="size-4" aria-hidden="true" /> Puzzle insights
        </Eyebrow>
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Range">
          {INSIGHT_RANGES.map((d) => (
            <button
              key={d}
              type="button"
              aria-pressed={days === d}
              onClick={() => setDays(d)}
              className={`min-h-9 rounded-full px-3 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-brand-500 ${
                days === d ? "bg-brand-600 text-white" : "bg-surface-sunken text-ink-soft hover:bg-line active:bg-line"
              }`}
            >
              {d}d
            </button>
          ))}
          <Button size="sm" variant="ghost" onClick={() => void refresh()} disabled={busy} aria-label="Refresh">
            <RefreshCw className={`size-4 ${busy ? "animate-spin motion-reduce:animate-none" : ""}`} aria-hidden="true" />
          </Button>
        </div>
      </div>

      {totals && (
        <p className="mt-2 text-sm text-ink-soft">
          <span className="font-semibold text-ink">{totals.opens}</span> opens · <span className="font-semibold text-ink">{totals.attempted}</span> attempted ·{" "}
          <span className="font-semibold text-ink">{totals.solves}</span> solved ({share(totals.solves, totals.opens)}) · signed in {share(totals.signedIn, totals.opens)} · narrator{" "}
          {totals.narratorConnected + totals.narratorFailed ? `${totals.narratorConnected}/${totals.narratorConnected + totals.narratorFailed} started` : "—"}
          <br />
          <span className="text-muted">Platforms: {describeBreakdown(totals.byPlatform, 5)}</span>
        </p>
      )}

      {error && <p role="alert" className="mt-2 rounded-xl bg-gold-50 px-3 py-2 text-sm text-ink-soft">{error}</p>}

      {rows && rows.length === 0 && <p className="mt-3 text-sm text-muted">No plays in the last {days} days.</p>}

      {rows && rows.length > 0 && (
        <div className="-mx-2 mt-3 overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse">
            <thead>
              <tr className="border-b border-line">
                <th className={TH}>Puzzle</th>
                <th className={TH}>Opens</th>
                <th className={TH}>Attempted</th>
                <th className={TH}>Solved</th>
                <th className={TH}>Median solve</th>
                <th className={TH}>Solo / MP</th>
                <th className={TH}>Signed in</th>
                <th className={TH}>Narrator</th>
                <th className={TH}>Platforms</th>
                <th className={TH}>Last</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const isOpen = openKey === r.puzzle_key;
                return (
                  <PuzzleRows key={r.puzzle_key} row={r} open={isOpen} clues={clues[r.puzzle_key]} onToggle={() => open(r.puzzle_key)} />
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function PuzzleRows({ row: r, open, clues, onToggle }: { row: PuzzleInsight; open: boolean; clues: ClueInsight[] | undefined; onToggle: () => void }) {
  const narrator = r.narrator_connected + r.narrator_failed;
  return (
    <>
      <tr className={`border-b border-line ${open ? "bg-brand-50/60" : ""}`}>
        <td className={`${TD} max-w-56`}>
          <button type="button" aria-expanded={open} onClick={onToggle} className="min-h-9 text-left font-semibold text-ink hover:text-brand-700 focus-visible:outline-2 focus-visible:outline-brand-500">
            {r.puzzle_title || "(untitled)"}
          </button>
          <span className="block text-xs text-muted">
            {r.width}×{r.height} · {describeBreakdown(r.by_source, 2)}
          </span>
        </td>
        <td className={TD}>{r.opens}</td>
        <td className={TD}>
          {r.attempted} <span className="text-muted">({share(r.attempted, r.opens)})</span>
        </td>
        <td className={TD}>
          {r.solves} <span className="text-muted">({share(r.solves, r.opens)})</span>
        </td>
        <td className={TD}>{formatSeconds(r.median_active_seconds)}</td>
        <td className={TD}>
          {r.solo} / {r.multiplayer}
        </td>
        <td className={TD}>{share(r.signed_in, r.opens)}</td>
        <td className={TD}>{narrator ? `${r.narrator_connected}/${narrator}` : "—"}</td>
        <td className={`${TD} max-w-64 text-xs text-ink-soft`}>{describeBreakdown(r.by_platform, 3)}</td>
        <td className={`${TD} whitespace-nowrap`}>{when(r.last_played)}</td>
      </tr>
      {open && (
        <tr className="border-b border-line bg-surface-sunken/50">
          <td colSpan={10} className="px-2 py-3">
            {!clues ? (
              <p className="text-sm text-muted">Loading clues…</p>
            ) : hardestClues(clues).length === 0 ? (
              <p className="text-sm text-muted">No clue was focused yet.</p>
            ) : (
              <HardestClues clues={clues} />
            )}
          </td>
        </tr>
      )}
    </>
  );
}

function HardestClues({ clues }: { clues: ClueInsight[] }) {
  const ranked = hardestClues(clues);
  const shown = ranked.slice(0, 12);
  const maxTime = Math.max(1, ...shown.map((c) => c.median_solve_seconds ?? c.avg_solve_seconds ?? 0));
  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Hardest to enter · median seconds from first focus to solve, wrong letters, focuses that never solved</p>
      <ol className="grid gap-1.5 sm:grid-cols-2">
        {shown.map((c) => {
          const time = c.median_solve_seconds ?? c.avg_solve_seconds ?? 0;
          return (
            <li key={c.clue} className="grid grid-cols-[3.5rem_1fr_auto] items-center gap-2 text-sm">
              <span className="font-mono font-semibold text-ink">{c.clue}</span>
              <span className="h-2 overflow-hidden rounded-full bg-line" aria-hidden="true">
                <span className="block h-full rounded-full bg-brand-500" style={{ width: `${Math.max(4, Math.round((100 * time) / maxTime))}%` }} />
              </span>
              <span className="whitespace-nowrap text-xs text-ink-soft tabular-nums">
                {formatSeconds(time)} · {c.wrong_letters} wrong · {c.unsolved}/{c.attempts} unsolved
              </span>
            </li>
          );
        })}
      </ol>
      {ranked.length > shown.length && <p className="mt-2 text-xs text-muted">{ranked.length - shown.length} more clues were easier.</p>}
    </div>
  );
}
