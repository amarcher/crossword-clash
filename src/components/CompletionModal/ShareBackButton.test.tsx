// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "../../i18n/i18n";

const share = vi.hoisted(() => ({ shareText: vi.fn() }));
vi.mock("../../lib/shareSheet", () => share);
vi.mock("./ShareResultButton", () => ({ runtimeDeps: async () => ({}) }));

const { ShareBackButton } = await import("./ShareBackButton");

afterEach(() => {
  cleanup();
  share.shareText.mockReset();
});

describe("ShareBackButton", () => {
  it("sends the sender this solve's link with how it went", async () => {
    share.shareText.mockResolvedValueOnce({ method: "native", outcome: "shared" });
    render(<ShareBackButton name="Andrew" link="https://crosswordclash.com/daily/2026-11-12/large?beat=570&r=VJ0ncnWyJ9j" outcome="beat" deltaSeconds={42} />);
    fireEvent.click(screen.getByRole("button", { name: "Send Andrew your solve" }));
    await waitFor(() => expect(share.shareText).toHaveBeenCalled());
    const [payload] = share.shareText.mock.calls[0];
    expect(payload.text).toBe("Beat your time by 0:42! Watch how I did it: https://crosswordclash.com/daily/2026-11-12/large?beat=570&r=VJ0ncnWyJ9j");
    expect(payload.url).toBe("https://crosswordclash.com/daily/2026-11-12/large?beat=570&r=VJ0ncnWyJ9j");
  });

  it("owns a loss, and says so when the link went to the clipboard", async () => {
    share.shareText.mockResolvedValueOnce({ method: "copy", outcome: "copied" });
    render(<ShareBackButton name="Andrew" link="https://x.test/l" outcome="lost" deltaSeconds={9} />);
    fireEvent.click(screen.getByRole("button", { name: "Send Andrew your solve" }));
    await screen.findByRole("button", { name: "Link copied: paste it to Andrew" });
    expect(share.shareText.mock.calls[0][0].text).toBe("You got me by 0:09. Watch how I did it: https://x.test/l");
  });
});
