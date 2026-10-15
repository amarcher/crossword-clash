/**
 * Promise wrapper around engine.worker.ts. One worker, requests answered in
 * order. `restart()` terminates it (the only way to stop a running fill) and
 * loads a fresh one, which re-reads the word list.
 */
import type { EngineRules, FillOutcome, SlotOptions, Viability } from "./ingrid";
import type { Grid, Symmetry } from "./grid";
import type { WorkerRequest } from "./engine.worker";

export const STUDIO_WORD_LIST_URL = "/seedgrid/words.dict";
export const MAX_SHARED = 4;

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
      this.ready = this.send<{ words: number }>({ type: "init", listUrl: STUDIO_WORD_LIST_URL, maxShared: MAX_SHARED }).then((r) => r.words);
      this.ready.catch(() => (this.ready = null));
    }
    return this.ready;
  }

  restart(): Promise<number> {
    this.worker?.terminate();
    for (const p of this.pending.values()) p.reject(new Error("cancelled"));
    this.pending.clear();
    this.ready = null;
    return this.load();
  }

  dispose() {
    this.worker?.terminate();
    this.worker = null;
    this.ready = null;
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
    return this.send<T>(req);
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

  skeleton(size: number, symmetry: Symmetry, seeds: string[], rules: EngineRules, attempts = 60) {
    return this.call<{ grid: Grid | null; attempts: number }>({ type: "skeleton", size, symmetry, seeds, rules, attempts });
  }
}
