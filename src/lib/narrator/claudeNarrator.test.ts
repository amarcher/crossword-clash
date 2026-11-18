// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../supabaseClient", () => ({ supabase: null }));

/**
 * The host names its room to the functions, so a Plus player in the room can
 * cover a TV nobody is signed in on (plusAccess.ts roomSponsor; Andrew,
 * 2026-11-16).
 */
describe("ClaudeNarratorBackend and the room", () => {
  const urls: string[] = [];
  beforeEach(() => {
    urls.length = 0;
    vi.stubEnv("VITE_SUPABASE_URL", "https://x.supabase.co");
    vi.stubEnv("VITE_SUPABASE_ANON_KEY", "anon");
    vi.stubGlobal("fetch", async (url: string) => {
      urls.push(url);
      return { ok: true, status: 200, json: async () => ({ text: "Nice one." }) };
    });
    vi.stubGlobal("speechSynthesis", { speak: (u: { onend?: () => void }) => u.onend?.(), cancel: () => {}, getVoices: () => [] });
    vi.stubGlobal("SpeechSynthesisUtterance", class { onend?: () => void; onerror?: () => void; constructor(public text: string) {} });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  async function narrate(gameId: string | null) {
    const { ClaudeNarratorBackend } = await import("./claudeNarrator");
    const backend = new ClaudeNarratorBackend({ ttsEngine: "browser", gameId });
    await backend.connect();
    const idle = new Promise<void>((resolve) => backend.setOnIdle(resolve));
    backend.sendEvent({ type: "STALL", data: { secondsSinceLastClaim: 45 } });
    await idle;
    await backend.disconnect();
  }

  it("names the room on the commentary request", async () => {
    await narrate("3ddb4144-c04c-41a1-989b-8d53d0686445");
    expect(urls).toEqual(["https://x.supabase.co/functions/v1/narrator-claude?game=3ddb4144-c04c-41a1-989b-8d53d0686445"]);
  });

  it("sends no room when there is none", async () => {
    await narrate(null);
    expect(urls).toEqual(["https://x.supabase.co/functions/v1/narrator-claude"]);
  });
});
