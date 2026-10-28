import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { Download, Flame, Globe, LayoutGrid, Play, Save, Sparkles, Square, Undo2 } from "lucide-react";
import { PageShell } from "../components/PageShell";
import { Button, Card, Eyebrow, Select } from "../components/ui";
import { StudioGrid } from "../components/Studio/StudioGrid";
import { TitleField } from "../components/Studio/TitleField";
import type { HiddenGridInputHandlers } from "../hooks/useHiddenGridInput";
import { CandidatePanel } from "../components/Studio/CandidatePanel";
import { CluePanel } from "../components/Studio/CluePanel";
import { PuzzleList } from "../components/Studio/PuzzleList";
import { DailyQueue } from "../components/Studio/DailyQueue";
import { Insights } from "../components/Studio/Insights";
import { Reports } from "../components/Studio/Reports";
import { StudioAccount } from "../components/Studio/StudioAccount";
import { EngineError } from "../components/Studio/EngineError";
import { WordListDownload } from "../components/Studio/WordListDownload";
import { StudioTabBar, studioPanelId, studioTabId, type StudioTab } from "../components/Studio/StudioTabBar";
import { useMediaQuery } from "../hooks/useMediaQuery";
import { useStudioAccount } from "../hooks/useStudioAccount";
import { useStudioToken } from "../hooks/useStudioToken";
import { useTransitionNavigate } from "../hooks/useTransitionNavigate";
import { EngineClient, STUDIO_WORD_LIST_URL, type LoadEvent } from "../lib/seedgrid/engineClient";
import type { WordListProgress } from "../lib/seedgrid/wordListStore";
import { cloneGrid, gridStats, slotsOf, slotText, type Grid, type Symmetry } from "../lib/seedgrid/grid";
import { normalizeEntry } from "../lib/seedgrid/dictionary";
import { toIpuz, toTransferPuzzle, type ClueSet } from "../lib/seedgrid/ipuz";
import { toPuz } from "../lib/seedgrid/puz";
import { communityEnabled } from "../lib/community";
import { fetchMyPuzzles, type CommunityPuzzle } from "../lib/communityPuzzles";
import { exportNatively, nativeExportAvailable } from "../lib/nativeExport";
import { studioAdminPanelsAllowed } from "../lib/studioGate";
import { PublishDialog } from "../components/Studio/PublishDialog";
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
/** Tailwind's `lg`: from here up the studio is the three-column desk; below it, one screen with tabs. */
const DESKTOP_QUERY = "(min-width: 64rem)";

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

type EngineStatus =
  /** The word list is on its way (downloading on the first open of a device, read from the cache after). */
  | { kind: "loading"; progress: WordListProgress | null }
  | { kind: "ready"; words: number }
  | { kind: "error"; message: string };

/**
 * Construction studio: build a grid the way Ingrid users do. Lay out theme
 * entries, place blacks, watch the heatmap, approve or reject candidates per
 * slot, and let ingrid_core (in a worker) fill the rest.
 *
 * Two arrangements of the same panels: from `lg` up the three-column desk
 * (setup · grid · candidates, clues beneath); below it one screen with a
 * bottom tab bar — Grid, Words, Clues, More — for phones, on the website and
 * in the apps. Every panel stays mounted in both, so a redraft in flight or
 * a half-typed clue survives a tab switch.
 */
export function StudioScreen() {
  const [state, dispatch] = useReducer(studioReducer, undefined, loadDraft);
  const client = useMemo(() => new EngineClient(), []);
  const account = useStudioAccount();
  const studioToken = useStudioToken();
  const navigate = useTransitionNavigate();
  const desktop = useMediaQuery(DESKTOP_QUERY);
  const [tab, setTab] = useState<StudioTab>("grid");
  // The daily queue, reports and insights are the constructor's: a Plus-only visitor never sees them, and the apps never show them.
  const adminPanels = (account.admin || !!studioToken || !account.plus) && studioAdminPanelsAllowed();
  const access = { admin: account.admin, plus: account.plus };
  const [engine, setEngine] = useState<EngineStatus>({ kind: "loading", progress: null });
  const [busy, setBusy] = useState<"fill" | "layout" | null>(null);
  // The account's published puzzles by studio id (PublishDialog, the chips in My puzzles).
  const [published, setPublished] = useState<Record<string, CommunityPuzzle>>({});
  const [publishOpen, setPublishOpen] = useState(false);
  const userId = account.user?.id ?? null;
  const refreshPublished = useCallback(() => {
    if (!userId || !communityEnabled()) return;
    fetchMyPuzzles(userId).then(
      (rows) => setPublished(Object.fromEntries(rows.map((r) => [r.studio_id, r]))),
      () => undefined,
    );
  }, [userId]);
  useEffect(() => {
    if (!userId) setPublished({});
    else refreshPublished();
  }, [userId, refreshPublished]);
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

  // Loads the word list (with progress while it downloads) and starts the engine; also the Retry.
  const startEngine = useCallback(() => {
    setEngine({ kind: "loading", progress: null });
    const onEvent = (e: LoadEvent) => {
      if (e.kind === "progress") setEngine((s) => (s.kind === "loading" ? { kind: "loading", progress: e.progress } : s));
      else if (e.kind === "list" && e.source === "network" && e.stored === false)
        setMessage("The word list couldn't be saved on this device, so it will download again next time.");
    };
    client
      .load(onEvent)
      .then((words) => setEngine({ kind: "ready", words }))
      .catch((err: Error) => {
        if (err.message !== "cancelled") setEngine({ kind: "error", message: err.message });
      });
  }, [client]);

  useEffect(() => {
    document.title = "Studio · Crossword Clash";
    startEngine();
    return () => client.dispose();
  }, [client, startEngine]);

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
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(state));
    } catch {
      // As above.
    }
    return next;
  };
  const openPuzzle = (next: StudioState) => {
    fileCurrent();
    setMessage(null);
    dispatch({ type: "LOAD", state: next });
    if (!desktop) setTab("grid");
  };
  const newPuzzle = () => {
    fileCurrent();
    setMessage(null);
    dispatch({ type: "NEW_GRID", size, id: newPuzzleId() });
    if (!desktop) setTab("grid");
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
              : "This grid can't be filled with these rules. Turn on the heatmap: red squares have no word through them at all.",
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
        if (!desktop) setTab("grid");
      } else if (res.attempts) setMessage(`None of ${res.attempts} layouts fills at a score floor of ${state.minScore}. Try a lower floor, a larger grid or no symmetry.`);
      else setMessage(`No legal ${gridSize}×${gridSize} layout holds these theme entries. Try a larger grid or no symmetry.`);
    } catch {
      setMessage("Layout stopped.");
    } finally {
      setBusy(null);
    }
  }, [client, seedsText, size, state.symmetry, state.minScore, state.rejected, state.grid, desktop]);

  // The grid's hidden input (useHiddenGridInput) maps keys and soft-keyboard
  // text onto these; Enter doubles as a direction toggle in the studio.
  const gridInput = useMemo<HiddenGridInputHandlers>(
    () => ({
      onLetter: (letter) => dispatch({ type: "TYPE", letter }),
      onErase: () => dispatch({ type: "ERASE" }),
      onMove: (dRow, dCol) => dispatch({ type: "MOVE", dRow, dCol }),
      onToggleDirection: () => dispatch({ type: "TOGGLE_DIR" }),
      onToggleBlock: () => dispatch({ type: "TOGGLE_BLOCK" }),
      onEnter: () => dispatch({ type: "TOGGLE_DIR" }),
    }),
    [],
  );

  const heat = useMemo(() => (showHeat && heatCounts ? cellHeat(base, heatCounts) : undefined), [showHeat, heatCounts, base]);
  const stats = gridStats(state.grid);
  const slots = slotsOf(state.grid);
  const complete = state.grid.cells.every((c) => c !== "");
  const missingClues = complete ? slots.filter((s) => !state.clues[slotKey(s)]?.trim()).length : 0;

  const exportFile = async (format: "ipuz" | "puz") => {
    const clues: Record<string, ClueSet> = {};
    for (const s of slots) {
      const standard = state.clues[slotKey(s)]?.trim();
      const speed = state.speedClues[slotKey(s)]?.trim();
      if (standard) clues[s.id] = { standard, ...(speed ? { speed } : {}) };
    }
    // The published credit when there is one, else the house name.
    const author = published[state.id]?.author ?? "Crossword Clash";
    const meta = { title: state.title || "Untitled", author };
    const bytes: Uint8Array =
      format === "ipuz"
        ? new TextEncoder().encode(JSON.stringify(toIpuz(state.grid, clues, meta), null, 2))
        : toPuz(state.grid, clues, { ...meta, notes: state.theme });
    const name = `${normalizeEntry(state.title || "puzzle").toLowerCase() || "puzzle"}.${format}`;
    if (nativeExportAvailable()) {
      // The webview has no downloads: the file goes to the OS share sheet (Files, AirDrop, another app).
      try {
        await exportNatively({ name, bytes, title: meta.title });
      } catch (err) {
        setMessage(`Couldn't share the file: ${err instanceof Error ? err.message : String(err)}`);
      }
      return;
    }
    const blob = new Blob([bytes as BlobPart], { type: format === "ipuz" ? "application/json" : "application/x-crossword" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
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
    const hash = compressPuzzleToHash(puzzle);
    if (Capacitor.isNativePlatform()) {
      // No window.open in the webview: hand the payload to the solver in this app. GameProvider
      // mounts with the index route and reads the hash the way a deep link is read.
      fileCurrent();
      navigate(`/${hash}`);
      return;
    }
    window.open(`${window.location.origin}/${hash}`, "_blank", "noopener");
  };

  const status =
    engine.kind === "ready" ? `${engine.words.toLocaleString()} words` : engine.kind === "loading" ? "Loading words…" : "No word list";

  // ---- The panels, laid out two ways below ----

  const engineNotice =
    engine.kind === "error" ? (
      <EngineError className={desktop ? "lg:col-span-3" : ""} listUrl={STUDIO_WORD_LIST_URL} message={engine.message} onRetry={startEngine} />
    ) : engine.kind === "loading" && engine.progress ? (
      <WordListDownload className={desktop ? "lg:col-span-3" : ""} progress={engine.progress} />
    ) : null;

  const playTestButton = (block = false) => (
    <Button variant={block ? "secondary" : "ghost"} block={block} onClick={playTest} disabled={!complete} title={Capacitor.isNativePlatform() ? "Open this puzzle in the solver" : "Open this puzzle in the solver, in a new tab"}>
      <Play className="size-4" aria-hidden="true" /> Play test
    </Button>
  );
  const publishButton = (block = false) =>
    communityEnabled() ? (
      <Button variant={block ? "secondary" : "ghost"} block={block} onClick={() => setPublishOpen(true)} disabled={!complete} title="Publish this puzzle for other players to find and play">
        <Globe className="size-4" aria-hidden="true" /> {published[state.id]?.status === "published" ? "Published" : "Publish"}
      </Button>
    ) : null;

  const gridPanel = (
    <section aria-label="Grid" className={desktop ? "order-1 lg:order-2" : ""}>
      <div className="mx-auto w-full max-w-[36rem]">
        <TitleField state={state} dispatch={dispatch} access={access} />
        <StudioGrid
          grid={state.grid}
          cursor={state.cursor}
          direction={state.dir}
          activeCells={slot?.cells ?? []}
          heat={heat}
          onSelect={(cell) => dispatch({ type: "SELECT", cell })}
          onToggleBlock={(cell) => dispatch({ type: "TOGGLE_BLOCK", cell })}
          onToggleDirection={() => dispatch({ type: "TOGGLE_DIR" })}
          input={gridInput}
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
          {desktop && playTestButton()}
          {desktop && publishButton()}
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
        {showHeat && (
          <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted" aria-label="Heatmap legend">
            <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-red-200" aria-hidden="true" /> no word fits through this square</span>
            <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-brand-100" aria-hidden="true" /> only a few</span>
            <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-surface-sunken ring-1 ring-line" aria-hidden="true" /> some</span>
            <span>· on the gold word the same shows as a corner dot</span>
          </p>
        )}
        <p className="mt-1 text-xs text-subtle">
          {desktop
            ? 'Type to write (your letters are bold and kept). Right-click a square, or press ".", to make it black or white again; space, Enter or a second tap switches between across and down.'
            : "Tap a square and type (your letters are bold and kept). Block makes the square black or white again; a second tap on a square switches between across and down. Words shows what fits the selected entry."}
        </p>
      </div>
    </section>
  );

  const wordsPanel = (
    <aside className={desktop ? "order-2 flex flex-col gap-4 lg:order-3" : "flex flex-col gap-4"} aria-label="Words">
      <Card className="flex max-h-[calc(100dvh-12rem)] flex-col p-4 lg:sticky lg:top-4 lg:max-h-[calc(100dvh-8rem)]">
        {slot && key ? (
          <CandidatePanel
            slotLabel={`${slot.number} ${slot.dir === "across" ? "Across" : "Down"}`}
            pattern={slotText(base, slot)}
            words={candidates?.key === key ? candidates.words : null}
            viability={viability}
            approved={state.approved[key] ?? []}
            rejected={state.rejected}
            onPlace={(word) => {
              dispatch({ type: "PLACE_WORD", word });
              // On a phone the word is written out of sight: show it.
              if (!desktop) setTab("grid");
            }}
            onApprove={(word) => dispatch({ type: "TOGGLE_APPROVE", key, word })}
            onReject={(word) => dispatch({ type: "TOGGLE_REJECT", word })}
            onClearApprovals={() => dispatch({ type: "CLEAR_APPROVALS", key })}
          />
        ) : (
          <p className="text-sm text-muted">{desktop ? "Select a square to see what fits there." : "Select a square on the Grid tab to see what fits there."}</p>
        )}
      </Card>
    </aside>
  );

  const cluesPanel = (
    <section aria-label="Clues" className={desktop ? "order-4 lg:col-span-3" : ""}>
      <CluePanel state={state} dispatch={dispatch} onExport={(format) => void exportFile(format)} showExport={desktop} access={access} userId={account.user?.id ?? null} />
    </section>
  );

  const setupPanel = (
    <aside className={desktop ? "order-3 flex flex-col gap-4 lg:order-1" : "flex flex-col gap-4"} aria-label="Setup">
      <PuzzleList
        entries={library}
        currentId={state.id}
        newSize={size}
        onOpen={(entry) => openPuzzle(entry.state)}
        onNew={newPuzzle}
        onDuplicate={(entry) => openPuzzle(duplicateState(entry.id === state.id ? state : entry.state, newPuzzleId()))}
        onDelete={deletePuzzle}
        published={new Set(Object.values(published).filter((r) => r.status === "published").map((r) => r.studio_id))}
      />
      {!desktop && (
        <Card className="p-4">
          <Eyebrow as="h2">Test, share, export</Eyebrow>
          <div className="mt-2 grid grid-cols-1 gap-2">
            {playTestButton(true)}
            {publishButton(true)}
            <Button variant="secondary" block onClick={() => void exportFile("ipuz")} disabled={!complete}>
              <Download className="size-4" aria-hidden="true" /> Export .ipuz
            </Button>
            <Button variant="secondary" block onClick={() => void exportFile("puz")} disabled={!complete} title="Across Lite format, for other crossword apps and editors">
              <Download className="size-4" aria-hidden="true" /> Export .puz
            </Button>
          </div>
          {!complete && <p className="mt-2 text-xs text-muted">Fill the grid first.</p>}
        </Card>
      )}
      {adminPanels && <DailyQueue state={state} admin={account.admin} />}
      {adminPanels && communityEnabled() && <Reports admin={account.admin} />}
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
          className="mt-1 h-11 w-full accent-brand-600"
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
                    className="min-h-9 rounded-full bg-surface-sunken px-2.5 py-1 font-mono text-xs text-ink-soft hover:bg-line active:bg-line-strong"
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
                  onClick={() => {
                    dispatch({ type: "RESTORE_VERSION", index: i });
                    if (!desktop) setTab("grid");
                  }}
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
  );

  const insightsPanel = adminPanels ? (
    <section aria-label="Puzzle insights" className={desktop ? "order-5 lg:col-span-3" : ""}>
      <Insights admin={account.admin} />
    </section>
  ) : null;

  const tabPanel = (id: StudioTab, children: React.ReactNode) => (
    <div role="tabpanel" id={studioPanelId(id)} aria-labelledby={studioTabId(id)} hidden={tab !== id} className="flex flex-col gap-4">
      {children}
    </div>
  );

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
      {desktop ? (
        <main className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[17rem_minmax(0,1fr)_20rem]">
          {engineNotice}
          {gridPanel}
          {setupPanel}
          {wordsPanel}
          {cluesPanel}
          {insightsPanel}
        </main>
      ) : (
        <>
          {/* The tab bar is fixed above the home indicator; the page keeps clear of it. */}
          <main className="mt-4 flex flex-col gap-4 pb-24">
            {engineNotice}
            {tabPanel("grid", gridPanel)}
            {tabPanel("words", wordsPanel)}
            {tabPanel("clues", cluesPanel)}
            {tabPanel(
              "more",
              <>
                {setupPanel}
                {insightsPanel}
              </>,
            )}
          </main>
          <StudioTabBar tab={tab} onChange={setTab} counts={{ clues: missingClues }} />
        </>
      )}
      {publishOpen && (
        <PublishDialog state={state} dispatch={dispatch} user={account.user} existing={published[state.id] ?? null} onClose={() => setPublishOpen(false)} onChanged={refreshPublished} />
      )}
    </PageShell>
  );
}
