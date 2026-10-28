/**
 * Promise wrapper around engine.worker.ts. One worker, requests answered in
 * order. `restart()` terminates it (the only way to stop a running fill) and
 * loads a fresh one, which is handed the word list again.
 *
 * The word list itself comes from `wordListStore.ts` (downloaded once per
 * device, then read from the Cache API) through the `loadList` function the
 * client is built with; the text is kept here so a restart never downloads
 * again, and the worker receives it in its init message.
 */
import type { EngineRules, FillOutcome, SlotOptions, Viability } from "./ingrid";
import { MAX_SHARED, type Grid, type Symmetry } from "./grid";
import type { WorkerRequest } from "./engine.worker";
import type { SkeletonResult } from "./skeletonFinder";
import { browserCaches, loadWordList, type WordListProgress, type WordListResult } from "./wordListStore";

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
export { MAX_SHARED } from "./grid";

/** What the client reports while the word list is on its way. */
export type LoadEvent =
  | { kind: "progress"; progress: WordListProgress }
  /** The list is in hand (from the cache, or downloaded and `stored` on the device — or not, where the Cache API is missing). */
  | { kind: "list"; source: WordListResult["source"]; bytes: number; stored: boolean | null };

export type ListLoader = (onEvent: (e: LoadEvent) => void) => Promise<string>;

/** The default loader: the studio's list through the device cache. */
export const loadStudioWordList: ListLoader = async (onEvent) => {
  let stored: boolean | null = null;
  const res = await loadWordList(STUDIO_WORD_LIST_URL, {
    fetch: (input, init) => fetch(input, init),
    caches: browserCaches(),
    onProgress: (progress) => onEvent({ kind: "progress", progress }),
    onStored: (s) => (stored = s),
  });
  onEvent({ kind: "list", source: res.source, bytes: res.bytes, stored });
  return res.text;
};

type Pending = { resolve: (v: unknown) => void; reject: (e: Error) => void };

export class EngineClient {
  private worker: Worker | null = null;
  private pending = new Map<number, Pending>();
  private nextId = 1;
  private ready: Promise<number> | null = null;
  /**
   * The one list download, shared by every `load()` (StrictMode's double
   * mount disposes and reloads while the first download is still running) and
   * kept so a restart (Stop) never fetches again.
   */
  private list: Promise<string> | null = null;
  private listeners = new Set<(e: LoadEvent) => void>();
  private readonly loadList: ListLoader;

  constructor(loadList: ListLoader = loadStudioWordList) {
    this.loadList = loadList;
  }

  private listText(): Promise<string> {
    if (!this.list) {
      const list = this.loadList((e) => this.listeners.forEach((l) => l(e)));
      this.list = list;
      // A failed download is forgotten, so the next load() (Retry) tries again.
      list.catch(() => this.list === list && (this.list = null));
    }
    return this.list;
  }

  /**
   * Resolves with the word count once the list is loaded and the engine has
   * read it. `onEvent` hears the download's progress (first open on a device).
   */
  load(onEvent?: (e: LoadEvent) => void): Promise<number> {
    if (onEvent) this.listeners.add(onEvent);
    if (!this.ready) {
      this.worker = new Worker(new URL("./engine.worker.ts", import.meta.url), { type: "module" });
      this.worker.onmessage = (e: MessageEvent<{ id: number; result?: unknown; error?: string }>) => {
        const p = this.pending.get(e.data.id);
        if (!p) return;
        this.pending.delete(e.data.id);
        if (e.data.error) p.reject(new Error(e.data.error));
        else p.resolve(e.data.result);
      };
      const worker = this.worker;
      const ready = (async () => {
        const list = await this.listText();
        // Disposed (or restarted) while the list was downloading: this attempt is over.
        if (this.worker !== worker) throw new Error("cancelled");
        return (await this.send<{ words: number }>({ type: "init", list, maxShared: MAX_SHARED })).words;
      })();
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
    this.listeners.clear();
    for (const p of this.pending.values()) p.reject(new Error("cancelled"));
    this.pending.clear();
  }

  private send<T>(req: WorkerRequest): Promise<T> {
    const id = this.nextId++;
    return new Promise<T>((resolve, reject) => {
      if (!this.worker) {
        reject(new Error("cancelled"));
        return;
      }
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
      this.worker.postMessage({ id, req });
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
