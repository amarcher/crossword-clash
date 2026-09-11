import { fetchNytPuzzle, NytImportError } from "../lib/nytImport";

/** Bundled as a function expression. Native code evaluates it only on Import. */
export async function extract(): Promise<string> {
  try {
    const puzzle = await fetchNytPuzzle(window.location.href);
    return JSON.stringify({ status: "ok", puzzle });
  } catch (error) {
    return JSON.stringify({ status: "error", code: error instanceof NytImportError ? error.code : "FORMAT" });
  }
}
