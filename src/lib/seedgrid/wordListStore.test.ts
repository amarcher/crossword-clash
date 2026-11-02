import { describe, expect, it, vi } from "vitest";
import {
  describeList,
  EXPECTED_WORD_LIST_BYTES,
  factsFromHeaders,
  factsFromInfo,
  formatMegabytes,
  listPath,
  loadWordList,
  readWithProgress,
  storageInfoUrl,
  urlVersion,
  WORD_LIST_CACHE,
  type WordListProgress,
} from "./wordListStore";

/** A word list long enough to pass `checkWordListResponse` is not needed (that only refuses HTML); keep it small. */
const LIST = Array.from({ length: 40 }, (_, i) => `WORD${i};50`).join("\n");
const HOSTED = "https://abc.supabase.co/storage/v1/object/public/seedgrid/words-production.dict";
const INFO = "https://abc.supabase.co/storage/v1/object/info/public/seedgrid/words-production.dict";

/** An in-memory CacheStorage: one named cache, Request/URL keys, Response values. */
function fakeCaches() {
  const entries = new Map<string, Response>();
  const cache = {
    match: async (key: string) => entries.get(key)?.clone(),
    put: async (key: string, res: Response) => void entries.set(key, res),
    keys: async () => [...entries.keys()].map((url) => ({ url }) as Request),
    delete: async (req: Request) => entries.delete(req.url),
  } as unknown as Cache;
  const opened: string[] = [];
  const caches = { open: async (name: string) => (opened.push(name), cache) } as unknown as CacheStorage;
  return { caches, entries, opened };
}

/** A streamed text response in `chunk`-byte pieces, with the headers a server would send. */
function streamed(text: string, chunk: number, headers: Record<string, string> = {}): Response {
  const bytes = new TextEncoder().encode(text);
  let at = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (at >= bytes.length) return controller.close();
      controller.enqueue(bytes.slice(at, at + chunk));
      at += chunk;
    },
  });
  return new Response(body, { status: 200, headers: { "content-type": "text/plain; charset=utf-8", ...headers } });
}

type Route = (url: string, init?: RequestInit) => Response | Promise<Response>;
function server(routes: Record<string, Route>) {
  const log: { url: string; method: string }[] = [];
  const fetchFn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    log.push({ url, method: init?.method ?? "GET" });
    const key = `${init?.method ?? "GET"} ${url}`;
    const route = routes[key] ?? routes[url];
    if (!route) throw new TypeError("Failed to fetch");
    return route(url, init);
  }) as unknown as typeof globalThis.fetch;
  return { fetch: fetchFn, log };
}

describe("word list URL facts", () => {
  it("reads the ?v= query, the path and Supabase's object-info endpoint", () => {
    expect(urlVersion("/seedgrid/words.dict")).toBeNull();
    expect(urlVersion("/seedgrid/words.dict?v=3")).toBe("3");
    expect(listPath("/seedgrid/words.dict?v=3")).toBe("/seedgrid/words.dict");
    expect(storageInfoUrl(HOSTED)).toBe(INFO);
    expect(storageInfoUrl(`${HOSTED}?v=2`)).toBe(INFO);
    expect(storageInfoUrl("/seedgrid/words.dict")).toBeNull();
    expect(storageInfoUrl("https://cdn.example.com/words.dict")).toBeNull();
  });

  it("takes the version and size from the info body, else from headers", () => {
    expect(factsFromInfo({ version: "uuid-1", etag: '"e"', size: 6979976 })).toEqual({ version: "uuid-1", size: 6979976 });
    expect(factsFromInfo({ etag: '"e"', last_modified: "2026-10-16" })).toEqual({ version: '"e"', size: null });
    expect(factsFromInfo(null)).toEqual({ version: null, size: null });
    expect(factsFromHeaders(new Headers({ "last-modified": "Fri, 16 Oct 2026 13:51:10 GMT", "content-length": "123" }))).toEqual({
      version: "Fri, 16 Oct 2026 13:51:10 GMT",
      size: 123,
    });
    expect(factsFromHeaders(new Headers())).toEqual({ version: null, size: null });
    expect(formatMegabytes(6_979_976)).toBe("7 MB");
    expect(formatMegabytes(4_200_000)).toBe("4.2 MB");
    expect(formatMegabytes(12_000_000)).toBe("12 MB");
  });

  it("describes a hosted list through the info endpoint and any other through HEAD, and answers null offline", async () => {
    const hosted = server({ [INFO]: () => Response.json({ version: "v-1", size: 99 }) });
    expect(await describeList(HOSTED, hosted)).toEqual({ version: "v-1", size: 99 });
    const local = server({ "HEAD /seedgrid/words.dict": () => new Response(null, { headers: { "last-modified": "Mon", "content-length": "77" } }) });
    expect(await describeList("/seedgrid/words.dict", local)).toEqual({ version: "Mon", size: 77 });
    expect(await describeList("/seedgrid/words.dict", server({}))).toBeNull();
    const broken = server({ "HEAD /seedgrid/words.dict": () => new Response(null, { status: 500 }) });
    expect(await describeList("/seedgrid/words.dict", broken)).toBeNull();
  });

  it("streams a body with progress against the given total", async () => {
    const seen: WordListProgress[] = [];
    const text = await readWithProgress(streamed(LIST, 64), LIST.length, (p) => seen.push(p));
    expect(text).toBe(LIST);
    expect(seen[0]).toEqual({ loaded: 0, total: LIST.length });
    expect(seen[seen.length - 1]).toEqual({ loaded: LIST.length, total: LIST.length });
    expect(seen.map((p) => p.loaded)).toEqual([...seen.map((p) => p.loaded)].sort((a, b) => a - b));
  });
});

describe("loadWordList", () => {
  it("downloads with progress on the first open and stores the text under the URL with its version", async () => {
    const { caches, entries, opened } = fakeCaches();
    const { fetch, log } = server({
      [INFO]: () => Response.json({ version: "v-1", size: LIST.length }),
      [HOSTED]: () => streamed(LIST, 100),
    });
    const seen: WordListProgress[] = [];
    const stored: boolean[] = [];
    const res = await loadWordList(HOSTED, { fetch, caches, onProgress: (p) => seen.push(p), onStored: (s) => stored.push(s) });
    expect(res).toEqual({ text: LIST, source: "network", bytes: LIST.length });
    expect(opened).toEqual([WORD_LIST_CACHE]);
    expect(log.map((l) => l.url)).toEqual([INFO, HOSTED]);
    // The size came from the info endpoint, since the compressed download names none.
    expect(seen[0]).toEqual({ loaded: 0, total: LIST.length });
    expect(seen[seen.length - 1]?.loaded).toBe(LIST.length);
    expect(stored).toEqual([true]);
    const kept = entries.get(HOSTED)!;
    expect(kept.headers.get("x-word-list-version")).toBe("v-1");
    expect(await kept.clone().text()).toBe(LIST);
  });

  it("reads the cache on the second open after one cheap check, and never downloads again", async () => {
    const { caches } = fakeCaches();
    const first = server({ [INFO]: () => Response.json({ version: "v-1", size: LIST.length }), [HOSTED]: () => streamed(LIST, 100) });
    await loadWordList(HOSTED, { fetch: first.fetch, caches });

    const second = server({ [INFO]: () => Response.json({ version: "v-1", size: LIST.length }), [HOSTED]: () => streamed("CHANGED;50", 100) });
    const progress = vi.fn();
    const res = await loadWordList(HOSTED, { fetch: second.fetch, caches, onProgress: progress });
    expect(res).toEqual({ text: LIST, source: "cache", bytes: LIST.length });
    expect(second.log.map((l) => l.url)).toEqual([INFO]);
    expect(progress).not.toHaveBeenCalled();

    // Offline: the facts cannot be fetched, so the cached copy stands.
    const offline = server({});
    expect(await loadWordList(HOSTED, { fetch: offline.fetch, caches })).toMatchObject({ source: "cache" });
  });

  it("replaces the cached copy when the server's version changes", async () => {
    const { caches, entries } = fakeCaches();
    const first = server({ [INFO]: () => Response.json({ version: "v-1", size: LIST.length }), [HOSTED]: () => streamed(LIST, 100) });
    await loadWordList(HOSTED, { fetch: first.fetch, caches });

    const NEXT = `${LIST}\nNEWWORD;60`;
    const second = server({ [INFO]: () => Response.json({ version: "v-2", size: NEXT.length }), [HOSTED]: () => streamed(NEXT, 100) });
    const res = await loadWordList(HOSTED, { fetch: second.fetch, caches });
    expect(res).toMatchObject({ text: NEXT, source: "network" });
    expect(second.log.map((l) => l.url)).toEqual([INFO, HOSTED]);
    expect(entries.get(HOSTED)!.headers.get("x-word-list-version")).toBe("v-2");
    expect(entries.size).toBe(1);
  });

  it("treats a ?v= URL as immutable: a new v is a new download and the old entry is evicted", async () => {
    const { caches, entries } = fakeCaches();
    const v1 = server({ "/seedgrid/words.dict?v=1": () => streamed(LIST, 100) });
    expect(await loadWordList("/seedgrid/words.dict?v=1", { fetch: v1.fetch, caches })).toMatchObject({ source: "network" });
    // No facts request for a pinned version, and the cache answers without one.
    expect(v1.log.map((l) => `${l.method} ${l.url}`)).toEqual(["GET /seedgrid/words.dict?v=1"]);
    const again = server({});
    expect(await loadWordList("/seedgrid/words.dict?v=1", { fetch: again.fetch, caches })).toMatchObject({ source: "cache" });
    expect(again.log).toEqual([]);

    const v2 = server({ "/seedgrid/words.dict?v=2": () => streamed(`${LIST}\nMORE;50`, 100) });
    expect(await loadWordList("/seedgrid/words.dict?v=2", { fetch: v2.fetch, caches })).toMatchObject({ source: "network" });
    expect([...entries.keys()]).toEqual(["/seedgrid/words.dict?v=2"]);
  });

  it("uses the dev list through HEAD facts and runs the bar against the expected size when nothing names one", async () => {
    const { caches } = fakeCaches();
    const { fetch } = server({
      "HEAD /seedgrid/words.dict": () => new Response(null, { headers: { "last-modified": "Mon" } }),
      "/seedgrid/words.dict": () => streamed(LIST, 100),
    });
    const seen: WordListProgress[] = [];
    const res = await loadWordList("/seedgrid/words.dict", { fetch, caches, onProgress: (p) => seen.push(p) });
    expect(res.source).toBe("network");
    expect(seen[0]).toEqual({ loaded: 0, total: EXPECTED_WORD_LIST_BYTES });
    expect(seen[seen.length - 1]).toEqual({ loaded: LIST.length, total: EXPECTED_WORD_LIST_BYTES });
  });

  it("fails loudly (nothing cached) on an HTML answer or a network error, so the caller can offer a retry", async () => {
    const { caches, entries } = fakeCaches();
    const html = server({
      [INFO]: () => new Response("nope", { status: 404 }),
      [`HEAD ${HOSTED}`]: () => new Response(null, { status: 404 }),
      [HOSTED]: () => new Response("<!doctype html><title>Crossword Clash</title>", { headers: { "content-type": "text/html" } }),
    });
    await expect(loadWordList(HOSTED, { fetch: html.fetch, caches })).rejects.toThrow(/HTML page/);
    expect(entries.size).toBe(0);
    const offline = server({});
    await expect(loadWordList(HOSTED, { fetch: offline.fetch, caches })).rejects.toThrow(/Failed to fetch/);
    // Then a retry that works stores the list.
    const ok = server({ [INFO]: () => Response.json({ version: "v-1", size: LIST.length }), [HOSTED]: () => streamed(LIST, 100) });
    expect(await loadWordList(HOSTED, { fetch: ok.fetch, caches })).toMatchObject({ source: "network" });
    expect(entries.size).toBe(1);
  });

  it("downloads every time, and says so, where the Cache API is missing", async () => {
    const stored: boolean[] = [];
    const { fetch, log } = server({ [INFO]: () => Response.json({ version: "v-1", size: LIST.length }), [HOSTED]: () => streamed(LIST, 100) });
    expect(await loadWordList(HOSTED, { fetch, caches: undefined, onStored: (s) => stored.push(s) })).toMatchObject({ source: "network" });
    expect(await loadWordList(HOSTED, { fetch, caches: undefined, onStored: (s) => stored.push(s) })).toMatchObject({ source: "network" });
    expect(stored).toEqual([false, false]);
    expect(log.filter((l) => l.url === HOSTED)).toHaveLength(2);
  });
});
