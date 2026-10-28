/**
 * Exporting a studio puzzle (.ipuz / .puz) in the NATIVE apps. The webview has
 * no download: an `<a download>` click does nothing there. Instead the bytes
 * are written to a temp file in the app's cache directory through
 * `@capacitor/filesystem` and handed to the OS share sheet through
 * `@capacitor/share`, where the player can save to Files, AirDrop it or send
 * it to another crossword app. On the web the studio keeps its blob download.
 *
 * Both plugins are imported dynamically behind the mobile-mode switch, like
 * nativePurchase.ts, and the same hard rule applies: no promise here may ever
 * resolve with a plugin object (a Capacitor plugin is a Proxy that answers
 * `then`, so such a promise never settles). The module namespace is what the
 * promises carry; `.Filesystem` / `.Share` are read off it synchronously.
 */
import { Capacitor } from "@capacitor/core";

type FilesystemModule = typeof import("@capacitor/filesystem");
type ShareModule = typeof import("@capacitor/share");
type Directory = import("@capacitor/filesystem").Directory;

// `Directory.Cache` from the plugin, spelled out so the enum needs no runtime
// import here (that would pull the plugin into the web bundle);
// nativeExport.test.ts checks the value against the real enum.
const CACHE_DIRECTORY = "CACHE" as unknown as Directory;
/** Where the temp files go inside the cache directory; the OS may clear it at any time, which is the point. */
export const EXPORT_FOLDER = "studio-exports";

export interface ExportFile {
  /** File name with its extension ("my-puzzle.ipuz"). */
  name: string;
  bytes: Uint8Array;
  /** The share sheet's subject line. */
  title?: string;
}

export type NativeExportOutcome = "shared" | "cancelled";

/** Whether exports must go through the share sheet: the native app, where downloads don't exist. */
export function nativeExportAvailable(platform: { isNativePlatform: () => boolean } = Capacitor): boolean {
  return import.meta.env.MODE === "mobile" && platform.isNativePlatform();
}

/** Bytes → base64, in chunks so `btoa` never sees a string too long for `apply`. */
export function toBase64(bytes: Uint8Array): string {
  let binary = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  return btoa(binary);
}

let filesystem: Promise<FilesystemModule> | null = null;
let share: Promise<ShareModule> | null = null;

async function filesystemModule(): Promise<FilesystemModule> {
  // The static switch lets Rollup drop the import (and the plugin's chunk) from web builds.
  if (import.meta.env.MODE !== "mobile") throw new Error("File export through the share sheet is only available in the apps.");
  if (!filesystem) filesystem = import("@capacitor/filesystem");
  return filesystem;
}

async function shareModule(): Promise<ShareModule> {
  if (import.meta.env.MODE !== "mobile") throw new Error("File export through the share sheet is only available in the apps.");
  if (!share) share = import("@capacitor/share");
  return share;
}

/** The share plugin rejects with "Share canceled" when the sheet is dismissed; that is not an error. */
function isDismissal(err: unknown): boolean {
  const message = err instanceof Error ? err.message : typeof err === "string" ? err : ((err as { message?: string } | null)?.message ?? "");
  return /cancel/i.test(message);
}

/**
 * Writes the file to the cache directory and opens the share sheet with it.
 * Resolves "cancelled" when the sheet is dismissed; throws when writing or
 * sharing fails for another reason.
 */
export async function exportNatively(file: ExportFile): Promise<NativeExportOutcome> {
  const { Filesystem } = await filesystemModule();
  const { Share } = await shareModule();
  const written = await Filesystem.writeFile({
    path: `${EXPORT_FOLDER}/${file.name}`,
    data: toBase64(file.bytes),
    directory: CACHE_DIRECTORY,
    recursive: true,
  });
  try {
    await Share.share({ title: file.title ?? file.name, url: written.uri, dialogTitle: file.title ?? file.name });
    return "shared";
  } catch (err) {
    if (isDismissal(err)) return "cancelled";
    throw err;
  }
}

/** Test hook: forget the loaded plugin modules. */
export function resetNativeExportForTests(): void {
  filesystem = null;
  share = null;
}
