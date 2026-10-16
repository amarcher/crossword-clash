/**
 * Promise wrapper around engine.worker.ts. One worker, requests answered in
 * order. `restart()` terminates it (the only way to stop a running fill) and
 * loads a fresh one, which re-reads the word list.
 */
import type { EngineRules, FillOutcome, SlotOptions, Viability } from "./ingrid";
import type { Grid, Symmetry } from "./grid";
import type { WorkerRequest } from "./engine.worker";
import type { SkeletonResult } from "./skeletonFinder";

/**
 * Which list the studio loads. VITE_SEEDGRID_WORD_LIST wins; otherwise dev uses
 * the local full list and every other build the licensable list in Supabase
 * Storage (`pnpm seedgrid:upload-dict`).
 */
export const STUDIO_WORD_LIST_URL = studioWordListUrl(
  import.meta.env.VITE_SEEDGRID_WORD_LIST as string | undefined,
  import.meta.env.DEV,
  import.meta.env.VITE_SUPABASE_URL as string | undefined,
);

export function studioWordListUrl(override: string | undefined, dev: boolean, supabaseUrl: string | undefined): string {
  if (override) return override;
  if (dev) return "/seedgrid/words.dict";
  if (!supabaseUrl) return "/seedgrid/words-production.dict";
  return `${supabaseUrl.replace(/\/$/, "")}/storage/v1/object/public/seedgrid/words-production.dict`;
}
/** No two engine-filled entries may share a run of letters longer than this. */
export const MAX_SHARED = 3;

type Pending = { resolve: (v: unknown) => void; reject: (e: Error) => void };

export class EngineClient {
  private worker: Worker | null = null;
  private pending = new Map<number, Pending>();
  private nextId = 1;
  private ready: Promise<number> | null = null;

  /** Resolves with the word count once the list is loaded. */
  load(): Promise<number> {
    if (!this.ready) {
      this.worker = new Worker(new URL("./engine.worker.ts", import.meta.url), { type: "module" });
      this.worker.onmessage = (e: MessageEvent<{ id: number; result?: unknown; error?: string }>) => {
        const p = this.pending.get(e.data.id);
        if (!p) return;
        this.pending.delete(e.data.id);
        if (e.data.error) p.reject(new Error(e.data.error));
        else p.resolve(e.data.result);
      };
      const ready = this.send<{ words: number }>({ type: "init", listUrl: STUDIO_WORD_LIST_URL, maxShared: MAX_SHARED }).then((r) => r.words);
      this.ready = ready;
      // A failed load shouldn't leave its worker running (unless a restart already replaced it).
      ready.catch(() => this.ready === ready && this.dispose());
    }
    return this.ready;
  }

  restart(): Promise<number> {
    this.dispose();
    return this.load();
  }

  dispose() {
    this.worker?.terminate();
    this.worker = null;
    this.ready = null;
    for (const p of this.pending.values()) p.reject(new Error("cancelled"));
    this.pending.clear();
  }

  private send<T>(req: WorkerRequest): Promise<T> {
    const id = this.nextId++;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
      this.worker!.postMessage({ id, req });
    });
  }

  private async call<T>(req: WorkerRequest): Promise<T> {
    await this.load();
    try {
      return await this.send<T>(req);
    } catch (err) {
      // A Rust panic leaves the wasm instance unusable ("unreachable", then "recursive use
      // of an object" on every later call), so start a fresh worker for the next request.
      if (err instanceof Error && /unreachable|recursive use|RuntimeError/i.test(err.message)) this.restart().catch(() => undefined);
      throw err;
    }
  }

  fill(grid: Grid, rules: EngineRules, timeoutMs: number, seed?: number) {
    return this.call<FillOutcome>({ type: "fill", grid, rules, timeoutMs, seed });
  }

  options(grid: Grid, rules: EngineRules, listSlot?: string, listLimit?: number) {
    return this.call<SlotOptions>({ type: "options", grid, rules, listSlot, listLimit });
  }

  classify(grid: Grid, rules: EngineRules, slotId: string, words: string[], timeoutMs: number) {
    return this.call<Record<string, Viability>>({ type: "classify", grid, rules, slotId, words, timeoutMs });
  }

  skeleton(size: number, symmetry: Symmetry, seeds: string[], rules: Pick<EngineRules, "minScore" | "rejected">, attempts = 60) {
    return this.call<SkeletonResult>({ type: "skeleton", size, symmetry, seeds, rules, attempts });
  }
}
