/* tslint:disable */
/* eslint-disable */

export class Engine {
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Find a complete fill. Returns `{ ok, rows?, reason?, ms }` as JSON; `reason` is
     * "unfillable" (proven impossible), "timeout", or "bad-request".
     */
    fill(request: string): string;
    /**
     * `word_list` is `WORD;SCORE` lines (extra `;fields` are ignored; the first occurrence
     * of a word wins). `max_shared` is the longest run of letters two entries may share
     * (below 3 disables the check).
     */
    constructor(word_list: string, max_shared: number, max_length: number);
    /**
     * Arc-consistent option counts for every slot (0 everywhere means the grid is
     * dead), plus the surviving words for `listSlot`, best first.
     */
    options(request: string): string;
    wordCount(): number;
}

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_engine_free: (a: number, b: number) => void;
    readonly engine_fill: (a: number, b: number, c: number) => [number, number];
    readonly engine_new: (a: number, b: number, c: number, d: number) => number;
    readonly engine_options: (a: number, b: number, c: number) => [number, number];
    readonly engine_wordCount: (a: number) => number;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __wbindgen_exn_store: (a: number) => void;
    readonly __externref_table_alloc: () => number;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
