/**
 * Sharing a text result — which mechanism, and what the user is told.
 *
 * - Native app: the OS share sheet through @capacitor/share (WKWebView has no
 *   usable Web Share API for files and reports `canShare` false; text shares
 *   through the plugin always open the sheet).
 * - Web: `navigator.share({ text })` with no file, so the text is never dropped
 *   (iOS drops the caption in most targets when a file is attached).
 * - Otherwise: the clipboard, and the caller tells the user what was copied.
 *
 * The decision and the outcome vocabulary are pure (`selectTextShareMethod`);
 * `shareText` is the thin runner over injectable capabilities so the whole
 * flow is unit-tested without a browser.
 */

export type TextShareMethod = "native" | "webshare" | "copy" | "unavailable";

export interface TextShareCapabilities {
  /** Running inside the Capacitor shell. */
  nativePlatform: boolean;
  /** `navigator.share` is a function. */
  canWebShare: boolean;
  /** `navigator.clipboard.writeText` is a function. */
  canCopy: boolean;
}

export function selectTextShareMethod(caps: TextShareCapabilities): TextShareMethod {
  if (caps.nativePlatform) return "native";
  if (caps.canWebShare) return "webshare";
  if (caps.canCopy) return "copy";
  return "unavailable";
}

export interface SharePayload {
  /** The full block, link included (what the clipboard and the Web Share API get). */
  text: string;
  /** The block without the link line, for sheets that take the URL as its own item. */
  body: string;
  url: string;
  title?: string;
}

export type ShareOutcome =
  /** The share sheet opened and the user picked a target. */
  | "shared"
  /** Nothing else was available (or the sheet failed); the text is on the clipboard. */
  | "copied"
  /** The user dismissed the sheet — nothing happened, nothing to report. */
  | "dismissed"
  /** No mechanism worked. */
  | "failed";

export interface ShareResult {
  method: TextShareMethod;
  outcome: ShareOutcome;
}

export interface ShareDeps extends TextShareCapabilities {
  /** @capacitor/share's `Share.share`. */
  nativeShare?: (data: { text: string; url: string; title?: string; dialogTitle?: string }) => Promise<unknown>;
  /** `navigator.share`. */
  webShare?: (data: { text: string; title?: string }) => Promise<void>;
  /** `navigator.clipboard.writeText`. */
  copy?: (text: string) => Promise<void>;
}

function isAbort(err: unknown): boolean {
  return (err as { name?: string } | null)?.name === "AbortError";
}

/** Run the share. Never throws. */
export async function shareText(payload: SharePayload, deps: ShareDeps): Promise<ShareResult> {
  const method = selectTextShareMethod(deps);

  const copy = async (): Promise<ShareOutcome> => {
    if (!deps.copy) return "failed";
    try {
      await deps.copy(payload.text);
      return "copied";
    } catch {
      return "failed";
    }
  };

  if (method === "native" && deps.nativeShare) {
    try {
      // The URL rides as its own item: iOS shows it as a link bubble under the
      // text, Android appends it. The body ends with the call to action.
      await deps.nativeShare({ text: payload.body, url: payload.url, title: payload.title, dialogTitle: payload.title });
      return { method, outcome: "shared" };
    } catch (err) {
      if (isAbort(err) || /cancel/i.test(String((err as Error)?.message ?? ""))) return { method, outcome: "dismissed" };
      return { method, outcome: await copy() };
    }
  }

  if (method === "webshare" && deps.webShare) {
    try {
      await deps.webShare({ text: payload.text, title: payload.title });
      return { method, outcome: "shared" };
    } catch (err) {
      if (isAbort(err)) return { method, outcome: "dismissed" };
      return { method: deps.canCopy ? "copy" : method, outcome: await copy() };
    }
  }

  if (method === "copy" || deps.canCopy) {
    return { method: "copy", outcome: await copy() };
  }
  return { method: "unavailable", outcome: "failed" };
}
