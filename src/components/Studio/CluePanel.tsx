import { useMemo, useState, type Dispatch } from "react";
import { Download, KeyRound, Sparkles, WandSparkles } from "lucide-react";
import { Button, Card, Eyebrow, Select } from "../ui";
import { CLUE_MAX } from "../../lib/seedgrid/audit";
import { slotsOf, slotText } from "../../lib/seedgrid/grid";
import type { Difficulty } from "../../lib/seedgrid/cluePrompt";
import { slotKey, type StudioAction, type StudioState } from "../../lib/seedgrid/studioState";
import { draftClues, edgeCaller, entryAnswers, StudioClaudeError, suggestClues } from "../../lib/seedgrid/studioClaude";
import { setStudioToken, useStudioToken } from "../../hooks/useStudioToken";

interface CluePanelProps {
  state: StudioState;
  dispatch: Dispatch<StudioAction>;
  onExport: () => void;
  /** A signed-in studio admin needs no token. */
  admin: boolean;
}

const INPUT =
  "min-w-0 flex-1 rounded-lg border border-line-strong bg-surface px-2 text-base text-ink placeholder:text-subtle focus-visible:outline-2 focus-visible:outline-brand-500";
const ICON_BUTTON =
  "inline-flex size-10 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-surface-sunken hover:text-brand-700 active:bg-line disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-brand-500";

/**
 * Clue editor with Claude drafting: "Draft" writes standard + speed clues for
 * every entry still missing one (then "Redraft" replaces Claude's own), and the
 * wand on a row asks for alternatives to pick from. Anything typed or picked by
 * hand is the constructor's and is never overwritten. Calls go through the
 * studio-claude function as a signed-in admin or with the studio token (kept
 * in this browser only).
 */
export function CluePanel({ state, dispatch, onExport, admin }: CluePanelProps) {
  const { grid } = state;
  const slots = slotsOf(grid);
  const complete = grid.cells.every((c) => c !== "");
  const token = useStudioToken();
  const [tokenDraft, setTokenDraft] = useState("");
  const [needToken, setNeedToken] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [alternatives, setAlternatives] = useState<{ key: string; clues: string[] } | null>(null);

  const context = useMemo(() => {
    const themeEntries = slots
      .filter((s) => s.cells.length >= 5 && s.cells.every((c) => grid.locked[c] && grid.cells[c] && grid.cells[c] !== "#"))
      .map((s) => slotText(grid, s));
    return [
      state.title && `Title: ${state.title}`,
      state.theme && `Theme: ${state.theme}`,
      themeEntries.length ? `Theme entries: ${themeEntries.join(", ")}` : "",
    ]
      .filter(Boolean)
      .join("\n");
  }, [grid, slots, state.title, state.theme]);

  const edited = new Set(state.editedClues ?? []);
  const missing = slots.filter((s) => !state.clues[slotKey(s)]?.trim());
  // Redrafting replaces Claude's own clues only; hand-written ones stay.
  const redraftable = slots.filter((s) => !edited.has(slotKey(s)));

  const run = async (label: string, work: (call: ReturnType<typeof edgeCaller>) => Promise<void>) => {
    if (!token && !admin) {
      setNeedToken(true);
      return;
    }
    setBusy(label);
    setError(null);
    try {
      await work(edgeCaller(token));
    } catch (err) {
      if (err instanceof StudioClaudeError && err.kind === "token") setNeedToken(true);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  const draft = () => {
    const targets = missing.length ? missing : redraftable;
    void run(`Drafting ${targets.length} clues…`, async (call) => {
      const drafted = await draftClues(call, grid, context, { slots: targets.map((s) => s.id), difficulty: state.difficulty });
      const byKey = Object.fromEntries(slots.filter((s) => drafted[s.id]).map((s) => [slotKey(s), drafted[s.id]]));
      dispatch({ type: "APPLY_CLUES", clues: byKey });
      const skipped = targets.length - Object.keys(byKey).length;
      if (skipped > 0) setError(`${skipped} clue${skipped === 1 ? "" : "s"} didn't pass the checks; write ${skipped === 1 ? "it" : "them"} or try the wand.`);
    });
  };

  const suggest = (slotId: string, key: string) =>
    void run("Thinking…", async (call) => {
      const clues = await suggestClues(call, grid, context, slotId, { difficulty: state.difficulty, current: state.clues[key] });
      setAlternatives({ key, clues });
    });

  const saveToken = () => {
    setStudioToken(tokenDraft);
    setTokenDraft("");
    setNeedToken(false);
    setError(null);
  };

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Eyebrow as="h2">Clues</Eyebrow>
        <div className="flex flex-wrap items-center gap-2">
          <label className="sr-only" htmlFor="studio-difficulty">Difficulty</label>
          <Select
            id="studio-difficulty"
            size="sm"
            value={state.difficulty}
            options={[
              { value: "easy", label: "Easy clues" },
              { value: "medium", label: "Medium clues" },
              { value: "hard", label: "Hard clues" },
            ]}
            onChange={(difficulty: Difficulty) => dispatch({ type: "SET_DIFFICULTY", difficulty })}
          />
          <Button variant="soft" size="sm" onClick={draft} disabled={!complete || busy !== null || (!missing.length && !redraftable.length)}>
            <Sparkles className="size-4" aria-hidden="true" />
            {missing.length ? `Draft ${missing.length === slots.length ? "all" : missing.length}` : "Redraft Claude's clues"}
          </Button>
          <Button variant="secondary" size="sm" onClick={onExport} disabled={!complete}>
            <Download className="size-4" aria-hidden="true" /> Export .ipuz
          </Button>
        </div>
      </div>

      <input
        className={`${INPUT} mt-3 h-10 w-full md:text-sm`}
        placeholder="Theme note for Claude (optional): what ties the long entries together?"
        aria-label="Theme note"
        value={state.theme}
        onChange={(e) => dispatch({ type: "SET_THEME", theme: e.target.value })}
      />

      {!complete && <p className="mt-2 text-sm text-muted">Fill the grid to draft clues.</p>}
      {busy && <p role="status" className="mt-2 text-sm text-ink-soft">{busy}</p>}
      {error && <p role="alert" className="mt-2 rounded-xl bg-gold-50 px-3 py-2 text-sm text-ink-soft">{error}</p>}
      {needToken && (
        <form
          className="mt-3 flex flex-wrap items-center gap-2 rounded-xl bg-surface-sunken p-3"
          onSubmit={(e) => {
            e.preventDefault();
            saveToken();
          }}
        >
          <KeyRound className="size-4 text-muted" aria-hidden="true" />
          <label className="text-sm text-ink-soft" htmlFor="studio-token">Sign in as a studio admin, or enter the studio token</label>
          <input
            id="studio-token"
            type="password"
            autoComplete="off"
            className={`${INPUT} h-10 md:text-sm`}
            value={tokenDraft}
            onChange={(e) => setTokenDraft(e.target.value)}
          />
          <Button size="sm" type="submit" disabled={!tokenDraft.trim()}>Save</Button>
        </form>
      )}

      <div className="mt-3 grid gap-x-6 gap-y-3 md:grid-cols-2">
        {(["across", "down"] as const).map((dir) => (
          <ol key={dir} className="flex flex-col gap-3">
            <li className="text-sm font-semibold text-ink">{dir === "across" ? "Across" : "Down"}</li>
            {slots.filter((s) => s.dir === dir).map((s) => {
              const k = slotKey(s);
              const clue = state.clues[k] ?? "";
              const answer = slotText(grid, s);
              const alts = alternatives?.key === k ? alternatives.clues : null;
              return (
                <li key={k} className="flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <span className="flex w-24 shrink-0 flex-col font-mono text-xs text-muted">
                      {s.number}. {answer}
                      {edited.has(k) && <span className="font-sans text-[11px] font-semibold text-brand-700">yours</span>}
                    </span>
                    <input
                      className={`${INPUT} h-10 md:text-sm`}
                      aria-label={`Clue for ${s.number} ${dir}`}
                      value={clue}
                      onChange={(e) => dispatch({ type: "SET_CLUE", key: k, clue: e.target.value })}
                    />
                    <span className={`w-6 text-right text-xs tabular-nums ${clue.length > CLUE_MAX ? "text-red-600" : "text-subtle"}`}>
                      {clue.length || ""}
                    </span>
                    <button
                      type="button"
                      className={ICON_BUTTON}
                      aria-label={`Suggest clues for ${s.number} ${dir}`}
                      title="Suggest clues"
                      disabled={!entryAnswers(grid)[s.id] || busy !== null}
                      onClick={() => suggest(s.id, k)}
                    >
                      <WandSparkles className="size-4" aria-hidden="true" />
                    </button>
                  </div>
                  <div className="flex items-center gap-2 pl-26">
                    <input
                      className={`${INPUT} h-9 text-muted md:text-xs`}
                      placeholder="Speed clue (race hint)"
                      aria-label={`Speed clue for ${s.number} ${dir}`}
                      value={state.speedClues[k] ?? ""}
                      onChange={(e) => dispatch({ type: "SET_SPEED_CLUE", key: k, clue: e.target.value })}
                    />
                  </div>
                  {alts && (
                    <ul className="flex flex-wrap gap-1.5 pl-26" aria-label={`Suggestions for ${s.number} ${dir}`}>
                      {alts.length === 0 && <li className="text-xs text-muted">No usable suggestions; try again.</li>}
                      {alts.map((alt) => (
                        <li key={alt}>
                          <button
                            type="button"
                            className="min-h-9 rounded-full bg-brand-50 px-3 text-left text-sm text-brand-700 hover:bg-brand-100 active:bg-brand-200"
                            onClick={() => {
                              dispatch({ type: "SET_CLUE", key: k, clue: alt });
                              setAlternatives(null);
                            }}
                          >
                            {alt}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ol>
        ))}
      </div>
    </Card>
  );
}
