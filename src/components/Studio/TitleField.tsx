import { useState, type Dispatch } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { TITLE_MAX, TITLES_COUNT } from "../../lib/seedgrid/cluePrompt";
import { slotsOf } from "../../lib/seedgrid/grid";
import { slotKey, type StudioAction, type StudioState } from "../../lib/seedgrid/studioState";
import { edgeCaller, puzzleContext, suggestTitles } from "../../lib/seedgrid/studioClaude";
import { useStudioToken } from "../../hooks/useStudioToken";
import type { StudioAccess } from "../../lib/studioGate";

interface TitleFieldProps {
  state: StudioState;
  dispatch: Dispatch<StudioAction>;
  /** Who may ask the AI: an admin (or the token) or a Plus subscriber, as in `CluePanel`. */
  access: StudioAccess;
}

/**
 * The puzzle's title with an AI "Suggest titles" action beside it: one call
 * (one allowance unit) for `TITLES_COUNT` options, vetted so none is an entry
 * of the grid or longer than `TITLE_MAX`, offered as chips. A tap fills the
 * title and keeps the other chips; typing a title by hand retires them.
 */
export function TitleField({ state, dispatch, access }: TitleFieldProps) {
  const { grid } = state;
  const token = useStudioToken();
  const allowed = access.admin || !!token || access.plus;
  const complete = grid.cells.every((c) => c !== "");
  const [busy, setBusy] = useState(false);
  const [titles, setTitles] = useState<string[] | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const suggest = () => {
    if (!allowed) {
      setNote("Sign in as a studio admin, or enter the studio token in the Clues panel, to ask the AI.");
      return;
    }
    setBusy(true);
    setNote(null);
    const clues = Object.fromEntries(slotsOf(grid).map((s) => [s.id, state.clues[slotKey(s)]]));
    const current = state.title;
    void (async () => {
      try {
        const found = await suggestTitles(edgeCaller(token), grid, puzzleContext(grid, state.title, state.theme), clues, { current });
        setTitles(found);
        if (!found.length) setNote("Nothing usable came back; try again.");
      } catch (err) {
        setNote(err instanceof Error ? err.message : String(err));
      } finally {
        setBusy(false);
      }
    })();
  };

  return (
    <div className="mb-3">
      <div className="flex items-center gap-2">
        <input
          className="min-w-0 flex-1 rounded-xl border border-line-strong bg-surface px-3 py-2 font-display text-xl font-bold text-ink placeholder:text-subtle focus-visible:outline-2 focus-visible:outline-brand-500"
          placeholder="Untitled puzzle"
          aria-label="Title"
          maxLength={TITLE_MAX * 2}
          value={state.title}
          onChange={(e) => {
            dispatch({ type: "SET_TITLE", title: e.target.value });
            // A title typed by hand retires the offered ones.
            if (titles) setTitles(null);
          }}
        />
        <button
          type="button"
          className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-xl px-3 text-sm font-semibold text-brand-700 hover:bg-brand-50 active:bg-brand-100 disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-brand-500"
          aria-busy={busy || undefined}
          disabled={!complete || busy}
          title={complete ? `Suggest titles with AI: ${TITLES_COUNT} options to pick from (one draft)` : "Fill the grid first"}
          onClick={suggest}
        >
          {busy ? <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <Sparkles className="size-4" aria-hidden="true" />}
          Suggest titles
        </button>
      </div>
      {note && <p className="mt-1 text-xs text-muted">{note}</p>}
      {titles && titles.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="Title suggestions">
          {titles.map((title) => {
            const chosen = title === state.title;
            return (
              <li key={title}>
                <button
                  type="button"
                  aria-pressed={chosen}
                  className={`min-h-9 rounded-full px-3 text-left text-sm hover:bg-brand-100 active:bg-brand-200 ${chosen ? "bg-brand-100 font-semibold text-brand-800" : "bg-brand-50 text-brand-700"}`}
                  onClick={() => dispatch({ type: "SET_TITLE", title })}
                >
                  {title}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
