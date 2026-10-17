// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { LOGO_INTRO_PLAYED_KEY, Title } from "./Title";

// The Lottie player is lazy; a stub keeps the test synchronous and lets us
// assert whether the intro was asked for at all.
vi.mock("./AnimatedLogo", () => ({
  default: ({ autoplay }: { autoplay?: boolean }) => <div data-testid="lottie" data-autoplay={String(autoplay)} />,
}));

function setReducedMotion(matches: boolean) {
  window.matchMedia = vi.fn().mockReturnValue({ matches, addEventListener: vi.fn(), removeEventListener: vi.fn() });
}

beforeEach(() => {
  sessionStorage.clear();
  setReducedMotion(false);
});
afterEach(cleanup);

describe("Title", () => {
  it("renders the static wordmark when not animating", () => {
    render(<Title />);
    expect(screen.getByRole("img", { name: "Crossword Clash" })).toHaveProperty("tagName", "IMG");
    expect(sessionStorage.getItem(LOGO_INTRO_PLAYED_KEY)).toBeNull();
  });

  it("plays the intro on the first menu visit of the session and remembers it", async () => {
    render(<Title animate />);
    expect(await screen.findByTestId("lottie")).toBeTruthy();
    expect(sessionStorage.getItem(LOGO_INTRO_PLAYED_KEY)).toBe("1");
  });

  it("rests on the final frame (the still image) once the intro has played this session", () => {
    sessionStorage.setItem(LOGO_INTRO_PLAYED_KEY, "1");
    render(<Title animate />);
    expect(screen.queryByTestId("lottie")).toBeNull();
    const still = screen.getByRole("img", { name: "Crossword Clash" });
    expect(still.tagName).toBe("IMG");
    // Same box as the animation so the menu's layout is identical either way.
    expect(still.style.aspectRatio).toBe("1222 / 326");
  });

  it("shows the still under reduced motion without marking the intro played", () => {
    setReducedMotion(true);
    render(<Title animate />);
    expect(screen.queryByTestId("lottie")).toBeNull();
    expect(screen.getByRole("img", { name: "Crossword Clash" }).tagName).toBe("IMG");
    expect(sessionStorage.getItem(LOGO_INTRO_PLAYED_KEY)).toBeNull();
  });

  it("keeps its first decision across re-renders", async () => {
    const { rerender } = render(<Title animate />);
    expect(await screen.findByTestId("lottie")).toBeTruthy();
    // The flag is now set, but the mounted player must not be swapped for the still mid-animation.
    rerender(<Title animate className="x" />);
    expect(screen.getByTestId("lottie")).toBeTruthy();
  });
});
