import { useCallback, useEffect, useMemo, useReducer, useRef, useState, type KeyboardEvent } from "react";
import { Flame, LayoutGrid, Play, Save, Sparkles, Square, Undo2 } from "lucide-react";
import { PageShell } from "../components/PageShell";
import { Button, Card, Eyebrow, Select } from "../components/ui";
import { StudioGrid } from "../components/Studio/StudioGrid";
import { CandidatePanel } from "../components/Studio/CandidatePanel";
import { CluePanel } from "../components/Studio/CluePanel";
import { PuzzleList } from "../components/Studio/PuzzleList";
import { DailyQueue } from "../components/Studio/DailyQueue";
import { Insights } from "../components/Studio/Insights";
import { StudioAccount } from "../components/Studio/StudioAccount";
import { EngineError } from "../components/Studio/EngineError";
import { useStudioAccount } from "../hooks/useStudioAccount";
import { EngineClient, STUDIO_WORD_LIST_URL } from "../lib/seedgrid/engineClient";
import { cloneGrid, gridStats, slotsOf, slotText, type Grid, type Symmetry } from "../lib/seedgrid/grid";
import { normalizeEntry } from "../lib/seedgrid/dictionary";
import { toIpuz, toTransferPuzzle, type ClueSet } from "../lib/seedgrid/ipuz";
import { duplicateState, isBlank, loadLibrary, removeEntry, saveLibrary, toEntry, upsertEntry, type LibraryEntry } from "../lib/seedgrid/studioLibrary";
import { normalizeTransferPuzzle } from "../lib/puzzleNormalizer";
import { compressPuzzleToHash } from "../lib/puzzleUrl";
import type { Viability } from "../lib/seedgrid/ingrid";
import {
  activeSlot,
  cellHeat,
  duplicateEntries,
  initialStudioState,
  newPuzzleId,
  rulesFor,
  slotKey,
  studioReducer,
  type StudioState,
} from "../lib/seedgrid/studioState";

const DRAFT_KEY = "crossword-clash:studio";
const FILL_MS = 15000;
const CLASSIFY_TOP = 24;
const CLASSIFY_BATCH = 4;
const CLASSIFY_MS = 250;

function loadDraft(): StudioState {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (raw) {
      const draft = JSON.parse(raw) as StudioState;
      const cells = draft.grid?.width * draft.grid?.height;
      if (draft.grid?.cells?.length === cells && draft.grid.locked?.length === cells) return { ...initialStudioState(), ...draft };
    }
  } catch {
    // A missing or unreadable draft just means a fresh grid.
  }
  return initialStudioState(5);
}

/** The grid with only the curator's letters: what the engine reasons from. */
function committed(grid: Grid): Grid {
  const out = cloneGrid(grid);
  out.cells = out.cells.map((c, i) => (c === "#" || out.locked[i] ? c : ""));
  return out;
}


type EngineStatus = { kind: "loading" } | { kind: "ready"; words: number } | { kind: "error"; message: string };

/**
 * Construction studio: build a grid the way Ingrid users do. Lay out theme
 * entries, place blacks, watch the heatmap, approve or reject candidates per
 * slot, and let ingrid_core (in a worker) fill the rest. Dev-only for now.
 */
export function StudioScreen() {
  const [state, dispatch] = useReducer(studioReducer, undefined, loadDraft);
  const client = useMemo(() => new EngineClient(), []);
  const account = useStudioAccount();
  const [engine, setEngine] = useState<EngineStatus>({ kind: "loading" });
  const [busy, setBusy] = useState<"fill" | "layout" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [heatCounts, setHeatCounts] = useState<Record<string, number> | null>(null);
  const [candidates, setCandidates] = useState<{ key: string; words: { word: string; score: number }[] } | null>(null);
  const [viability, setViability] = useState<Record<string, Viability>>({});
  const [showHeat, setShowHeat] = useState(true);
  const [seedsText, setSeedsText] = useState("");
  const [size, setSize] = useState(state.grid.width);
  const fillSeed = useRef(1);
  const generation = useRef(0);
  // Bumped after Stop so the heatmap and candidates are recomputed by the fresh worker.
  const [engineEpoch, setEngineEpoch] = useState(0);
  // The latest grid, so a fill or layout that finishes after the user edited can be dropped.
  const latestGrid = useRef(state.grid);
  latestGrid.current = state.grid;

  // The size picker follows the grid (restored versions, laid-out skeletons).
  useEffect(() => setSize(state.grid.width), [state.grid.width]);

  useEffect(() => {
    document.title = "Studio · Crossword Clash";
    client
      .load()
      .then((words) => setEngine({ kind: "ready", words }))
      .catch((err: Error) => setEngine({ kind: "error", message: err.message }));
    return () => client.dispose();
  }, [client]);

  // The open puzzle is the draft; it is also filed under "My puzzles" once it has
  // anything in it. Debounced so typing doesn't rewrite the whole list per key.
  const [library, setLibrary] = useState<LibraryEntry[]>(loadLibrary);
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        localStorage.setItem(DRAFT_KEY, JSON.stringify(state));
      } catch {
        // Private mode or full storage: the draft just isn't kept.
      }
      if (isBlank(state)) return;
      setLibrary((list) => {
        const next = upsertEntry(list, toEntry(state, Date.now()));
        if (!saveLibrary(next)) setMessage("This browser's storage is full, so the puzzle list wasn't saved. Delete a few puzzles.");
        return next;
      });
    }, 400);
    return () => clearTimeout(timer);
  }, [state]);

  // File the open puzzle right away before switching, in case the debounce hasn't run.
  const fileCurrent = () => {
    if (isBlank(state)) return library;
    const next = upsertEntry(library, toEntry(state, Date.now()));
    setLibrary(next);
    saveLibrary(next);
    return next;
  };
  const openPuzzle = (next: StudioState) => {
    fileCurrent();
    setMessage(null);
    dispatch({ type: "LOAD", state: next });
  };
  const newPuzzle = () => {
    fileCurrent();
    setMessage(null);
    dispatch({ type: "NEW_GRID", size, id: newPuzzleId() });
  };
  const deletePuzzle = (entry: LibraryEntry) => {
    const next = removeEntry(library, entry.id);
    setLibrary(next);
    saveLibrary(next);
    if (entry.id === state.id) dispatch({ type: "NEW_GRID", size: state.grid.width, id: newPuzzleId() });
  };

  const slot = activeSlot(state);
  const key = slot ? slotKey(slot) : null;
  const rules = useMemo(() => rulesFor(state), [state]);
  const base = useMemo(() => committed(state.grid), [state.grid]);
  const rulesJson = JSON.stringify(rules);
  const dupes = useMemo(() => duplicateEntries(base), [base]);

  // Heatmap, candidates for the selected entry, then background proofs for the top candidates.
  useEffect(() => {
    if (engine.kind !== "ready") return;
    const gen = ++generation.current;
    const stale = () => gen !== generation.current;
    const timer = setTimeout(async () => {
      try {
        const heat = await client.options(base, rules);
        if (stale()) return;
        // The engine refuses duplicate entries outright; point at them instead of the whole grid.
        setHeatCounts(dupes.length ? Object.fromEntries(dupes.map((id) => [id, 0])) : heat.counts);
        if (!slot || !key) {
          setCandidates(null);
          return;
        }
        // List every option for this entry, not just the approved ones.
        const open = { ...rules, approved: { ...rules.approved } };
        delete open.approved![slot.id];
        const list = await client.options(base, open, slot.id, 150);
        if (stale()) return;
        setCandidates({ key, words: list.words ?? [] });
        setViability({});
        const top = (list.words ?? []).slice(0, CLASSIFY_TOP).map((w) => w.word);
        for (let i = 0; i < top.length; i += CLASSIFY_BATCH) {
          const verdicts = await client.classify(base, open, slot.id, top.slice(i, i + CLASSIFY_BATCH), CLASSIFY_MS);
          if (stale()) return;
          setViability((v) => ({ ...v, ...verdicts }));
        }
      } catch {
        // A restart (Stop) rejects whatever was queued; the next change re-runs this.
      }
    }, 120);
    return () => clearTimeout(timer);
    // rulesJson stands in for rules; slot is derived from key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine.kind, engineEpoch, client, base, rulesJson, key]);

  const runFill = useCallback(async () => {
    if (dupes.length) {
      setMessage(`Entries ${dupes.join(", ")} repeat a word. Change one before filling.`);
      return;
    }
    setBusy("fill");
    setMessage(null);
    const started = state.grid;
    try {
      const res = await client.fill(base, rules, FILL_MS, fillSeed.current++);
      if (latestGrid.current !== started) setMessage("The grid changed while filling, so that fill was dropped. Fill again.");
      else if (res.ok) dispatch({ type: "SET_GRID", grid: res.grid });
      else
        setMessage(
          res.reason === "timeout"
            ? `No fill in ${FILL_MS / 1000} s. Try fewer approvals, a lower score, or another black square.`
            : res.reason === "bad-request"
              ? "The engine can't read this grid (an entry may be longer than 21 squares)."
              : "This grid can't be filled with these rules. Red squares show where it's stuck.",
        );
    } catch {
      setMessage("Fill stopped.");
    } finally {
      setBusy(null);
    }
  }, [client, base, rules, dupes, state.grid]);

  const stop = useCallback(() => {
    setBusy(null);
    client
      .restart()
      .then(() => setEngineEpoch((n) => n + 1))
      .catch(() => undefined);
  }, [client]);

  const layOut = useCallback(async () => {
    const seeds = seedsText.split(/[,\n]/).map(normalizeEntry).filter((w) => w.length >= 3);
    const longest = Math.max(0, ...seeds.map((s) => s.length));
    const gridSize = Math.max(size, longest);
    if (gridSize > 15) {
      setMessage("Theme entries longer than 15 letters don't fit.");
      return;
    }
    setBusy("layout");
    setMessage(null);
    const started = state.grid;
    try {
      // Approvals belong to the current grid's slots, so a new layout only uses score and rejections.
      const res = await client.skeleton(gridSize, state.symmetry, seeds, { minScore: state.minScore, rejected: state.rejected });
      if (latestGrid.current !== started) setMessage("The grid changed during layout, so that layout was dropped.");
      else if (res.grid) {
        setSize(gridSize);
        dispatch({ type: "SET_GRID", grid: res.grid });
        if (res.minScore < state.minScore) {
          // The layout only fills below the chosen floor, so Fill would fail at it: move the floor with the layout.
          dispatch({ type: "SET_MIN_SCORE", minScore: res.minScore });
          setMessage(`This layout fills at a score floor of ${res.minScore}, not ${state.minScore}, so the floor is now ${res.minScore}. Raise it back for other theme entries.`);
        }
      } else if (res.attempts) setMessage(`None of ${res.attempts} layouts fills at a score floor of ${state.minScore}. Try a lower floor, a larger grid or no symmetry.`);
      else setMessage(`No legal ${gridSize}×${gridSize} layout holds these theme entries. Try a larger grid or no symmetry.`);
    } catch {
      setMessage("Layout stopped.");
    } finally {
      setBusy(null);
    }
  }, [client, seedsText, size, state.symmetry, state.minScore, state.rejected, state.grid]);

  const onKey = useCallback((e: KeyboardEvent<HTMLInputElement>) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const moves: Record<string, [number, number]> = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
    if (/^[a-z]$/i.test(e.key)) dispatch({ type: "TYPE", letter: e.key });
    else if (e.key === "Backspace" || e.key === "Delete") dispatch({ type: "ERASE" });
    else if (e.key === "." ) dispatch({ type: "TOGGLE_BLOCK" });
    else if (e.key === " " || e.key === "Enter") dispatch({ type: "TOGGLE_DIR" });
    else if (moves[e.key]) dispatch({ type: "MOVE", dRow: moves[e.key][0], dCol: moves[e.key][1] });
    else return;
    e.preventDefault();
  }, []);

  const onLetters = useCallback((text: string) => {
    for (const ch of text) {
      if (/[a-z]/i.test(ch)) dispatch({ type: "TYPE", letter: ch });
      else if (ch === ".") dispatch({ type: "TOGGLE_BLOCK" });
      else if (ch === " ") dispatch({ type: "TOGGLE_DIR" });
    }
  }, []);

  const onErase = useCallback(() => dispatch({ type: "ERASE" }), []);

  const heat = useMemo(() => (showHeat && heatCounts ? cellHeat(base, heatCounts) : undefined), [showHeat, heatCounts, base]);
  const stats = gridStats(state.grid);
  const slots = slotsOf(state.grid);
  const complete = state.grid.cells.every((c) => c !== "");

  const exportIpuz = () => {
    const clues: Record<string, ClueSet> = {};
    for (const s of slots) {
      const standard = state.clues[slotKey(s)]?.trim();
      const speed = state.speedClues[slotKey(s)]?.trim();
      if (standard) clues[s.id] = { standard, ...(speed ? { speed } : {}) };
    }
    const ipuz = toIpuz(state.grid, clues, { title: state.title || "Untitled", author: "Crossword Clash" });
    const url = URL.createObjectURL(new Blob([JSON.stringify(ipuz, null, 2)], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${normalizeEntry(state.title || "puzzle").toLowerCase() || "puzzle"}.ipuz`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const playTest = () => {
    const clues: Record<string, ClueSet> = {};
    for (const s of slots) {
      const standard = state.clues[slotKey(s)]?.trim();
      if (standard) clues[s.id] = { standard };
    }
    const puzzle = normalizeTransferPuzzle(toTransferPuzzle(state.grid, clues, { title: state.title, author: "Crossword Clash" }));
    window.open(`${window.location.origin}/${compressPuzzleToHash(puzzle)}`, "_blank", "noopener");
  };

  const status =
    engine.kind === "ready" ? `${engine.words.toLocaleString()} words` : engine.kind === "loading" ? "Loading words…" : "No word list";

  return (
    <PageShell
      width="7xl"
      background="canvas"
      bar={{
        backLabel: "Menu",
        backTo: "/menu",
        right: (
          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-muted tabular-nums sm:inline">{status}</span>
            <StudioAccount account={account} />
          </div>
        ),
      }}
    >
      <main className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[17rem_minmax(0,1fr)_20rem]">
        {engine.kind === "error" && <EngineError className="lg:col-span-3" listUrl={STUDIO_WORD_LIST_URL} message={engine.message} />}

        {/* Grid: first on phones */}
        <section aria-label="Grid" className="order-1 lg:order-2">
          <div className="mx-auto w-full max-w-[36rem]">
            <input
              className="mb-3 w-full rounded-xl border border-line-strong bg-surface px-3 py-2 font-display text-xl font-bold text-ink placeholder:text-subtle focus-visible:outline-2 focus-visible:outline-brand-500"
              placeholder="Untitled puzzle"
              aria-label="Title"
              value={state.title}
              onChange={(e) => dispatch({ type: "SET_TITLE", title: e.target.value })}
            />
            <StudioGrid
              grid={state.grid}
              cursor={state.cursor}
              activeCells={slot?.cells ?? []}
              heat={heat}
              onSelect={(cell) => dispatch({ type: "SELECT", cell })}
              onKey={onKey}
              onLetters={onLetters}
              onErase={onErase}
            />
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {busy ? (
                <Button variant="secondary" onClick={stop}>
                  <Square className="size-4" aria-hidden="true" /> Stop
                </Button>
              ) : (
                <Button onClick={runFill} disabled={engine.kind !== "ready" || busy !== null}>
                  <Sparkles className="size-4" aria-hidden="true" /> {complete ? "New fill" : "Fill"}
                </Button>
              )}
              <Button variant="secondary" onClick={() => dispatch({ type: "CLEAR_FILL" })} disabled={busy !== null}>
                <Undo2 className="size-4" aria-hidden="true" /> Clear fill
              </Button>
              <Button variant="ghost" onClick={() => dispatch({ type: "TOGGLE_BLOCK" })} aria-label="Toggle black square">
                <LayoutGrid className="size-4" aria-hidden="true" /> Block
              </Button>
              <Button variant="ghost" onClick={playTest} disabled={!complete} title="Open this puzzle in the solver, in a new tab">
                <Play className="size-4" aria-hidden="true" /> Play test
              </Button>
              <Button variant="ghost" aria-pressed={showHeat} onClick={() => setShowHeat((v) => !v)} className={showHeat ? "bg-surface-sunken text-ink" : ""}>
                <Flame className="size-4" aria-hidden="true" /> Heatmap
              </Button>
            </div>
            {message && <p role="status" className="mt-3 rounded-xl bg-gold-50 px-3 py-2 text-sm text-ink-soft">{message}</p>}
            <p className="mt-3 text-sm text-muted">
              {stats.words} words · {stats.blocks} blocks ({Math.round(stats.blockPct * 100)}%) · average {stats.avgLength.toFixed(1)}
              {stats.shortRuns > 0 && <span className="text-red-600"> · {stats.shortRuns} two-letter runs</span>}
              {!stats.connected && <span className="text-red-600"> · grid is split</span>}
            </p>
            <p className="mt-1 text-xs text-subtle">
              Type to write (your letters are bold and kept); "." toggles a black square; space or a second tap switches direction.
            </p>
          </div>
        </section>

        {/* Setup */}
        <aside className="order-3 flex flex-col gap-4 lg:order-1">
          <PuzzleList
            entries={library}
            currentId={state.id}
            newSize={size}
            onOpen={(entry) => openPuzzle(entry.state)}
            onNew={newPuzzle}
            onDuplicate={(entry) => openPuzzle(duplicateState(entry.id === state.id ? state : entry.state, newPuzzleId()))}
            onDelete={deletePuzzle}
          />
          <DailyQueue state={state} admin={account.admin} />
          <Card className="p-4">
            <Eyebrow as="h2">Theme entries</Eyebrow>
            <textarea
              className="mt-2 w-full rounded-xl border border-line-strong bg-surface px-3 py-2 text-base md:text-sm text-ink placeholder:text-subtle focus-visible:outline-2 focus-visible:outline-brand-500"
              rows={3}
              placeholder="starfish, devil ray"
              value={seedsText}
              onChange={(e) => setSeedsText(e.target.value)}
            />
            <div className="mt-2 flex items-center gap-2">
              <label className="sr-only" htmlFor="studio-size">Size</label>
              <Select
                id="studio-size"
                value={String(size)}
                options={Array.from({ length: 11 }, (_, i) => ({ value: String(i + 5), label: `${i + 5}×${i + 5}` }))}
                onChange={(n) => setSize(Number(n))}
              />
              <Button variant="secondary" className="flex-1" onClick={layOut} disabled={engine.kind !== "ready" || busy !== null}>
                {busy === "layout" ? "Laying out…" : "Lay out"}
              </Button>
            </div>
          </Card>

          <Card className="p-4">
            <Eyebrow as="h2">Rules</Eyebrow>
            <label className="mt-3 block text-sm font-medium text-ink-soft" htmlFor="studio-symmetry">Symmetry</label>
            <Select
              id="studio-symmetry"
              block
              className="mt-1"
              value={state.symmetry}
              options={[
                { value: "rotational", label: "Rotational" },
                { value: "mirror", label: "Mirror (left–right)" },
                { value: "diagonal", label: "Diagonal" },
                { value: "none", label: "None" },
              ]}
              onChange={(symmetry: Symmetry) => dispatch({ type: "SET_SYMMETRY", symmetry })}
            />
            <label className="mt-3 flex items-baseline justify-between text-sm font-medium text-ink-soft" htmlFor="studio-score">
              Minimum word score <span className="tabular-nums text-ink">{state.minScore}</span>
            </label>
            <input
              id="studio-score"
              type="range"
              min={30}
              max={60}
              className="mt-1 w-full accent-brand-600"
              value={state.minScore}
              onChange={(e) => dispatch({ type: "SET_MIN_SCORE", minScore: Number(e.target.value) })}
            />
            <p className="text-xs text-subtle">50 is everyday words; lower lets in rarer ones when a corner won't fill.</p>
            {state.rejected.length > 0 && (
              <>
                <p className="mt-3 text-sm font-medium text-ink-soft">Rejected everywhere</p>
                <ul className="mt-1 flex flex-wrap gap-1.5">
                  {state.rejected.map((w) => (
                    <li key={w}>
                      <button
                        type="button"
                        className="rounded-full bg-surface-sunken px-2.5 py-1 font-mono text-xs text-ink-soft hover:bg-line active:bg-line-strong"
                        onClick={() => dispatch({ type: "TOGGLE_REJECT", word: w })}
                        aria-label={`Allow ${w} again`}
                      >
                        {w} ×
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </Card>

          <Card className="p-4">
            <div className="flex items-center justify-between">
              <Eyebrow as="h2">Versions</Eyebrow>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => dispatch({ type: "SAVE_VERSION", name: `Version ${state.versions.length + 1}`, at: Date.now() })}
              >
                <Save className="size-4" aria-hidden="true" /> Save
              </Button>
            </div>
            {state.versions.length === 0 ? (
              <p className="mt-2 text-sm text-muted">Save a skeleton before filling to come back to it.</p>
            ) : (
              <ul className="mt-2 flex flex-col">
                {state.versions.map((v, i) => (
                  <li key={v.at}>
                    <button
                      type="button"
                      className="flex min-h-11 w-full items-center justify-between rounded-lg px-2 text-left text-sm text-ink hover:bg-surface-sunken active:bg-line"
                      onClick={() => dispatch({ type: "RESTORE_VERSION", index: i })}
                    >
                      {v.name}
                      <span className="text-xs text-subtle">{v.grid.width}×{v.grid.height} · {new Date(v.at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </aside>

        {/* Candidates */}
        <aside className="order-2 flex flex-col gap-4 lg:order-3">
          <Card className="flex max-h-[32rem] flex-col p-4 lg:max-h-[calc(100dvh-8rem)] lg:sticky lg:top-4">
            {slot && key ? (
              <CandidatePanel
                slotLabel={`${slot.number} ${slot.dir === "across" ? "Across" : "Down"}`}
                pattern={slotText(base, slot)}
                words={candidates?.key === key ? candidates.words : null}
                viability={viability}
                approved={state.approved[key] ?? []}
                rejected={state.rejected}
                onPlace={(word) => dispatch({ type: "PLACE_WORD", word })}
                onApprove={(word) => dispatch({ type: "TOGGLE_APPROVE", key, word })}
                onReject={(word) => dispatch({ type: "TOGGLE_REJECT", word })}
                onClearApprovals={() => dispatch({ type: "CLEAR_APPROVALS", key })}
              />
            ) : (
              <p className="text-sm text-muted">Select a square to see what fits there.</p>
            )}
          </Card>
        </aside>

        {/* Clues + export */}
        <section aria-label="Clues" className="order-4 lg:col-span-3">
          <CluePanel state={state} dispatch={dispatch} onExport={exportIpuz} admin={account.admin} />
        </section>

        {/* How the published puzzles are doing */}
        <section aria-label="Puzzle insights" className="order-5 lg:col-span-3">
          <Insights admin={account.admin} />
        </section>
      </main>
    </PageShell>
  );
}
