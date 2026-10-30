import { describe, it, expect, vi } from "vitest";
import { selectTextShareMethod, shareText, type SharePayload } from "./shareSheet";

const PAYLOAD: SharePayload = {
  text: "Crossword Clash · Daily Mini · Oct 20\n⏱ 1:42\n🟩🟩\nBeat my time → https://x.test/daily/2026-10-20/mini?beat=102",
  body: "Crossword Clash · Daily Mini · Oct 20\n⏱ 1:42\n🟩🟩\nBeat my time →",
  url: "https://x.test/daily/2026-10-20/mini?beat=102",
  title: "Crossword Clash",
};

describe("selectTextShareMethod", () => {
  it("always uses the native share sheet inside the app, whatever the WebView reports", () => {
    expect(selectTextShareMethod({ nativePlatform: true, canWebShare: false, canCopy: false })).toBe("native");
    expect(selectTextShareMethod({ nativePlatform: true, canWebShare: true, canCopy: true })).toBe("native");
  });

  it("uses the Web Share API on the web when it exists, else the clipboard", () => {
    expect(selectTextShareMethod({ nativePlatform: false, canWebShare: true, canCopy: true })).toBe("webshare");
    expect(selectTextShareMethod({ nativePlatform: false, canWebShare: false, canCopy: true })).toBe("copy");
    expect(selectTextShareMethod({ nativePlatform: false, canWebShare: false, canCopy: false })).toBe("unavailable");
  });
});

describe("shareText", () => {
  it("native: hands the plugin the whole block as one text item and no url (iOS would share the url alone)", async () => {
    const nativeShare = vi.fn().mockResolvedValue({});
    const result = await shareText(PAYLOAD, { nativePlatform: true, canWebShare: false, canCopy: true, nativeShare });
    expect(result).toEqual({ method: "native", outcome: "shared" });
    expect(nativeShare).toHaveBeenCalledWith(expect.objectContaining({ text: PAYLOAD.text }));
    expect(nativeShare.mock.calls[0][0]).not.toHaveProperty("url");
    expect(PAYLOAD.text).toContain(PAYLOAD.url);
  });

  it("native: a cancelled sheet is a dismissal, not a copy", async () => {
    const nativeShare = vi.fn().mockRejectedValue(new Error("Share canceled"));
    const copy = vi.fn();
    const result = await shareText(PAYLOAD, { nativePlatform: true, canWebShare: false, canCopy: true, nativeShare, copy });
    expect(result.outcome).toBe("dismissed");
    expect(copy).not.toHaveBeenCalled();
  });

  it("web: shares the text alone, with no file", async () => {
    const webShare = vi.fn().mockResolvedValue(undefined);
    const result = await shareText(PAYLOAD, { nativePlatform: false, canWebShare: true, canCopy: true, webShare });
    expect(result).toEqual({ method: "webshare", outcome: "shared" });
    const data = webShare.mock.calls[0][0];
    expect(data.text).toBe(PAYLOAD.text);
    expect("files" in data).toBe(false);
    expect("url" in data).toBe(false);
  });

  it("web: a dismissed sheet shares nothing and copies nothing", async () => {
    const abort = Object.assign(new Error("aborted"), { name: "AbortError" });
    const webShare = vi.fn().mockRejectedValue(abort);
    const copy = vi.fn();
    const result = await shareText(PAYLOAD, { nativePlatform: false, canWebShare: true, canCopy: true, webShare, copy });
    expect(result).toEqual({ method: "webshare", outcome: "dismissed" });
    expect(copy).not.toHaveBeenCalled();
  });

  it("web: a failing sheet falls back to the clipboard with the full text", async () => {
    const webShare = vi.fn().mockRejectedValue(new Error("NotAllowedError"));
    const copy = vi.fn().mockResolvedValue(undefined);
    const result = await shareText(PAYLOAD, { nativePlatform: false, canWebShare: true, canCopy: true, webShare, copy });
    expect(result).toEqual({ method: "copy", outcome: "copied" });
    expect(copy).toHaveBeenCalledWith(PAYLOAD.text);
  });

  it("desktop without Web Share: copies the full text", async () => {
    const copy = vi.fn().mockResolvedValue(undefined);
    const result = await shareText(PAYLOAD, { nativePlatform: false, canWebShare: false, canCopy: true, copy });
    expect(result).toEqual({ method: "copy", outcome: "copied" });
    expect(copy).toHaveBeenCalledWith(PAYLOAD.text);
  });

  it("reports failure when nothing works, without throwing", async () => {
    const copy = vi.fn().mockRejectedValue(new Error("blocked"));
    expect(await shareText(PAYLOAD, { nativePlatform: false, canWebShare: false, canCopy: true, copy })).toEqual({
      method: "copy",
      outcome: "failed",
    });
    expect(await shareText(PAYLOAD, { nativePlatform: false, canWebShare: false, canCopy: false })).toEqual({
      method: "unavailable",
      outcome: "failed",
    });
  });
});
