import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { CircleHelp, Download, Flame, Globe, LayoutGrid, Play, Save, Sparkles, Square, Undo2 } from "lucide-react";
import { PageShell } from "../components/PageShell";
import { Button, Card, Eyebrow, Select } from "../components/ui";
import { StudioGrid } from "../components/Studio/StudioGrid";
import { TitleField } from "../components/Studio/TitleField";
import type { HiddenGridInputHandlers } from "../hooks/useHiddenGridInput";
import { CandidatePanel } from "../components/Studio/CandidatePanel";
import { CluePanel, type CluePanelHandle } from "../components/Studio/CluePanel";
import { PuzzleList } from "../components/Studio/PuzzleList";
import { DailyQueue } from "../components/Studio/DailyQueue";
import { Insights } from "../components/Studio/Insights";
import { Reports } from "../components/Studio/Reports";
import { StudioAccount } from "../components/Studio/StudioAccount";
import { EngineError } from "../components/Studio/EngineError";
import { WordListDownload } from "../components/Studio/WordListDownload";
import { StudioPopover } from "../components/Studio/StudioPopover";
import { StudioSection } from "../components/Studio/StudioSection";
import { CandidateStrip } from "../components/Studio/CandidateStrip";
import { ActiveClueBar } from "../components/Studio/ActiveClueBar";
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
import { fetchMyPuzzles, puzzlePath, type CommunityPuzzle } from "../lib/communityPuzzles";
import { exportNatively, nativeExportAvailable } from "../lib/nativeExport";
import { studioAdminPanelsAllowed } from "../lib/studioGate";
import { PublishDialog } from "../components/Studio/PublishDialog";
import { duplicateState, isBlank, loadLibrary, removeEntry, saveLibrary, toEntry, upsertEntry, type LibraryEntry } from "../lib/seedgrid/studioLibrary";
import { normalizeTransferPuzzle } from "../lib/puzzleNormalizer";
import { compressPuzzleToHash } from "../lib/puzzleUrl";
import type { Viability } from "../lib/seedgrid/ingrid";
import { diagnoseFill, PROBE_MS } from "../lib/seedgrid/fillDiagnosis";
import {
  activeSlot,
  cellHeat,
  duplicateEntries,
  initialStudioState,
  layoutSymmetry,
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
/** A secondary tool's label: hidden on a narrow phone and in a narrow desk centre, where the icon and its title stand alone. */
const TOOL_LABEL = "max-sm:sr-only @max-[28rem]:sr-only";

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
  // The desk's right column: the word list or the clues.
  const [sideTab, setSideTab] = useState<"words" | "clues">("words");
  const cluePanelRef = useRef<CluePanelHandle>(null);
  // The daily queue, reports and insights are the constructor's: a Plus-only visitor never sees them, and the apps never show them.
  const adminPanels = (account.admin || !!studioToken || !account.plus) && studioAdminPanelsAllowed();
  const access = { admin: account.admin, plus: account.plus };
  const [engine, setEngine] = useState<EngineStatus>({ kind: "loading", progress: null });
  const [busy, setBusy] = useState<"fill" | "layout" | "diagnose" | null>(null);
  // Cells the last failed fill blamed (fillDiagnosis.ts); cleared by the next change to the grid or rules.
  const [stuck, setStuck] = useState<number[]>([]);
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
  useEffect(() => setStuck([]), [base, rulesJson]);

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
    let diagnosing = false;
    try {
      const res = await client.fill(base, rules, FILL_MS, fillSeed.current++);
      if (latestGrid.current !== started) setMessage("The grid changed while filling, so that fill was dropped. Fill again.");
      else if (res.ok) dispatch({ type: "SET_GRID", grid: res.grid });
      else if (res.reason === "timeout") setMessage(`No fill in ${FILL_MS / 1000} s. Try fewer approvals, a lower score, or another black square.`);
      else if (res.reason === "bad-request") setMessage("The engine can't read this grid (an entry may be longer than 21 squares).");
      else {
        // The engine only says "unfillable": find the entry or rule in the way
        // (fillDiagnosis.ts) and paint it. Stop restarts the worker, which rejects
        // the probes and lands in the catch below.
        setBusy("diagnose");
        diagnosing = true;
        setMessage("This grid can't be filled with these rules. Looking for what's in the way…");
        const verdict = await diagnoseFill(base, rules, {
          options: (g, r) => client.options(g, r),
          fill: (g, r) => client.fill(g, r, PROBE_MS, fillSeed.current++),
        });
        if (latestGrid.current !== started) return;
        setStuck(verdict.cells);
        setMessage(verdict.message);
      }
    } catch {
      setMessage(diagnosing ? "This grid can't be filled with these rules." : "Fill stopped.");
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
      // Theme entries pair up in mirrored rows, which takes a symmetry: with none chosen, lay out rotationally.
      const res = await client.skeleton(gridSize, layoutSymmetry(state.symmetry), seeds, { minScore: state.minScore, rejected: state.rejected });
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
  const fewest = useMemo(() => {
    const known = (heat ?? []).filter((n): n is number => n !== undefined);
    return known.length ? Math.min(...known) : null;
  }, [heat]);
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
      <EngineError listUrl={STUDIO_WORD_LIST_URL} message={engine.message} onRetry={startEngine} />
    ) : engine.kind === "loading" && engine.progress ? (
      <WordListDownload progress={engine.progress} />
    ) : null;

  const playTestButton = (block = false) => (
    <Button variant={block ? "secondary" : "ghost"} size={block ? "md" : "sm"} block={block} onClick={playTest} disabled={!complete} title={Capacitor.isNativePlatform() ? "Open this puzzle in the solver" : "Open this puzzle in the solver, in a new tab"}>
      <Play className="size-4" aria-hidden="true" /> <span className={block ? "" : TOOL_LABEL}>Play test</span>
    </Button>
  );
  const publishButton = (block = false) =>
    communityEnabled() ? (
      <Button variant={block ? "secondary" : "ghost"} size={block ? "md" : "sm"} block={block} onClick={() => setPublishOpen(true)} disabled={!complete} title="Publish this puzzle for other players to find and play">
        <Globe className="size-4" aria-hidden="true" /> <span className={block ? "" : TOOL_LABEL}>{published[state.id]?.status === "published" ? "Published" : "Publish"}</span>
      </Button>
    ) : null;

  const slotLabel = slot ? `${slot.number} ${slot.dir === "across" ? "Across" : "Down"}` : "";
  const slotWords = candidates?.key === key ? candidates.words : null;
  const placeWord = (word: string) => dispatch({ type: "PLACE_WORD", word });
  const toolSize = desktop ? "sm" : "md";

  // Fill first (the one primary action), then the grid tools; the help and legends wait behind "?".
  const toolbar = (
    <div className="flex flex-wrap items-center gap-1.5">
      {busy ? (
        <Button variant="secondary" size={toolSize} onClick={stop}>
          <Square className="size-4" aria-hidden="true" /> Stop
        </Button>
      ) : (
        <Button size={toolSize} onClick={runFill} disabled={engine.kind !== "ready" || busy !== null}>
          <Sparkles className="size-4" aria-hidden="true" /> {complete ? "New fill" : "Fill"}
        </Button>
      )}
      <Button variant="secondary" size={toolSize} onClick={() => dispatch({ type: "CLEAR_FILL" })} disabled={busy !== null} title="Clear fill: keep your own letters and the black squares">
        <Undo2 className="size-4" aria-hidden="true" /> <span className={TOOL_LABEL}>Clear fill</span>
      </Button>
      <Button variant="ghost" size={toolSize} onClick={() => dispatch({ type: "TOGGLE_BLOCK" })} aria-label="Toggle black square" title="Toggle black square (.)">
        <LayoutGrid className="size-4" aria-hidden="true" /> <span className={TOOL_LABEL} aria-hidden="true">Block</span>
      </Button>
      <Button variant="ghost" size={toolSize} aria-pressed={showHeat} onClick={() => setShowHeat((v) => !v)} className={showHeat ? "bg-surface-sunken text-ink" : ""} title="Heatmap: how many words fit through each square">
        <Flame className="size-4" aria-hidden="true" /> <span className={TOOL_LABEL}>Heatmap</span>
      </Button>
      {/* AI clues, offered where the constructor is looking once there's something to clue; the draft runs in the clue panel, which opens. */}
      {complete && missingClues > 0 && (
        <Button
          variant="soft"
          size={toolSize}
          disabled={busy !== null}
          title="Write a clue for every entry without one, with AI"
          onClick={() => {
            if (desktop) setSideTab("clues");
            else setTab("clues");
            cluePanelRef.current?.draftAll();
          }}
        >
          <Sparkles className="size-4" aria-hidden="true" /> Draft {missingClues === slots.length ? "all" : missingClues} clues
        </Button>
      )}
      {desktop && playTestButton()}
      {desktop && publishButton()}
      <StudioPopover label="How the studio works" icon={<CircleHelp className="size-4" aria-hidden="true" />} className="ml-auto">
        <p>
          {desktop
            ? 'Type to write (your letters are bold and kept). Right-click a square for black / white, direction and the words through it; "." also toggles a black square, and a letter typed on one opens it again. Space, Enter or a second tap switches between across and down.'
            : "Tap a square and type (your letters are bold and kept). Hold a square for black / white, direction and the words through it; typing a letter on a black square opens it again. A second tap switches between across and down."}
        </p>
        <ul className="mt-2 flex flex-col gap-1" aria-label="Heatmap legend">
          <li>Heatmap: how many words still fit through each square, given the letters you typed. Darker means fewer.</li>
          <li className="flex items-center gap-1.5"><span className="size-2.5 shrink-0 rounded-sm bg-red-200" aria-hidden="true" /> none: no word fits</li>
          <li className="flex items-center gap-1.5"><span className="size-2.5 shrink-0 rounded-sm bg-brand-200" aria-hidden="true" /> 1–5 words</li>
          <li className="flex items-center gap-1.5"><span className="size-2.5 shrink-0 rounded-sm bg-brand-100" aria-hidden="true" /> 6–20</li>
          <li className="flex items-center gap-1.5"><span className="size-2.5 shrink-0 rounded-sm bg-brand-50 ring-1 ring-line" aria-hidden="true" /> 21–100; white is more</li>
          <li>On the gold word the same shows as a corner dot.</li>
        </ul>
      </StudioPopover>
    </div>
  );

  const statsLine = (
    <p className="text-sm text-muted">
      {stats.words} words · {stats.blocks} blocks ({Math.round(stats.blockPct * 100)}%) · average {stats.avgLength.toFixed(1)}
      {stats.shortRuns > 0 && <span className="text-red-600"> · {stats.shortRuns} two-letter runs</span>}
      {!stats.connected && <span className="text-red-600"> · grid is split</span>}
      {/* The heatmap's own readout, so turning it on always says something even when no square is tight. */}
      {heat && (fewest !== null || complete) && (
        <span className={fewest === 0 ? "text-red-600" : ""}>
          {" · "}
          {fewest === null ? "every entry is written" : `tightest square: ${fewest.toLocaleString()} ${fewest === 1 ? "word" : "words"}`}
        </span>
      )}
    </p>
  );

  const grid = (
    <StudioGrid
      grid={state.grid}
      cursor={state.cursor}
      direction={state.dir}
      activeCells={slot?.cells ?? []}
      heat={heat}
      stuck={stuck}
      onSelect={(cell) => dispatch({ type: "SELECT", cell })}
      onToggleBlock={(cell) => dispatch({ type: "TOGGLE_BLOCK", cell })}
      onToggleDirection={() => dispatch({ type: "TOGGLE_DIR" })}
      onShowWords={(cell, dir) => {
        dispatch({ type: "SELECT", cell });
        dispatch({ type: "SET_DIR", dir });
        if (desktop) setSideTab("words");
        else setTab("words");
      }}
      input={gridInput}
    />
  );
  // Squares stop growing at 4rem, so a mini is a tidy block rather than a wall of 115 px squares.
  const gridCap = `${state.grid.width * 4}rem`;

  const gridPanel = desktop ? (
    // The desk's centre: title and tools on top, then the grid as large as the space left allows.
    <section aria-label="Grid" className="@container flex min-h-0 flex-col gap-2">
      <TitleField state={state} dispatch={dispatch} access={access} />
      {toolbar}
      <div className="min-h-0 flex-1 [container-type:size]">
        <div className="mx-auto" style={{ width: `min(100cqw, calc(100cqh * ${state.grid.width / state.grid.height}), ${gridCap})` }}>
          {grid}
        </div>
      </div>
      {message && <p role="status" className="rounded-xl bg-gold-50 px-3 py-2 text-sm text-ink-soft">{message}</p>}
      {statsLine}
    </section>
  ) : (
    <section aria-label="Grid" className="flex flex-col gap-2">
      <TitleField state={state} dispatch={dispatch} access={access} />
      {/* A tablet in portrait would otherwise get a grid taller than the screen; leave room for the strip, tools and tab bar. */}
      <div className="mx-auto w-full" style={{ maxWidth: `min(${gridCap}, max(16rem, calc(100dvh - 31rem)))` }}>
        {grid}
      </div>
      {slot && key && (
        <CandidateStrip slotLabel={slotLabel} words={slotWords} viability={viability} rejected={state.rejected} onPlace={placeWord} onMore={() => setTab("words")} />
      )}
      {slot && key && complete && (
        <ActiveClueBar slotLabel={slotLabel} answer={slotText(state.grid, slot)} clue={state.clues[key] ?? ""} onChange={(clue) => dispatch({ type: "SET_CLUE", key, clue })} />
      )}
      {toolbar}
      {message && <p role="status" className="rounded-xl bg-gold-50 px-3 py-2 text-sm text-ink-soft">{message}</p>}
      {statsLine}
    </section>
  );

  const candidatePanel =
    slot && key ? (
      <CandidatePanel
        key={key}
        slotLabel={slotLabel}
        pattern={slotText(base, slot)}
        words={slotWords}
        viability={viability}
        approved={state.approved[key] ?? []}
        rejected={state.rejected}
        onPlace={(word) => {
          placeWord(word);
          // On a phone the word is written out of sight: show it.
          if (!desktop) setTab("grid");
        }}
        onApprove={(word) => dispatch({ type: "TOGGLE_APPROVE", key, word })}
        onReject={(word) => dispatch({ type: "TOGGLE_REJECT", word })}
        onClearApprovals={() => dispatch({ type: "CLEAR_APPROVALS", key })}
      />
    ) : (
      <p className="text-sm text-muted">{desktop ? "Select a square to see what fits there." : "Select a square on the Grid tab to see what fits there."}</p>
    );

  const cluePanel = (
    <CluePanel
      ref={cluePanelRef}
      state={state}
      dispatch={dispatch}
      onExport={(format) => void exportFile(format)}
      showExport={desktop}
      access={access}
      userId={account.user?.id ?? null}
      activeKey={key}
      onSelectSlot={(s) => {
        dispatch({ type: "SELECT", cell: s.cells[0] });
        dispatch({ type: "SET_DIR", dir: s.dir });
      }}
    />
  );

  // The desk's right column: the word list and the clues share it, a tab each, both kept mounted.
  const sidePanel = (
    <aside aria-label="Words and clues" className="flex min-h-0 flex-col gap-2">
      <div role="tablist" aria-label="Words or clues" className="grid grid-cols-2 gap-1 rounded-xl bg-surface-sunken p-1">
        {(["words", "clues"] as const).map((id) => (
          <button
            key={id}
            type="button"
            role="tab"
            id={`studio-side-tab-${id}`}
            aria-selected={sideTab === id}
            aria-controls={`studio-side-panel-${id}`}
            className={`min-h-8 rounded-lg text-sm font-semibold focus-visible:outline-2 focus-visible:outline-brand-500 ${sideTab === id ? "bg-surface text-ink shadow-card" : "text-muted hover:text-ink"}`}
            onClick={() => setSideTab(id)}
          >
            {id === "words" ? "Words" : "Clues"}
            {id === "clues" && missingClues > 0 && <span className="ml-1.5 rounded-full bg-gold-100 px-1.5 text-xs text-gold-700 tabular-nums">{missingClues}</span>}
          </button>
        ))}
      </div>
      <Card id="studio-side-panel-words" role="tabpanel" aria-labelledby="studio-side-tab-words" hidden={sideTab !== "words"} className="flex min-h-0 flex-1 flex-col p-4">
        {candidatePanel}
      </Card>
      <div id="studio-side-panel-clues" role="tabpanel" aria-labelledby="studio-side-tab-clues" hidden={sideTab !== "clues"} className="min-h-0 flex-1 overflow-y-auto overscroll-contain rounded-2xl">
        {cluePanel}
      </div>
    </aside>
  );

  const setupPanel = (
    <aside className={desktop ? "flex min-h-0 flex-col gap-3 overflow-y-auto overscroll-contain pb-1" : "flex flex-col gap-4"} aria-label="Setup">
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
      <StudioSection title="Theme entries" defaultOpen={isBlank(state)}>
        <p className="text-sm text-muted">The words to build around. Lay out places them in a fresh grid and adds the black squares.</p>
        <textarea
          className="mt-2 w-full rounded-xl border border-line-strong bg-surface px-3 py-2 text-base md:text-sm text-ink placeholder:text-subtle focus-visible:outline-2 focus-visible:outline-brand-500"
          rows={2}
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
      </StudioSection>

      <StudioSection title="Rules">
        <label className="block text-sm font-medium text-ink-soft" htmlFor="studio-symmetry">Symmetry</label>
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
        <p className="mt-1 text-xs text-subtle">
          {state.symmetry === "none" ? "Black squares go only where you put them. Lay out still builds a rotationally symmetric grid." : "A black square also places its mirrored partner."}
        </p>
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
      </StudioSection>

      <StudioSection
        title={state.versions.length ? `Versions (${state.versions.length})` : "Versions"}
        action={
          <Button variant="ghost" size="sm" onClick={() => dispatch({ type: "SAVE_VERSION", name: `Version ${state.versions.length + 1}`, at: Date.now() })}>
            <Save className="size-4" aria-hidden="true" /> Save
          </Button>
        }
      >
        {state.versions.length === 0 ? (
          <p className="text-sm text-muted">Save a skeleton before filling to come back to it.</p>
        ) : (
          <ul className="flex flex-col">
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
      </StudioSection>
      {adminPanels && <DailyQueue state={state} admin={account.admin} />}
      {adminPanels && communityEnabled() && <Reports admin={account.admin} />}
    </aside>
  );

  const insightsPanel = adminPanels ? (
    <section aria-label="Puzzle insights">
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
        <main className="mt-3 flex flex-col gap-4">
          {engineNotice}
          {/* The desk is one screen tall and never scrolls as a page: each column scrolls on its own. */}
          <div className="grid h-[calc(100dvh-7rem)] min-h-[32rem] grid-cols-[15rem_minmax(0,1fr)_22rem] gap-4 xl:grid-cols-[16rem_minmax(0,1fr)_24rem]">
            {setupPanel}
            {gridPanel}
            {sidePanel}
          </div>
          {insightsPanel}
        </main>
      ) : (
        <>
          {/* The tab bar is fixed above the home indicator; the page keeps clear of it. */}
          <main className="mt-3 flex flex-col gap-4 pb-[calc(3rem+env(safe-area-inset-bottom))]">
            {engineNotice}
            {tabPanel("grid", gridPanel)}
            {tabPanel("words", <Card className="flex max-h-[calc(100dvh-12rem)] flex-col p-4">{candidatePanel}</Card>)}
            {tabPanel("clues", cluePanel)}
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
        <PublishDialog state={state} dispatch={dispatch} user={account.user} existing={published[state.id] ?? null} onClose={() => setPublishOpen(false)}
          onChanged={refreshPublished}
          onViewPuzzle={
            Capacitor.isNativePlatform()
              ? (shortId) => {
                  fileCurrent();
                  navigate(puzzlePath(shortId));
                }
              : undefined
          }
        />
      )}
    </PageShell>
  );
}
