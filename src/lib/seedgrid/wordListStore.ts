/**
 * The studio's word list, downloaded on demand and kept on the device.
 *
 * The list is a few MB, so nothing fetches it until the editor itself opens
 * (the gate never asks for it; a non-subscriber never pays the bytes). The
 * first open on a device streams the download with progress, stores the text
 * in the Cache API (`caches.open(WORD_LIST_CACHE)`, keyed by the list URL),
 * and later opens read it from there without a network round trip for the
 * body. Precedent named by the owner (2026-10-28): a game downloading its
 * extra content after install, once.
 *
 * Versions. A URL with a `?v=` query is immutable: a new `v` is a new key,
 * and the old entry is evicted. Otherwise the list is revalidated cheaply
 * before the cached copy is used: `describeList` asks for the list's facts —
 * Supabase Storage's `/object/info/public/…` JSON (its `version` and `size`;
 * the hosted list is served brotli-compressed in chunks, so the download
 * itself carries no Content-Length, and `ETag` is not a CORS-safelisted
 * response header), else a HEAD whose `Last-Modified` (safelisted) stands in
 * — and a changed validator replaces the cached copy. When the facts cannot
 * be fetched (offline) the cached copy is used as it is.
 *
 * Everything here is injectable (`fetch`, `caches`) so the whole flow is
 * unit-tested without a browser; the engine worker receives the text.
 */
import { checkWordListResponse } from "./ingrid";

export const WORD_LIST_CACHE = "seedgrid-words-v1";

/** Header on the cached response: the validator the copy was stored under. */
const VERSION_HEADER = "x-word-list-version";
/** Header on the cached response: how many bytes the text is (for the status line). */
const SIZE_HEADER = "x-word-list-size";

/** How long the facts request may take before the cached copy is used unchecked. */
export const DESCRIBE_TIMEOUT_MS = 4000;

/** When the server names no size, the bar runs against this (the production list is 7 MB). */
export const EXPECTED_WORD_LIST_BYTES = 7_000_000;

export interface WordListProgress {
  /** Bytes received so far. */
  loaded: number;
  /** Bytes expected, or null when nothing names the size (an indeterminate bar). */
  total: number | null;
}

export interface WordListFacts {
  /** What identifies this version of the list on the server, or null when nothing does. */
  version: string | null;
  /** The list's size in bytes, when the server says. */
  size: number | null;
}

export interface WordListResult {
  text: string;
  /** Where the text came from: the device's cache, or a download this time. */
  source: "cache" | "network";
  bytes: number;
}

export interface WordListDeps {
  fetch: typeof fetch;
  /** `window.caches`; undefined where the Cache API is missing (insecure origins), then every open downloads. */
  caches?: CacheStorage;
  onProgress?: (p: WordListProgress) => void;
  /** Called once a download has been stored (or could not be, e.g. storage full). */
  onStored?: (stored: boolean) => void;
}

/** The `?v=` query of a list URL, when it has one: a versioned URL never needs revalidating. */
export function urlVersion(url: string): string | null {
  const q = url.indexOf("?");
  if (q < 0) return null;
  return new URLSearchParams(url.slice(q + 1)).get("v");
}

/** The URL without its query, for finding other versions of the same list in the cache. */
export function listPath(url: string): string {
  const q = url.indexOf("?");
  return q < 0 ? url : url.slice(0, q);
}

/**
 * Supabase Storage's object-info endpoint for a public object URL
 * (`…/object/public/<bucket>/<key>` → `…/object/info/public/<bucket>/<key>`), or null
 * for any other host.
 */
export function storageInfoUrl(url: string): string | null {
  const m = /^(https?:\/\/[^/]+\/storage\/v1\/object)\/public\/(.+)$/.exec(listPath(url));
  return m ? `${m[1]}/info/public/${m[2]}` : null;
}

/** The facts from a Supabase object-info body. */
export function factsFromInfo(info: unknown): WordListFacts {
  const o = (info ?? {}) as { version?: unknown; etag?: unknown; last_modified?: unknown; size?: unknown };
  const version = [o.version, o.etag, o.last_modified].find((v): v is string => typeof v === "string" && v.length > 0) ?? null;
  const size = typeof o.size === "number" && o.size > 0 ? o.size : null;
  return { version, size };
}

/** The facts from a HEAD (or GET) response's headers: `Last-Modified` as the version, `Content-Length` as the size. */
export function factsFromHeaders(headers: Headers): WordListFacts {
  const version = headers.get("last-modified") || headers.get("etag") || null;
  const length = Number(headers.get("content-length"));
  return { version, size: Number.isFinite(length) && length > 0 ? length : null };
}

async function withTimeout<T>(work: (signal: AbortSignal) => Promise<T>, ms: number): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await work(controller.signal);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * What the server currently holds under this URL, or null when it cannot be
 * asked (offline, timeout, an error status).
 */
export async function describeList(url: string, deps: Pick<WordListDeps, "fetch">): Promise<WordListFacts | null> {
  const info = storageInfoUrl(url);
  try {
    return await withTimeout(async (signal) => {
      if (info) {
        const res = await deps.fetch(info, { signal });
        if (res.ok) return factsFromInfo(await res.json());
      }
      const head = await deps.fetch(url, { method: "HEAD", signal });
      if (!head.ok) return null;
      return factsFromHeaders(head.headers);
    }, DESCRIBE_TIMEOUT_MS);
  } catch {
    return null;
  }
}

/** Reads a response body in chunks, reporting progress; returns the decoded text. */
export async function readWithProgress(res: Response, total: number | null, onProgress?: (p: WordListProgress) => void): Promise<string> {
  const body = res.body;
  if (!body) {
    const text = await res.text();
    onProgress?.({ loaded: text.length, total: total ?? text.length });
    return text;
  }
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let loaded = 0;
  onProgress?.({ loaded: 0, total });
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.byteLength;
    onProgress?.({ loaded, total });
  }
  const all = new Uint8Array(loaded);
  let at = 0;
  for (const c of chunks) {
    all.set(c, at);
    at += c.byteLength;
  }
  onProgress?.({ loaded, total: total ?? loaded });
  return new TextDecoder().decode(all);
}

async function openStore(caches: CacheStorage | undefined): Promise<Cache | null> {
  if (!caches) return null;
  try {
    return await caches.open(WORD_LIST_CACHE);
  } catch {
    return null;
  }
}

async function readCached(store: Cache | null, url: string): Promise<{ text: string; version: string | null } | null> {
  if (!store) return null;
  try {
    const hit = await store.match(url);
    if (!hit) return null;
    return { text: await hit.text(), version: hit.headers.get(VERSION_HEADER) };
  } catch {
    return null;
  }
}

/** Stores the text under the URL and evicts other versions of the same list. Returns whether it was stored. */
async function storeText(store: Cache | null, url: string, text: string, version: string | null): Promise<boolean> {
  if (!store) return false;
  try {
    const headers: Record<string, string> = { "content-type": "text/plain; charset=utf-8", [SIZE_HEADER]: String(text.length) };
    if (version) headers[VERSION_HEADER] = version;
    await store.put(url, new Response(text, { headers }));
    const path = listPath(url);
    for (const req of await store.keys()) if (req.url !== url && listPath(req.url) === path) await store.delete(req);
    return true;
  } catch {
    // Storage full or refused: the list still works this session.
    return false;
  }
}

/** Downloads the list with progress and verifies it looks like a word list. */
async function download(url: string, size: number | null, deps: WordListDeps): Promise<{ text: string; facts: WordListFacts }> {
  const res = await deps.fetch(url);
  const fromHeaders = factsFromHeaders(res.headers);
  const total = fromHeaders.size ?? size ?? (res.ok ? EXPECTED_WORD_LIST_BYTES : null);
  const text = res.ok ? await readWithProgress(res, total, deps.onProgress) : await res.text();
  checkWordListResponse(res.status, res.headers.get("content-type"), text);
  return { text, facts: { version: fromHeaders.version, size: fromHeaders.size } };
}

/**
 * The list's text: from the device's cache when a copy of the current
 * version is there, else downloaded (with progress) and stored for next time.
 * Throws when the list cannot be had at all; the caller offers a retry.
 */
export async function loadWordList(url: string, deps: WordListDeps): Promise<WordListResult> {
  const store = await openStore(deps.caches);
  const cached = await readCached(store, url);
  const pinned = urlVersion(url);

  if (cached) {
    // A versioned URL is immutable; anything else is checked against the server when it answers.
    if (pinned) return { text: cached.text, source: "cache", bytes: cached.text.length };
    const facts = await describeList(url, deps);
    if (!facts || !facts.version || facts.version === cached.version) return { text: cached.text, source: "cache", bytes: cached.text.length };
    const fresh = await download(url, facts.size, deps);
    // Not `onStored?.(await storeText(…))`: an optional call skips its arguments when there is no listener.
    const stored = await storeText(store, url, fresh.text, facts.version);
    deps.onStored?.(stored);
    return { text: fresh.text, source: "network", bytes: fresh.text.length };
  }

  // Nothing cached: learn the size (for the bar) and the version (for the cache), then download.
  const facts = pinned ? null : await describeList(url, deps);
  const fresh = await download(url, facts?.size ?? null, deps);
  const version = pinned ?? facts?.version ?? fresh.facts.version;
  const stored = await storeText(store, url, fresh.text, version);
  deps.onStored?.(stored);
  return { text: fresh.text, source: "network", bytes: fresh.text.length };
}

/** Human size for the status line: "7 MB". */
export function formatMegabytes(bytes: number): string {
  const mb = bytes / 1_000_000;
  return `${mb >= 10 ? Math.round(mb) : Math.max(1, Math.round(mb * 10) / 10).toString().replace(/\.0$/, "")} MB`;
}

/** The browser's Cache API, or undefined where it is missing (an insecure origin, some webviews). */
export function browserCaches(): CacheStorage | undefined {
  try {
    return typeof caches === "undefined" ? undefined : caches;
  } catch {
    return undefined;
  }
}
