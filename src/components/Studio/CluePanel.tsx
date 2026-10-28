import { useCallback, useEffect, useMemo, useState, type Dispatch } from "react";
import { useTranslation } from "react-i18next";
import { Download, KeyRound, Loader2, Sparkles, WandSparkles } from "lucide-react";
import { Button, Card, Eyebrow, Select } from "../ui";
import { CLUE_MAX } from "../../lib/seedgrid/audit";
import { slotsOf, slotText } from "../../lib/seedgrid/grid";
import { ALTERNATIVES_COUNT, type Difficulty } from "../../lib/seedgrid/cluePrompt";
import { slotKey, type StudioAction, type StudioState } from "../../lib/seedgrid/studioState";
import { draftClues, edgeCaller, entryAnswers, StudioClaudeError, suggestClues } from "../../lib/seedgrid/studioClaude";
import { setStudioToken, useStudioToken } from "../../hooks/useStudioToken";
import type { StudioAccess } from "../../lib/studioGate";
import { allowanceLeft, fetchStudioAllowance, type StudioAllowance } from "../../lib/studioUsage";

interface CluePanelProps {
  state: StudioState;
  dispatch: Dispatch<StudioAction>;
  onExport: (format: "ipuz" | "puz") => void;
  /** Who is drafting: an admin (no token needed, any model) or a Plus subscriber (metered). */
  access: StudioAccess;
  /** The signed-in user, for the subscriber's allowance read. */
  userId: string | null;
}

/** How many rows may be redrafting at once; the rest of the panel stays live either way. */
export const MAX_REDRAFTS_IN_FLIGHT = 3;

const INPUT =
  "min-w-0 flex-1 rounded-lg border border-line-strong bg-surface px-2 text-base text-ink placeholder:text-subtle focus-visible:outline-2 focus-visible:outline-brand-500 disabled:opacity-60";
const ICON_BUTTON =
  "inline-flex size-10 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-surface-sunken hover:text-brand-700 active:bg-line disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-brand-500";

const without = <T,>(rec: Record<string, T>, key: string): Record<string, T> => {
  const next = { ...rec };
  delete next[key];
  return next;
};

/**
 * Clue editor with AI drafting: "Draft" writes a clue for every entry still
 * missing one (then "Redraft AI clues" replaces the AI's own), and the wand on
 * a row redrafts that one entry — `ALTERNATIVES_COUNT` alternatives in one
 * call, offered as chips while the rest of the panel stays editable (up to
 * `MAX_REDRAFTS_IN_FLIGHT` rows at once). Anything typed or picked by hand is
 * the constructor's and is never overwritten. Calls go through the
 * studio-claude function as a signed-in admin, a Plus subscriber or with the
 * studio token (kept in this browser only). Speed clues are no longer edited
 * here: no player-facing screen shows them (see `StudioState.speedClues`).
 */
export function CluePanel({ state, dispatch, onExport, access, userId }: CluePanelProps) {
  const { t } = useTranslation();
  const { grid } = state;
  const slots = slotsOf(grid);
  const complete = grid.cells.every((c) => c !== "");
  const token = useStudioToken();
  const admin = access.admin || !!token;
  // A Plus subscriber (and not an admin) drafts on a monthly allowance; show what is left.
  const metered = access.plus && !admin && !!userId;
  const [allowance, setAllowance] = useState<StudioAllowance | null>(null);
  const refreshAllowance = useCallback(() => {
    if (metered && userId) void fetchStudioAllowance(userId).then(setAllowance);
  }, [metered, userId]);
  useEffect(refreshAllowance, [refreshAllowance]);
  const [tokenDraft, setTokenDraft] = useState("");
  const [needToken, setNeedToken] = useState(false);
  /** The whole-puzzle draft in progress, by its status line. */
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** Rows (slot keys) whose redraft is still out. */
  const [inFlight, setInFlight] = useState<Record<string, true>>({});
  /** Per row: the alternatives offered by the last redraft, until the row is typed in or redrafted again. */
  const [alternatives, setAlternatives] = useState<Record<string, string[]>>({});
  /** Per row: what the last redraft had to say when it offered nothing. */
  const [rowNotes, setRowNotes] = useState<Record<string, string>>({});
  const inFlightCount = Object.keys(inFlight).length;

  const context = useMemo(() => {
    const themeEntries = slots
      .filter((s) => s.cells.length >= 5 && s.cells.every((c) => grid.locked[c] && grid.cells[c] && grid.cells[c] !== "#"))
      .map((s) => slotText(grid, s));
    return [
      state.title && `Title: ${state.title}`,
      state.theme.trim() && `Theme: ${state.theme.trim()}`,
      themeEntries.length ? `Theme entries: ${themeEntries.join(", ")}` : "",
    ]
      .filter(Boolean)
      .join("\n");
  }, [grid, slots, state.title, state.theme]);

  const edited = new Set(state.editedClues ?? []);
  const missing = slots.filter((s) => !state.clues[slotKey(s)]?.trim());
  // Redrafting replaces the AI's own clues only; hand-written ones stay.
  const redraftable = slots.filter((s) => !edited.has(slotKey(s)));

  const allowed = () => {
    if (admin || access.plus) return true;
    setNeedToken(true);
    return false;
  };

  const explain = (err: unknown) => {
    if (err instanceof StudioClaudeError && err.kind === "token") setNeedToken(true);
    return err instanceof Error ? err.message : String(err);
  };

  const draft = () => {
    if (!allowed()) return;
    const targets = missing.length ? missing : redraftable;
    setBusy(`Drafting ${targets.length} clues…`);
    setError(null);
    void (async () => {
      try {
        const drafted = await draftClues(edgeCaller(token), grid, context, { slots: targets.map((s) => s.id), difficulty: state.difficulty });
        const byKey = Object.fromEntries(slots.filter((s) => drafted[s.id]).map((s) => [slotKey(s), drafted[s.id]]));
        dispatch({ type: "APPLY_CLUES", clues: byKey });
        const skipped = targets.length - Object.keys(byKey).length;
        if (skipped > 0) setError(`${skipped} clue${skipped === 1 ? "" : "s"} didn't pass the checks; write ${skipped === 1 ? "it" : "them"} or try the wand.`);
      } catch (err) {
        setError(explain(err));
      } finally {
        setBusy(null);
        refreshAllowance();
      }
    })();
  };

  /** Redraft one row: only that row is busy; its alternatives arrive as chips. */
  const redraft = (slotId: string, key: string) => {
    if (!allowed() || inFlight[key] || inFlightCount >= MAX_REDRAFTS_IN_FLIGHT) return;
    setInFlight((prev) => ({ ...prev, [key]: true }));
    setRowNotes((prev) => without(prev, key));
    const current = state.clues[key];
    void (async () => {
      try {
        const clues = await suggestClues(edgeCaller(token), grid, context, slotId, { difficulty: state.difficulty, current });
        setAlternatives((prev) => ({ ...prev, [key]: clues }));
        if (!clues.length) setRowNotes((prev) => ({ ...prev, [key]: "Nothing usable came back; try again." }));
      } catch (err) {
        setRowNotes((prev) => ({ ...prev, [key]: explain(err) }));
      } finally {
        setInFlight((prev) => without(prev, key));
        refreshAllowance();
      }
    })();
  };

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
          <Button
            variant="soft"
            size="sm"
            onClick={draft}
            disabled={!complete || busy !== null || (!missing.length && !redraftable.length)}
            title={missing.length ? "Ask the AI for a clue for every entry without one" : "Replace every AI-written clue; yours stay"}
          >
            <Sparkles className="size-4" aria-hidden="true" />
            {missing.length ? `Draft ${missing.length === slots.length ? "all" : missing.length}` : "Redraft AI clues"}
          </Button>
          <Button variant="secondary" size="sm" onClick={() => onExport("ipuz")} disabled={!complete}>
            <Download className="size-4" aria-hidden="true" /> Export .ipuz
          </Button>
          <Button variant="secondary" size="sm" onClick={() => onExport("puz")} disabled={!complete} title="Across Lite format, for other crossword apps and editors">
            <Download className="size-4" aria-hidden="true" /> Export .puz
          </Button>
        </div>
      </div>

      <div className="mt-3">
        <label className="text-sm font-semibold text-ink" htmlFor="studio-theme">Theme (optional)</label>
        <input
          id="studio-theme"
          className={`${INPUT} mt-1 h-10 w-full md:text-sm`}
          placeholder="Tell the AI the theme, if there is one — e.g. “Each long entry hides a planet”"
          aria-describedby="studio-theme-help"
          value={state.theme}
          onChange={(e) => dispatch({ type: "SET_THEME", theme: e.target.value })}
        />
        <p id="studio-theme-help" className="mt-1 text-xs text-muted">
          Only read when drafting, so theme entries can nod to it. Leave it blank for a themeless puzzle; the AI never invents one.
        </p>
      </div>

      {!complete && <p className="mt-2 text-sm text-muted">Fill the grid to draft clues.</p>}
      {metered && allowance && (
        <p className="mt-2 text-sm text-muted tabular-nums" title="Each AI call uses one draft, however many alternative clues it returns.">
          {t("studio.draftsLeft", { left: allowanceLeft(allowance), limit: allowance.limit })}
        </p>
      )}
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

      <div className="mt-3 grid grid-cols-1 gap-x-6 gap-y-3 md:grid-cols-2">
        {(["across", "down"] as const).map((dir) => (
          <ol key={dir} className="flex flex-col gap-3">
            <li className="text-sm font-semibold text-ink">{dir === "across" ? "Across" : "Down"}</li>
            {slots.filter((s) => s.dir === dir).map((s) => {
              const k = slotKey(s);
              const clue = state.clues[k] ?? "";
              const answer = slotText(grid, s);
              const rowBusy = !!inFlight[k];
              const alts = alternatives[k];
              const note = rowNotes[k];
              const label = `${s.number} ${dir}`;
              return (
                <li key={k} className="flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <span className="flex w-24 shrink-0 flex-col font-mono text-xs text-muted">
                      {s.number}. {answer}
                      {edited.has(k) && <span className="font-sans text-[11px] font-semibold text-brand-700">yours</span>}
                    </span>
                    <input
                      className={`${INPUT} h-10 md:text-sm`}
                      aria-label={`Clue for ${label}`}
                      value={clue}
                      disabled={rowBusy}
                      onChange={(e) => {
                        dispatch({ type: "SET_CLUE", key: k, clue: e.target.value });
                        // Typing by hand retires the offered alternatives.
                        if (alts) setAlternatives((prev) => without(prev, k));
                      }}
                    />
                    <span className={`w-6 text-right text-xs tabular-nums ${clue.length > CLUE_MAX ? "text-red-600" : "text-subtle"}`}>
                      {clue.length || ""}
                    </span>
                    <button
                      type="button"
                      className={ICON_BUTTON}
                      aria-label={`Redraft ${label} with AI`}
                      aria-busy={rowBusy || undefined}
                      title={`Redraft with AI: ${ALTERNATIVES_COUNT} alternatives to pick from`}
                      disabled={!entryAnswers(grid)[s.id] || rowBusy || busy !== null || inFlightCount >= MAX_REDRAFTS_IN_FLIGHT}
                      onClick={() => redraft(s.id, k)}
                    >
                      {rowBusy ? (
                        <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
                      ) : (
                        <WandSparkles className="size-4" aria-hidden="true" />
                      )}
                    </button>
                  </div>
                  {note && <p className="pl-26 text-xs text-muted">{note}</p>}
                  {alts && alts.length > 0 && (
                    <ul className="flex flex-wrap gap-1.5 pl-26" aria-label={`Alternatives for ${label}`}>
                      {alts.map((alt) => {
                        const chosen = alt === clue;
                        return (
                          <li key={alt}>
                            <button
                              type="button"
                              aria-pressed={chosen}
                              className={`min-h-9 rounded-full px-3 text-left text-sm hover:bg-brand-100 active:bg-brand-200 ${chosen ? "bg-brand-100 font-semibold text-brand-800" : "bg-brand-50 text-brand-700"}`}
                              onClick={() => dispatch({ type: "SET_CLUE", key: k, clue: alt })}
                            >
                              {alt}
                            </button>
                          </li>
                        );
                      })}
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
