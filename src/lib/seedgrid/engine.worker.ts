/**
 * Runs the ingrid_core engine off the main thread for the studio. Requests
 * are answered one at a time, in order; engineClient.ts wraps this in
 * promises. To cancel a long fill the client terminates the worker.
 */
import init, { Engine } from "./wasm/seedgrid_engine";
import wasmUrl from "./wasm/seedgrid_engine_bg.wasm?url";
import { IngridEngine, MIN_WORD_LIST_WORDS, type EngineRules } from "./ingrid";
import { findSkeleton } from "./skeletonFinder";
import type { Grid, Symmetry } from "./grid";
import { mulberry32 } from "./random";

export type WorkerRequest =
  | { type: "init"; list: string; maxShared: number }
  | { type: "fill"; grid: Grid; rules: EngineRules; timeoutMs: number; seed?: number }
  | { type: "options"; grid: Grid; rules: EngineRules; listSlot?: string; listLimit?: number }
  | { type: "classify"; grid: Grid; rules: EngineRules; slotId: string; words: string[]; timeoutMs: number }
  | { type: "skeleton"; size: number; symmetry: Symmetry; seeds: string[]; rules: Pick<EngineRules, "minScore" | "rejected">; attempts: number };

let engine: IngridEngine | null = null;

async function handle(req: WorkerRequest): Promise<unknown> {
  if (req.type === "init") {
    await init({ module_or_path: wasmUrl });
    // The list text arrives from the client (wordListStore.ts: downloaded once per device, then cached).
    engine = new IngridEngine(new Engine(req.list, req.maxShared, 21));
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
    case "skeleton":
      // Random layouts first, then constructive ones ranked by the heatmap, then annealing,
      // then a lower score floor; see skeletonFinder.ts. Stop = the client terminates the worker.
      return findSkeleton(engine, req, { random: mulberry32(Date.now() & 0xffff) });
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
