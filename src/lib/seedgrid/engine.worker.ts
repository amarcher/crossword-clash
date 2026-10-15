/**
 * Runs the ingrid_core engine off the main thread for the studio. Requests
 * are answered one at a time, in order; engineClient.ts wraps this in
 * promises. To cancel a long fill the client terminates the worker.
 */
import init, { Engine } from "./wasm/seedgrid_engine";
import wasmUrl from "./wasm/seedgrid_engine_bg.wasm?url";
import { checkWordListResponse, IngridEngine, MIN_WORD_LIST_WORDS, type EngineRules } from "./ingrid";
import { buildSkeleton } from "./layout";
import { cloneGrid, type Grid, type Symmetry } from "./grid";

export type WorkerRequest =
  | { type: "init"; listUrl: string; maxShared: number }
  | { type: "fill"; grid: Grid; rules: EngineRules; timeoutMs: number; seed?: number }
  | { type: "options"; grid: Grid; rules: EngineRules; listSlot?: string; listLimit?: number }
  | { type: "classify"; grid: Grid; rules: EngineRules; slotId: string; words: string[]; timeoutMs: number }
  | { type: "skeleton"; size: number; symmetry: Symmetry; seeds: string[]; rules: Pick<EngineRules, "minScore" | "rejected">; attempts: number };

let engine: IngridEngine | null = null;

function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

async function handle(req: WorkerRequest): Promise<unknown> {
  if (req.type === "init") {
    await init({ module_or_path: wasmUrl });
    const res = await fetch(req.listUrl);
    const text = await res.text();
    checkWordListResponse(res.status, res.headers.get("content-type"), text);
    engine = new IngridEngine(new Engine(text, req.maxShared, 21));
    if (engine.wordCount < MIN_WORD_LIST_WORDS) throw new Error(`word list has only ${engine.wordCount} words`);
    return { words: engine.wordCount };
  }
  if (!engine) throw new Error("engine not loaded");
  switch (req.type) {
    case "fill":
      return engine.fill(req.grid, req.rules, { timeoutMs: req.timeoutMs, seed: req.seed });
    case "options":
      return engine.options(req.grid, req.rules, req.listSlot, req.listLimit);
    case "classify":
      return engine.classify(req.grid, req.slotId, req.words, req.rules, req.timeoutMs);
    case "skeleton": {
      // Random symmetric layouts around the seeds; keep the first one the engine can fill.
      const random = rng(Date.now() & 0xffff);
      for (let attempt = 0; attempt < req.attempts; attempt++) {
        const placed = buildSkeleton({
          size: req.size,
          symmetry: req.symmetry,
          seeds: req.seeds,
          random,
          maxBlockPct: attempt < req.attempts / 2 ? 0.22 : 0.26,
        });
        if (!placed) continue;
        // Only the score floor and rejections apply: approvals belong to another grid's slots.
        const probe = engine.fill(placed.grid, { minScore: req.rules.minScore, rejected: req.rules.rejected }, { timeoutMs: req.size <= 7 ? 500 : 1500, seed: attempt });
        if (probe.ok) {
          const grid = cloneGrid(placed.grid);
          grid.cells = grid.cells.map((c, i) => (c === "#" || grid.locked[i] ? c : ""));
          return { grid, attempts: attempt + 1 };
        }
      }
      return { grid: null, attempts: req.attempts };
    }
  }
}

self.onmessage = async (event: MessageEvent<{ id: number; req: WorkerRequest }>) => {
  const { id, req } = event.data;
  try {
    self.postMessage({ id, result: await handle(req) });
  } catch (err) {
    self.postMessage({ id, error: err instanceof Error ? err.message : String(err) });
  }
};
